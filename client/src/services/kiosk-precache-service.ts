import { offlineDB, OfflineAttendee, OfflineEvent, OfflineBadgeTemplate } from '@/lib/offline-db';
import type { KioskBrandingConfig } from '@shared/schema';

export interface PreCacheProgress {
  phase: 'attendees' | 'templates' | 'events' | 'branding' | 'complete';
  current: number;
  total: number;
  message: string;
}

export interface PreCacheResult {
  success: boolean;
  attendeesCount: number;
  templatesCount: number;
  eventsCount: number;
  error?: string;
}

class KioskPreCacheService {
  private progressListeners: Set<(progress: PreCacheProgress) => void> = new Set();

  onProgress(callback: (progress: PreCacheProgress) => void) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  private notifyProgress(progress: PreCacheProgress) {
    this.progressListeners.forEach(cb => cb(progress));
  }

  async preCacheForEvent(
    eventId: string,
    customerId: string
  ): Promise<PreCacheResult> {
    
    try {
      this.notifyProgress({
        phase: 'events',
        current: 0,
        total: 1,
        message: 'Loading event data...',
      });

      const eventResponse = await fetch(`/api/events/${eventId}/scoped?customerId=${customerId}`, { credentials: 'include' });
      if (!eventResponse.ok) {
        throw new Error('Failed to fetch event');
      }
      const eventData = await eventResponse.json();
      
      const offlineEvent: OfflineEvent = {
        id: eventData.id,
        name: eventData.name,
        date: eventData.startDate || eventData.date || new Date().toISOString(),
        customerId: eventData.customerId,
        defaultBadgeTemplateId: eventData.defaultBadgeTemplateId,
        selectedTemplates: eventData.selectedTemplates || [],
        settings: eventData.settings || {},
        syncStatus: 'synced',
        lastModified: new Date().toISOString(),
      };
      await offlineDB.saveEvent(offlineEvent);

      this.notifyProgress({
        phase: 'events',
        current: 1,
        total: 1,
        message: 'Event data loaded',
      });

      // Cache branding (logo/banner are base64 data URLs, so storing the config is sufficient)
      this.notifyProgress({
        phase: 'branding',
        current: 0,
        total: 1,
        message: 'Caching branding assets...',
      });

      try {
        const launchInfoResponse = await fetch(`/api/kiosk/${eventId}/launch-info`);
        if (launchInfoResponse.ok) {
          const launchData = await launchInfoResponse.json();
          if (launchData.branding) {
            await offlineDB.saveAppState(`branding_${eventId}`, launchData.branding);
          }
        }
      } catch (brandingError) {
        // Branding cache is non-critical — log and continue
        console.warn('[KioskPreCache] Branding cache failed (non-critical):', brandingError);
      }

      this.notifyProgress({
        phase: 'branding',
        current: 1,
        total: 1,
        message: 'Branding assets cached',
      });

      this.notifyProgress({
        phase: 'attendees',
        current: 0,
        total: 100,
        message: 'Loading attendees...',
      });

      const attendeesResponse = await fetch(`/api/attendees?eventId=${eventId}&customerId=${customerId}`, { credentials: 'include' });
      if (!attendeesResponse.ok) {
        throw new Error('Failed to fetch attendees');
      }
      const attendeesData = await attendeesResponse.json();

      const offlineAttendees: OfflineAttendee[] = attendeesData.map((a: any) => ({
        id: a.id,
        eventId: a.eventId,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email || '',
        company: a.company,
        title: a.title,
        participantType: a.participantType || 'General',
        checkedIn: a.checkedIn || false,
        checkedInAt: a.checkedInAt,
        badgePrinted: a.badgePrinted || false,
        badgePrintedAt: a.badgePrintedAt,
        qrCode: a.qrCode || a.id,
        customFields: a.customFields,
        syncStatus: 'synced' as const,
        lastModified: new Date().toISOString(),
      }));

      await offlineDB.bulkSaveAttendees(offlineAttendees);

      this.notifyProgress({
        phase: 'attendees',
        current: offlineAttendees.length,
        total: offlineAttendees.length,
        message: `${offlineAttendees.length} attendees cached`,
      });

      this.notifyProgress({
        phase: 'templates',
        current: 0,
        total: 100,
        message: 'Loading badge templates...',
      });

      const templatesResponse = await fetch(`/api/badge-templates?customerId=${customerId}`, { credentials: 'include' });
      if (!templatesResponse.ok) {
        throw new Error('Failed to fetch badge templates');
      }
      const templatesData = await templatesResponse.json();

      const offlineTemplates: OfflineBadgeTemplate[] = templatesData.map((t: any) => ({
        id: t.id,
        customerId: t.customerId,
        name: t.name,
        participantType: t.participantType || 'General',
        width: t.width || 4,
        height: t.height || 3,
        backgroundColor: t.backgroundColor || '#ffffff',
        textColor: t.textColor || '#000000',
        accentColor: t.accentColor || '#3b82f6',
        includeQR: t.includeQR ?? true,
        qrPosition: t.qrPosition || 'bottom-right',
        mergeFields: t.mergeFields || [],
        customFields: t.customFields,
        syncStatus: 'synced' as const,
        lastModified: new Date().toISOString(),
      }));

      await offlineDB.bulkSaveTemplates(offlineTemplates);

      this.notifyProgress({
        phase: 'templates',
        current: offlineTemplates.length,
        total: offlineTemplates.length,
        message: `${offlineTemplates.length} templates cached`,
      });

      this.notifyProgress({
        phase: 'complete',
        current: 100,
        total: 100,
        message: 'Pre-cache complete! Ready for offline mode.',
      });

      await offlineDB.saveAppState(`precache_${eventId}`, {
        timestamp: new Date().toISOString(),
        attendeesCount: offlineAttendees.length,
        templatesCount: offlineTemplates.length,
      });


      return {
        success: true,
        attendeesCount: offlineAttendees.length,
        templatesCount: offlineTemplates.length,
        eventsCount: 1,
      };
    } catch (error) {
      console.error('[KioskPreCache] Pre-cache failed:', error);
      return {
        success: false,
        attendeesCount: 0,
        templatesCount: 0,
        eventsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getPreCacheStatus(eventId: string): Promise<{
    cached: boolean;
    timestamp?: string;
    attendeesCount?: number;
    templatesCount?: number;
  }> {
    const status = await offlineDB.getAppState(`precache_${eventId}`);
    if (status) {
      return {
        cached: true,
        timestamp: status.timestamp,
        attendeesCount: status.attendeesCount,
        templatesCount: status.templatesCount,
      };
    }
    return { cached: false };
  }

  async refreshCache(eventId: string, customerId: string): Promise<PreCacheResult> {
    return this.preCacheForEvent(eventId, customerId);
  }

  async clearEventCache(eventId: string): Promise<void> {
    const attendees = await offlineDB.getAttendeesByEvent(eventId);
    const db = await (offlineDB as any).init();
    
    for (const attendee of attendees) {
      await db.delete('attendees', attendee.id);
    }
    
    await db.delete('events', eventId);
    
    const appStateDb = await (offlineDB as any).init();
    await appStateDb.delete('appState', `precache_${eventId}`);
    await appStateDb.delete('appState', `branding_${eventId}`);
    
  }

  async getCachedAttendees(eventId: string): Promise<OfflineAttendee[]> {
    return offlineDB.getAttendeesByEvent(eventId);
  }

  async getCachedTemplates(customerId: string): Promise<OfflineBadgeTemplate[]> {
    return offlineDB.getBadgeTemplates(customerId);
  }

  async getCachedEvent(eventId: string): Promise<OfflineEvent | undefined> {
    return offlineDB.getEvent(eventId);
  }

  async getCachedBranding(eventId: string): Promise<KioskBrandingConfig | null> {
    const state = await offlineDB.getAppState(`branding_${eventId}`);
    return state ? (state as KioskBrandingConfig) : null;
  }

  async searchCachedAttendees(
    eventId: string,
    searchTerm: string
  ): Promise<OfflineAttendee | undefined> {
    const attendees = await offlineDB.getAttendeesByEvent(eventId);
    const searchLower = searchTerm.toLowerCase().trim();
    
    return attendees.find(a => 
      a.id === searchTerm ||
      a.email?.toLowerCase() === searchLower ||
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) ||
      a.qrCode === searchTerm
    );
  }

  async getCacheStats(): Promise<{
    totalAttendees: number;
    totalEvents: number;
    totalTemplates: number;
    lastUpdated: string | null;
  }> {
    const events = await offlineDB.getAllEvents();
    let totalAttendees = 0;
    
    for (const event of events) {
      const attendees = await offlineDB.getAttendeesByEvent(event.id);
      totalAttendees += attendees.length;
    }

    const allTemplates = await (offlineDB as any).init()
      .then((db: any) => db.getAll('badgeTemplates'));

    const lastSync = await offlineDB.getAppState('lastSyncTime');

    return {
      totalAttendees,
      totalEvents: events.length,
      totalTemplates: allTemplates.length,
      lastUpdated: lastSync,
    };
  }
}

export const kioskPreCacheService = new KioskPreCacheService();
