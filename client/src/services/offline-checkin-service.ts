import { offlineDB, OfflineAttendee, PrintQueueItem } from '@/lib/offline-db';
import { apiRequest } from '@/lib/queryClient';

export interface CheckInResult {
  success: boolean;
  attendee?: OfflineAttendee;
  isOffline: boolean;
  message: string;
}

export interface OfflineStats {
  isOnline: boolean;
  pendingSyncActions: number;
  pendingPrintJobs: number;
  pendingAttendeeUpdates: number;
  lastSyncTime?: string;
}

class OfflineCheckinService {
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<(isOnline: boolean) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners();
      this.syncPendingActions();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners();
    });
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  onStatusChange(callback: (isOnline: boolean) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.isOnline));
  }

  async checkInAttendee(attendeeId: string, eventId?: string, source: string = 'kiosk'): Promise<CheckInResult> {

    if (this.isOnline) {
      try {
        const response = await apiRequest('POST', `/api/attendees/${attendeeId}/checkin`);
        const data = await response.json();
        
        await offlineDB.checkInAttendeeOffline(attendeeId);
        
        const attendee = await offlineDB.getAttendee(attendeeId);
        
        return {
          success: true,
          attendee: attendee || undefined,
          isOffline: false,
          message: 'Check-in successful',
        };
      } catch (error) {
        return this.checkInOffline(attendeeId, eventId, source);
      }
    } else {
      return this.checkInOffline(attendeeId, eventId, source);
    }
  }

  private async checkInOffline(attendeeId: string, eventId?: string, source: string = 'kiosk'): Promise<CheckInResult> {

    const success = await offlineDB.checkInAttendeeOffline(attendeeId);
    
    if (success) {
      await offlineDB.addToSyncQueue({
        action: 'checkin',
        entity: 'attendee',
        entityId: attendeeId,
        data: { attendeeId, eventId, source, checkedInAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      
      const attendee = await offlineDB.getAttendee(attendeeId);
      
      return {
        success: true,
        attendee: attendee || undefined,
        isOffline: true,
        message: 'Checked in offline. Will sync when online.',
      };
    }

    return {
      success: false,
      isOffline: true,
      message: 'Attendee not found in offline cache',
    };
  }

  async sessionCheckIn(sessionId: string, attendeeId: string, source: string = 'kiosk'): Promise<CheckInResult> {

    if (this.isOnline) {
      try {
        const response = await apiRequest('POST', `/api/sessions/${sessionId}/checkin`, {
          attendeeId,
          source,
        });
        const data = await response.json();
        
        return {
          success: true,
          isOffline: false,
          message: 'Session check-in successful',
        };
      } catch (error) {
        return this.sessionCheckInOffline(sessionId, attendeeId, source);
      }
    } else {
      return this.sessionCheckInOffline(sessionId, attendeeId, source);
    }
  }

  private async sessionCheckInOffline(sessionId: string, attendeeId: string, source: string): Promise<CheckInResult> {
    await offlineDB.addToSyncQueue({
      action: 'checkin',
      entity: 'session',
      entityId: sessionId,
      data: { sessionId, attendeeId, source, checkedInAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });

    return {
      success: true,
      isOffline: true,
      message: 'Session check-in saved offline. Will sync when online.',
    };
  }

  async queuePrintJob(
    attendeeId: string,
    attendeeName: string,
    eventId: string,
    badgeHtml: string,
    templateConfig: any
  ): Promise<string> {
    const jobId = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const printJob: PrintQueueItem = {
      id: jobId,
      attendeeId,
      attendeeName,
      eventId,
      badgeHtml,
      templateConfig,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    await offlineDB.addToPrintQueue(printJob);

    await offlineDB.markBadgePrintedOffline(attendeeId);

    if (!this.isOnline) {
      await offlineDB.addToSyncQueue({
        action: 'print',
        entity: 'badge',
        entityId: attendeeId,
        data: { attendeeId, eventId, printedAt: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
    }

    return jobId;
  }

  async getPendingPrintJobs(): Promise<PrintQueueItem[]> {
    return offlineDB.getPendingPrintJobs();
  }

  async markPrintJobComplete(jobId: string): Promise<void> {
    await offlineDB.updatePrintJob(jobId, {
      status: 'completed',
    });
  }

  async markPrintJobFailed(jobId: string, error: string): Promise<void> {
    const job = await offlineDB.getPrintJob(jobId);
    if (job) {
      const attempts = job.attempts + 1;
      await offlineDB.updatePrintJob(jobId, {
        status: attempts >= 3 ? 'failed' : 'pending',
        attempts,
        error,
      });
    }
  }

  async syncPendingActions(): Promise<{ synced: number; failed: number }> {
    if (this.syncInProgress || !this.isOnline) {
      return { synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = await offlineDB.getSyncQueue();

      for (const item of queue) {
        try {
          await this.processSyncItem(item);
          if (item.id) {
            await offlineDB.clearSyncQueueItem(item.id);
          }
          synced++;
        } catch (error) {
          console.error('[OfflineCheckin] Failed to sync item:', item, error);
          
          if (item.id) {
            const newRetryCount = (item.retryCount || 0) + 1;
            if (newRetryCount >= (item.maxRetries || 5)) {
              await offlineDB.clearSyncQueueItem(item.id);
              failed++;
            } else {
              await offlineDB.updateSyncQueueItem(item.id, { retryCount: newRetryCount });
            }
          }
        }
      }

      const pendingAttendees = await offlineDB.getPendingAttendees();
      for (const attendee of pendingAttendees) {
        try {
          if (attendee.checkedIn && attendee.syncStatus === 'pending') {
            await this.syncAttendeeCheckIn(attendee);
          }
        } catch (error) {
          console.error('[OfflineCheckin] Failed to sync attendee:', attendee.id, error);
        }
      }

      await offlineDB.saveAppState('lastSyncTime', new Date().toISOString());
    } finally {
      this.syncInProgress = false;
    }

    return { synced, failed };
  }

  private async processSyncItem(item: any): Promise<void> {
    switch (item.action) {
      case 'checkin':
        if (item.entity === 'attendee') {
          await apiRequest('POST', `/api/attendees/${item.entityId}/checkin`);
        } else if (item.entity === 'session') {
          await apiRequest('POST', `/api/sessions/${item.entityId}/checkin`, {
            attendeeId: item.data.attendeeId,
            source: item.data.source,
          });
        }
        break;
      
      case 'checkout':
        if (item.entity === 'session') {
          await apiRequest('POST', `/api/sessions/${item.entityId}/checkout`, {
            attendeeId: item.data.attendeeId,
            source: item.data.source,
          });
        }
        break;
      
      case 'print':
        await apiRequest('POST', `/api/attendees/${item.entityId}/badge-printed`);
        break;
      
      default:
        console.warn('[OfflineCheckin] Unknown sync action:', item.action);
    }
  }

  private async syncAttendeeCheckIn(attendee: OfflineAttendee): Promise<void> {
    await apiRequest('POST', `/api/attendees/${attendee.id}/checkin`);
    
    const updated = { ...attendee, syncStatus: 'synced' as const };
    await offlineDB.saveAttendee(updated);
  }

  async getOfflineStats(): Promise<OfflineStats> {
    const stats = await offlineDB.getOfflineStats();
    const lastSyncTime = await offlineDB.getAppState('lastSyncTime');
    
    return {
      isOnline: this.isOnline,
      ...stats,
      lastSyncTime,
    };
  }

  async getOfflineAttendees(eventId: string): Promise<OfflineAttendee[]> {
    return offlineDB.getAttendeesByEvent(eventId);
  }

  async searchOfflineAttendees(eventId: string, searchTerm: string): Promise<OfflineAttendee | undefined> {
    const attendees = await offlineDB.getAttendeesByEvent(eventId);
    const searchLower = searchTerm.toLowerCase().trim();
    
    return attendees.find(a => 
      a.id === searchTerm ||
      a.email?.toLowerCase() === searchLower ||
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) ||
      a.qrCode === searchTerm
    );
  }
}

export const offlineCheckinService = new OfflineCheckinService();
