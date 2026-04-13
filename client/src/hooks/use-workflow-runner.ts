import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { 
  EventWorkflowWithSteps, 
  WorkflowStepWithData, 
  Attendee,
  EventBuyerQuestion,
  EventDisclaimer,
  AttendeeWorkflowResponse,
  AttendeeSignature,
} from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

export type WorkflowStepType = 'buyer_questions' | 'disclaimer' | 'badge_edit' | 'badge_print';

export interface QuestionResponse {
  questionId: string;
  responseValue?: string | null;
  responseValues?: string[] | null;
}

export interface WorkflowState {
  currentStepIndex: number;
  responses: Record<string, QuestionResponse>;
  signatures: Record<string, string>;
  badgeEdits: Record<string, string>;
  badgeConfirmed: boolean;
  completed: boolean;
  error: string | null;
}

export interface WorkflowRunnerOptions {
  eventId: string;
  attendeeId: string;
  authToken?: string;
  mode: 'admin' | 'staff' | 'kiosk';
  initialWorkflow?: EventWorkflowWithSteps | null;
  onComplete?: (attendee: Attendee) => void;
  onError?: (error: string) => void;
  onStepChange?: (step: WorkflowStepWithData, index: number) => void;
}

const initialState: WorkflowState = {
  currentStepIndex: 0,
  responses: {},
  signatures: {},
  badgeEdits: {},
  badgeConfirmed: false,
  completed: false,
  error: null,
};

export function useWorkflowRunner(options: WorkflowRunnerOptions) {
  const { eventId, attendeeId, authToken, mode, initialWorkflow, onComplete, onError, onStepChange } = options;
  
  const [state, setState] = useState<WorkflowState>(initialState);
  
  const headers = useMemo(() => {
    if (mode === 'staff' && authToken) {
      return { Authorization: `Bearer ${authToken}` };
    }
    return {};
  }, [mode, authToken]);
  
  const { data: fetchedWorkflow, isLoading: workflowLoading } = useQuery<EventWorkflowWithSteps | null>({
    queryKey: mode === 'staff' 
      ? ['/api/staff/workflow', authToken] 
      : ['/api/events', eventId, 'workflow'],
    queryFn: async () => {
      if (initialWorkflow !== undefined) {
        return initialWorkflow;
      }
      const endpoint = mode === 'staff' 
        ? '/api/staff/workflow' 
        : `/api/events/${eventId}/workflow`;
      
      const res = await fetch(endpoint, {
        headers: mode === 'staff' && authToken
          ? { 'Authorization': `Bearer ${authToken}` }
          : {},
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch workflow');
      }
      return res.json();
    },
    enabled: !!eventId && (mode !== 'staff' || !!authToken),
    staleTime: initialWorkflow !== undefined ? Infinity : undefined,
  });
  
  const workflow = initialWorkflow !== undefined ? initialWorkflow : fetchedWorkflow;
  
  const { data: existingResponses } = useQuery<AttendeeWorkflowResponse[]>({
    queryKey: mode === 'staff'
      ? ['/api/staff/attendees', attendeeId, 'workflow-responses', authToken]
      : ['/api/events', eventId, 'attendees', attendeeId, 'workflow-responses'],
    queryFn: async () => {
      const endpoint = mode === 'staff'
        ? `/api/staff/attendees/${attendeeId}/workflow-responses`
        : `/api/events/${eventId}/attendees/${attendeeId}/workflow-responses`;
      
      const res = await fetch(endpoint, {
        headers: mode === 'staff' && authToken
          ? { 'Authorization': `Bearer ${authToken}` }
          : {},
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error('Failed to fetch responses');
      }
      return res.json();
    },
    enabled: !!eventId && !!attendeeId && (mode !== 'staff' || !!authToken),
    staleTime: 30000,
  });
  
  const { data: existingSignatures } = useQuery<AttendeeSignature[]>({
    queryKey: mode === 'staff'
      ? ['/api/staff/attendees', attendeeId, 'signatures', authToken]
      : ['/api/events', eventId, 'attendees', attendeeId, 'signatures'],
    queryFn: async () => {
      const endpoint = mode === 'staff'
        ? `/api/staff/attendees/${attendeeId}/signatures`
        : `/api/events/${eventId}/attendees/${attendeeId}/signatures`;
      
      const res = await fetch(endpoint, {
        headers: mode === 'staff' && authToken
          ? { 'Authorization': `Bearer ${authToken}` }
          : {},
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error('Failed to fetch signatures');
      }
      return res.json();
    },
    enabled: !!eventId && !!attendeeId && (mode !== 'staff' || !!authToken),
    staleTime: 30000,
  });
  
  useEffect(() => {
    if (existingResponses && existingResponses.length > 0) {
      setState(prev => {
        const newResponses: Record<string, QuestionResponse> = { ...prev.responses };
        for (const r of existingResponses) {
          newResponses[r.questionId] = {
            questionId: r.questionId,
            responseValue: r.responseValue,
            responseValues: r.responseValues,
          };
        }
        return { ...prev, responses: newResponses };
      });
    }
  }, [existingResponses]);
  
  useEffect(() => {
    if (existingSignatures && existingSignatures.length > 0) {
      setState(prev => {
        const newSignatures: Record<string, string> = { ...prev.signatures };
        for (const s of existingSignatures) {
          if (s.signatureData) {
            newSignatures[s.disclaimerId] = s.signatureData;
          }
        }
        return { ...prev, signatures: newSignatures };
      });
    }
  }, [existingSignatures]);
  
  const enabledSteps = useMemo(() => {
    if (!workflow?.steps) return [];
    return workflow.steps.filter(s => s.enabled).sort((a, b) => a.position - b.position);
  }, [workflow]);
  
  const [hasResolved, setHasResolved] = useState(false);
  useEffect(() => {
    if (hasResolved || enabledSteps.length === 0) return;
    if (existingResponses === undefined || existingSignatures === undefined) return;
    
    const loadedResponses = new Map((existingResponses || []).map(r => [r.questionId, r]));
    const loadedSignatureIds = new Set((existingSignatures || []).filter(s => s.signatureData).map(s => s.disclaimerId));
    
    const isQuestionAnswered = (questionId: string, allowsMultiple: boolean): boolean => {
      const response = loadedResponses.get(questionId);
      if (!response) return false;
      if (allowsMultiple) {
        return !!(response.responseValues && response.responseValues.length > 0);
      }
      return !!(response.responseValue && response.responseValue.trim() !== '');
    };
    
    let resumeIndex = 0;
    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      if (step.stepType === 'buyer_questions' && step.questions && step.questions.length > 0) {
        const hasAnyResponse = step.questions.some(q => {
          const allowsMultiple = q.questionType === 'multiple_choice';
          return isQuestionAnswered(q.id, allowsMultiple);
        });
        if (!hasAnyResponse) break;
        const allRequiredAnswered = step.questions.every(q => {
          const isRequired = q.required ?? false;
          if (!isRequired) return true;
          const allowsMultiple = q.questionType === 'multiple_choice';
          return isQuestionAnswered(q.id, allowsMultiple);
        });
        if (!allRequiredAnswered) break;
        resumeIndex = i + 1;
      } else if (step.stepType === 'disclaimer' && step.disclaimer) {
        if (step.disclaimer.requireSignature && !loadedSignatureIds.has(step.disclaimer.id)) break;
        resumeIndex = i + 1;
      } else if (step.stepType === 'badge_edit') {
        break;
      } else if (step.stepType === 'badge_print') {
        resumeIndex = i + 1;
      }
    }
    
    if (resumeIndex >= enabledSteps.length) {
      setState(prev => ({ ...prev, completed: true }));
    } else if (resumeIndex > 0) {
      setState(prev => ({ ...prev, currentStepIndex: resumeIndex }));
    }
    setHasResolved(true);
  }, [enabledSteps, existingResponses, existingSignatures, hasResolved]);
  
  const currentStep = useMemo(() => {
    return enabledSteps[state.currentStepIndex] || null;
  }, [enabledSteps, state.currentStepIndex]);
  
  const totalSteps = enabledSteps.length;
  const isFirstStep = state.currentStepIndex === 0;
  const isLastStep = state.currentStepIndex === totalSteps - 1;
  const hasWorkflow = !!workflow && workflow.enabled && enabledSteps.length > 0;
  
  const saveResponsesMutation = useMutation({
    mutationFn: async (responses: QuestionResponse[]) => {
      const endpoint = mode === 'staff'
        ? `/api/staff/attendees/${attendeeId}/workflow-responses`
        : `/api/events/${eventId}/attendees/${attendeeId}/workflow-responses`;
      
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        credentials: 'include',
        body: JSON.stringify({ responses }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save responses');
      }
      return res.json();
    },
    onError: (error: Error) => {
      setState(prev => ({ ...prev, error: error.message }));
      onError?.(error.message);
    },
  });
  
  const saveSignatureMutation = useMutation({
    mutationFn: async (data: { disclaimerId: string; signatureData: string }) => {
      const endpoint = mode === 'staff'
        ? `/api/staff/attendees/${attendeeId}/signatures`
        : `/api/events/${eventId}/attendees/${attendeeId}/signatures`;
      
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save signature');
      }
      return res.json();
    },
    onError: (error: Error) => {
      setState(prev => ({ ...prev, error: error.message }));
      onError?.(error.message);
    },
  });
  
  const saveBadgeEditMutation = useMutation({
    mutationFn: async (edits: Record<string, string>) => {
      const endpoint = mode === 'staff'
        ? `/api/staff/attendees/${attendeeId}`
        : `/api/events/${eventId}/attendees/${attendeeId}`;
      
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: fetchHeaders,
        credentials: 'include',
        body: JSON.stringify(edits),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save badge edits');
      }
      return res.json();
    },
    onError: (error: Error) => {
      setState(prev => ({ ...prev, error: error.message }));
      onError?.(error.message);
    },
  });
  
  const setQuestionResponse = useCallback((questionId: string, value: string | null, isMultiple = false) => {
    setState(prev => ({
      ...prev,
      responses: {
        ...prev.responses,
        [questionId]: isMultiple
          ? { 
              questionId, 
              responseValues: value ? [...(prev.responses[questionId]?.responseValues || []), value] : null 
            }
          : { questionId, responseValue: value },
      },
    }));
  }, []);
  
  const setMultipleQuestionResponse = useCallback((questionId: string, values: string[]) => {
    setState(prev => ({
      ...prev,
      responses: {
        ...prev.responses,
        [questionId]: { questionId, responseValues: values },
      },
    }));
  }, []);
  
  const setSignature = useCallback((disclaimerId: string, signatureData: string) => {
    setState(prev => ({
      ...prev,
      signatures: {
        ...prev.signatures,
        [disclaimerId]: signatureData,
      },
    }));
  }, []);
  
  const setBadgeEdit = useCallback((fieldName: string, value: string) => {
    setState(prev => ({
      ...prev,
      badgeEdits: {
        ...prev.badgeEdits,
        [fieldName]: value,
      },
      badgeConfirmed: false,
    }));
  }, []);
  
  const confirmBadge = useCallback((confirmed: boolean = true) => {
    setState(prev => ({ ...prev, badgeConfirmed: confirmed }));
  }, []);
  
  const validateCurrentStep = useCallback((): { valid: boolean; errors: string[] } => {
    if (!currentStep) return { valid: true, errors: [] };
    
    const errors: string[] = [];
    
    if (currentStep.stepType === 'buyer_questions' && currentStep.questions) {
      for (const question of currentStep.questions) {
        if (question.required) {
          const response = state.responses[question.id];
          if (!response) {
            errors.push(`Please answer: ${question.questionText}`);
          } else if (question.questionType === 'multiple_choice') {
            if (!response.responseValues || response.responseValues.length === 0) {
              errors.push(`Please select at least one option for: ${question.questionText}`);
            }
          } else {
            if (!response.responseValue || response.responseValue.trim() === '') {
              errors.push(`Please answer: ${question.questionText}`);
            }
          }
        }
      }
    }
    
    if (currentStep.stepType === 'disclaimer' && currentStep.disclaimer) {
      if (!state.signatures[currentStep.disclaimer.id]) {
        errors.push(currentStep.disclaimer.requireSignature 
          ? 'Please sign the disclaimer to continue' 
          : 'Please agree to the disclaimer to continue');
      }
    }
    
    if (currentStep.stepType === 'badge_edit') {
      if (!state.badgeConfirmed) {
        errors.push('Please review and confirm the badge information');
      }
    }
    
    return { valid: errors.length === 0, errors };
  }, [currentStep, state.responses, state.signatures, state.badgeConfirmed]);
  
  const saveCurrentStepData = useCallback(async () => {
    if (!currentStep) return;
    
    if (currentStep.stepType === 'buyer_questions' && currentStep.questions) {
      const responses = currentStep.questions
        .map(q => state.responses[q.id])
        .filter(Boolean) as QuestionResponse[];
      
      if (responses.length > 0) {
        await saveResponsesMutation.mutateAsync(responses);
      }
    }
    
    if (currentStep.stepType === 'disclaimer' && currentStep.disclaimer) {
      const signatureData = state.signatures[currentStep.disclaimer.id];
      if (signatureData) {
        await saveSignatureMutation.mutateAsync({
          disclaimerId: currentStep.disclaimer.id,
          signatureData,
        });
      }
    }
    
    if (currentStep.stepType === 'badge_edit' || currentStep.stepType === 'badge_print') {
      if (Object.keys(state.badgeEdits).length > 0) {
        await saveBadgeEditMutation.mutateAsync(state.badgeEdits);
      }
    }
  }, [currentStep, state.responses, state.signatures, state.badgeEdits, saveResponsesMutation, saveSignatureMutation, saveBadgeEditMutation]);
  
  const saveBadgeEdits = useCallback(async () => {
    if (Object.keys(state.badgeEdits).length > 0) {
      await saveBadgeEditMutation.mutateAsync(state.badgeEdits);
    }
  }, [state.badgeEdits, saveBadgeEditMutation]);
  
  const goToNextStep = useCallback(async () => {
    const validation = validateCurrentStep();
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.errors[0] }));
      return false;
    }
    
    setState(prev => ({ ...prev, error: null }));
    
    try {
      await saveCurrentStepData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save data. Please try again.';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
    
    if (isLastStep) {
      setState(prev => ({ ...prev, completed: true }));
      return true;
    }
    
    const nextIndex = state.currentStepIndex + 1;
    setState(prev => ({ ...prev, currentStepIndex: nextIndex }));
    
    if (enabledSteps[nextIndex]) {
      onStepChange?.(enabledSteps[nextIndex], nextIndex);
    }
    
    return true;
  }, [validateCurrentStep, saveCurrentStepData, isLastStep, state.currentStepIndex, enabledSteps, onStepChange]);
  
  const goToPreviousStep = useCallback(() => {
    if (isFirstStep) return;
    
    const currentStepData = enabledSteps[state.currentStepIndex];
    const prevIndex = state.currentStepIndex - 1;
    setState(prev => {
      const newState = { ...prev, currentStepIndex: prevIndex, error: null };
      if (currentStepData?.stepType === 'disclaimer' && currentStepData.disclaimer) {
        const newSignatures = { ...prev.signatures };
        delete newSignatures[currentStepData.disclaimer.id];
        newState.signatures = newSignatures;
      }
      return newState;
    });
    
    if (enabledSteps[prevIndex]) {
      onStepChange?.(enabledSteps[prevIndex], prevIndex);
    }
  }, [isFirstStep, state.currentStepIndex, enabledSteps, onStepChange]);
  
  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= totalSteps) return;
    
    setState(prev => ({ ...prev, currentStepIndex: index, error: null }));
    
    if (enabledSteps[index]) {
      onStepChange?.(enabledSteps[index], index);
    }
  }, [totalSteps, enabledSteps, onStepChange]);
  
  const reset = useCallback(() => {
    setState(initialState);
  }, []);
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  const getQuestionsForCurrentStep = useCallback((): EventBuyerQuestion[] => {
    if (currentStep?.stepType === 'buyer_questions' && currentStep.questions) {
      return currentStep.questions;
    }
    return [];
  }, [currentStep]);
  
  const getDisclaimerForCurrentStep = useCallback((): EventDisclaimer | null => {
    if (currentStep?.stepType === 'disclaimer' && currentStep.disclaimer) {
      return currentStep.disclaimer;
    }
    return null;
  }, [currentStep]);
  
  const isStepCompleted = useCallback((stepIndex: number): boolean => {
    return stepIndex < state.currentStepIndex;
  }, [state.currentStepIndex]);
  
  const resetCompleted = useCallback(() => {
    setState(prev => ({ ...prev, completed: false, currentStepIndex: enabledSteps.length - 1 }));
  }, [enabledSteps.length]);
  
  return {
    workflow,
    workflowLoading,
    hasWorkflow,
    enabledSteps,
    currentStep,
    currentStepIndex: state.currentStepIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    completed: state.completed,
    error: state.error,
    responses: state.responses,
    signatures: state.signatures,
    badgeEdits: state.badgeEdits,
    badgeConfirmed: state.badgeConfirmed,
    setQuestionResponse,
    setMultipleQuestionResponse,
    setSignature,
    setBadgeEdit,
    confirmBadge,
    validateCurrentStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    reset,
    resetCompleted,
    clearError,
    getQuestionsForCurrentStep,
    getDisclaimerForCurrentStep,
    isStepCompleted,
    saveBadgeEdits,
    isSaving: saveResponsesMutation.isPending || saveSignatureMutation.isPending || saveBadgeEditMutation.isPending,
  };
}
