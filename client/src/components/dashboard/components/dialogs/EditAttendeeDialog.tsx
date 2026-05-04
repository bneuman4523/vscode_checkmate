import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { CheckCircle, Loader2 } from "lucide-react";
import type { EditFormData } from "../../types";

interface SyncedQuestion {
  id: string;
  questionName: string;
  questionLabel?: string;
  questionType: string;
  questionSource: string;
  options?: Array<{ answerCode: string; answerName: string; answerLabel?: string }>;
  readOnly: boolean;
  displayOnStaffEdit: boolean;
}

interface QuestionResponse {
  id: string;
  questionId: string;
  responseValue: string | null;
  responseValues: string[] | null;
}

interface EditAttendeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: EditFormData;
  onFormDataChange: (data: EditFormData | ((prev: EditFormData) => EditFormData)) => void;
  isUpdating: boolean;
  onSave: () => void;
  syncedQuestions?: SyncedQuestion[];
  questionResponses?: QuestionResponse[];
  questionEdits?: Record<string, string>;
  onQuestionEdit?: (questionId: string, value: string) => void;
}

/**
 * Dialog for editing attendee badge data (name, company, title)
 * and synced question responses when available.
 */
export function EditAttendeeDialog({
  open,
  onOpenChange,
  formData,
  onFormDataChange,
  isUpdating,
  onSave,
  syncedQuestions,
  questionResponses,
  questionEdits,
  onQuestionEdit,
}: EditAttendeeDialogProps) {
  const visibleQuestions = syncedQuestions?.filter(q => q.displayOnStaffEdit) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Badge Data</DialogTitle>
          <DialogDescription>
            Update the information that will be printed on the badge.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First Name</Label>
              <Input
                id="edit-firstName"
                value={formData.firstName}
                onChange={(e) => onFormDataChange(prev => ({ ...prev, firstName: e.target.value }))}
                data-testid="input-edit-firstName"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last Name</Label>
              <Input
                id="edit-lastName"
                value={formData.lastName}
                onChange={(e) => onFormDataChange(prev => ({ ...prev, lastName: e.target.value }))}
                data-testid="input-edit-lastName"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-company">Company</Label>
            <Input
              id="edit-company"
              value={formData.company}
              onChange={(e) => onFormDataChange(prev => ({ ...prev, company: e.target.value }))}
              data-testid="input-edit-company"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={formData.title}
              onChange={(e) => onFormDataChange(prev => ({ ...prev, title: e.target.value }))}
              data-testid="input-edit-title"
            />
          </div>

          {/* Synced Questions */}
          {visibleQuestions.length > 0 && (
            <div className="border-t pt-3 space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Custom Questions</Label>
              {visibleQuestions.map((question) => {
                const existing = questionResponses?.find(r => r.questionId === question.id);
                const currentValue = questionEdits?.[question.id] ?? existing?.responseValue ?? '';

                return (
                  <div key={question.id} className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      {question.questionLabel || question.questionName}
                      {question.readOnly && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1">Read-only</Badge>
                      )}
                    </Label>
                    {question.readOnly ? (
                      <p className="text-xs text-muted-foreground pl-1">{currentValue || '—'}</p>
                    ) : question.questionType === 'single_choice' && question.options?.length ? (
                      <Select
                        value={currentValue}
                        onValueChange={(v) => onQuestionEdit?.(question.id, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {question.options.map((opt) => (
                            <SelectItem key={opt.answerCode} value={opt.answerName || opt.answerCode}>
                              {opt.answerLabel || opt.answerName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-xs"
                        value={currentValue}
                        onChange={(e) => onQuestionEdit?.(question.id, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={onSave}
            disabled={isUpdating}
            className="w-full sm:w-auto"
            data-testid="button-save-edit"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
