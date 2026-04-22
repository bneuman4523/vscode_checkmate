import { createChildLogger } from '../logger';
import { storage } from "../storage";
import { syncOrchestrator } from "./sync-orchestrator";
import { resolveAuthHeaders } from "./auth-resolver";
import {
  calculateNextSyncAt,
  calculateSyncPriority,
  areDependenciesMet,
  type SyncDataType,
} from "./adaptive-schedule";
import type { IntegrationEndpointConfig, SyncJob, EventSyncState, Event } from "@shared/schema";

const logger = createChildLogger('SyncScheduler');

interface SchedulerConfig {
  pollIntervalMs: number;
  maxConcurrentJobs: number;
  shutdownTimeoutMs: number;
}

export class SyncScheduler {
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private runningJobs: Map<string, Promise<void>> = new Map();
  private config: SchedulerConfig;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? 30000, // Poll every 30 seconds
      maxConcurrentJobs: config?.maxConcurrentJobs ?? 5,
      shutdownTimeoutMs: config?.shutdownTimeoutMs ?? 60000,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('Already running');
      return;
    }

    logger.info('Starting scheduler...');
    this.isRunning = true;

    await this.recoverStaleJobs();

    // Backfill sync states for all integrations (handles pre-tiered-sync events)
    await this.backfillAllSyncStates();

    // Initial poll
    await this.poll();

    // Schedule recurring polls
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Already stopped');
      return;
    }

    logger.info('Stopping scheduler...');
    this.isRunning = false;

    // Clear the poll timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for running jobs to complete
    if (this.runningJobs.size > 0) {
      logger.info(`Waiting for ${this.runningJobs.size} running jobs to complete...`);

      const timeout = new Promise<void>((resolve) =>
        setTimeout(() => {
          logger.info('Shutdown timeout reached, force stopping');
          resolve();
        }, this.config.shutdownTimeoutMs)
      );

      await Promise.race([
        Promise.all(Array.from(this.runningJobs.values())),
        timeout,
      ]);
    }

    logger.info('Scheduler stopped');
  }

  private schedulePoll(): void {
    if (!this.isRunning) return;

    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // ─── Poll: three-tier orchestration ─────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Tier 1: Account-level event discovery
      await this.checkDueEventDiscoveries();

      // Tier 2+3: Per-event data syncs (attendees, sessions, session_registrations)
      await this.checkDueEventSyncs();

      // Execute pending jobs from the queue
      await this.processPendingJobs();
    } catch (error) {
      logger.error({ err: error }, 'Poll error');
    }
  }

  // ─── Stale job recovery ────────────────────────────────────────────────────

  private async recoverStaleJobs(): Promise<void> {
    try {
      const staleJobs = await storage.getStaleRunningSyncJobs();
      if (staleJobs.length > 0) {
        logger.info(`Recovering ${staleJobs.length} stale running job(s) from previous shutdown`);
        for (const job of staleJobs) {
          const attempts = (job.attempts || 0);
          const maxAttempts = job.maxAttempts || 3;
          if (attempts >= maxAttempts) {
            await storage.updateSyncJob(job.id, {
              status: 'failed',
              completedAt: new Date(),
              errorMessage: 'Job was stuck in running state after server restart (max attempts reached)',
            });
            logger.info(`Job ${job.id} marked as failed (${attempts}/${maxAttempts} attempts used)`);
          } else {
            await storage.updateSyncJob(job.id, {
              status: 'pending',
              nextRetryAt: new Date(),
              errorMessage: 'Job reset to pending after server restart',
            });
            logger.info(`Job ${job.id} reset to pending for retry`);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error recovering stale jobs');
    }
  }

  // ─── Tier 1: Event Discovery ─────────────────────────────────────────────

  /**
   * Check endpoint configs where dataType = 'events' and create event_discovery jobs.
   * This is the account-level tier -- discovers which events exist on the external platform.
   */
  private async checkDueEventDiscoveries(): Promise<void> {
    try {
      const dueConfigs = await storage.getEndpointConfigsDueForSync();

      for (const config of dueConfigs) {
        // Only process event-discovery configs in this tier
        if (config.dataType !== 'events') {
          continue;
        }

        // Check if we're within the sync window
        if (!this.isWithinSyncWindow(config)) {
          logger.debug(`Skipping event discovery for config ${config.id} — outside sync window`);
          continue;
        }

        // Check if job already exists for this config
        const existingJobs = await this.getActiveJobsForConfig(config.id);
        if (existingJobs.length > 0) {
          logger.debug(`Skipping event discovery for config ${config.id} — active job exists`);
          continue;
        }

        logger.info(`Creating event_discovery job for endpoint config ${config.id}`);
        await storage.createSyncJob({
          integrationId: config.integrationId,
          endpointConfigId: config.id,
          jobType: 'event_discovery',
          syncTier: 'account_discovery',
          triggerType: 'scheduled',
          priority: 5,
          status: 'pending',
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error checking due event discoveries');
    }
  }

  // ─── Tier 2+3: Per-Event Data Syncs ──────────────────────────────────────

  /**
   * Query event_sync_states where syncEnabled=true AND nextSyncAt <= now,
   * then create per-event sync jobs for each due state.
   */
  private async checkDueEventSyncs(): Promise<void> {
    try {
      const dueStates = await storage.getSyncStatesDueForSync();

      if (dueStates.length > 0) {
        logger.debug(`Found ${dueStates.length} event sync state(s) due for sync`);
      }

      for (const state of dueStates) {
        try {
          await this.maybeCreateEventSyncJob(state);
        } catch (error) {
          // One failed state should not block others
          logger.error(
            { err: error, stateId: state.id, eventId: state.eventId, dataType: state.dataType },
            'Error evaluating event sync state'
          );
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error checking due event syncs');
    }
  }

  /**
   * Evaluate a single EventSyncState and create a job if appropriate.
   */
  private async maybeCreateEventSyncJob(state: EventSyncState): Promise<void> {
    // Load the event to check syncSettings and date info
    const event = await storage.getEvent(state.eventId);
    if (!event) {
      logger.warn(`Event ${state.eventId} not found for sync state ${state.id} — skipping`);
      return;
    }

    const syncSettings = event.syncSettings as {
      syncFrozen?: boolean;
      attendeeSyncEnabled?: boolean;
      sessionSyncEnabled?: boolean;
      sessionRegistrationSyncEnabled?: boolean;
      postEventGracePeriodHours?: number;
    } | null;

    // Check if event sync is globally frozen
    if (syncSettings?.syncFrozen) {
      logger.debug(`Skipping frozen event ${state.eventId} (state ${state.id})`);
      return;
    }

    // Check if this specific data type is disabled at the event level
    if (state.dataType === 'attendees' && syncSettings?.attendeeSyncEnabled === false) {
      logger.debug(`Attendee sync disabled for event ${state.eventId} — skipping`);
      return;
    }
    if (state.dataType === 'sessions' && syncSettings?.sessionSyncEnabled === false) {
      logger.debug(`Session sync disabled for event ${state.eventId} — skipping`);
      return;
    }
    if (state.dataType === 'session_registrations' && syncSettings?.sessionRegistrationSyncEnabled === false) {
      logger.debug(`Session registration sync disabled for event ${state.eventId} — skipping`);
      return;
    }

    // Check if an active job already exists for this state
    const activeJobs = await storage.getActiveJobsByEventSyncState(state.id);
    if (activeJobs.length > 0) {
      logger.debug(`Skipping state ${state.id} — active job already exists (${activeJobs[0].id})`);
      return;
    }

    // For session_registrations: check that dependencies (attendees + sessions) have been synced
    if (state.dataType === 'session_registrations') {
      const attendeeState = await storage.getEventSyncState(state.eventId, 'attendees');
      const sessionState = await storage.getEventSyncState(state.eventId, 'sessions');

      const deps = areDependenciesMet(
        attendeeState?.lastSyncAt ?? null,
        sessionState?.lastSyncAt ?? null
      );

      if (!deps.met) {
        logger.debug(
          `Skipping session_registrations for event ${state.eventId} — ${deps.reason}`
        );
        return;
      }
    }

    // Calculate priority based on event proximity
    const priority = calculateSyncPriority({
      startDate: event.startDate ?? null,
      endDate: event.endDate ?? null,
    });

    // Map dataType to job type
    const jobType = this.dataTypeToJobType(state.dataType);
    const syncTier = state.dataType === 'session_registrations' ? 'event_dependent' : 'event_data';

    logger.info(
      `Creating ${jobType} job for event ${state.eventId} (state ${state.id}, priority ${priority})`
    );

    await storage.createSyncJob({
      integrationId: state.integrationId,
      eventId: state.eventId,
      eventSyncStateId: state.id,
      jobType,
      syncTier,
      triggerType: 'scheduled',
      priority,
      status: 'pending',
    });
  }

  /**
   * Map a sync state dataType to the corresponding job type.
   */
  private dataTypeToJobType(dataType: string): string {
    switch (dataType) {
      case 'attendees': return 'event_attendee_sync';
      case 'sessions': return 'event_session_sync';
      case 'session_registrations': return 'event_session_registration_sync';
      default: return `event_${dataType}_sync`;
    }
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────

  private isWithinSyncWindow(config: IntegrationEndpointConfig): boolean {
    if (!config.syncWindowStart || !config.syncWindowEnd) {
      return true; // No window configured, always sync
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Simple time comparison (assumes same timezone)
    if (config.syncWindowStart <= config.syncWindowEnd) {
      // Normal window (e.g., 08:00 to 22:00)
      return currentTime >= config.syncWindowStart && currentTime <= config.syncWindowEnd;
    } else {
      // Overnight window (e.g., 22:00 to 08:00)
      return currentTime >= config.syncWindowStart || currentTime <= config.syncWindowEnd;
    }
  }

  private async getActiveJobsForConfig(configId: string): Promise<SyncJob[]> {
    return storage.getPendingSyncJobsByConfig(configId);
  }

  // ─── Job processing ──────────────────────────────────────────────────────

  private async processPendingJobs(): Promise<void> {
    // Check how many jobs are currently running
    const availableSlots = this.config.maxConcurrentJobs - this.runningJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    // Get due jobs
    const dueJobs = await storage.getDueSyncJobs();
    const jobsToProcess = dueJobs.slice(0, availableSlots);

    for (const job of jobsToProcess) {
      // Skip if already running
      if (this.runningJobs.has(job.id)) {
        continue;
      }

      // Start processing the job
      const jobPromise = this.processJob(job);
      this.runningJobs.set(job.id, jobPromise);

      // Clean up when done
      jobPromise.finally(() => {
        this.runningJobs.delete(job.id);
      });
    }
  }

  private async processJob(job: SyncJob): Promise<void> {
    logger.info(`Processing job ${job.id} (type: ${job.jobType}, trigger: ${job.triggerType})`);

    const startedAt = new Date();

    try {
      // Mark job as running
      await storage.updateSyncJob(job.id, {
        status: 'running',
        startedAt,
        attempts: (job.attempts || 0) + 1,
      });

      // Execute the sync based on job type
      let result: SyncResult;

      switch (job.jobType) {
        // ── Legacy job types (backward compatible) ──
        case 'attendee_sync':
          result = await this.executeAttendeeSync(job);
          break;
        case 'event_sync':
          result = await this.executeEventSync(job);
          break;

        // ── Tier 1: Event discovery ──
        case 'event_discovery':
          result = await this.executeEventSync(job);
          break;

        // ── Tier 2+3: Per-event data syncs ──
        case 'event_attendee_sync':
        case 'event_session_sync':
        case 'event_session_registration_sync':
          result = await this.executePerEventSync(job);
          break;

        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      // Mark job as completed
      const completedAt = new Date();
      await storage.updateSyncJob(job.id, {
        status: 'completed',
        completedAt,
        processedRecords: result.processedRecords,
        createdRecords: result.createdRecords,
        updatedRecords: result.updatedRecords,
        skippedRecords: result.skippedRecords,
        failedRecords: result.failedRecords,
        result: result as any,
      });

      // Update endpoint config sync status (for discovery / legacy jobs)
      if (job.endpointConfigId) {
        await storage.updateEndpointConfigSyncStatus(
          job.endpointConfigId,
          'success',
          undefined,
          result.processedRecords
        );
      }

      logger.info(
        `Job ${job.id} completed. Processed: ${result.processedRecords}, Created: ${result.createdRecords}, Updated: ${result.updatedRecords}`
      );

    } catch (error) {
      logger.error({ err: error }, `Job ${job.id} failed`);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Check if we should retry
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.maxAttempts || 3;

      if (attempts < maxAttempts) {
        // Schedule retry with exponential backoff
        const backoffMs = Math.min(
          1000 * Math.pow(2, attempts), // Exponential backoff
          3600000 // Max 1 hour
        );
        const nextRetryAt = new Date(Date.now() + backoffMs);

        await storage.updateSyncJob(job.id, {
          status: 'pending',
          attempts,
          nextRetryAt,
          errorMessage,
          errorStack,
        });

        logger.info(`Job ${job.id} scheduled for retry at ${nextRetryAt.toISOString()}`);
      } else {
        // Mark as dead letter
        await storage.updateSyncJob(job.id, {
          status: 'failed',
          completedAt: new Date(),
          attempts,
          errorMessage,
          errorStack,
        });

        // Update endpoint config sync status
        if (job.endpointConfigId) {
          await storage.updateEndpointConfigSyncStatus(
            job.endpointConfigId,
            'failed',
            errorMessage
          );
        }

        // Update event sync state on final failure
        if (job.eventSyncStateId) {
          try {
            const syncState = await storage.getEventSyncStateById(job.eventSyncStateId);
            await storage.updateEventSyncState(job.eventSyncStateId, {
              syncStatus: 'error',
              lastErrorMessage: errorMessage,
              lastErrorAt: new Date(),
              consecutiveFailures: (syncState?.consecutiveFailures ?? 0) + 1,
            });
          } catch (stateErr) {
            logger.error({ err: stateErr }, `Failed to update sync state ${job.eventSyncStateId} after job failure`);
          }
        }

        logger.info(`Job ${job.id} moved to dead letter queue after ${attempts} attempts`);
      }
    }
  }

  // ─── Legacy: Attendee sync (all events for an integration) ───────────────

  private async executeAttendeeSync(job: SyncJob): Promise<SyncResult> {
    const integration = await storage.getCustomerIntegration(job.integrationId);
    if (!integration) {
      throw new Error(`Integration ${job.integrationId} not found`);
    }

    // Get event code mappings for this integration
    const eventCodeMappings = await storage.getEventCodeMappings(job.integrationId);

    if (eventCodeMappings.length === 0) {
      logger.info(`No event code mappings found for integration ${job.integrationId}`);
      return {
        processedRecords: 0,
        createdRecords: 0,
        updatedRecords: 0,
        skippedRecords: 0,
        failedRecords: 0,
      };
    }

    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const mapping of eventCodeMappings) {
      try {
        const event = await storage.getEvent(mapping.eventId);
        const syncSettings = event?.syncSettings as { syncFrozen?: boolean; syncIntervalMinutes?: number | null } | null;
        if (syncSettings?.syncFrozen) {
          logger.debug(`Skipping frozen event ${mapping.eventId}`);
          totalSkipped++;
          continue;
        }

        if (syncSettings?.syncIntervalMinutes) {
          const attendeeSyncState = await storage.getEventSyncState(mapping.eventId, 'attendees');
          if (attendeeSyncState?.lastSyncAt) {
            const intervalMs = syncSettings.syncIntervalMinutes * 60 * 1000;
            const timeSinceLastSync = Date.now() - new Date(attendeeSyncState.lastSyncAt).getTime();
            if (timeSinceLastSync < intervalMs) {
              const minsRemaining = Math.round((intervalMs - timeSinceLastSync) / 60000);
              logger.debug(`Skipping event ${mapping.eventId} — custom interval ${syncSettings.syncIntervalMinutes}m, next sync in ~${minsRemaining}m`);
              totalSkipped++;
              continue;
            }
          }
        }

        const result = await syncOrchestrator.syncEventAttendees({
          integration,
          eventCodeMapping: mapping,
        });

        totalProcessed += result.processedCount;
        totalCreated += (result as any).createdCount || 0;
        totalUpdated += (result as any).updatedCount || 0;
        totalFailed += result.failedCount;
      } catch (error) {
        logger.error({ err: error }, `Error syncing mapping ${mapping.id}`);
        totalFailed++;
      }
    }

    return {
      processedRecords: totalProcessed,
      createdRecords: totalCreated,
      updatedRecords: totalUpdated,
      skippedRecords: totalSkipped,
      failedRecords: totalFailed,
    };
  }

  // ─── Legacy / Tier 1: Event discovery ────────────────────────────────────

  private async executeEventSync(job: SyncJob): Promise<SyncResult> {
    const integration = await storage.getCustomerIntegration(job.integrationId);
    if (!integration) {
      throw new Error(`Integration ${job.integrationId} not found`);
    }

    // Get the endpoint config for events
    const endpointConfig = job.endpointConfigId
      ? await storage.getIntegrationEndpointConfigById(job.endpointConfigId)
      : await storage.getIntegrationEndpointConfig(job.integrationId, 'events');

    if (!endpointConfig) {
      logger.info(`No events endpoint config found for integration ${job.integrationId}`);
      return {
        processedRecords: 0,
        createdRecords: 0,
        updatedRecords: 0,
        skippedRecords: 0,
        failedRecords: 0,
      };
    }

    try {
      const result = await syncOrchestrator.syncEvents({
        integration,
        endpointConfig,
      });

      // After successful event discovery, ensure sync states exist for all events
      try {
        await this.backfillSyncStatesForIntegration(job.integrationId);
      } catch (backfillErr) {
        logger.error({ err: backfillErr }, `Sync state backfill failed for integration ${job.integrationId} (discovery still succeeded)`);
      }

      return {
        processedRecords: result.processedCount,
        createdRecords: result.createdCount,
        updatedRecords: result.updatedCount,
        skippedRecords: 0,
        failedRecords: result.failedCount,
      };
    } catch (error) {
      logger.error({ err: error }, `Error syncing events`);
      throw error;
    }
  }

  // ─── Tier 2+3: Per-event data sync ──────────────────────────────────────

  /**
   * Execute a sync for ONE event + ONE data type.
   * Used by event_attendee_sync, event_session_sync, event_session_registration_sync.
   */
  private async executePerEventSync(job: SyncJob): Promise<SyncResult> {
    const syncStartTime = Date.now();

    // Validate required fields
    if (!job.eventId) {
      throw new Error(`Per-event sync job ${job.id} is missing eventId`);
    }
    if (!job.eventSyncStateId) {
      throw new Error(`Per-event sync job ${job.id} is missing eventSyncStateId`);
    }

    // Load event
    const event = await storage.getEvent(job.eventId);
    if (!event) {
      throw new Error(`Event ${job.eventId} not found`);
    }

    // Load the sync state (for resolved endpoint, etc.)
    const syncState = await storage.getEventSyncStateById(job.eventSyncStateId);
    if (!syncState) {
      throw new Error(`EventSyncState ${job.eventSyncStateId} not found`);
    }

    // Mark sync state as syncing
    await storage.updateEventSyncState(syncState.id, {
      syncStatus: 'syncing',
    });

    // Resolve auth headers via the shared auth resolver
    const auth = await resolveAuthHeaders(job.integrationId);

    let result: SyncResult;

    try {
      switch (job.jobType) {
        case 'event_attendee_sync':
          result = await this.executePerEventAttendeeSync(job, event, auth.integration, auth.headers, syncState);
          break;
        case 'event_session_sync':
          result = await this.executePerEventSessionSync(job, event, auth.integration, auth.headers, syncState);
          break;
        case 'event_session_registration_sync':
          result = await this.executePerEventSessionRegistrationSync(job, event, auth.integration, auth.headers, syncState);
          break;
        default:
          throw new Error(`Unsupported per-event job type: ${job.jobType}`);
      }
    } catch (error) {
      // Update sync state to error before re-throwing
      const durationMs = Date.now() - syncStartTime;
      await storage.updateEventSyncState(syncState.id, {
        syncStatus: 'error',
        lastErrorMessage: error instanceof Error ? error.message : 'Unknown error',
        lastErrorAt: new Date(),
        lastSyncDurationMs: durationMs,
      });
      throw error;
    }

    // Sync completed successfully -- update the sync state
    const durationMs = Date.now() - syncStartTime;
    const syncSettings = event.syncSettings as {
      postEventGracePeriodHours?: number;
    } | null;

    const nextSyncAt = calculateNextSyncAt(
      {
        startDate: event.startDate ?? null,
        endDate: event.endDate ?? null,
        timezone: event.timezone ?? null,
        postEventGracePeriodHours: syncSettings?.postEventGracePeriodHours,
      },
      syncState.dataType as SyncDataType,
    );

    await storage.updateEventSyncState(syncState.id, {
      syncStatus: nextSyncAt ? 'success' : 'disabled',
      lastSyncAt: new Date(),
      nextSyncAt,
      lastSyncDurationMs: durationMs,
      consecutiveFailures: 0,
      lastErrorMessage: null,
      lastSyncResult: {
        processedCount: result.processedRecords,
        createdCount: result.createdRecords,
        updatedCount: result.updatedRecords,
        errorCount: result.failedRecords,
        durationMs,
      },
      // Disable sync if event is past grace period
      ...(nextSyncAt === null ? { syncEnabled: false } : {}),
    });

    if (nextSyncAt) {
      logger.info(
        `Sync state ${syncState.id} updated — next sync at ${nextSyncAt.toISOString()} (took ${durationMs}ms)`
      );
    } else {
      logger.info(
        `Sync state ${syncState.id} disabled — event past grace period (took ${durationMs}ms)`
      );
    }

    return result;
  }

  /**
   * Sync attendees for a single event.
   * Delegates to syncOrchestrator.syncSingleEventAttendees().
   */
  private async executePerEventAttendeeSync(
    job: SyncJob,
    event: Event,
    integration: any,
    authHeaders: Record<string, string>,
    syncState: any,
  ): Promise<SyncResult> {
    const result = await syncOrchestrator.syncSingleEventAttendees({
      integration,
      event,
      authHeaders,
      syncState,
    });

    return {
      processedRecords: result.processedCount,
      createdRecords: result.createdCount,
      updatedRecords: result.updatedCount,
      skippedRecords: 0,
      failedRecords: result.errorCount,
    };
  }

  /**
   * Sync sessions for a single event.
   * Delegates to syncOrchestrator.syncSingleEventSessions().
   */
  private async executePerEventSessionSync(
    job: SyncJob,
    event: Event,
    integration: any,
    authHeaders: Record<string, string>,
    syncState: any,
  ): Promise<SyncResult> {
    const result = await syncOrchestrator.syncSingleEventSessions({
      integration,
      event,
      authHeaders,
      syncState,
    });

    return {
      processedRecords: result.processedCount,
      createdRecords: result.createdCount,
      updatedRecords: result.updatedCount,
      skippedRecords: 0,
      failedRecords: result.errorCount,
    };
  }

  /**
   * Sync session registrations for a single event.
   * Delegates to syncOrchestrator.syncSingleEventSessionRegistrations().
   */
  private async executePerEventSessionRegistrationSync(
    job: SyncJob,
    event: Event,
    integration: any,
    authHeaders: Record<string, string>,
    syncState: any,
  ): Promise<SyncResult> {
    const result = await syncOrchestrator.syncSingleEventSessionRegistrations({
      integration,
      event,
      authHeaders,
      syncState,
    });

    return {
      processedRecords: result.processedCount,
      createdRecords: result.createdCount,
      updatedRecords: result.updatedCount,
      skippedRecords: 0,
      failedRecords: result.errorCount,
    };
  }

  // ─── Sync state backfill ─────────────────────────────────────────────────

  /**
   * Ensure event_sync_states rows exist for every event linked to this integration,
   * for all three data types (attendees, sessions, session_registrations).
   *
   * Idempotent: skips states that already exist. Respects per-event syncSettings
   * (syncFrozen, attendeeSyncEnabled, etc.) when creating new states.
   */
  async backfillSyncStatesForIntegration(integrationId: string): Promise<{ created: number; existing: number; recalculated: number }> {
    const events = await storage.getEventsByIntegrationId(integrationId);
    const dataTypes: SyncDataType[] = ['attendees', 'sessions', 'session_registrations'];

    let created = 0;
    let existing = 0;
    let recalculated = 0;

    for (const event of events) {
      const syncSettings = event.syncSettings as {
        syncFrozen?: boolean;
        attendeeSyncEnabled?: boolean;
        sessionSyncEnabled?: boolean;
        sessionRegistrationSyncEnabled?: boolean;
        postEventGracePeriodHours?: number;
        adaptiveScheduleEnabled?: boolean;
      } | null;

      for (const dataType of dataTypes) {
        const existingState = await storage.getEventSyncState(event.id, dataType);

        if (existingState) {
          // If nextSyncAt is null but the event might be valid again (e.g. dates changed),
          // recalculate so it doesn't stay stuck
          if (existingState.nextSyncAt === null && existingState.syncEnabled) {
            const nextSyncAt = calculateNextSyncAt(
              {
                startDate: event.startDate ?? null,
                endDate: event.endDate ?? null,
                timezone: event.timezone ?? null,
                postEventGracePeriodHours: syncSettings?.postEventGracePeriodHours,
              },
              dataType,
            );

            if (nextSyncAt !== null) {
              await storage.updateEventSyncState(existingState.id, { nextSyncAt });
              recalculated++;
              logger.debug(
                `Recalculated nextSyncAt for event ${event.id} / ${dataType} → ${nextSyncAt.toISOString()}`
              );
            }
          }
          existing++;
          continue;
        }

        // Determine whether this state should be enabled
        let syncEnabled = true;
        if (syncSettings?.syncFrozen) {
          syncEnabled = false;
        } else if (dataType === 'attendees' && syncSettings?.attendeeSyncEnabled === false) {
          syncEnabled = false;
        } else if (dataType === 'sessions' && syncSettings?.sessionSyncEnabled === false) {
          syncEnabled = false;
        } else if (dataType === 'session_registrations' && syncSettings?.sessionRegistrationSyncEnabled === false) {
          syncEnabled = false;
        }

        const syncTier = dataType === 'session_registrations' ? 'event_dependent' : 'event_data';
        const adaptiveScheduleEnabled = syncSettings?.adaptiveScheduleEnabled !== false;

        const nextSyncAt = syncEnabled
          ? calculateNextSyncAt(
              {
                startDate: event.startDate ?? null,
                endDate: event.endDate ?? null,
                timezone: event.timezone ?? null,
                postEventGracePeriodHours: syncSettings?.postEventGracePeriodHours,
              },
              dataType,
            )
          : null;

        // If calculateNextSyncAt returns null, the event is past grace period — disable
        if (nextSyncAt === null && syncEnabled) {
          syncEnabled = false;
        }

        await storage.createEventSyncState({
          eventId: event.id,
          integrationId,
          dataType,
          syncEnabled,
          adaptiveScheduleEnabled,
          syncTier,
          nextSyncAt,
          syncStatus: 'pending',
        });

        created++;
        logger.debug(`Created sync state for event ${event.id} / ${dataType} (enabled: ${syncEnabled})`);
      }
    }

    logger.info(
      `Backfill for integration ${integrationId}: ${created} created, ${existing} already existed, ${recalculated} recalculated`
    );

    return { created, existing, recalculated };
  }

  /**
   * Startup backfill: iterate all customer integrations and ensure sync states
   * exist for every event. Handles the case where events were created before
   * tiered sync was deployed.
   */
  async backfillAllSyncStates(): Promise<void> {
    try {
      const integrationIds = await storage.getAllCustomerIntegrationIds();
      logger.info(`Running startup sync state backfill for ${integrationIds.length} integration(s)`);

      let totalCreated = 0;
      let totalExisting = 0;
      let totalRecalculated = 0;

      for (const integrationId of integrationIds) {
        try {
          const result = await this.backfillSyncStatesForIntegration(integrationId);
          totalCreated += result.created;
          totalExisting += result.existing;
          totalRecalculated += result.recalculated;
        } catch (error) {
          logger.error({ err: error, integrationId }, `Backfill failed for integration ${integrationId}`);
        }
      }

      logger.info(
        `Startup backfill complete: ${totalCreated} states created, ${totalExisting} already existed, ${totalRecalculated} recalculated`
      );
    } catch (error) {
      logger.error({ err: error }, 'Startup sync state backfill failed');
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      runningJobsCount: this.runningJobs.size,
      runningJobIds: Array.from(this.runningJobs.keys()),
      config: this.config,
    };
  }
}

interface SyncResult {
  processedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
}

interface SchedulerStatus {
  isRunning: boolean;
  runningJobsCount: number;
  runningJobIds: string[];
  config: SchedulerConfig;
}

export const syncScheduler = new SyncScheduler();
