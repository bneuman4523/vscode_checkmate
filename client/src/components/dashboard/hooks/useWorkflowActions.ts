import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Attendee, BadgeTemplateConfig } from "../types";

interface UseWorkflowActionsOptions {
  resolveTemplateForAttendee: (attendeeId: string) => Promise<BadgeTemplateConfig | null>;
  clearTemplateCache: (attendeeId: string) => void;
  checkinMutate: (attendeeId: string) => Promise<unknown>;
  hasActiveWorkflow: boolean;
}

/**
 * Manages workflow-related state and actions.
 * 
 * Why: Workflow logic involves complex state coordination (template resolution,
 * attendee selection, query invalidation). Extracting into a dedicated hook
 * keeps the main component focused on composition.
 */
export function useWorkflowActions(options: UseWorkflowActionsOptions) {
  const { resolveTemplateForAttendee, clearTemplateCache, checkinMutate, hasActiveWorkflow } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showWorkflowRunner, setShowWorkflowRunner] = useState(false);
  const [workflowAttendee, setWorkflowAttendee] = useState<Attendee | null>(null);
  const [workflowBadgeTemplate, setWorkflowBadgeTemplate] = useState<BadgeTemplateConfig | null>(null);
  const [isResolvingTemplate, setIsResolvingTemplate] = useState(false);

  const startWorkflowCheckin = useCallback(async (attendee: Attendee) => {
    setIsResolvingTemplate(true);
    setWorkflowBadgeTemplate(null);
    setWorkflowAttendee(attendee);
    
    await queryClient.invalidateQueries({ 
      queryKey: ['/api/staff/attendees', attendee.id, 'workflow-responses'] 
    });
    await queryClient.invalidateQueries({ 
      queryKey: ['/api/staff/attendees', attendee.id, 'signatures'] 
    });
    await queryClient.invalidateQueries({ 
      queryKey: ['/api/staff/workflow'] 
    });
    
    try {
      const resolvedTemplate = await resolveTemplateForAttendee(attendee.id);
      setWorkflowBadgeTemplate(resolvedTemplate);
      setShowWorkflowRunner(true);
    } catch (error) {
      setShowWorkflowRunner(true);
    } finally {
      setIsResolvingTemplate(false);
    }
  }, [resolveTemplateForAttendee, queryClient]);

  const handleWorkflowComplete = useCallback(async () => {
    if (!workflowAttendee) return;
    
    try {
      await checkinMutate(workflowAttendee.id);
      setShowWorkflowRunner(false);
      setWorkflowAttendee(null);
    } catch (error) {
      toast({
        title: "Check-in Failed",
        description: error instanceof Error ? error.message : "Failed to complete check-in. Please try again.",
        variant: "destructive",
      });
    }
  }, [workflowAttendee, checkinMutate, toast]);

  const handleWorkflowCancel = useCallback(() => {
    setShowWorkflowRunner(false);
    setWorkflowAttendee(null);
    setWorkflowBadgeTemplate(null);
  }, []);

  const handleCheckinClick = useCallback((attendee: Attendee, closeDialog?: () => void) => {
    closeDialog?.();
    if (hasActiveWorkflow) {
      startWorkflowCheckin(attendee);
    } else {
      checkinMutate(attendee.id);
    }
  }, [hasActiveWorkflow, startWorkflowCheckin, checkinMutate]);

  const retryTemplateResolution = useCallback(async () => {
    if (!workflowAttendee) return;
    clearTemplateCache(workflowAttendee.id);
    await startWorkflowCheckin(workflowAttendee);
  }, [workflowAttendee, clearTemplateCache, startWorkflowCheckin]);

  return {
    showWorkflowRunner,
    setShowWorkflowRunner,
    workflowAttendee,
    workflowBadgeTemplate,
    isResolvingTemplate,
    startWorkflowCheckin,
    handleWorkflowComplete,
    handleWorkflowCancel,
    handleCheckinClick,
    retryTemplateResolution,
  };
}
