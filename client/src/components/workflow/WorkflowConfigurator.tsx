import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Settings2, 
  Plus, 
  Trash2, 
  GripVertical, 
  MessageSquare, 
  FileText, 
  Edit2, 
  Printer,
  Save,
  X,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  EventWorkflowWithSteps, 
  WorkflowStepWithData, 
  EventBuyerQuestion, 
  EventDisclaimer,
  InsertEventBuyerQuestion,
  InsertEventDisclaimer,
  InsertEventWorkflowStep
} from "@shared/schema";

interface WorkflowConfiguratorProps {
  eventId: string;
}

const STEP_TYPE_CONFIG = {
  buyer_questions: {
    label: "Buyer Questions",
    icon: MessageSquare,
    description: "Ask attendees questions during check-in",
  },
  disclaimer: {
    label: "Disclaimer",
    icon: FileText,
    description: "Display disclaimer with optional signature",
  },
  badge_edit: {
    label: "Badge Review",
    icon: Edit2,
    description: "Allow attendees to review/edit badge info",
  },
  badge_print: {
    label: "Badge Print",
    icon: Printer,
    description: "Print badge step indicator",
  },
};

const QUESTION_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "single_choice", label: "Single Choice" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "rating", label: "Star Rating" },
];

export function WorkflowConfigurator({ eventId }: WorkflowConfiguratorProps) {
  const { toast } = useToast();
  const { trackStart, trackComplete } = useBehaviorTracking();
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<string>("buyer_questions");
  
  // Track when component mounts
  useEffect(() => {
    trackStart("workflow_editor", "open");
  }, [trackStart]);
  
  const [editingQuestion, setEditingQuestion] = useState<EventBuyerQuestion | null>(null);
  const [editingDisclaimer, setEditingDisclaimer] = useState<EventDisclaimer | null>(null);
  
  const [newQuestion, setNewQuestion] = useState<Partial<InsertEventBuyerQuestion>>({
    questionText: "",
    questionType: "text",
    required: false,
    options: [],
  });
  
  const [newDisclaimer, setNewDisclaimer] = useState<Partial<InsertEventDisclaimer>>({
    title: "",
    disclaimerText: "",
    confirmationText: "I have read and agree to the above disclaimer.",
    requireSignature: false,
  });
  
  const [optionsInput, setOptionsInput] = useState("");

  const { data: workflow, isLoading } = useQuery<EventWorkflowWithSteps | null>({
    queryKey: ["/api/events", eventId, "workflow"],
    enabled: !!eventId,
  });

  const toggleWorkflowMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", `/api/events/${eventId}/workflow`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      toast({
        title: "Workflow Updated",
        description: `Check-in workflow has been ${workflow?.enabled ? "disabled" : "enabled"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStaffMutation = useMutation({
    mutationFn: async (enabledForStaff: boolean) => {
      return apiRequest("PATCH", `/api/events/${eventId}/workflow`, { enabledForStaff });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      toast({
        title: "Workflow Updated",
        description: `Workflow is now ${workflow?.enabledForStaff ? "disabled" : "enabled"} for staff.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addStepMutation = useMutation({
    mutationFn: async (stepType: string) => {
      const maxPosition = workflow?.steps?.length || 0;
      return apiRequest("POST", `/api/events/${eventId}/workflow/steps`, {
        stepType,
        position: maxPosition,
        enabled: true,
      });
    },
    onSuccess: () => {
      trackComplete("workflow_editor", "add_step");
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      setAddStepDialogOpen(false);
      toast({ title: "Step Added" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: Partial<InsertEventWorkflowStep> }) => {
      return apiRequest("PATCH", `/api/events/${eventId}/workflow/steps/${stepId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}/workflow/steps/${stepId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      toast({ title: "Step Removed" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (data: InsertEventBuyerQuestion & { stepId: string }) => {
      const { stepId, ...questionData } = data;
      return apiRequest("POST", `/api/events/${eventId}/workflow/steps/${stepId}/questions`, questionData);
    },
    onSuccess: () => {
      trackComplete("workflow_editor", "save");
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      setNewQuestion({ questionText: "", questionType: "text", required: false, options: [] });
      setOptionsInput("");
      toast({ title: "Question Added" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ questionId, data }: { questionId: string; data: Partial<InsertEventBuyerQuestion> }) => {
      return apiRequest("PATCH", `/api/events/${eventId}/workflow/questions/${questionId}`, data);
    },
    onSuccess: () => {
      trackComplete("workflow_editor", "save");
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      setEditingQuestion(null);
      toast({ title: "Question Updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}/workflow/questions/${questionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      toast({ title: "Question Removed" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addDisclaimerMutation = useMutation({
    mutationFn: async (data: InsertEventDisclaimer & { stepId: string }) => {
      const { stepId, ...disclaimerData } = data;
      return apiRequest("PUT", `/api/events/${eventId}/workflow/steps/${stepId}/disclaimer`, disclaimerData);
    },
    onSuccess: () => {
      trackComplete("workflow_editor", "save");
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      setNewDisclaimer({
        title: "",
        disclaimerText: "",
        confirmationText: "I have read and agree to the above disclaimer.",
        requireSignature: false,
      });
      toast({ title: "Disclaimer Added" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateDisclaimerMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: Partial<InsertEventDisclaimer> }) => {
      return apiRequest("PUT", `/api/events/${eventId}/workflow/steps/${stepId}/disclaimer`, data);
    },
    onSuccess: () => {
      trackComplete("workflow_editor", "save");
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      setEditingDisclaimer(null);
      toast({ title: "Disclaimer Updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDisclaimerMutation = useMutation({
    mutationFn: async (disclaimerId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}/workflow/disclaimers/${disclaimerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "workflow"] });
      toast({ title: "Disclaimer Removed" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const moveStep = (stepId: string, direction: "up" | "down") => {
    if (!workflow?.steps) return;
    
    const sortedSteps = [...workflow.steps].sort((a, b) => a.position - b.position);
    const currentIndex = sortedSteps.findIndex(s => s.id === stepId);
    
    if (direction === "up" && currentIndex > 0) {
      trackComplete("workflow_editor", "reorder");
      const prevStep = sortedSteps[currentIndex - 1];
      const currentStep = sortedSteps[currentIndex];
      updateStepMutation.mutate({ stepId: currentStep.id, data: { position: prevStep.position } });
      updateStepMutation.mutate({ stepId: prevStep.id, data: { position: currentStep.position } });
    } else if (direction === "down" && currentIndex < sortedSteps.length - 1) {
      trackComplete("workflow_editor", "reorder");
      const nextStep = sortedSteps[currentIndex + 1];
      const currentStep = sortedSteps[currentIndex];
      updateStepMutation.mutate({ stepId: currentStep.id, data: { position: nextStep.position } });
      updateStepMutation.mutate({ stepId: nextStep.id, data: { position: currentStep.position } });
    }
  };

  const handleAddQuestion = (stepId: string) => {
    if (!newQuestion.questionText?.trim()) return;
    
    const options = ["single_choice", "multiple_choice"].includes(newQuestion.questionType || "")
      ? optionsInput.split("\n").filter(o => o.trim())
      : null;
    
    const questions = workflow?.steps?.find(s => s.stepType === "buyer_questions")?.questions || [];
    
    addQuestionMutation.mutate({
      eventId,
      stepId,
      questionText: newQuestion.questionText,
      questionType: newQuestion.questionType as "text" | "single_choice" | "multiple_choice" | "rating",
      required: newQuestion.required || false,
      options,
      position: questions.length,
    });
  };

  const handleAddDisclaimer = (stepId: string) => {
    if (!newDisclaimer.title?.trim() || !newDisclaimer.disclaimerText?.trim()) return;
    
    addDisclaimerMutation.mutate({
      eventId,
      stepId,
      title: newDisclaimer.title,
      disclaimerText: newDisclaimer.disclaimerText,
      confirmationText: newDisclaimer.confirmationText || "I agree",
      requireSignature: newDisclaimer.requireSignature || false,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = workflow?.steps?.sort((a, b) => a.position - b.position) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2" data-testid="text-workflow-title">
              <Settings2 className="h-5 w-5" />
              Check-in Workflow
            </CardTitle>
            <CardDescription>
              Configure the steps attendees go through during check-in.
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="workflow-enabled"
                data-testid="switch-workflow-enabled"
                checked={workflow?.enabled || false}
                onCheckedChange={(checked) => toggleWorkflowMutation.mutate(checked)}
                disabled={toggleWorkflowMutation.isPending}
              />
              <Label htmlFor="workflow-enabled" className="text-sm">
                {workflow?.enabled ? "Enabled" : "Disabled"}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="workflow-staff"
                data-testid="switch-workflow-staff"
                checked={workflow?.enabledForStaff ?? true}
                onCheckedChange={(checked) => toggleStaffMutation.mutate(checked)}
                disabled={toggleStaffMutation.isPending || !workflow?.enabled}
              />
              <Label htmlFor="workflow-staff" className="text-sm">
                Staff
              </Label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          {sortedSteps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No workflow steps configured. Add steps to create your check-in flow.
            </div>
          ) : (
            sortedSteps.map((step, index) => {
              const config = STEP_TYPE_CONFIG[step.stepType as keyof typeof STEP_TYPE_CONFIG];
              const Icon = config?.icon || Settings2;
              
              return (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-4 border rounded-lg bg-card"
                  data-testid={`workflow-step-${step.id}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStep(step.id, "up")}
                      disabled={index === 0}
                      data-testid={`button-move-up-${step.id}`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStep(step.id, "down")}
                      disabled={index === sortedSteps.length - 1}
                      data-testid={`button-move-down-${step.id}`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium">{config?.label || step.stepType}</h4>
                          <p className="text-sm text-muted-foreground">{config?.description}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={step.enabled}
                          onCheckedChange={(checked) => 
                            updateStepMutation.mutate({ stepId: step.id, data: { enabled: checked } })
                          }
                          data-testid={`switch-step-enabled-${step.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteStepMutation.mutate(step.id)}
                          data-testid={`button-delete-step-${step.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    
                    {step.stepType === "buyer_questions" && (
                      <div className="pt-3 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium">Questions</h5>
                          <Badge variant="secondary">{step.questions?.length || 0}/3</Badge>
                        </div>
                        
                        {step.questions?.map((q) => (
                          <div key={q.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <div className="flex items-center gap-2">
                              {q.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                              <span className="text-sm">{q.questionText}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setEditingQuestion(q)}
                                data-testid={`button-edit-question-${q.id}`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => deleteQuestionMutation.mutate(q.id)}
                                data-testid={`button-delete-question-${q.id}`}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        {(step.questions?.length || 0) < 3 && (
                          <Accordion type="single" collapsible>
                            <AccordionItem value="add-question" className="border-none">
                              <AccordionTrigger className="text-sm py-2 hover:no-underline" data-testid="button-add-question-toggle">
                                <span className="flex items-center gap-2">
                                  <Plus className="h-4 w-4" />
                                  Add Question
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-3 pt-2">
                                  <Input
                                    placeholder="Question text..."
                                    value={newQuestion.questionText || ""}
                                    onChange={(e) => setNewQuestion(prev => ({ ...prev, questionText: e.target.value }))}
                                    data-testid="input-new-question-text"
                                  />
                                  <div className="flex gap-2">
                                    <Select
                                      value={newQuestion.questionType || "text"}
                                      onValueChange={(value) => setNewQuestion(prev => ({ ...prev, questionType: value as "text" }))}
                                    >
                                      <SelectTrigger data-testid="select-question-type">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {QUESTION_TYPES.map(t => (
                                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={newQuestion.required || false}
                                        onCheckedChange={(checked) => setNewQuestion(prev => ({ ...prev, required: checked }))}
                                        data-testid="switch-question-required"
                                      />
                                      <Label className="text-sm">Required</Label>
                                    </div>
                                  </div>
                                  {["single_choice", "multiple_choice"].includes(newQuestion.questionType || "") && (
                                    <Textarea
                                      placeholder="Options (one per line)..."
                                      value={optionsInput}
                                      onChange={(e) => setOptionsInput(e.target.value)}
                                      rows={3}
                                      data-testid="textarea-question-options"
                                    />
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddQuestion(step.id)}
                                    disabled={!newQuestion.questionText?.trim() || addQuestionMutation.isPending}
                                    data-testid="button-save-question"
                                  >
                                    <Save className="h-4 w-4 mr-2" />
                                    Save Question
                                  </Button>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        )}
                      </div>
                    )}
                    
                    {step.stepType === "disclaimer" && (
                      <div className="pt-3 border-t space-y-3">
                        <h5 className="text-sm font-medium">Disclaimer</h5>
                        
                        {step.disclaimer ? (
                          <div className="p-3 bg-muted/50 rounded space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{step.disclaimer.title}</span>
                              <div className="flex items-center gap-1">
                                {step.disclaimer.requireSignature && (
                                  <Badge variant="secondary" className="text-xs">Signature Required</Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setEditingDisclaimer(step.disclaimer!)}
                                  data-testid="button-edit-disclaimer"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => deleteDisclaimerMutation.mutate(step.disclaimer!.id)}
                                  data-testid="button-delete-disclaimer"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {step.disclaimer.disclaimerText}
                            </p>
                          </div>
                        ) : (
                          <Accordion type="single" collapsible>
                            <AccordionItem value="add-disclaimer" className="border-none">
                              <AccordionTrigger className="text-sm py-2 hover:no-underline" data-testid="button-add-disclaimer-toggle">
                                <span className="flex items-center gap-2">
                                  <Plus className="h-4 w-4" />
                                  Add Disclaimer
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-3 pt-2">
                                  <Input
                                    placeholder="Disclaimer title..."
                                    value={newDisclaimer.title || ""}
                                    onChange={(e) => setNewDisclaimer(prev => ({ ...prev, title: e.target.value }))}
                                    data-testid="input-disclaimer-title"
                                  />
                                  <Textarea
                                    placeholder="Disclaimer text..."
                                    value={newDisclaimer.disclaimerText || ""}
                                    onChange={(e) => setNewDisclaimer(prev => ({ ...prev, disclaimerText: e.target.value }))}
                                    rows={4}
                                    data-testid="textarea-disclaimer-text"
                                  />
                                  <Input
                                    placeholder="Confirmation text..."
                                    value={newDisclaimer.confirmationText || ""}
                                    onChange={(e) => setNewDisclaimer(prev => ({ ...prev, confirmationText: e.target.value }))}
                                    data-testid="input-disclaimer-confirmation"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={newDisclaimer.requireSignature || false}
                                      onCheckedChange={(checked) => setNewDisclaimer(prev => ({ ...prev, requireSignature: checked }))}
                                      data-testid="switch-disclaimer-signature"
                                    />
                                    <Label className="text-sm">Require Signature</Label>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddDisclaimer(step.id)}
                                    disabled={!newDisclaimer.title?.trim() || !newDisclaimer.disclaimerText?.trim() || addDisclaimerMutation.isPending}
                                    data-testid="button-save-disclaimer"
                                  >
                                    <Save className="h-4 w-4 mr-2" />
                                    Save Disclaimer
                                  </Button>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        <Dialog open={addStepDialogOpen} onOpenChange={setAddStepDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full" data-testid="button-add-step">
              <Plus className="h-4 w-4 mr-2" />
              Add Workflow Step
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Workflow Step</DialogTitle>
              <DialogDescription>
                Choose a step type to add to your check-in workflow.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              {Object.entries(STEP_TYPE_CONFIG).map(([type, config]) => {
                const Icon = config.icon;
                const isSelected = selectedStepType === type;
                
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedStepType(type)}
                    className={`
                      flex items-start gap-3 p-4 rounded-lg border text-left transition-colors
                      ${isSelected ? 'border-primary bg-primary/5' : 'hover-elevate'}
                    `}
                    data-testid={`button-step-type-${type}`}
                  >
                    <div className={`p-2 rounded-md ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">{config.label}</h4>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddStepDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addStepMutation.mutate(selectedStepType)}
                disabled={addStepMutation.isPending}
                data-testid="button-confirm-add-step"
              >
                Add Step
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={!!editingQuestion} onOpenChange={() => setEditingQuestion(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Question</DialogTitle>
            </DialogHeader>
            {editingQuestion && (
              <div className="space-y-3 py-4">
                <Input
                  placeholder="Question text..."
                  value={editingQuestion.questionText}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, questionText: e.target.value })}
                  data-testid="input-edit-question-text"
                />
                <Select
                  value={editingQuestion.questionType}
                  onValueChange={(value) => setEditingQuestion({ ...editingQuestion, questionType: value as "text" })}
                >
                  <SelectTrigger data-testid="select-edit-question-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {["single_choice", "multiple_choice"].includes(editingQuestion.questionType) && (
                  <Textarea
                    placeholder="Options (one per line)..."
                    value={(editingQuestion.options || []).join("\n")}
                    onChange={(e) => setEditingQuestion({ 
                      ...editingQuestion, 
                      options: e.target.value.split("\n").filter(o => o.trim()) 
                    })}
                    rows={3}
                    data-testid="textarea-edit-question-options"
                  />
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingQuestion.required}
                    onCheckedChange={(checked) => setEditingQuestion({ ...editingQuestion, required: checked })}
                    data-testid="switch-edit-question-required"
                  />
                  <Label className="text-sm">Required</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingQuestion(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingQuestion) {
                    updateQuestionMutation.mutate({
                      questionId: editingQuestion.id,
                      data: {
                        questionText: editingQuestion.questionText,
                        questionType: editingQuestion.questionType,
                        required: editingQuestion.required,
                        options: editingQuestion.options,
                      },
                    });
                  }
                }}
                disabled={updateQuestionMutation.isPending}
                data-testid="button-save-edit-question"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={!!editingDisclaimer} onOpenChange={() => setEditingDisclaimer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Disclaimer</DialogTitle>
            </DialogHeader>
            {editingDisclaimer && (
              <div className="space-y-3 py-4">
                <Input
                  placeholder="Disclaimer title..."
                  value={editingDisclaimer.title}
                  onChange={(e) => setEditingDisclaimer({ ...editingDisclaimer, title: e.target.value })}
                  data-testid="input-edit-disclaimer-title"
                />
                <Textarea
                  placeholder="Disclaimer text..."
                  value={editingDisclaimer.disclaimerText}
                  onChange={(e) => setEditingDisclaimer({ ...editingDisclaimer, disclaimerText: e.target.value })}
                  rows={4}
                  data-testid="textarea-edit-disclaimer-text"
                />
                <Input
                  placeholder="Confirmation text..."
                  value={editingDisclaimer.confirmationText || ""}
                  onChange={(e) => setEditingDisclaimer({ ...editingDisclaimer, confirmationText: e.target.value })}
                  data-testid="input-edit-disclaimer-confirmation"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingDisclaimer.requireSignature}
                    onCheckedChange={(checked) => setEditingDisclaimer({ ...editingDisclaimer, requireSignature: checked })}
                    data-testid="switch-edit-disclaimer-signature"
                  />
                  <Label className="text-sm">Require Signature</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingDisclaimer(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingDisclaimer) {
                    updateDisclaimerMutation.mutate({
                      stepId: editingDisclaimer.stepId,
                      data: {
                        title: editingDisclaimer.title,
                        disclaimerText: editingDisclaimer.disclaimerText,
                        confirmationText: editingDisclaimer.confirmationText,
                        requireSignature: editingDisclaimer.requireSignature,
                      },
                    });
                  }
                }}
                disabled={updateDisclaimerMutation.isPending}
                data-testid="button-save-edit-disclaimer"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
