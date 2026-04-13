import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { WorkflowRunner } from "@/components/workflow/WorkflowRunner";
import type { Attendee, BadgeTemplateConfig, WorkflowConfig, StaffSession } from "../../types";

interface WorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  attendee: Attendee | null;
  workflowConfig: WorkflowConfig | null;
  badgeTemplate: BadgeTemplateConfig | null;
  session: StaffSession | null;
  isResolvingTemplate: boolean;
  templateResolutionError: string | null;
  onComplete: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * Dialog wrapper for the WorkflowRunner component.
 * 
 * Why: The workflow dialog manages template resolution states (loading,
 * error, success) and conditionally renders the WorkflowRunner.
 * Isolating it keeps this complex state management separate.
 */
export function WorkflowDialog({
  open,
  onOpenChange,
  eventId,
  attendee,
  workflowConfig,
  badgeTemplate,
  session,
  isResolvingTemplate,
  templateResolutionError,
  onComplete,
  onCancel,
  onRetry,
}: WorkflowDialogProps) {
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      onCancel();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Check-In Workflow
          </DialogTitle>
          {attendee && (
            <DialogDescription>
              Completing check-in for {attendee.firstName} {attendee.lastName}
            </DialogDescription>
          )}
        </DialogHeader>
        {attendee && workflowConfig && eventId && (
          isResolvingTemplate ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading badge template...</p>
            </div>
          ) : templateResolutionError ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Alert variant="destructive">
                <AlertDescription>{templateResolutionError}</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onRetry}>
                  Retry
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {!badgeTemplate && (
                <Alert className="bg-amber-50 border-amber-200 mb-4">
                  <AlertDescription className="text-amber-800">
                    No badge template configured for attendee type "{attendee.participantType || 'General'}". 
                    Badge printing will be skipped.
                  </AlertDescription>
                </Alert>
              )}
              <WorkflowRunner
                eventId={eventId}
                attendeeId={attendee.id}
                attendeeData={{
                  firstName: attendee.firstName,
                  lastName: attendee.lastName,
                  email: attendee.email,
                  company: attendee.company,
                  title: attendee.title,
                  participantType: attendee.participantType,
                  externalId: attendee.externalId,
                }}
                workflow={workflowConfig}
                onComplete={onComplete}
                onCancel={onCancel}
                mode="staff"
                badgeTemplate={badgeTemplate || undefined}
                autoPrint={!session?.printPreviewOnCheckin}
              />
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
