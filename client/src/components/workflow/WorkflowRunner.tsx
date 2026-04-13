import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { useWorkflowRunner, type WorkflowRunnerOptions } from "@/hooks/use-workflow-runner";
import { WorkflowProgress } from "./WorkflowProgress";
import { WorkflowBuyerQuestions } from "./WorkflowBuyerQuestions";
import { WorkflowDisclaimer } from "./WorkflowDisclaimer";
import { WorkflowBadgeEdit } from "./WorkflowBadgeEdit";
import { WorkflowBadgePrint } from "./WorkflowBadgePrint";
import type { Attendee, EventWorkflowStep, EventBuyerQuestion, EventDisclaimer } from "@shared/schema";

interface WorkflowConfig {
  id: string;
  enabled: boolean;
  steps: (EventWorkflowStep & {
    questions?: EventBuyerQuestion[];
    disclaimer?: EventDisclaimer;
  })[];
}

interface BadgeTemplateConfig {
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  includeQR: boolean;
  qrPosition: string;
  qrCodeConfig?: {
    embedType: 'externalId' | 'simple' | 'json' | 'custom';
    fields: string[];
    separator: string;
    includeLabel: boolean;
  };
  mergeFields: Array<{
    field: string;
    label: string;
    fontSize: number;
    position: { x: number; y: number };
    align: 'left' | 'center' | 'right';
    fontWeight?: string;
    fontStyle?: 'normal' | 'italic';
  }>;
}

export interface WorkflowRunnerProps {
  eventId: string;
  attendeeId: string;
  attendeeData: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType: string;
    externalId?: string;
  };
  workflow: WorkflowConfig;
  onComplete: () => void;
  onCancel: () => void;
  mode: 'admin' | 'staff' | 'kiosk';
  badgeTemplate?: BadgeTemplateConfig;
  autoPrint?: boolean;
}

interface WorkflowRunnerComponentProps extends Omit<WorkflowRunnerOptions, 'onStepChange'> {
  attendee: Attendee;
  onSkip?: () => void;
  showSkipButton?: boolean;
  editableFields?: string[];
}

export function WorkflowRunnerComponent({
  attendee,
  onSkip,
  showSkipButton = true,
  editableFields,
  ...options
}: WorkflowRunnerComponentProps) {
  const workflow = useWorkflowRunner(options);
  
  if (workflow.workflowLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!workflow.hasWorkflow) {
    if (showSkipButton && onSkip) {
      return (
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <p className="text-muted-foreground">No additional steps configured.</p>
          <Button onClick={onSkip} data-testid="button-skip-workflow">
            Continue
          </Button>
        </div>
      );
    }
    return null;
  }
  
  if (workflow.completed) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold">All Steps Completed</h3>
        <p className="text-muted-foreground text-center">
          You've completed all required steps. Your check-in is ready.
        </p>
        {options.onComplete && (
          <Button 
            onClick={() => options.onComplete?.(attendee)}
            data-testid="button-workflow-complete"
          >
            Complete Check-in
          </Button>
        )}
      </div>
    );
  }
  
  const renderCurrentStep = () => {
    if (!workflow.currentStep) return null;
    
    switch (workflow.currentStep.stepType) {
      case 'buyer_questions':
        return (
          <WorkflowBuyerQuestions
            questions={workflow.getQuestionsForCurrentStep()}
            responses={workflow.responses}
            onResponseChange={workflow.setQuestionResponse}
            onMultipleResponseChange={workflow.setMultipleQuestionResponse}
            disabled={workflow.isSaving}
          />
        );
        
      case 'disclaimer':
        const disclaimer = workflow.getDisclaimerForCurrentStep();
        if (!disclaimer) return null;
        return (
          <WorkflowDisclaimer
            disclaimer={disclaimer}
            signatureData={workflow.signatures[disclaimer.id] || null}
            onSignatureChange={workflow.setSignature}
            disabled={workflow.isSaving}
            showValidationError={!!workflow.error}
          />
        );
        
      case 'badge_edit':
        return (
          <WorkflowBadgeEdit
            attendee={attendee}
            editableFields={editableFields}
            badgeEdits={workflow.badgeEdits}
            onBadgeEditChange={workflow.setBadgeEdit}
            badgeConfirmed={workflow.badgeConfirmed}
            onConfirmBadge={workflow.confirmBadge}
            disabled={workflow.isSaving}
          />
        );
        
      case 'badge_print':
        return (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <p className="text-muted-foreground">Badge will be printed after completing check-in.</p>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="space-y-6">
      <WorkflowProgress
        steps={workflow.enabledSteps}
        currentStepIndex={workflow.currentStepIndex}
        isStepCompleted={workflow.isStepCompleted}
        onStepClick={workflow.goToStep}
        allowNavigation={true}
      />
      
      <div className="min-h-[300px]">
        {renderCurrentStep()}
      </div>
      
      {workflow.error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{workflow.error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
        {!workflow.isFirstStep && (
          <Button
            variant="outline"
            onClick={workflow.goToPreviousStep}
            disabled={workflow.isSaving}
            data-testid="button-workflow-previous"
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
        )}
        {workflow.isFirstStep && (
          <div className="w-full sm:w-auto order-2 sm:order-1" />
        )}
        
        <div className="text-sm text-muted-foreground order-1 sm:order-2">
          Step {workflow.currentStepIndex + 1} of {workflow.totalSteps}
        </div>
        
        <Button
          onClick={workflow.goToNextStep}
          disabled={workflow.isSaving}
          data-testid="button-workflow-next"
          className="w-full sm:w-auto order-3"
        >
          {workflow.isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          {workflow.isLastStep ? 'Complete' : 'Next'}
          {!workflow.isLastStep && <ChevronRight className="h-4 w-4 ml-2" />}
        </Button>
      </div>
      
      {showSkipButton && onSkip && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground"
            data-testid="button-skip-steps"
          >
            Skip remaining steps
          </Button>
        </div>
      )}
    </div>
  );
}

export function WorkflowRunner({
  eventId,
  attendeeId,
  attendeeData,
  workflow: preloadedWorkflow,
  onComplete,
  onCancel,
  mode,
  badgeTemplate,
  autoPrint = false,
}: WorkflowRunnerProps) {
  const authToken = useMemo(() => 
    mode === 'staff' ? localStorage.getItem('staffToken') || undefined : undefined,
    [mode]
  );
  
  const attendee: Attendee = useMemo(() => ({
    id: attendeeId,
    eventId: eventId,
    firstName: attendeeData.firstName,
    lastName: attendeeData.lastName,
    email: attendeeData.email,
    company: attendeeData.company ?? null,
    title: attendeeData.title ?? null,
    phone: null,
    participantType: attendeeData.participantType,
    registrationStatus: 'registered' as const,
    registrationStatusLabel: null,
    checkedIn: false,
    badgePrinted: false,
    externalId: attendeeData.externalId ?? null,
    customFields: null,
    checkedInAt: null,
    badgePrintedAt: null,
    createdAt: new Date(),
  }), [attendeeId, eventId, attendeeData]);
  
  const hookRunner = useWorkflowRunner({
    eventId,
    attendeeId,
    authToken,
    mode,
    initialWorkflow: preloadedWorkflow,
    onComplete: () => onComplete(),
    onError: (error) => console.error('Workflow error:', error),
  });
  
  const { enabledSteps, currentStep, totalSteps, isFirstStep, isLastStep } = hookRunner;
  
  const handleQuestionResponse = useCallback((questionId: string, value: string | string[]) => {
    if (Array.isArray(value)) {
      hookRunner.setMultipleQuestionResponse(questionId, value);
    } else {
      hookRunner.setQuestionResponse(questionId, value);
    }
  }, [hookRunner]);
  
  if (hookRunner.workflowLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!preloadedWorkflow.enabled || enabledSteps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <p className="text-muted-foreground">No workflow steps configured for this event.</p>
        <Button onClick={onComplete} data-testid="button-continue-no-workflow">
          Continue to Check-In
        </Button>
      </div>
    );
  }
  
  if (hookRunner.completed) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold">All Steps Completed</h3>
        <p className="text-muted-foreground text-center">
          You've completed all required steps. Your check-in is ready.
        </p>
        <Button onClick={onComplete} data-testid="button-workflow-complete">
          Complete Check-In
        </Button>
      </div>
    );
  }
  
  const renderCurrentStep = () => {
    if (!currentStep) return null;
    
    switch (currentStep.stepType) {
      case 'buyer_questions':
        const questions = hookRunner.getQuestionsForCurrentStep();
        return (
          <WorkflowBuyerQuestions
            questions={questions}
            responses={hookRunner.responses}
            onResponseChange={handleQuestionResponse}
            onMultipleResponseChange={hookRunner.setMultipleQuestionResponse}
            disabled={hookRunner.isSaving}
          />
        );
        
      case 'disclaimer':
        const disclaimer = hookRunner.getDisclaimerForCurrentStep();
        if (!disclaimer) return null;
        return (
          <WorkflowDisclaimer
            disclaimer={disclaimer}
            signatureData={hookRunner.signatures[disclaimer.id] || null}
            onSignatureChange={hookRunner.setSignature}
            disabled={hookRunner.isSaving}
          />
        );
        
      case 'badge_edit':
      case 'badge_print':
        return (
          <WorkflowBadgePrint
            attendee={attendee}
            badgeEdits={hookRunner.badgeEdits}
            onBadgeEditChange={hookRunner.setBadgeEdit}
            onSaveBadgeEdits={hookRunner.saveBadgeEdits}
            onPrintComplete={onComplete}
            onCancel={onCancel}
            disabled={hookRunner.isSaving}
            templateConfig={badgeTemplate}
            autoPrint={autoPrint && currentStep?.stepType === 'badge_print'}
            mode={mode}
          />
        );
        
      default:
        return null;
    }
  };
  
  const isBadgePrintStep = currentStep?.stepType === 'badge_edit' || currentStep?.stepType === 'badge_print';
  
  return (
    <div className="space-y-6">
      <WorkflowProgress
        steps={enabledSteps}
        currentStepIndex={hookRunner.currentStepIndex}
        isStepCompleted={hookRunner.isStepCompleted}
        onStepClick={hookRunner.goToStep}
        allowNavigation={true}
      />
      
      {hookRunner.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{hookRunner.error}</AlertDescription>
        </Alert>
      )}
      
      <div className="min-h-[300px]">
        {renderCurrentStep()}
      </div>
      
      {!isBadgePrintStep && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={hookRunner.goToPreviousStep}
              disabled={hookRunner.isSaving}
              data-testid="button-workflow-previous"
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
          {isFirstStep && (
            <div className="w-full sm:w-auto order-2 sm:order-1" />
          )}
          
          <div className="text-sm text-muted-foreground order-1 sm:order-2">
            Step {hookRunner.currentStepIndex + 1} of {totalSteps}
          </div>
          
          <Button
            onClick={hookRunner.goToNextStep}
            disabled={hookRunner.isSaving}
            data-testid="button-workflow-next"
            className="w-full sm:w-auto order-3"
          >
            {hookRunner.isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isLastStep ? 'Complete' : 'Next'}
            {!isLastStep && <ChevronRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      )}
      
      {mode !== 'kiosk' && !isBadgePrintStep && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground"
            data-testid="button-skip-steps"
          >
            Skip remaining steps
          </Button>
        </div>
      )}
    </div>
  );
}
