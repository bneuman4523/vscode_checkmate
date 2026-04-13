import { useState } from "react";
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
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  MessageSquare, 
  FileText, 
  Edit2, 
  Printer,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import type { 
  WorkflowSnapshot, 
  WorkflowStepSnapshot, 
  BuyerQuestionSnapshot, 
  DisclaimerSnapshot,
  WorkflowStepType,
  BuyerQuestionType
} from "@shared/schema";

interface TemplateWorkflowEditorProps {
  value: WorkflowSnapshot;
  onChange: (value: WorkflowSnapshot) => void;
}

const STEP_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string }> = {
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

const QUESTION_TYPES: { value: BuyerQuestionType; label: string }[] = [
  { value: "text", label: "Text Input" },
  { value: "single_choice", label: "Single Choice" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "rating", label: "Star Rating" },
];

function generateId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function TemplateWorkflowEditor({ value, onChange }: TemplateWorkflowEditorProps) {
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [selectedStepType, setSelectedStepType] = useState<WorkflowStepType>("buyer_questions");
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editingDisclaimerIndex, setEditingDisclaimerIndex] = useState<number | null>(null);

  const [newQuestion, setNewQuestion] = useState<Partial<BuyerQuestionSnapshot>>({
    questionText: "",
    questionType: "text",
    required: false,
    options: [],
  });
  
  const [newDisclaimer, setNewDisclaimer] = useState<Partial<DisclaimerSnapshot>>({
    title: "",
    disclaimerText: "",
    confirmationText: "I have read and agree to the above disclaimer.",
    requireSignature: false,
  });
  
  const [optionsInput, setOptionsInput] = useState("");

  const updateWorkflow = (updates: Partial<WorkflowSnapshot>) => {
    onChange({ ...value, ...updates });
  };

  const addStep = (stepType: WorkflowStepType) => {
    const newStep: WorkflowStepSnapshot = {
      stepType,
      position: value.steps.length,
      enabled: true,
    };
    updateWorkflow({ steps: [...value.steps, newStep] });
    setAddStepDialogOpen(false);
  };

  const removeStep = (index: number) => {
    const stepToRemove = value.steps[index];
    const newSteps = value.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i }));
    
    let newQuestions = value.buyerQuestions;
    let newDisclaimers = value.disclaimers;
    
    if (stepToRemove.stepType === "buyer_questions") {
      const qStepIndex = value.steps.filter((s, i) => i < index && s.stepType === "buyer_questions").length;
      newQuestions = value.buyerQuestions.filter(q => (q.stepIndex ?? 0) !== qStepIndex);
      newQuestions = newQuestions.map(q => (q.stepIndex ?? 0) > qStepIndex ? { ...q, stepIndex: (q.stepIndex ?? 0) - 1 } : q);
    } else if (stepToRemove.stepType === "disclaimer") {
      const dStepIndex = value.steps.filter((s, i) => i < index && s.stepType === "disclaimer").length;
      newDisclaimers = value.disclaimers.filter(d => (d.stepIndex ?? 0) !== dStepIndex);
      newDisclaimers = newDisclaimers.map(d => (d.stepIndex ?? 0) > dStepIndex ? { ...d, stepIndex: (d.stepIndex ?? 0) - 1 } : d);
    }
    
    updateWorkflow({ steps: newSteps, buyerQuestions: newQuestions, disclaimers: newDisclaimers });
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= value.steps.length) return;
    
    const newSteps = [...value.steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    newSteps.forEach((s, i) => s.position = i);
    updateWorkflow({ steps: newSteps });
  };

  const toggleStep = (index: number) => {
    const newSteps = [...value.steps];
    newSteps[index] = { ...newSteps[index], enabled: !newSteps[index].enabled };
    updateWorkflow({ steps: newSteps });
  };

  const addQuestion = (stepIndex: number) => {
    if (!newQuestion.questionText) return;
    
    const questionsInStep = value.buyerQuestions.filter(q => (q.stepIndex ?? 0) === stepIndex);
    const question: BuyerQuestionSnapshot = {
      questionText: newQuestion.questionText || "",
      questionType: newQuestion.questionType || "text",
      required: newQuestion.required || false,
      position: questionsInStep.length,
      options: optionsInput ? optionsInput.split(",").map(o => o.trim()).filter(Boolean) : [],
      stepIndex,
    };
    
    updateWorkflow({ buyerQuestions: [...value.buyerQuestions, question] });
    setNewQuestion({ questionText: "", questionType: "text", required: false, options: [] });
    setOptionsInput("");
  };

  const removeQuestion = (index: number) => {
    updateWorkflow({ buyerQuestions: value.buyerQuestions.filter((_, i) => i !== index) });
  };

  const updateQuestion = (index: number, updates: Partial<BuyerQuestionSnapshot>) => {
    const newQuestions = [...value.buyerQuestions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    updateWorkflow({ buyerQuestions: newQuestions });
    setEditingQuestionIndex(null);
  };

  const addDisclaimer = (stepIndex: number) => {
    if (!newDisclaimer.title || !newDisclaimer.disclaimerText) return;
    
    const disclaimer: DisclaimerSnapshot = {
      title: newDisclaimer.title || "",
      disclaimerText: newDisclaimer.disclaimerText || "",
      requireSignature: newDisclaimer.requireSignature || false,
      confirmationText: newDisclaimer.confirmationText || "I have read and agree to the above disclaimer.",
      stepIndex,
    };
    
    updateWorkflow({ disclaimers: [...value.disclaimers, disclaimer] });
    setNewDisclaimer({
      title: "",
      disclaimerText: "",
      confirmationText: "I have read and agree to the above disclaimer.",
      requireSignature: false,
    });
  };

  const removeDisclaimer = (index: number) => {
    updateWorkflow({ disclaimers: value.disclaimers.filter((_, i) => i !== index) });
  };

  const updateDisclaimer = (index: number, updates: Partial<DisclaimerSnapshot>) => {
    const newDisclaimers = [...value.disclaimers];
    newDisclaimers[index] = { ...newDisclaimers[index], ...updates };
    updateWorkflow({ disclaimers: newDisclaimers });
    setEditingDisclaimerIndex(null);
  };

  const getBuyerQuestionsStepIndex = (stepArrayIndex: number) => {
    return value.steps.slice(0, stepArrayIndex + 1).filter(s => s.stepType === "buyer_questions").length - 1;
  };

  const getDisclaimerStepIndex = (stepArrayIndex: number) => {
    return value.steps.slice(0, stepArrayIndex + 1).filter(s => s.stepType === "disclaimer").length - 1;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Check-in Workflow</CardTitle>
          <CardDescription>
            Configure the steps attendees complete during check-in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Workflow</Label>
              <p className="text-xs text-muted-foreground">Show workflow steps during check-in</p>
            </div>
            <Switch 
              checked={value.enabled} 
              onCheckedChange={(enabled) => updateWorkflow({ enabled })} 
            />
          </div>

          {value.enabled && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable for Staff</Label>
                  <p className="text-xs text-muted-foreground">Staff check-ins show workflow</p>
                </div>
                <Switch 
                  checked={value.enabledForStaff} 
                  onCheckedChange={(enabledForStaff) => updateWorkflow({ enabledForStaff })} 
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable for Kiosk</Label>
                  <p className="text-xs text-muted-foreground">Kiosk check-ins show workflow</p>
                </div>
                <Switch 
                  checked={value.enabledForKiosk} 
                  onCheckedChange={(enabledForKiosk) => updateWorkflow({ enabledForKiosk })} 
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Workflow Steps</Label>
                  <Button size="sm" variant="outline" onClick={() => setAddStepDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Step
                  </Button>
                </div>

                {value.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No workflow steps configured. Add a step to get started.
                  </p>
                ) : (
                  <Accordion type="multiple" className="space-y-2">
                    {value.steps.map((step, index) => {
                      const config = STEP_TYPE_CONFIG[step.stepType];
                      const Icon = config?.icon || MessageSquare;
                      
                      return (
                        <AccordionItem key={index} value={`step-${index}`} className="border rounded-lg">
                          <AccordionTrigger className="px-3 py-2 hover:no-underline">
                            <div className="flex items-center gap-3 flex-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <Icon className="h-4 w-4" />
                              <span className="font-medium">{config?.label || step.stepType}</span>
                              {!step.enabled && (
                                <Badge variant="secondary" className="text-xs">Disabled</Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm">Enabled</Label>
                                <Switch 
                                  checked={step.enabled} 
                                  onCheckedChange={() => toggleStep(index)} 
                                />
                              </div>

                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => moveStep(index, "up")}
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => moveStep(index, "down")}
                                  disabled={index === value.steps.length - 1}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={() => removeStep(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              {step.stepType === "buyer_questions" && (
                                <div className="border-t pt-3 mt-3 space-y-3">
                                  <Label className="text-sm font-medium">Questions</Label>
                                  {value.buyerQuestions
                                    .map((q, qIndex) => ({ ...q, originalIndex: qIndex }))
                                    .filter(q => q.stepIndex === getBuyerQuestionsStepIndex(index))
                                    .map((question) => (
                                      <div key={question.originalIndex} className="flex items-start gap-2 p-2 bg-muted rounded">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">{question.questionText}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {QUESTION_TYPES.find(t => t.value === question.questionType)?.label}
                                            {question.required && " • Required"}
                                          </p>
                                        </div>
                                        <Button 
                                          size="sm" 
                                          variant="ghost"
                                          onClick={() => removeQuestion(question.originalIndex)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  
                                  <div className="space-y-2 p-3 border rounded-lg bg-background">
                                    <Input
                                      placeholder="Question text..."
                                      value={newQuestion.questionText || ""}
                                      onChange={(e) => setNewQuestion({ ...newQuestion, questionText: e.target.value })}
                                    />
                                    <div className="flex gap-2">
                                      <Select 
                                        value={newQuestion.questionType || "text"} 
                                        onValueChange={(v) => setNewQuestion({ ...newQuestion, questionType: v as BuyerQuestionType })}
                                      >
                                        <SelectTrigger className="w-[180px]">
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
                                          onCheckedChange={(required) => setNewQuestion({ ...newQuestion, required })}
                                        />
                                        <Label className="text-sm">Required</Label>
                                      </div>
                                    </div>
                                    {(newQuestion.questionType === "single_choice" || newQuestion.questionType === "multiple_choice") && (
                                      <Input
                                        placeholder="Options (comma-separated)..."
                                        value={optionsInput}
                                        onChange={(e) => setOptionsInput(e.target.value)}
                                      />
                                    )}
                                    <Button 
                                      size="sm" 
                                      onClick={() => addQuestion(getBuyerQuestionsStepIndex(index))}
                                      disabled={!newQuestion.questionText}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Question
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {step.stepType === "disclaimer" && (
                                <div className="border-t pt-3 mt-3 space-y-3">
                                  <Label className="text-sm font-medium">Disclaimers</Label>
                                  {value.disclaimers
                                    .map((d, dIndex) => ({ ...d, originalIndex: dIndex }))
                                    .filter(d => d.stepIndex === getDisclaimerStepIndex(index))
                                    .map((disclaimer) => (
                                      <div key={disclaimer.originalIndex} className="flex items-start gap-2 p-2 bg-muted rounded">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">{disclaimer.title}</p>
                                          <p className="text-xs text-muted-foreground line-clamp-2">
                                            {disclaimer.disclaimerText}
                                          </p>
                                          {disclaimer.requireSignature && (
                                            <Badge variant="secondary" className="text-xs mt-1">Requires Signature</Badge>
                                          )}
                                        </div>
                                        <Button 
                                          size="sm" 
                                          variant="ghost"
                                          onClick={() => removeDisclaimer(disclaimer.originalIndex)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  
                                  <div className="space-y-2 p-3 border rounded-lg bg-background">
                                    <Input
                                      placeholder="Disclaimer title..."
                                      value={newDisclaimer.title || ""}
                                      onChange={(e) => setNewDisclaimer({ ...newDisclaimer, title: e.target.value })}
                                    />
                                    <Textarea
                                      placeholder="Disclaimer text..."
                                      value={newDisclaimer.disclaimerText || ""}
                                      onChange={(e) => setNewDisclaimer({ ...newDisclaimer, disclaimerText: e.target.value })}
                                      rows={3}
                                    />
                                    <Input
                                      placeholder="Confirmation text..."
                                      value={newDisclaimer.confirmationText || ""}
                                      onChange={(e) => setNewDisclaimer({ ...newDisclaimer, confirmationText: e.target.value })}
                                    />
                                    <div className="flex items-center gap-2">
                                      <Switch 
                                        checked={newDisclaimer.requireSignature || false}
                                        onCheckedChange={(requireSignature) => setNewDisclaimer({ ...newDisclaimer, requireSignature })}
                                      />
                                      <Label className="text-sm">Require Signature</Label>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      onClick={() => addDisclaimer(getDisclaimerStepIndex(index))}
                                      disabled={!newDisclaimer.title || !newDisclaimer.disclaimerText}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Disclaimer
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addStepDialogOpen} onOpenChange={setAddStepDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workflow Step</DialogTitle>
            <DialogDescription>
              Choose a step type to add to the workflow
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {Object.entries(STEP_TYPE_CONFIG).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={type}
                  variant={selectedStepType === type ? "default" : "outline"}
                  className="justify-start h-auto py-3"
                  onClick={() => setSelectedStepType(type as WorkflowStepType)}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">{config.description}</div>
                  </div>
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStepDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addStep(selectedStepType)}>
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const emptyWorkflowSnapshot: WorkflowSnapshot = {
  enabled: false,
  enabledForStaff: true,
  enabledForKiosk: true,
  steps: [],
  buyerQuestions: [],
  disclaimers: [],
};
