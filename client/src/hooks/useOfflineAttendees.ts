import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { offlineDB, OfflineAttendee } from '@/lib/offline-db';
import { apiRequest } from '@/lib/queryClient';

export interface UseOfflineAttendeesOptions {
  eventId: string;
  enabled?: boolean;
}

export interface OfflineCheckInResult {
  success: boolean;
  isOffline: boolean;
  message: string;
  attendee?: OfflineAttendee;
}

export function useOfflineAttendees({ eventId, enabled = true }: UseOfflineAttendeesOptions) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineAttendees, setOfflineAttendees] = useState<OfflineAttendee[]>([]);

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

  const { data: onlineAttendees, isLoading: isLoadingOnline, error: onlineError } = useQuery({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    queryFn: async () => {
      const response = await fetch(`/api/attendees?eventId=${eventId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch attendees');
      return response.json();
    },
    enabled: enabled && isOnline,
    staleTime: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (!enabled || !eventId) return;

    const loadOfflineAttendees = async () => {
      const cached = await offlineDB.getAttendeesByEvent(eventId);
      setOfflineAttendees(cached);
    };

    loadOfflineAttendees();
  }, [eventId, enabled]);

  useEffect(() => {
    if (onlineAttendees && Array.isArray(onlineAttendees)) {
      const cacheAttendees = async () => {
        for (const attendee of onlineAttendees) {
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
        setOfflineAttendees(await offlineDB.getAttendeesByEvent(eventId));
      };
      cacheAttendees();
    }
  }, [onlineAttendees, eventId]);

  const attendees = isOnline && onlineAttendees ? onlineAttendees : offlineAttendees;
  const isLoading = isOnline ? isLoadingOnline : false;

  const findAttendeeByQR = useCallback(async (qrCode: string): Promise<OfflineAttendee | null> => {
    const cached = await offlineDB.getAttendeesByEvent(eventId);
    const found = cached.find(a => 
      a.qrCode === qrCode || 
      a.id === qrCode || 
      a.email?.toLowerCase() === qrCode.toLowerCase()
    );
    return found || null;
  }, [eventId]);

  const findAttendeeBySearch = useCallback(async (query: string): Promise<OfflineAttendee[]> => {
    const cached = await offlineDB.getAttendeesByEvent(eventId);
    const lowerQuery = query.toLowerCase();
    return cached.filter(a =>
      a.firstName.toLowerCase().includes(lowerQuery) ||
      a.lastName.toLowerCase().includes(lowerQuery) ||
      a.email.toLowerCase().includes(lowerQuery) ||
      a.company?.toLowerCase().includes(lowerQuery)
    );
  }, [eventId]);

  const checkInAttendee = useCallback(async (attendeeId: string): Promise<OfflineCheckInResult> => {

    if (isOnline) {
      try {
        await apiRequest('POST', `/api/attendees/${attendeeId}/checkin`);
        
        await offlineDB.checkInAttendeeOffline(attendeeId);
        
        queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
        
        const attendee = await offlineDB.getAttendee(attendeeId);
        
        return {
          success: true,
          isOffline: false,
          message: 'Check-in successful',
          attendee: attendee || undefined,
        };
      } catch (error) {
        return performOfflineCheckIn(attendeeId);
      }
    } else {
      return performOfflineCheckIn(attendeeId);
    }
  }, [isOnline, eventId, queryClient]);

  const performOfflineCheckIn = async (attendeeId: string): Promise<OfflineCheckInResult> => {
    const success = await offlineDB.checkInAttendeeOffline(attendeeId);

    if (success) {
      await offlineDB.addToSyncQueue({
        action: 'checkin',
        entity: 'attendee',
        entityId: attendeeId,
        data: { 
          attendeeId, 
          eventId, 
          checkedInAt: new Date().toISOString(),
          source: 'offline'
        },
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });

      const attendee = await offlineDB.getAttendee(attendeeId);
      setOfflineAttendees(await offlineDB.getAttendeesByEvent(eventId));

      return {
        success: true,
        isOffline: true,
        message: 'Checked in offline. Will sync when online.',
        attendee: attendee || undefined,
      };
    }

    return {
      success: false,
      isOffline: true,
      message: 'Attendee not found in offline cache',
    };
  };

  const revertCheckIn = useCallback(async (attendeeId: string): Promise<OfflineCheckInResult> => {
    if (isOnline) {
      try {
        await apiRequest('DELETE', `/api/attendees/${attendeeId}/checkin`);
        
        const attendee = await offlineDB.getAttendee(attendeeId);
        if (attendee) {
          attendee.checkedIn = false;
          attendee.checkedInAt = undefined;
          await offlineDB.saveAttendee(attendee);
        }
        
        queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
        
        return {
          success: true,
          isOffline: false,
          message: 'Check-in reverted',
        };
      } catch (error) {
        return {
          success: false,
          isOffline: false,
          message: 'Failed to revert check-in',
        };
      }
    } else {
      return {
        success: false,
        isOffline: true,
        message: 'Cannot revert check-in while offline',
      };
    }
  }, [isOnline, eventId, queryClient]);

  return {
    attendees,
    isLoading,
    isOnline,
    error: onlineError,
    findAttendeeByQR,
    findAttendeeBySearch,
    checkInAttendee,
    revertCheckIn,
    offlineCount: offlineAttendees.length,
  };
}
