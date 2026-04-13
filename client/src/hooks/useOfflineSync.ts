import { useEffect, useState, useCallback } from 'react';
import { offlineDB, OfflineAttendee, OfflineEvent, OfflineBadgeTemplate } from '@/lib/offline-db';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingActions: number;
  cachedAttendees: number;
  cachedTemplates: number;
  error: string | null;
}

export interface UseOfflineSyncOptions {
  eventId: string;
  customerId: string;
  enabled?: boolean;
}

export function useOfflineSync({ eventId, customerId, enabled = true }: UseOfflineSyncOptions) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState(0);
  const [cachedAttendees, setCachedAttendees] = useState(0);
  const [cachedTemplates, setCachedTemplates] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cacheAttendees = useCallback(async () => {
    if (!eventId || !customerId) return;

    try {
      const response = await fetch(`/api/attendees?eventId=${eventId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch attendees');

      const attendees = await response.json();

      for (const attendee of attendees) {
        const offlineAttendee: OfflineAttendee = {
          id: attendee.id,
          eventId: attendee.eventId,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          email: attendee.email,
          company: attendee.company || undefined,
          title: attendee.title || undefined,
          participantType: attendee.participantType,
          checkedIn: attendee.checkedIn || false,
          checkedInAt: attendee.checkedInAt || undefined,
          badgePrinted: attendee.badgePrinted || false,
          badgePrintedAt: attendee.badgePrintedAt || undefined,
          qrCode: attendee.qrCode || attendee.externalId || attendee.id,
          customFields: attendee.customFields || undefined,
          syncStatus: 'synced',
          lastModified: new Date().toISOString(),
        };
        await offlineDB.saveAttendee(offlineAttendee);
      }

      setCachedAttendees(attendees.length);
      return attendees.length;
    } catch (err) {
      console.error('[OfflineSync] Failed to cache attendees:', err);
      throw err;
    }
  }, [eventId, customerId]);

  const cacheTemplates = useCallback(async () => {
    if (!customerId) return;

    try {
      const response = await fetch(`/api/badge-templates?customerId=${customerId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch templates');

      const templates = await response.json();

      for (const template of templates) {
        const offlineTemplate: OfflineBadgeTemplate = {
          id: template.id,
          customerId: template.customerId,
          name: template.name,
          participantType: template.participantType || 'General',
          width: template.width,
          height: template.height,
          backgroundColor: template.backgroundColor || '#ffffff',
          textColor: template.textColor || '#000000',
          accentColor: template.accentColor || '#0066cc',
          includeQR: template.includeQR ?? true,
          qrPosition: template.qrPosition,
          mergeFields: template.mergeFields,
          customFields: template.customFields,
          syncStatus: 'synced',
          lastModified: new Date().toISOString(),
        };
        await offlineDB.saveBadgeTemplate(offlineTemplate);
      }

      setCachedTemplates(templates.length);
      return templates.length;
    } catch (err) {
      console.error('[OfflineSync] Failed to cache templates:', err);
      throw err;
    }
  }, [customerId]);

  const cacheEvent = useCallback(async () => {
    if (!eventId || !customerId) return;

    try {
      const response = await fetch(`/api/events/${eventId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch event');

      const event = await response.json();

      const offlineEvent: OfflineEvent = {
        id: event.id,
        name: event.name,
        date: event.startDate || new Date().toISOString(),
        customerId: event.customerId,
        defaultBadgeTemplateId: event.defaultBadgeTemplateId,
        selectedTemplates: event.selectedTemplates || [],
        settings: event.settings || {},
        syncStatus: 'synced',
        lastModified: new Date().toISOString(),
      };
      await offlineDB.saveEvent(offlineEvent);

      return event;
    } catch (err) {
      console.error('[OfflineSync] Failed to cache event:', err);
      throw err;
    }
  }, [eventId, customerId]);

  const syncAll = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    setError(null);

    try {
      await Promise.all([
        cacheEvent(),
        cacheAttendees(),
        cacheTemplates(),
      ]);

      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      await offlineDB.saveAppState(`lastSync_${eventId}`, { timestamp: syncTime });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      console.error('[OfflineSync] Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, eventId, cacheEvent, cacheAttendees, cacheTemplates]);

  const refreshAttendees = useCallback(async () => {
    if (!isOnline) return;
    await cacheAttendees();
    queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
  }, [isOnline, eventId, cacheAttendees, queryClient]);

  useEffect(() => {
    if (!enabled || !eventId || !customerId) return;

    const loadCacheStatus = async () => {
      const state = await offlineDB.getAppState(`lastSync_${eventId}`);
      if (state?.timestamp) {
        setLastSyncTime(state.timestamp);
      }

      const attendees = await offlineDB.getAttendeesByEvent(eventId);
      setCachedAttendees(attendees.length);

      const pending = await offlineDB.getSyncQueue();
      setPendingActions(pending.length);
    };

    loadCacheStatus();

    if (isOnline) {
      syncAll();
    }
  }, [enabled, eventId, customerId, isOnline]);

  useEffect(() => {
    if (isOnline && pendingActions > 0) {
    }
  }, [isOnline, pendingActions]);

  const updatePendingCount = useCallback(async () => {
    const pending = await offlineDB.getSyncQueue();
    setPendingActions(pending.length);
  }, []);

  return {
    isOnline,
    isSyncing,
    lastSyncTime,
    pendingActions,
    cachedAttendees,
    cachedTemplates,
    error,
    syncAll,
    refreshAttendees,
    updatePendingCount,
  };
}
