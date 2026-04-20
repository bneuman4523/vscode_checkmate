import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Attendee, BadgeTemplateConfig, Session, SessionRegistration, WorkflowConfig } from "../types";
import { getAuthHeaders, clearSession } from "../utils";
import { offlineDB, OfflineAttendee } from "@/lib/offline-db";

/**
 * Centralized data fetching for the staff dashboard.
 * 
 * Why: All API queries are grouped here to:
 * 1. Share offline status detection
 * 2. Centralize cache invalidation patterns
 * 3. Maintain consistent error handling and auth redirect
 */
export function useStaffQueries(
  eventId: string | undefined,
  isAuthenticated: boolean,
  selectedSessionId?: string
) {
  const [, setLocation] = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCachedCount, setOfflineCachedCount] = useState(0);
  const [resolvedTemplateCache, setResolvedTemplateCache] = useState<Record<string, BadgeTemplateConfig | null>>({});
  const [templateResolutionError, setTemplateResolutionError] = useState<string | null>(null);

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

  interface StaffSessionResponse {
    settings: { allowWalkins: boolean; printPreviewOnCheckin: boolean; allowKioskFromStaff: boolean };
    event?: {
      id: string;
      name: string;
      customerId: string;
      syncSettings?: { selectedStatuses?: string[]; statusesConfigured?: boolean } | null;
      tempStaffSettings?: { defaultRegistrationStatusFilter?: string[] } | null;
    };
  }

  const sessionDataQuery = useQuery<StaffSessionResponse>({
    queryKey: ['/api/staff/session/data'],
    queryFn: async () => {
      const response = await fetch('/api/staff/session', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return { settings: { allowWalkins: false, printPreviewOnCheckin: false, allowKioskFromStaff: false } };
      const data = await response.json();
      return {
        settings: data.settings || { allowWalkins: false, printPreviewOnCheckin: false, allowKioskFromStaff: false },
        event: data.event || undefined,
      };
    },
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  const workflowQuery = useQuery<WorkflowConfig | null>({
    queryKey: ['/api/staff/workflow'],
    queryFn: async () => {
      const response = await fetch('/api/staff/workflow', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const badgeTemplatesQuery = useQuery<BadgeTemplateConfig[]>({
    queryKey: ['/api/staff/badge-templates'],
    queryFn: async () => {
      const response = await fetch('/api/staff/badge-templates', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const attendeesQuery = useQuery<Attendee[]>({
    queryKey: ['/api/staff/attendees'],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await offlineDB.getAttendeesByEvent(eventId || '');
        if (cached.length > 0) {
          return cached.map(a => ({
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            company: a.company || undefined,
            title: a.title || undefined,
            participantType: a.participantType,
            checkedIn: a.checkedIn,
            checkedInAt: a.checkedInAt || undefined,
            badgePrinted: a.badgePrinted,
            badgePrintedAt: a.badgePrintedAt || undefined,
            externalId: a.qrCode || undefined,
          })) as Attendee[];
        }
        throw new Error('No cached data available');
      }

      const response = await fetch('/api/staff/attendees', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      if (response.status === 401) {
        clearSession();
        setLocation(`/staff/${eventId}`);
        throw new Error('Session expired');
      }
      if (!response.ok) throw new Error('Failed to fetch attendees');
      const data = await response.json();

      if (eventId && data.length > 0) {
        for (const attendee of data) {
          const offlineAttendee: OfflineAttendee = {
            id: attendee.id,
            eventId: eventId,
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
            qrCode: attendee.externalId || attendee.id,
            customFields: attendee.customFields || undefined,
            syncStatus: 'synced',
            lastModified: new Date().toISOString(),
          };
          await offlineDB.saveAttendee(offlineAttendee);
        }
        setOfflineCachedCount(data.length);
      }

      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: isOnline ? 30000 : false,
    retry: isOnline ? 3 : 0,
  });

  const sessionsQuery = useQuery<Session[]>({
    queryKey: ['/api/staff/sessions'],
    queryFn: async () => {
      const response = await fetch('/api/staff/sessions', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const sessionRegistrationsQuery = useQuery<SessionRegistration[]>({
    queryKey: ['/api/staff/sessions', selectedSessionId, 'registrations'],
    queryFn: async () => {
      if (!selectedSessionId) return [];
      const response = await fetch(`/api/staff/sessions/${selectedSessionId}/registrations`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch registrations');
      return response.json();
    },
    enabled: isAuthenticated && !!selectedSessionId,
  });

  const resolveTemplateForAttendee = useCallback(async (attendeeId: string): Promise<BadgeTemplateConfig | null> => {
    if (resolvedTemplateCache[attendeeId] !== undefined) {
      setTemplateResolutionError(null);
      return resolvedTemplateCache[attendeeId];
    }
    
    try {
      const response = await fetch(`/api/staff/attendees/${attendeeId}/resolve-template`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        console.error('Failed to resolve template for attendee');
        setTemplateResolutionError('Failed to load badge template. Please try again.');
        return null;
      }
      const data = await response.json();
      const template = data.template as BadgeTemplateConfig | null;
      setResolvedTemplateCache(prev => ({ ...prev, [attendeeId]: template }));
      setTemplateResolutionError(null);
      return template;
    } catch (error) {
      console.error('Error resolving template:', error);
      setTemplateResolutionError('Network error loading badge template. Please try again.');
      return null;
    }
  }, [resolvedTemplateCache]);

  const clearTemplateCache = useCallback((attendeeId: string) => {
    setResolvedTemplateCache(prev => {
      const { [attendeeId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const hasActiveWorkflow = Boolean(
    workflowQuery.data?.enabled && 
    (workflowQuery.data?.steps?.filter(s => s.enabled).length ?? 0) > 0
  );

  const activeBadgeTemplate = (badgeTemplatesQuery.data?.length ?? 0) > 0 
    ? badgeTemplatesQuery.data![0] 
    : null;

  return {
    isOnline,
    offlineCachedCount,
    allowWalkins: sessionDataQuery.data?.settings?.allowWalkins ?? false,
    allowKioskFromStaff: sessionDataQuery.data?.settings?.allowKioskFromStaff ?? false,
    event: sessionDataQuery.data?.event ?? null,
    workflowConfig: workflowQuery.data ?? null,
    hasActiveWorkflow,
    badgeTemplates: badgeTemplatesQuery.data ?? [],
    activeBadgeTemplate,
    attendees: attendeesQuery.data ?? [],
    attendeesLoading: attendeesQuery.isLoading,
    refetchAttendees: attendeesQuery.refetch,
    sessions: sessionsQuery.data ?? [],
    sessionsLoading: sessionsQuery.isLoading,
    refetchSessions: sessionsQuery.refetch,
    sessionRegistrations: sessionRegistrationsQuery.data ?? [],
    registrationsLoading: sessionRegistrationsQuery.isLoading,
    refetchRegistrations: sessionRegistrationsQuery.refetch,
    resolveTemplateForAttendee,
    clearTemplateCache,
    templateResolutionError,
  };
}
