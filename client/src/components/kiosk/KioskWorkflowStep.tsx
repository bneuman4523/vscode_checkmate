import { useKiosk } from "./KioskContext";
import { WorkflowRunnerComponent } from "@/components/workflow/WorkflowRunner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function KioskWorkflowStep() {
  const { workflowAttendee, kioskWorkflow, eventId, exitPin, handleWorkflowComplete, handleWorkflowCancel } = useKiosk();

  if (!workflowAttendee || !kioskWorkflow) return null;

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-semibold">
          {workflowAttendee.firstName} {workflowAttendee.lastName}
        </h2>
        <p className="text-muted-foreground">Please complete the following steps</p>
      </div>
      <WorkflowRunnerComponent
        eventId={eventId!}
        attendeeId={workflowAttendee.id}
        attendee={workflowAttendee}
        mode="kiosk"
        kioskPin={exitPin}
        initialWorkflow={kioskWorkflow}
        onComplete={handleWorkflowComplete}
        showSkipButton={false}
      />
      <div className="text-center pt-2">
        <Button variant="outline" onClick={handleWorkflowCancel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
