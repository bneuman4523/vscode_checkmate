import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  ChevronRight,
  Check,
  AlertCircle,
  Eraser,
  Loader2,
  PenTool,
} from "lucide-react";
import { WorkflowRunner } from "@/components/workflow/WorkflowRunner";
import type { WorkflowRunnerProps } from "@/components/workflow/WorkflowRunner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroupMemberInfo {
  id: string;
  firstName: string;
  lastName: string;
}

export interface GroupWorkflowRunnerProps {
  eventId: string;
  primaryAttendeeId: string;
  /**
   * All selected members (excluding primary — the primary is implied).
   * If the primary should also appear in the member list, include them.
   */
  selectedMembers: GroupMemberInfo[];
  groupDisclaimerMode: "group" | "individual";
  onComplete: () => void;
  onCancel: () => void;
  mode: "kiosk" | "staff";

  // Pass-through props for WorkflowRunner
  workflow: WorkflowRunnerProps["workflow"];
  badgeTemplate?: WorkflowRunnerProps["badgeTemplate"];
  /** Primary attendee data needed by WorkflowRunner */
  primaryAttendeeData: WorkflowRunnerProps["attendeeData"];
}

type Phase =
  | "primary-workflow" // Running the normal WorkflowRunner for the primary
  | "disclaimer-queue" // Cycling through individual member disclaimers
  | "complete"; // All done

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the disclaimer steps from a workflow config */
function getDisclaimerSteps(workflow: WorkflowRunnerProps["workflow"]) {
  if (!workflow.enabled) return [];
  return workflow.steps.filter((s) => s.enabled && s.stepType === "disclaimer");
}

// ---------------------------------------------------------------------------
// GroupDisclaimerQueue — handles cycling through members for individual signing
// ---------------------------------------------------------------------------

interface DisclaimerQueueProps {
  eventId: string;
  disclaimerSteps: WorkflowRunnerProps["workflow"]["steps"];
  members: GroupMemberInfo[];
  mode: "kiosk" | "staff";
  onComplete: () => void;
  onCancel: () => void;
}

function GroupDisclaimerQueue({
  eventId,
  disclaimerSteps,
  members,
  mode,
  onComplete,
  onCancel,
}: DisclaimerQueueProps) {
  const isKiosk = mode === "kiosk";

  // Track which member we're on (index into members[])
  const [currentMemberIdx, setCurrentMemberIdx] = useState(0);
  // Track which disclaimer step within the current member (if multiple disclaimers)
  const [currentDisclaimerIdx, setCurrentDisclaimerIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signature state for the current disclaimer
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasInitializedRef = useRef(false);

  const currentMember = members[currentMemberIdx];
  const currentStep = disclaimerSteps[currentDisclaimerIdx];
  const disclaimer = currentStep?.disclaimer;

  const totalSignatures = members.length * disclaimerSteps.length;
  const currentSignatureNumber =
    currentMemberIdx * disclaimerSteps.length + currentDisclaimerIdx + 1;

  // Reset canvas when member or disclaimer changes
  useEffect(() => {
    canvasInitializedRef.current = false;
    setSignatureData(null);
    setHasAgreed(false);
    setHasSignature(false);
    setError(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
    canvasInitializedRef.current = true;
  }, [currentMemberIdx, currentDisclaimerIdx]);

  // ---------------------------------------------------------------------------
  // Canvas drawing handlers
  // ---------------------------------------------------------------------------
  const getCoordinates = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        const touch = e.touches[0];
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const coords = getCoordinates(e);
      if (!coords) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      setIsDrawing(true);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    },
    [getCoordinates]
  );

  const draw = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!isDrawing) return;
      const coords = getCoordinates(e);
      if (!coords) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    },
    [isDrawing, getCoordinates]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL("image/png"));
    }
  }, [isDrawing]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
    setHasSignature(false);
    setSignatureData(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Save and advance
  // ---------------------------------------------------------------------------
  const saveSignatureForMember = useCallback(
    async (memberId: string, disclaimerId: string, sigData: string) => {
      const authToken =
        mode === "staff"
          ? localStorage.getItem("staffToken") || undefined
          : undefined;

      const endpoint =
        mode === "staff"
          ? `/api/staff/attendees/${memberId}/signatures`
          : `/api/events/${eventId}/attendees/${memberId}/signatures`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (mode === "staff" && authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          disclaimerId,
          signatureData: sigData,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Failed to save signature"
        );
      }
      return res.json();
    },
    [eventId, mode]
  );

  const handleNext = useCallback(async () => {
    if (!disclaimer || !currentMember) return;

    // Validate
    if (disclaimer.requireSignature) {
      if (!hasAgreed) {
        setError("Please agree to the disclaimer to continue");
        return;
      }
      if (!hasSignature || !signatureData) {
        setError("Please sign the disclaimer to continue");
        return;
      }
    } else {
      if (!hasAgreed) {
        setError("Please agree to the disclaimer to continue");
        return;
      }
    }

    setError(null);
    setIsSaving(true);

    try {
      const sigValue = disclaimer.requireSignature
        ? signatureData!
        : "agreed";
      await saveSignatureForMember(
        currentMember.id,
        disclaimer.id,
        sigValue
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save signature"
      );
      setIsSaving(false);
      return;
    }

    setIsSaving(false);

    // Advance to next disclaimer or next member
    if (currentDisclaimerIdx < disclaimerSteps.length - 1) {
      setCurrentDisclaimerIdx((prev) => prev + 1);
    } else if (currentMemberIdx < members.length - 1) {
      setCurrentMemberIdx((prev) => prev + 1);
      setCurrentDisclaimerIdx(0);
    } else {
      // All done
      onComplete();
    }
  }, [
    disclaimer,
    currentMember,
    hasAgreed,
    hasSignature,
    signatureData,
    saveSignatureForMember,
    currentDisclaimerIdx,
    disclaimerSteps.length,
    currentMemberIdx,
    members.length,
    onComplete,
  ]);

  if (!disclaimer || !currentMember) {
    // No disclaimers to show — skip straight to complete
    onComplete();
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border p-4",
          isKiosk ? "p-6" : "p-4"
        )}
        data-testid="group-disclaimer-progress"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "rounded-full bg-primary/10 flex items-center justify-center",
              isKiosk ? "h-12 w-12" : "h-10 w-10"
            )}
          >
            <PenTool
              className={cn(
                "text-primary",
                isKiosk ? "h-6 w-6" : "h-5 w-5"
              )}
            />
          </div>
          <div>
            <p
              className={cn(
                "font-semibold",
                isKiosk ? "text-xl" : "text-base"
              )}
            >
              Signature {currentSignatureNumber} of {totalSignatures}
            </p>
            <p
              className={cn(
                "text-muted-foreground",
                isKiosk ? "text-base" : "text-sm"
              )}
            >
              {currentMember.firstName} {currentMember.lastName}
            </p>
          </div>
        </div>

        {/* Mini progress dots */}
        <div className="flex gap-1.5">
          {members.map((m, idx) => (
            <div
              key={m.id}
              className={cn(
                "rounded-full transition-colors",
                isKiosk ? "h-3 w-3" : "h-2 w-2",
                idx < currentMemberIdx
                  ? "bg-green-500"
                  : idx === currentMemberIdx
                    ? "bg-primary"
                    : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Kiosk hand-off prompt */}
      {isKiosk && (
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <AlertDescription
            className={cn(
              "text-blue-800 dark:text-blue-200",
              isKiosk ? "text-lg" : "text-sm"
            )}
          >
            Please hand the device to{" "}
            <strong>
              {currentMember.firstName} {currentMember.lastName}
            </strong>{" "}
            to sign.
          </AlertDescription>
        </Alert>
      )}

      {/* Disclaimer content */}
      <Card>
        <CardHeader>
          <CardTitle
            className={isKiosk ? "text-xl" : undefined}
            data-testid="group-disclaimer-title"
          >
            {disclaimer.title}
          </CardTitle>
          <CardDescription className={isKiosk ? "text-base" : undefined}>
            {currentMember.firstName}, please read carefully and sign below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className={cn("rounded-md border p-4", isKiosk ? "h-40" : "h-48")}>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: disclaimer.disclaimerText
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#x27;")
                  .replace(/\n/g, "<br/>"),
              }}
            />
          </ScrollArea>

          {/* Agreement checkbox */}
          <div
            className={cn(
              "flex items-start space-x-3 p-3 rounded-md border transition-colors",
              error && !hasAgreed
                ? "border-destructive bg-destructive/5"
                : "border-transparent"
            )}
          >
            <Checkbox
              id={`agreement-${currentMember.id}`}
              checked={hasAgreed}
              onCheckedChange={(checked) => setHasAgreed(!!checked)}
              disabled={isSaving}
              data-testid="group-disclaimer-agreement"
              className={cn(
                isKiosk && "h-6 w-6",
                error && !hasAgreed ? "border-destructive" : ""
              )}
            />
            <Label
              htmlFor={`agreement-${currentMember.id}`}
              className={cn(
                "font-normal leading-relaxed cursor-pointer",
                isKiosk ? "text-base" : "text-sm"
              )}
            >
              {disclaimer.confirmationText}
            </Label>
          </div>

          {/* Signature pad */}
          {disclaimer.requireSignature && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className={cn("font-medium", isKiosk ? "text-lg" : "text-base")}>
                  {currentMember.firstName}'s Signature
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size={isKiosk ? "default" : "sm"}
                  onClick={clearSignature}
                  disabled={isSaving}
                  data-testid="group-disclaimer-clear-signature"
                >
                  <Eraser className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>

              <div className="border rounded-md overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={isKiosk ? 600 : 400}
                  height={isKiosk ? 200 : 150}
                  data-testid="group-disclaimer-signature-canvas"
                  className={cn(
                    "w-full cursor-crosshair touch-none",
                    isKiosk ? "h-[200px]" : "h-[150px]"
                  )}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>

              {!hasSignature && (
                <p
                  className={cn(
                    "text-muted-foreground flex items-center gap-2",
                    isKiosk ? "text-base" : "text-sm"
                  )}
                >
                  <AlertCircle className="h-4 w-4" />
                  Please sign in the box above using your mouse or finger.
                </p>
              )}

              {hasSignature && hasAgreed && (
                <p
                  className={cn(
                    "text-green-600 flex items-center gap-2",
                    isKiosk ? "text-base" : "text-sm"
                  )}
                >
                  <Check className="h-4 w-4" />
                  Signature captured.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      <div
        className={cn(
          "flex items-center gap-3 pt-4 border-t",
          isKiosk ? "flex-col" : "flex-row justify-between"
        )}
      >
        {mode !== "kiosk" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="text-muted-foreground"
            data-testid="group-disclaimer-cancel"
          >
            Cancel
          </Button>
        )}

        <Button
          onClick={handleNext}
          disabled={isSaving}
          className={cn(
            isKiosk ? "w-full h-16 text-xl" : "ml-auto"
          )}
          data-testid="group-disclaimer-next"
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : null}
          {currentMemberIdx === members.length - 1 &&
          currentDisclaimerIdx === disclaimerSteps.length - 1
            ? "Complete"
            : "Next"}
          {!(
            currentMemberIdx === members.length - 1 &&
            currentDisclaimerIdx === disclaimerSteps.length - 1
          ) && <ChevronRight className="h-5 w-5 ml-2" />}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupWorkflowRunner — main export
// ---------------------------------------------------------------------------

export default function GroupWorkflowRunner({
  eventId,
  primaryAttendeeId,
  selectedMembers,
  groupDisclaimerMode,
  onComplete,
  onCancel,
  mode,
  workflow,
  badgeTemplate,
  primaryAttendeeData,
}: GroupWorkflowRunnerProps) {
  const isKiosk = mode === "kiosk";
  const [phase, setPhase] = useState<Phase>("primary-workflow");

  // Members who need individual disclaimers (everyone except primary)
  const nonPrimaryMembers = useMemo(
    () => selectedMembers.filter((m) => m.id !== primaryAttendeeId),
    [selectedMembers, primaryAttendeeId]
  );

  // Build a workflow config for the primary that skips badge_print / badge_edit steps
  // (printing is handled by the calling component after group check-in completes)
  const primaryWorkflow = useMemo(() => {
    return {
      ...workflow,
      steps: workflow.steps.map((step) => {
        if (step.stepType === "badge_print" || step.stepType === "badge_edit") {
          return { ...step, enabled: false };
        }
        return step;
      }),
    };
  }, [workflow]);

  const disclaimerSteps = useMemo(
    () => getDisclaimerSteps(workflow),
    [workflow]
  );

  // When primary workflow completes:
  // - 'group' mode → done (primary signed for everyone)
  // - 'individual' mode → enter disclaimer queue for remaining members
  const handlePrimaryWorkflowComplete = useCallback(() => {
    if (
      groupDisclaimerMode === "individual" &&
      nonPrimaryMembers.length > 0 &&
      disclaimerSteps.length > 0
    ) {
      setPhase("disclaimer-queue");
    } else {
      setPhase("complete");
      onComplete();
    }
  }, [groupDisclaimerMode, nonPrimaryMembers.length, disclaimerSteps.length, onComplete]);

  const handleDisclaimerQueueComplete = useCallback(() => {
    setPhase("complete");
    onComplete();
  }, [onComplete]);

  const primaryName = `${primaryAttendeeData.firstName} ${primaryAttendeeData.lastName}`;

  // WorkflowRunner expects 'admin' | 'staff' | 'kiosk' — map our mode through
  const workflowMode = mode as WorkflowRunnerProps["mode"];

  return (
    <div className="space-y-4">
      {/* Group header */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-muted/30 px-4",
          isKiosk ? "py-5" : "py-3"
        )}
        data-testid="group-workflow-header"
      >
        <Users className={cn("text-primary", isKiosk ? "h-7 w-7" : "h-5 w-5")} />
        <div>
          <p className={cn("font-semibold", isKiosk ? "text-xl" : "text-base")}>
            Group Check-In
          </p>
          <p className={cn("text-muted-foreground", isKiosk ? "text-base" : "text-sm")}>
            {phase === "primary-workflow"
              ? `Answering for ${primaryName}'s group (${selectedMembers.length} ${selectedMembers.length === 1 ? "person" : "people"})`
              : phase === "disclaimer-queue"
                ? "Collecting individual signatures"
                : "All steps complete"}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={cn("ml-auto", isKiosk ? "text-base px-3 py-1" : "text-xs")}
        >
          {selectedMembers.length} {selectedMembers.length === 1 ? "member" : "members"}
        </Badge>
      </div>

      {/* Phase: Primary workflow */}
      {phase === "primary-workflow" && (
        <WorkflowRunner
          eventId={eventId}
          attendeeId={primaryAttendeeId}
          attendeeData={primaryAttendeeData}
          workflow={primaryWorkflow}
          onComplete={handlePrimaryWorkflowComplete}
          onCancel={onCancel}
          mode={workflowMode}
          badgeTemplate={badgeTemplate}
          autoPrint={false}
        />
      )}

      {/* Phase: Individual disclaimer queue */}
      {phase === "disclaimer-queue" && (
        <GroupDisclaimerQueue
          eventId={eventId}
          disclaimerSteps={disclaimerSteps}
          members={nonPrimaryMembers}
          mode={mode}
          onComplete={handleDisclaimerQueueComplete}
          onCancel={onCancel}
        />
      )}

      {/* Phase: Complete (shouldn't render long — onComplete fires immediately) */}
      {phase === "complete" && (
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className={cn("font-semibold", isKiosk ? "text-2xl" : "text-xl")}>
            Group Workflow Complete
          </h3>
          <p className="text-muted-foreground text-center">
            All steps completed for {selectedMembers.length}{" "}
            {selectedMembers.length === 1 ? "member" : "members"}.
          </p>
        </div>
      )}
    </div>
  );
}
