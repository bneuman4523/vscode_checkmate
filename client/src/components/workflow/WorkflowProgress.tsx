import { Check, Circle, Loader2 } from "lucide-react";
import type { WorkflowStepWithData } from "@shared/schema";

interface WorkflowProgressProps {
  steps: WorkflowStepWithData[];
  currentStepIndex: number;
  isStepCompleted: (index: number) => boolean;
  onStepClick?: (index: number) => void;
  allowNavigation?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  buyer_questions: 'Questions',
  disclaimer: 'Disclaimer',
  badge_edit: 'Review Badge',
  badge_print: 'Print Badge',
};

export function WorkflowProgress({
  steps,
  currentStepIndex,
  isStepCompleted,
  onStepClick,
  allowNavigation = false,
}: WorkflowProgressProps) {
  if (steps.length === 0) return null;
  
  return (
    <div className="w-full py-4 overflow-x-auto">
      <div className="flex items-center justify-center gap-1 sm:gap-2 min-w-fit px-2">
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(index);
          const isCurrent = index === currentStepIndex;
          const isPending = !isCompleted && !isCurrent;
          const canNavigate = allowNavigation && (isCompleted || isCurrent);
          
          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              {index > 0 && (
                <div 
                  className={`w-4 sm:w-8 h-0.5 mx-0.5 sm:mx-1 ${
                    isCompleted ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
              
              <button
                type="button"
                data-testid={`button-step-${index}`}
                onClick={() => canNavigate && onStepClick?.(index)}
                disabled={!canNavigate}
                className={`
                  flex flex-col items-center gap-1 sm:gap-1.5 transition-colors
                  ${canNavigate ? 'cursor-pointer' : 'cursor-default'}
                  ${isCurrent ? 'opacity-100' : 'opacity-70'}
                `}
              >
                <div
                  className={`
                    w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium
                    transition-colors
                    ${isCompleted 
                      ? 'bg-primary text-primary-foreground' 
                      : isCurrent 
                        ? 'bg-primary text-primary-foreground ring-2 ring-offset-2 ring-primary' 
                        : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                
                <span 
                  className={`text-[10px] sm:text-xs text-center max-w-[60px] sm:max-w-none leading-tight ${
                    isCurrent ? 'font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {STEP_LABELS[step.stepType] || step.stepType}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
