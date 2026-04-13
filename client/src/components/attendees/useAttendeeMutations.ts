import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { playCheckinSound, playRevertSound, playErrorSound } from "@/lib/sounds";
import type { InsertAttendee } from "@shared/schema";

export interface AttendeeFormValues {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  participantType: string;
  externalId?: string;
  registrationStatus?: string;
}

export function useAttendeeMutations(eventId: string, callbacks?: {
  onAddSuccess?: () => void;
  onEditSuccess?: () => void;
  onDeleteSuccess?: () => void;
}) {
  const { toast } = useToast();
  const queryKey = [`/api/attendees?eventId=${eventId}`];

  const createAttendeeMutation = useMutation({
    mutationFn: async (data: AttendeeFormValues) => {
      const payload: Partial<InsertAttendee> = {
        eventId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        company: data.company || null,
        title: data.title || null,
        participantType: data.participantType,
        externalId: data.externalId || null,
        registrationStatus: data.registrationStatus || "Registered",
      };
      const response = await apiRequest("POST", "/api/attendees", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      callbacks?.onAddSuccess?.();
      toast({ title: "Attendee added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add attendee", variant: "destructive" });
    },
  });

  const updateAttendeeMutation = useMutation({
    mutationFn: async (data: AttendeeFormValues & { id: string }) => {
      const { id, ...updates } = data;
      const response = await apiRequest("PATCH", `/api/attendees/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      callbacks?.onEditSuccess?.();
      toast({ title: "Attendee updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update attendee", variant: "destructive" });
    },
  });

  const deleteAttendeeMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      await apiRequest("DELETE", `/api/attendees/${attendeeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      callbacks?.onDeleteSuccess?.();
      toast({ title: "Attendee deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete attendee", variant: "destructive" });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      return apiRequest("POST", `/api/attendees/${attendeeId}/checkin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Attendee checked in successfully" });
      playCheckinSound();
    },
    onError: () => {
      toast({ title: "Failed to check in attendee", variant: "destructive" });
      playErrorSound();
    },
  });

  const revertCheckInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      return apiRequest("DELETE", `/api/attendees/${attendeeId}/checkin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Check-in reverted successfully" });
      playRevertSound();
    },
    onError: () => {
      toast({ title: "Failed to revert check-in", variant: "destructive" });
      playErrorSound();
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (attendees: AttendeeFormValues[]) => {
      const results = await Promise.allSettled(
        attendees.map(async (attendee) => {
          const payload: Partial<InsertAttendee> = {
            eventId,
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            company: attendee.company || null,
            title: attendee.title || null,
            participantType: attendee.participantType,
          };
          const response = await apiRequest("POST", "/api/attendees", payload);
          return response.json();
        })
      );
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      return { successful, failed };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Import completed",
        description: `${data.successful} attendees imported${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Failed to import attendees", variant: "destructive" });
    },
  });

  return {
    createAttendeeMutation,
    updateAttendeeMutation,
    deleteAttendeeMutation,
    checkInMutation,
    revertCheckInMutation,
    bulkImportMutation,
  };
}
