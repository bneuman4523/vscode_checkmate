import { createChildLogger } from '../logger';
import { storage } from "../storage";
import { syncOrchestrator } from "./sync-orchestrator";
import type { IntegrationEndpointConfig, SyncJob } from "@shared/schema";

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

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Check for configs that are due for sync
      await this.checkDueEndpointConfigs();
      
      // Process pending sync jobs
      await this.processPendingJobs();
    } catch (error) {
      logger.error({ err: error }, 'Poll error');
    }
  }

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

  private async checkDueEndpointConfigs(): Promise<void> {
    try {
      const dueConfigs = await storage.getEndpointConfigsDueForSync();
      
      for (const config of dueConfigs) {
        // Check if we're within the sync window
        if (!this.isWithinSyncWindow(config)) {
          continue;
        }

        // Check if job already exists for this config
        const existingJobs = await this.getActiveJobsForConfig(config.id);
        if (existingJobs.length > 0) {
          continue;
        }

        // Create a new scheduled sync job with appropriate job type based on dataType
        const jobType = config.dataType === 'events' ? 'event_sync' : 'attendee_sync';
        if (process.env.NODE_ENV !== 'production') {
          logger.info(`Creating scheduled ${jobType} job for endpoint config ${config.id}`);
        }
        
        await storage.createSyncJob({
          integrationId: config.integrationId,
          endpointConfigId: config.id,
          jobType,
          triggerType: 'scheduled',
          priority: 5,
          status: 'pending',
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error checking due endpoint configs');
    }
  }

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
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`Processing job ${job.id} (type: ${job.jobType}, trigger: ${job.triggerType})`);
    }

    const startedAt = new Date();
    
    try {
      // Mark job as running
      await storage.updateSyncJob(job.id, {
        status: 'running',
        startedAt,
        attempts: (job.attempts || 0) + 1,
      });

      // Get integration and endpoint config
      const integration = await storage.getCustomerIntegration(job.integrationId);
      if (!integration) {
        throw new Error(`Integration ${job.integrationId} not found`);
      }

      // Execute the sync based on job type
      let result: SyncResult;
      
      switch (job.jobType) {
        case 'attendee_sync':
          result = await this.executeAttendeeSync(job, integration);
          break;
        case 'event_sync':
          result = await this.executeEventSync(job, integration);
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

      // Update endpoint config sync status
      if (job.endpointConfigId) {
        await storage.updateEndpointConfigSyncStatus(
          job.endpointConfigId,
          'success',
          undefined,
          result.processedRecords
        );
      }

      logger.info(`Job ${job.id} completed. Processed: ${result.processedRecords}, Created: ${result.createdRecords}, Updated: ${result.updatedRecords}`);

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

        logger.info(`Job ${job.id} moved to dead letter queue after ${attempts} attempts`);
      }
    }
  }

  private async executeAttendeeSync(job: SyncJob, integration: any): Promise<SyncResult> {
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
          if (process.env.NODE_ENV !== 'production') {
            logger.info(`Skipping frozen event ${mapping.eventId}`);
          }
          totalSkipped++;
          continue;
        }

        if (syncSettings?.syncIntervalMinutes) {
          const attendeeSyncState = await storage.getEventSyncState(mapping.eventId, 'attendees');
          if (attendeeSyncState?.lastSyncAt) {
            const intervalMs = syncSettings.syncIntervalMinutes * 60 * 1000;
            const timeSinceLastSync = Date.now() - new Date(attendeeSyncState.lastSyncAt).getTime();
            if (timeSinceLastSync < intervalMs) {
              if (process.env.NODE_ENV !== 'production') {
                const minsRemaining = Math.round((intervalMs - timeSinceLastSync) / 60000);
                logger.info(`Skipping event ${mapping.eventId} — custom interval ${syncSettings.syncIntervalMinutes}m, next sync in ~${minsRemaining}m`);
              }
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
        totalCreated += result.createdCount || 0;
        totalUpdated += result.updatedCount || 0;
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

  private async executeEventSync(job: SyncJob, integration: any): Promise<SyncResult> {
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
