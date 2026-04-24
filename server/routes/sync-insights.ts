import { createChildLogger } from '../logger';
import type { Express, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { SyncJob, EventSyncState, CustomerIntegration } from "@shared/schema";
import { eq, and, gte, lte, desc, count, or, isNull, inArray } from "drizzle-orm";

const logger = createChildLogger('SyncInsights');

// Parse time range string to start/end dates
function parseTimeRange(range: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  const match = range.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    start.setDate(start.getDate() - 7);
    return { start, end };
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      start.setMinutes(start.getMinutes() - value);
      break;
    case 'h':
      start.setHours(start.getHours() - value);
      break;
    case 'd':
      start.setDate(start.getDate() - value);
      break;
  }

  return { start, end };
}

// Map jobType to a friendly data type label
function jobTypeToDataType(jobType: string): string {
  switch (jobType) {
    case 'event_attendee_sync': return 'attendees';
    case 'event_session_sync': return 'sessions';
    case 'event_session_registration_sync': return 'session_registrations';
    case 'event_discovery': return 'events';
    case 'attendee_sync': return 'attendees';
    default: return jobType;
  }
}

export function registerSyncInsightsRoutes(app: Express): void {

  // =====================
  // GET /api/sync/metrics/:customerId
  // Summary metrics for a customer's sync activity
  // =====================
  app.get("/api/sync/metrics/:customerId", requireAuth, requireRole("super_admin", "admin"), async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const user = req.dbUser!;

      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const range = (req.query.range as string) || '7d';
      const { start, end } = parseTimeRange(range);

      // Get all events for this customer
      const customerEvents = await db.select({ id: schema.events.id })
        .from(schema.events)
        .where(eq(schema.events.customerId, customerId));

      const eventIds = customerEvents.map((e: { id: string }) => e.id);

      if (eventIds.length === 0) {
        return res.json({
          timeRange: { start: start.toISOString(), end: end.toISOString() },
          syncsCompleted: 0,
          syncsFailed: 0,
          attendeesSynced: 0,
          eventsSynced: 0,
          sessionsSynced: 0,
          activeIntegrations: 0,
          successRate: 100,
          avgDurationMs: 0,
          byDataType: {},
        });
      }

      // Get all sync jobs for this customer's events within the time range
      const jobs: SyncJob[] = await db.select()
        .from(schema.syncJobs)
        .where(
          and(
            inArray(schema.syncJobs.eventId, eventIds),
            gte(schema.syncJobs.createdAt, start),
            lte(schema.syncJobs.createdAt, end)
          )
        );

      // Also get jobs linked via integration (for event_discovery jobs that may not have eventId)
      const integrations = await db.select({ id: schema.customerIntegrations.id })
        .from(schema.customerIntegrations)
        .where(eq(schema.customerIntegrations.customerId, customerId));

      const integrationIds = integrations.map((i: { id: string }) => i.id);
      let discoveryJobs: SyncJob[] = [];
      if (integrationIds.length > 0) {
        discoveryJobs = await db.select()
          .from(schema.syncJobs)
          .where(
            and(
              inArray(schema.syncJobs.integrationId, integrationIds),
              isNull(schema.syncJobs.eventId),
              gte(schema.syncJobs.createdAt, start),
              lte(schema.syncJobs.createdAt, end)
            )
          );
      }

      const allJobs = [...jobs, ...discoveryJobs];

      const completed = allJobs.filter((j: SyncJob) => j.status === 'completed');
      const failed = allJobs.filter((j: SyncJob) => j.status === 'failed' || j.status === 'dead_letter');

      // Calculate average duration
      const jobsWithDuration = allJobs.filter((j: SyncJob) => j.startedAt && j.completedAt);
      const avgDurationMs = jobsWithDuration.length > 0
        ? Math.round(jobsWithDuration.reduce((sum: number, j: SyncJob) => {
            return sum + (new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime());
          }, 0) / jobsWithDuration.length)
        : 0;

      // Aggregate by data type
      const byDataType: Record<string, { completed: number; failed: number; records: number }> = {};
      for (const job of allJobs) {
        const dt = jobTypeToDataType(job.jobType);
        if (!byDataType[dt]) byDataType[dt] = { completed: 0, failed: 0, records: 0 };
        if (job.status === 'completed') byDataType[dt].completed++;
        if (job.status === 'failed' || job.status === 'dead_letter') byDataType[dt].failed++;
        byDataType[dt].records += (job.processedRecords || 0);
      }

      // Count unique events synced
      const syncedEventIds = allJobs.filter((j: SyncJob) => j.eventId).map((j: SyncJob) => j.eventId);
      const eventsSynced = new Set(syncedEventIds).size;

      // Count attendees synced
      const attendeesSynced = allJobs
        .filter((j: SyncJob) => j.jobType === 'event_attendee_sync' || j.jobType === 'attendee_sync')
        .reduce((sum: number, j: SyncJob) => sum + (j.processedRecords || 0), 0);

      // Count sessions synced
      const sessionsSynced = allJobs
        .filter((j: SyncJob) => j.jobType === 'event_session_sync')
        .reduce((sum: number, j: SyncJob) => sum + (j.processedRecords || 0), 0);

      const total = completed.length + failed.length;
      const successRate = total > 0 ? Math.round((completed.length / total) * 1000) / 10 : 100;

      res.json({
        timeRange: { start: start.toISOString(), end: end.toISOString() },
        syncsCompleted: completed.length,
        syncsFailed: failed.length,
        attendeesSynced,
        eventsSynced,
        sessionsSynced,
        activeIntegrations: integrationIds.length,
        successRate,
        avgDurationMs,
        byDataType,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get sync metrics");
      res.status(500).json({ error: error.message });
    }
  });

  // =====================
  // GET /api/sync/jobs/:customerId
  // Paginated list of sync jobs
  // =====================
  app.get("/api/sync/jobs/:customerId", requireAuth, requireRole("super_admin", "admin"), async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const user = req.dbUser!;

      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const range = (req.query.range as string) || '7d';
      const status = (req.query.status as string) || 'all';
      const dataType = (req.query.dataType as string) || 'all';
      const eventId = req.query.eventId as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const { start, end } = parseTimeRange(range);

      // Get events for this customer
      const customerEvents = await db.select({ id: schema.events.id, name: schema.events.name })
        .from(schema.events)
        .where(eq(schema.events.customerId, customerId));

      const eventMap = new Map(customerEvents.map((e: { id: string; name: string }) => [e.id, e.name] as [string, string]));
      const eventIds = customerEvents.map((e: { id: string; name: string }) => e.id);

      // Get integration IDs for discovery jobs
      const integrations = await db.select({ id: schema.customerIntegrations.id })
        .from(schema.customerIntegrations)
        .where(eq(schema.customerIntegrations.customerId, customerId));
      const integrationIds = integrations.map((i: { id: string }) => i.id);

      if (eventIds.length === 0 && integrationIds.length === 0) {
        return res.json({ jobs: [], total: 0, page, limit });
      }

      // Build conditions
      const conditions: any[] = [
        gte(schema.syncJobs.createdAt, start),
        lte(schema.syncJobs.createdAt, end),
      ];

      // Scope to this customer's events + integrations
      const scopeConditions: any[] = [];
      if (eventIds.length > 0) {
        scopeConditions.push(inArray(schema.syncJobs.eventId, eventIds));
      }
      if (integrationIds.length > 0) {
        scopeConditions.push(inArray(schema.syncJobs.integrationId, integrationIds));
      }
      if (scopeConditions.length === 1) {
        conditions.push(scopeConditions[0]);
      } else if (scopeConditions.length > 1) {
        conditions.push(or(...scopeConditions));
      }

      if (status !== 'all') {
        conditions.push(eq(schema.syncJobs.status, status));
      }

      if (dataType !== 'all') {
        const jobTypes: string[] = [];
        if (dataType === 'attendees') jobTypes.push('event_attendee_sync', 'attendee_sync');
        if (dataType === 'sessions') jobTypes.push('event_session_sync');
        if (dataType === 'session_registrations') jobTypes.push('event_session_registration_sync');
        if (dataType === 'events') jobTypes.push('event_discovery');
        if (jobTypes.length > 0) {
          conditions.push(inArray(schema.syncJobs.jobType, jobTypes));
        }
      }

      if (eventId) {
        conditions.push(eq(schema.syncJobs.eventId, eventId));
      }

      const where = and(...conditions);

      // Count total
      const [{ total: totalCount }] = await db.select({ total: count() })
        .from(schema.syncJobs)
        .where(where as any);

      // Fetch page
      const jobRows: SyncJob[] = await db.select()
        .from(schema.syncJobs)
        .where(where as any)
        .orderBy(desc(schema.syncJobs.createdAt))
        .limit(limit)
        .offset(offset);

      const jobs = jobRows.map((j: SyncJob) => {
        const durationMs = (j.startedAt && j.completedAt)
          ? new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()
          : null;
        return {
          id: j.id,
          jobType: j.jobType,
          eventId: j.eventId,
          eventName: j.eventId ? (eventMap.get(j.eventId) || 'Unknown') : null,
          status: j.status,
          triggerType: j.triggerType,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          durationMs,
          processedRecords: j.processedRecords,
          createdRecords: j.createdRecords,
          updatedRecords: j.updatedRecords,
          skippedRecords: j.skippedRecords,
          failedRecords: j.failedRecords,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt,
        };
      });

      res.json({
        jobs,
        total: Number(totalCount),
        page,
        limit,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get sync jobs");
      res.status(500).json({ error: error.message });
    }
  });

  // =====================
  // GET /api/sync/job-detail/:jobId
  // Full detail for a single sync job
  // =====================
  app.get("/api/sync/job-detail/:jobId", requireAuth, requireRole("super_admin", "admin"), async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const user = req.dbUser!;

      const [job]: SyncJob[] = await db.select()
        .from(schema.syncJobs)
        .where(eq(schema.syncJobs.id, jobId))
        .limit(1);

      if (!job) {
        return res.status(404).json({ error: "Sync job not found" });
      }

      // Verify access: get integration to find customer
      const [integration]: CustomerIntegration[] = await db.select()
        .from(schema.customerIntegrations)
        .where(eq(schema.customerIntegrations.id, job.integrationId))
        .limit(1);

      if (user.role !== 'super_admin' && integration && user.customerId !== integration.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Get event info if present
      let event = null;
      if (job.eventId) {
        const [evt] = await db.select({ id: schema.events.id, name: schema.events.name, eventDate: schema.events.eventDate })
          .from(schema.events)
          .where(eq(schema.events.id, job.eventId))
          .limit(1);
        event = evt || null;
      }

      // Get integration info
      let integrationInfo = null;
      if (integration) {
        integrationInfo = {
          id: integration.id,
          name: integration.name,
          providerId: integration.providerId,
          baseUrl: integration.baseUrl,
        };
      }

      // Get sync state if present
      let syncState = null;
      if (job.eventSyncStateId) {
        const [state]: EventSyncState[] = await db.select()
          .from(schema.eventSyncStates)
          .where(eq(schema.eventSyncStates.id, job.eventSyncStateId))
          .limit(1);
        syncState = state || null;
      }

      const durationMs = (job.startedAt && job.completedAt)
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null;

      res.json({
        job: {
          ...job,
          durationMs,
        },
        event,
        integration: integrationInfo,
        syncState,
        result: job.result || null,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get sync job detail");
      res.status(500).json({ error: error.message });
    }
  });

  // =====================
  // GET /api/sync/schedule/:customerId
  // Current sync schedule overview
  // =====================
  app.get("/api/sync/schedule/:customerId", requireAuth, requireRole("super_admin", "admin"), async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const user = req.dbUser!;

      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Get events for this customer
      const customerEvents = await db.select()
        .from(schema.events)
        .where(eq(schema.events.customerId, customerId))
        .orderBy(desc(schema.events.eventDate));

      const eventIds = customerEvents.map((e: { id: string }) => e.id);

      if (eventIds.length === 0) {
        return res.json({ schedules: [] });
      }

      // Get all sync states for these events
      const syncStates: EventSyncState[] = await db.select()
        .from(schema.eventSyncStates)
        .where(inArray(schema.eventSyncStates.eventId, eventIds));

      // Build schedule info per event per data type
      const schedules = syncStates.map((state: EventSyncState) => {
        const event = customerEvents.find((e: { id: string }) => e.id === state.eventId);
        const now = new Date();
        const eventDate = event?.eventDate ? new Date(event.eventDate) : null;

        // Determine adaptive phase
        let phase = 'standard';
        let phaseLabel = 'Standard';
        if (eventDate) {
          const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (hoursUntilEvent < 0 && hoursUntilEvent > -24) {
            phase = 'day-of';
            phaseLabel = 'Day-of: every 15m';
          } else if (hoursUntilEvent >= 0 && hoursUntilEvent <= 4) {
            phase = 'imminent';
            phaseLabel = 'Imminent: every 15m';
          } else if (hoursUntilEvent > 4 && hoursUntilEvent <= 24) {
            phase = 'approaching';
            phaseLabel = 'Approaching: every 1h';
          } else if (hoursUntilEvent > 24 && hoursUntilEvent <= 72) {
            phase = 'upcoming';
            phaseLabel = 'Upcoming: every 4h';
          } else if (hoursUntilEvent > 72) {
            phase = 'future';
            phaseLabel = `Future: every ${state.syncIntervalMinutes || 240}m`;
          } else {
            phase = 'past';
            phaseLabel = 'Past event';
          }
        }

        const isOverdue = !!(state.nextSyncAt && new Date(state.nextSyncAt) < now);

        return {
          eventId: state.eventId,
          eventName: event?.name || 'Unknown',
          eventDate: event?.eventDate,
          dataType: state.dataType,
          syncEnabled: state.syncEnabled,
          lastSyncAt: state.lastSyncAt,
          nextSyncAt: state.nextSyncAt,
          syncStatus: state.syncStatus,
          syncIntervalMinutes: state.syncIntervalMinutes,
          phase,
          phaseLabel,
          isOverdue,
          consecutiveFailures: state.consecutiveFailures,
          lastErrorMessage: state.lastErrorMessage,
          lastSyncDurationMs: state.lastSyncDurationMs,
          adaptiveScheduleEnabled: state.adaptiveScheduleEnabled,
          syncTier: state.syncTier,
        };
      });

      // Sort: overdue first, then by next sync time
      schedules.sort((a: { isOverdue: boolean; nextSyncAt: any }, b: { isOverdue: boolean; nextSyncAt: any }) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.nextSyncAt && b.nextSyncAt) {
          return new Date(a.nextSyncAt).getTime() - new Date(b.nextSyncAt).getTime();
        }
        return 0;
      });

      res.json({ schedules });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get sync schedule");
      res.status(500).json({ error: error.message });
    }
  });

  // =====================
  // GET /api/sync/health/:customerId
  // Quick health check
  // =====================
  app.get("/api/sync/health/:customerId", requireAuth, requireRole("super_admin", "admin"), async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const user = req.dbUser!;

      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Get integrations
      const integrations: CustomerIntegration[] = await db.select()
        .from(schema.customerIntegrations)
        .where(eq(schema.customerIntegrations.customerId, customerId));

      // Get events
      const customerEvents = await db.select({ id: schema.events.id })
        .from(schema.events)
        .where(eq(schema.events.customerId, customerId));
      const eventIds = customerEvents.map((e: { id: string }) => e.id);

      // Check for stuck jobs (running for more than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      let stuckJobs: SyncJob[] = [];
      if (eventIds.length > 0) {
        stuckJobs = await db.select()
          .from(schema.syncJobs)
          .where(
            and(
              inArray(schema.syncJobs.eventId, eventIds),
              eq(schema.syncJobs.status, 'running'),
              lte(schema.syncJobs.startedAt, tenMinutesAgo)
            )
          );
      }

      // Check for consecutive failures in sync states
      let failingStates: EventSyncState[] = [];
      if (eventIds.length > 0) {
        failingStates = await db.select()
          .from(schema.eventSyncStates)
          .where(
            and(
              inArray(schema.eventSyncStates.eventId, eventIds),
              gte(schema.eventSyncStates.consecutiveFailures, 3)
            )
          );
      }

      // Recent failures (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      let recentFailures: SyncJob[] = [];
      if (eventIds.length > 0) {
        recentFailures = await db.select()
          .from(schema.syncJobs)
          .where(
            and(
              inArray(schema.syncJobs.eventId, eventIds),
              or(
                eq(schema.syncJobs.status, 'failed'),
                eq(schema.syncJobs.status, 'dead_letter')
              ),
              gte(schema.syncJobs.completedAt, oneHourAgo)
            )
          );
      }

      // Determine overall health
      let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      const issues: string[] = [];

      if (stuckJobs.length > 0) {
        healthStatus = 'critical';
        issues.push(`${stuckJobs.length} stuck job(s) running for over 10 minutes`);
      }
      if (failingStates.length > 0) {
        healthStatus = healthStatus === 'critical' ? 'critical' : 'warning';
        issues.push(`${failingStates.length} sync state(s) with 3+ consecutive failures`);
      }
      if (recentFailures.length > 3) {
        healthStatus = healthStatus === 'critical' ? 'critical' : 'warning';
        issues.push(`${recentFailures.length} failed jobs in the last hour`);
      }

      res.json({
        status: healthStatus,
        integrationCount: integrations.length,
        stuckJobCount: stuckJobs.length,
        failingStateCount: failingStates.length,
        recentFailureCount: recentFailures.length,
        issues,
        integrations: integrations.map((i: CustomerIntegration) => ({
          id: i.id,
          name: i.name,
          providerId: i.providerId,
        })),
      });
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get sync health");
      res.status(500).json({ error: error.message });
    }
  });
}
