import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Attendee, PrintPreviewData } from "../types";
import { getAuthHeaders, clearSession } from "../utils";
import { offlineDB } from "@/lib/offline-db";
import { playCheckinSound, playRevertSound, playErrorSound } from "@/lib/sounds";

interface CheckinMutationOptions {
  eventId: string | undefined;
  onPrintPreview?: (data: PrintPreviewData) => void;
  onSuccess?: () => void;
}

interface SessionMutationOptions {
  sessionId: string;
}

/**
 * Centralized mutations for staff dashboard actions.
 * 
 * Why: All mutations share common patterns (auth headers, toast notifications,
 * cache invalidation). Centralizing prevents duplication and ensures
 * consistent user feedback across all actions.
 */
export function useStaffMutations(options: CheckinMutationOptions) {
  const { eventId, onPrintPreview, onSuccess } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const checkinMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      if (!navigator.onLine) {
        const success = await offlineDB.checkInAttendeeOffline(attendeeId);
        if (success) {
          await offlineDB.addToSyncQueue({
            action: 'checkin',
            entity: 'attendee',
            entityId: attendeeId,
            data: { attendeeId, eventId, checkedInAt: new Date().toISOString(), source: 'staff-offline' },
            timestamp: new Date().toISOString(),
            retryCount: 0,
          });
          const cached = await offlineDB.getAttendee(attendeeId);
          return { 
            attendee: cached ? {
              id: cached.id,
              firstName: cached.firstName,
              lastName: cached.lastName,
              email: cached.email,
              checkedIn: true,
              checkedInAt: new Date().toISOString(),
            } : { id: attendeeId, firstName: 'Attendee', lastName: '', email: '' },
            isOffline: true 
          };
        }
        throw new Error('Failed to check in offline');
      }

      const response = await fetch('/api/staff/checkin', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendeeId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Check-in failed');
      }
      const data = await response.json();
      
      await offlineDB.checkInAttendeeOffline(attendeeId);
      
      return data;
    },
    onSuccess: (data) => {
      const isOffline = data.isOffline;
      toast({
        title: isOffline ? "Checked in (offline)" : "Check-in successful",
        description: isOffline 
          ? `${data.attendee.firstName} ${data.attendee.lastName} checked in. Will sync when online.`
          : `${data.attendee.firstName} ${data.attendee.lastName} has been checked in.`,
      });
      playCheckinSound();
      queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
      onSuccess?.();
      
      if (!isOffline && data.printPreview?.enabled && data.printPreview?.template && onPrintPreview) {
        try {
          onPrintPreview({
            attendee: {
              ...data.attendee,
              badgePrinted: data.attendee.badgePrinted || false,
              badgePrintedAt: data.attendee.badgePrintedAt,
            },
            template: data.printPreview.template,
          });
        } catch (err) {
          console.error('Failed to set print preview data:', err);
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Check-in failed",
        description: error.message,
        variant: "destructive",
      });
      playErrorSound();
    },
  });

  const badgePrintedMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await fetch('/api/staff/badge-printed', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendeeId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to mark badge as printed');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge marked as printed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update badge status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revertCheckinMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await fetch('/api/staff/revert-checkin', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendeeId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Revert check-in failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Check-in reverted",
        description: `${data.attendee.firstName} ${data.attendee.lastName} check-in has been reverted.`,
      });
      playRevertSound();
      queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Revert failed",
        description: error.message,
        variant: "destructive",
      });
      playErrorSound();
    },
  });

  const updateAttendeeMutation = useMutation({
    mutationFn: async ({ attendeeId, data }: { attendeeId: string; data: { firstName: string; lastName: string; company: string; title: string } }) => {
      const response = await fetch(`/api/staff/attendees/${attendeeId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update attendee');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Attendee updated",
        description: `${data.attendee.firstName} ${data.attendee.lastName} has been updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addWalkinMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; company?: string; title?: string; participantType: string }) => {
      const response = await fetch('/api/staff/attendees', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add attendee');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Walk-in added",
        description: `${data.firstName} ${data.lastName} has been registered.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add attendee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/staff/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Logout failed');
      return response.json();
    },
    onSuccess: () => {
      clearSession();
      window.location.replace(`/staff/${eventId}`);
    },
  });

  return {
    checkinMutation,
    badgePrintedMutation,
    revertCheckinMutation,
    updateAttendeeMutation,
    addWalkinMutation,
    logoutMutation,
  };
}

/**
 * Session-specific mutations for session check-in/checkout.
 * Separated because they require a sessionId context.
 */
export function useSessionMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sessionCheckinMutation = useMutation({
    mutationFn: async ({ sessionId, attendeeId }: { sessionId: string; attendeeId: string }) => {
      const response = await fetch(`/api/staff/sessions/${sessionId}/checkin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendeeId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session check-in failed');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Session check-in successful",
        description: `${data.attendee.firstName} ${data.attendee.lastName} checked in to ${data.session.name}.`,
      });
      playCheckinSound();
      queryClient.invalidateQueries({ queryKey: ['/api/staff/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/sessions', variables.sessionId, 'registrations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Session check-in failed",
        description: error.message,
        variant: "destructive",
      });
      playErrorSound();
    },
  });

  const sessionCheckoutMutation = useMutation({
    mutationFn: async ({ sessionId, attendeeId }: { sessionId: string; attendeeId: string }) => {
      const response = await fetch(`/api/staff/sessions/${sessionId}/checkout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attendeeId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Session check-out failed');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Session check-out successful",
        description: `${data.attendee.firstName} ${data.attendee.lastName} checked out of ${data.session.name}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/sessions', variables.sessionId, 'registrations'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Session check-out failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    sessionCheckinMutation,
    sessionCheckoutMutation,
  };
}
