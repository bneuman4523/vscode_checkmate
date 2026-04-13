import { createChildLogger } from '../logger';
import { storage } from '../storage';
import type { DataRetentionPolicy } from '@shared/schema';

const logger = createChildLogger('DataRetention');

class DataRetentionWorker {
  private interval: NodeJS.Timeout | null = null;
  private readonly RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private isRunning = false;
  private stats = {
    lastRunAt: null as Date | null,
    eventsProcessed: 0,
    attendeesAffected: 0,
    notificationsSent: 0,
  };

  start(): void {
    if (this.interval) {
      logger.warn('Worker already running');
      return;
    }

    logger.info('Starting data retention worker');
    this.interval = setInterval(() => {
      this.runCycle().catch(error => {
        logger.error({ err: error }, 'Retention cycle failed');
      });
    }, this.RUN_INTERVAL_MS);

    setTimeout(() => {
      this.runCycle().catch(error => {
        logger.error({ err: error }, 'Initial retention cycle failed');
      });
    }, 60 * 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Data retention worker stopped');
    }
  }

  async runCycle(): Promise<void> {
    if (this.isRunning) {
      logger.info('Retention cycle already in progress, skipping');
      return;
    }

    this.isRunning = true;
    this.stats.lastRunAt = new Date();

    try {
      await this.sendUpcomingNotifications();
      await this.processEligibleEvents();
    } catch (error) {
      logger.error({ err: error }, 'Retention cycle error');
    } finally {
      this.isRunning = false;
    }
  }

  private async sendUpcomingNotifications(): Promise<void> {
    try {
      const pending = await storage.getEventsPendingRetentionNotification();

      for (const item of pending) {
        try {
          const daysUntil = Math.ceil(
            (item.eligibleDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );

          logger.info({
            eventId: item.event.id,
            eventName: item.event.name,
            customerId: item.customer.id,
            customerName: item.customer.name,
            action: item.policy.action,
            attendeeCount: item.attendeeCount,
            daysUntilAction: daysUntil,
          }, `Retention ${item.policy.action} scheduled in ${daysUntil} days`);

          const hasEventOverride = !!(item.event as any).dataRetentionOverride;
          await storage.logRetentionAction({
            customerId: item.customer.id,
            eventId: item.event.id,
            eventName: item.event.name,
            action: 'notify',
            attendeesAffected: item.attendeeCount,
            retentionDays: item.policy.retentionDays,
            retentionBasis: item.policy.retentionBasis,
            eligibleDate: item.eligibleDate,
            policySource: hasEventOverride ? 'event_override' : 'account',
            details: {
              notifyDaysBefore: item.policy.notifyDaysBefore,
              daysUntilAction: daysUntil,
              scheduledAction: item.policy.action,
              customerEmail: item.customer.contactEmail,
            },
          });

          await storage.markEventRetentionNotified(item.event.id);
          this.stats.notificationsSent++;

          logger.info({ eventId: item.event.id }, 'Retention notification logged');
        } catch (error) {
          logger.error({ err: error, eventId: item.event.id }, 'Failed to send retention notification');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to check pending notifications');
    }
  }

  private async processEligibleEvents(): Promise<void> {
    try {
      const eligible = await storage.getEventsEligibleForRetention();

      logger.info(`Found ${eligible.length} events eligible for retention processing`);

      for (const item of eligible) {
        try {
          const { event, customer, policy, policySource, eligibleDate, attendeeCount } = item;

          if (attendeeCount === 0) {
            await storage.markEventRetentionProcessed(event.id);
            logger.info({ eventId: event.id }, 'Event has no attendees, marked as processed');
            continue;
          }

          logger.info({
            eventId: event.id,
            eventName: event.name,
            customerId: customer.id,
            action: policy.action,
            attendeeCount,
            policySource,
          }, `Processing retention: ${policy.action} for ${attendeeCount} attendees`);

          let affected = 0;

          if (policy.action === 'anonymize') {
            affected = await storage.anonymizeEventAttendees(event.id);
          } else if (policy.action === 'delete') {
            affected = attendeeCount;
            await storage.deleteEvent(event.id);
          }

          if (policy.action === 'anonymize') {
            await storage.markEventRetentionProcessed(event.id);
          }

          await storage.logRetentionAction({
            customerId: customer.id,
            eventId: event.id,
            eventName: event.name,
            action: policy.action,
            attendeesAffected: affected,
            retentionDays: policy.retentionDays,
            retentionBasis: policy.retentionBasis,
            eligibleDate,
            policySource,
            details: {
              customerName: customer.name,
              eventDate: event.eventDate?.toISOString(),
              endDate: event.endDate?.toISOString(),
            },
          });

          this.stats.eventsProcessed++;
          this.stats.attendeesAffected += affected;

          logger.info({
            eventId: event.id,
            action: policy.action,
            affected,
          }, `Retention ${policy.action} completed`);
        } catch (error) {
          logger.error({ err: error, eventId: item.event.id }, 'Failed to process event retention');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to process eligible events');
    }
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      workerActive: this.interval !== null,
    };
  }
}

export const dataRetentionWorker = new DataRetentionWorker();
