import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface EditAttendeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: EditFormData;
  onFormDataChange: (data: EditFormData | ((prev: EditFormData) => EditFormData)) => void;
  isUpdating: boolean;
  onSave: () => void;
}

/**
 * Dialog for editing attendee badge data (name, company, title).
 * 
 * Why: Form handling logic is isolated to keep focus on the form UI.
 * The parent component manages when to show this dialog and what
 * attendee is being edited.
 */
export function EditAttendeeDialog({
  open,
  onOpenChange,
  formData,
  onFormDataChange,
  isUpdating,
  onSave,
}: EditAttendeeDialogProps) {
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
