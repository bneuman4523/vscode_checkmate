import { createChildLogger } from '../logger';

const logger = createChildLogger('AdaptiveSchedule');

export type SyncDataType = 'attendees' | 'sessions' | 'session_registrations';

interface EventDateInfo {
  startDate: Date | null;
  endDate: Date | null;
  timezone: string | null;
  postEventGracePeriodHours?: number;
}

interface AdaptiveIntervalResult {
  intervalMinutes: number | null; // null = do not schedule (sync complete for this event)
  reason: string; // Human-readable explanation for reporting
  phase: 'pre_event_far' | 'pre_event_approaching' | 'pre_event_day_of' | 'during_event' | 'post_event_grace' | 'post_event_complete' | 'no_dates' | 'disabled';
}

// Interval tables by data type and phase (in minutes)
const INTERVALS: Record<SyncDataType, Record<string, number>> = {
  attendees: {
    pre_event_far: 1440,       // 24 hours
    pre_event_approaching: 240, // 4 hours
    pre_event_day_of: 15,       // 15 minutes
    during_event: 5,            // 5 minutes
    post_event_grace: 30,       // 30 minutes
    no_dates: 1440,             // 24 hours fallback
  },
  sessions: {
    pre_event_far: 1440,       // 24 hours
    pre_event_approaching: 360, // 6 hours
    pre_event_day_of: 30,       // 30 minutes
    during_event: 15,           // 15 minutes
    post_event_grace: 30,       // 30 minutes
    no_dates: 1440,             // 24 hours fallback
  },
  session_registrations: {
    pre_event_far: 1440,       // 24 hours
    pre_event_approaching: 360, // 6 hours
    pre_event_day_of: 30,       // 30 minutes
    during_event: 10,           // 10 minutes
    post_event_grace: 30,       // 30 minutes
    no_dates: 1440,             // 24 hours fallback
  },
};

/**
 * Calculate the adaptive sync interval for a given event and data type.
 * Returns null if the event is past its grace period and should stop syncing.
 */
export function calculateAdaptiveSyncInterval(
  event: EventDateInfo,
  dataType: SyncDataType,
  now: Date = new Date()
): AdaptiveIntervalResult {
  const intervals = INTERVALS[dataType];
  const gracePeriodHours = event.postEventGracePeriodHours ?? 2;

  if (!event.startDate) {
    return {
      intervalMinutes: intervals.no_dates,
      reason: 'No event dates set — using default 24h interval',
      phase: 'no_dates',
    };
  }

  const msUntilStart = event.startDate.getTime() - now.getTime();
  const hoursUntilStart = msUntilStart / 3600000;

  // Determine event end (default: start + 8 hours if no end date)
  const eventEnd = event.endDate || new Date(event.startDate.getTime() + 8 * 3600000);
  const hoursAfterEnd = (now.getTime() - eventEnd.getTime()) / 3600000;

  // Post-event: past grace period — stop syncing
  if (hoursAfterEnd > gracePeriodHours) {
    return {
      intervalMinutes: null,
      reason: `Event ended ${Math.round(hoursAfterEnd)}h ago — past ${gracePeriodHours}h grace period, sync stopped`,
      phase: 'post_event_complete',
    };
  }

  // Post-event: within grace period
  if (hoursAfterEnd > 0 && hoursAfterEnd <= gracePeriodHours) {
    return {
      intervalMinutes: intervals.post_event_grace,
      reason: `Event ended ${Math.round(hoursAfterEnd * 10) / 10}h ago — grace period sync every ${intervals.post_event_grace}m`,
      phase: 'post_event_grace',
    };
  }

  // During event (between start and end)
  if (msUntilStart <= 0 && hoursAfterEnd <= 0) {
    return {
      intervalMinutes: intervals.during_event,
      reason: `Event is live — high frequency sync every ${intervals.during_event}m`,
      phase: 'during_event',
    };
  }

  // Day-of (0-24 hours before start)
  if (hoursUntilStart > 0 && hoursUntilStart <= 24) {
    return {
      intervalMinutes: intervals.pre_event_day_of,
      reason: `Event starts in ${Math.round(hoursUntilStart)}h — day-of sync every ${intervals.pre_event_day_of}m`,
      phase: 'pre_event_day_of',
    };
  }

  // Approaching (1-7 days before start)
  if (hoursUntilStart > 24 && hoursUntilStart <= 168) {
    const daysUntil = Math.round(hoursUntilStart / 24);
    return {
      intervalMinutes: intervals.pre_event_approaching,
      reason: `Event starts in ${daysUntil} days — approaching sync every ${intervals.pre_event_approaching / 60}h`,
      phase: 'pre_event_approaching',
    };
  }

  // Well before (more than 7 days)
  const daysUntil = Math.round(hoursUntilStart / 24);
  return {
    intervalMinutes: intervals.pre_event_far,
    reason: `Event starts in ${daysUntil} days — standard sync every ${intervals.pre_event_far / 60}h`,
    phase: 'pre_event_far',
  };
}

/**
 * Calculate the next sync timestamp based on adaptive interval.
 * Returns null if sync should be disabled (event complete).
 */
export function calculateNextSyncAt(
  event: EventDateInfo,
  dataType: SyncDataType,
  now: Date = new Date()
): Date | null {
  const result = calculateAdaptiveSyncInterval(event, dataType, now);
  if (result.intervalMinutes === null) return null;
  return new Date(now.getTime() + result.intervalMinutes * 60 * 1000);
}

/**
 * Calculate job priority based on event proximity.
 * Lower number = higher priority.
 */
export function calculateSyncPriority(
  event: { startDate: Date | null; endDate: Date | null },
  now: Date = new Date()
): number {
  if (!event.startDate) return 5;

  const hoursUntilStart = (event.startDate.getTime() - now.getTime()) / 3600000;
  const eventEnd = event.endDate || new Date(event.startDate.getTime() + 8 * 3600000);
  const isLive = hoursUntilStart <= 0 && now.getTime() < eventEnd.getTime();

  if (isLive) return 1;                        // Live event — highest priority
  if (hoursUntilStart > 0 && hoursUntilStart <= 24) return 2;  // Day-of
  if (hoursUntilStart > 24 && hoursUntilStart <= 168) return 3; // This week
  return 5;                                     // Default
}

/**
 * Check if session_registrations dependencies are met.
 * Requires at least one successful attendee sync AND one successful session sync.
 */
export function areDependenciesMet(
  attendeeLastSyncAt: Date | null,
  sessionLastSyncAt: Date | null
): { met: boolean; reason: string } {
  if (!attendeeLastSyncAt && !sessionLastSyncAt) {
    return { met: false, reason: 'Neither attendees nor sessions have been synced yet' };
  }
  if (!attendeeLastSyncAt) {
    return { met: false, reason: 'Attendees have not been synced yet' };
  }
  if (!sessionLastSyncAt) {
    return { met: false, reason: 'Sessions have not been synced yet' };
  }
  return { met: true, reason: 'All dependencies met' };
}
