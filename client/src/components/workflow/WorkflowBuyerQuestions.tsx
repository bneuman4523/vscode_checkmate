import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Star } from "lucide-react";
import type { EventBuyerQuestion } from "@shared/schema";
import type { QuestionResponse } from "@/hooks/use-workflow-runner";

interface WorkflowBuyerQuestionsProps {
  questions: EventBuyerQuestion[];
  responses: Record<string, QuestionResponse>;
  onResponseChange: (questionId: string, value: string | null, isMultiple?: boolean) => void;
  onMultipleResponseChange: (questionId: string, values: string[]) => void;
  disabled?: boolean;
}

export function WorkflowBuyerQuestions({
  questions,
  responses,
  onResponseChange,
  onMultipleResponseChange,
  disabled = false,
}: WorkflowBuyerQuestionsProps) {
  const renderQuestion = (question: EventBuyerQuestion) => {
    const response = responses[question.id];
    
    switch (question.questionType) {
      case 'text':
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={`q-${question.id}`} className="text-base font-medium">
              {question.questionText}
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={`q-${question.id}`}
              data-testid={`input-question-${question.id}`}
              placeholder={question.placeholder || "Enter your answer..."}
              value={response?.responseValue || ""}
              onChange={(e) => onResponseChange(question.id, e.target.value)}
              disabled={disabled}
            />
          </div>
        );
        
      case 'single_choice':
        return (
          <div key={question.id} className="space-y-3">
            <Label className="text-base font-medium">
              {question.questionText}
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={response?.responseValue || ""}
              onValueChange={(value) => onResponseChange(question.id, value)}
              disabled={disabled}
              className="space-y-2"
            >
              {(question.options || []).map((option, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <RadioGroupItem 
                    value={option} 
                    id={`q-${question.id}-${idx}`}
                    data-testid={`radio-question-${question.id}-${idx}`}
                  />
                  <Label 
                    htmlFor={`q-${question.id}-${idx}`}
                    className="font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
        
      case 'multiple_choice':
        const selectedValues = response?.responseValues || [];
        return (
          <div key={question.id} className="space-y-3">
            <Label className="text-base font-medium">
              {question.questionText}
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="space-y-2">
              {(question.options || []).map((option, idx) => (
                <div key={idx} className="flex items-center space-x-3">
                  <Checkbox
                    id={`q-${question.id}-${idx}`}
                    data-testid={`checkbox-question-${question.id}-${idx}`}
                    checked={selectedValues.includes(option)}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...selectedValues, option]
                        : selectedValues.filter(v => v !== option);
                      onMultipleResponseChange(question.id, newValues);
                    }}
                  />
                  <Label 
                    htmlFor={`q-${question.id}-${idx}`}
                    className="font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );
        
      case 'rating':
        const currentRating = parseInt(response?.responseValue || "0", 10);
        return (
          <div key={question.id} className="space-y-3">
            <Label className="text-base font-medium">
              {question.questionText}
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  data-testid={`rating-question-${question.id}-${rating}`}
                  disabled={disabled}
                  onClick={() => onResponseChange(question.id, rating.toString())}
                  className="p-1 transition-colors hover-elevate rounded"
                >
                  <Star
                    className={`h-8 w-8 ${
                      rating <= currentRating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">No questions configured for this step.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-buyer-questions-title">A Few Quick Questions</CardTitle>
        <CardDescription>Please answer the following questions to complete your check-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {questions
          .sort((a, b) => a.position - b.position)
          .map(renderQuestion)}
      </CardContent>
    </Card>
  );
}
