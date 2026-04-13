import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";

interface AddAttendeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType: string;
  }) => void;
  isSubmitting: boolean;
  participantTypes: string[];
}

export function AddAttendeeDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  participantTypes,
}: AddAttendeeDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [participantType, setParticipantType] = useState("");

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompany("");
    setTitle("");
    setParticipantType("");
  };

  const handleSubmit = () => {
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      participantType,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const isValid =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    participantType;

  const availableTypes = participantTypes.length > 0 ? participantTypes : ["General"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Walk-in Attendee</DialogTitle>
          <DialogDescription>
            Register a new attendee who arrived without prior registration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="walkin-firstName">First Name *</Label>
              <Input
                id="walkin-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                data-testid="input-walkin-firstName"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walkin-lastName">Last Name *</Label>
              <Input
                id="walkin-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                data-testid="input-walkin-lastName"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-email">Email *</Label>
            <Input
              id="walkin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              data-testid="input-walkin-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-participantType">Attendee Type *</Label>
            <Select value={participantType} onValueChange={setParticipantType}>
              <SelectTrigger data-testid="select-walkin-participantType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-company">Company</Label>
            <Input
              id="walkin-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
              data-testid="input-walkin-company"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-title">Title</Label>
            <Input
              id="walkin-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Job title"
              data-testid="input-walkin-title"
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="w-full sm:w-auto"
            data-testid="button-submit-walkin"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Add Attendee
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
