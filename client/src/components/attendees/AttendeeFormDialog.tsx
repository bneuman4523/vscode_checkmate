import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Send, Mail, Printer } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Attendee } from "@shared/schema";
import type { AttendeeFormValues } from "./useAttendeeMutations";

const attendeeFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  company: z.string().optional(),
  title: z.string().optional(),
  participantType: z.string().min(1, "Attendee type is required"),
  externalId: z.string().optional(),
  registrationStatus: z.string().optional(),
});

const REGISTRATION_STATUSES = ["Invited", "Registered", "Attended"];

interface AttendeeFormDialogProps {
  mode: "add" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendee: Attendee | null;
  attendeeTypes: string[];
  isPending: boolean;
  onSubmit: (data: AttendeeFormValues) => void;
  eventId?: string;
}

export function AttendeeFormDialog({
  mode,
  open,
  onOpenChange,
  attendee,
  attendeeTypes,
  isPending,
  onSubmit,
  eventId,
}: AttendeeFormDialogProps) {
  const queryClient = useQueryClient();

  // Fetch synced questions for this event
  const { data: syncedQuestions } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "synced-questions"],
    queryFn: async () => {
      if (!eventId) return [];
      const res = await fetch(`/api/events/${eventId}/synced-questions`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!eventId && mode === 'edit' && open,
    staleTime: 30 * 1000,
  });

  // Fetch question responses for this attendee
  const { data: questionResponses } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "attendees", attendee?.id, "question-responses"],
    queryFn: async () => {
      if (!eventId || !attendee?.id) return [];
      const res = await fetch(`/api/events/${eventId}/attendees/${attendee.id}/question-responses`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!eventId && !!attendee?.id && mode === 'edit' && open,
    staleTime: 30 * 1000,
  });

  // Track local question response edits
  const [editedResponses, setEditedResponses] = useState<Record<string, string>>({});

  // Bulk save question responses
  const saveResponsesMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !attendee?.id || Object.keys(editedResponses).length === 0) return;
      const responses = Object.entries(editedResponses).map(([questionId, responseValue]) => ({
        questionId,
        responseValue,
      }));
      const res = await fetch(`/api/events/${eventId}/attendees/${attendee.id}/question-responses/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responses }),
      });
      if (!res.ok) throw new Error('Failed to save question responses');
    },
    onSuccess: () => {
      setEditedResponses({});
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "attendees", attendee?.id, "question-responses"] });
    },
  });
  const form = useForm<AttendeeFormValues>({
    resolver: zodResolver(attendeeFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      title: "",
      participantType: "",
      externalId: "",
      registrationStatus: "Registered",
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      if (mode === "edit" && attendee) {
        form.reset({
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          email: attendee.email,
          company: attendee.company || "",
          title: attendee.title || "",
          participantType: attendee.participantType,
          externalId: attendee.externalId || "",
          registrationStatus: attendee.registrationStatus || "Registered",
        });
      } else {
        form.reset({
          firstName: "",
          lastName: "",
          email: "",
          company: "",
          title: "",
          participantType: "Attendee",
          externalId: "",
          registrationStatus: "Registered",
        });
      }
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = (data: AttendeeFormValues) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={mode === "edit" ? "sm:max-w-[600px] max-h-[90vh] overflow-y-auto" : "sm:max-w-[500px]"}
        data-testid={mode === "add" ? "dialog-add-attendee" : "dialog-edit-attendee"}
      >
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Attendee" : "Edit Attendee"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Add a new attendee to this event."
              : "Update attendee information. Registration code and status fields are read-only."}
          </DialogDescription>
        </DialogHeader>

        {mode === "edit" && attendee && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 mb-4">
            <h4 className="text-sm font-medium text-muted-foreground">Profile Information (Read-Only)</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Registration Code:</span>
                <p className="font-mono text-xs mt-1" data-testid="text-edit-external-id">
                  {attendee.externalId || "Not synced"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Registration Status:</span>
                <div className="mt-1" data-testid="text-edit-registration-status">
                  {attendee.registrationStatus === 'Attended' ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Attended
                    </Badge>
                  ) : attendee.registrationStatus === 'Registered' ? (
                    <Badge variant="secondary" className="gap-1">
                      <Send className="h-3 w-3" />
                      Registered
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Mail className="h-3 w-3" />
                      Invited
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Check-in Status:</span>
                <div className="mt-1">
                  {attendee.checkedIn ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Attended
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600">
                      {attendee.registrationStatusLabel || attendee.registrationStatus || 'Registered'}
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Checked In At:</span>
                <p className="text-xs mt-1">
                  {attendee.checkedInAt
                    ? new Date(attendee.checkedInAt).toLocaleString()
                    : "-"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Badge Printed:</span>
                <div className="mt-1">
                  {attendee.badgePrinted ? (
                    <Badge variant="outline" className="gap-1">
                      <Printer className="h-3 w-3" />
                      Printed
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not printed</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Badge Printed At:</span>
                <p className="text-xs mt-1">
                  {attendee.badgePrintedAt
                    ? new Date(attendee.badgePrintedAt).toLocaleString()
                    : "-"}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Created At:</span>
                <p className="text-xs mt-1">
                  {attendee.createdAt
                    ? new Date(attendee.createdAt).toLocaleString()
                    : "-"}
                </p>
              </div>
              {attendee.customFields && Object.keys(attendee.customFields).length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Custom Fields:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(attendee.customFields).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="font-medium">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Synced Questions from Certain */}
              {syncedQuestions && syncedQuestions.filter(q => q.displayOnAdminEdit).length > 0 && (
                <div className="col-span-2 border-t pt-3 mt-1">
                  <span className="text-muted-foreground text-sm font-medium">Synced Questions</span>
                  <div className="mt-2 space-y-3">
                    {syncedQuestions.filter(q => q.displayOnAdminEdit).map((question: any) => {
                      const existing = questionResponses?.find((r: any) => r.questionId === question.id);
                      const currentValue = editedResponses[question.id] ?? existing?.responseValue ?? '';
                      const isEdited = question.id in editedResponses;

                      return (
                        <div key={question.id} className="space-y-1">
                          <label className="text-xs font-medium flex items-center gap-1.5">
                            {question.questionLabel || question.questionName}
                            {question.questionSource === 'profile' && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1">Profile</Badge>
                            )}
                            {question.readOnly && (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1">Read-only</Badge>
                            )}
                          </label>
                          {question.readOnly ? (
                            <p className="text-xs text-muted-foreground">{currentValue || '—'}</p>
                          ) : question.questionType === 'single_choice' && question.options?.length > 0 ? (
                            <Select
                              value={currentValue}
                              onValueChange={(v) => setEditedResponses(prev => ({ ...prev, [question.id]: v }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                {question.options.map((opt: any) => (
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
                              onChange={(e) => setEditedResponses(prev => ({ ...prev, [question.id]: e.target.value }))}
                              placeholder={`Enter ${question.questionName}...`}
                            />
                          )}
                        </div>
                      );
                    })}
                    {Object.keys(editedResponses).length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => saveResponsesMutation.mutate()}
                        disabled={saveResponsesMutation.isPending}
                        className="text-xs"
                      >
                        {saveResponsesMutation.isPending ? 'Saving...' : 'Save Question Responses'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={mode === "add" ? "John" : undefined} data-testid={mode === "add" ? "input-first-name" : "input-edit-first-name"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={mode === "add" ? "Doe" : undefined} data-testid={mode === "add" ? "input-last-name" : "input-edit-last-name"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder={mode === "add" ? "john@example.com" : undefined} data-testid={mode === "add" ? "input-email" : "input-edit-email"} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={mode === "add" ? "Acme Inc" : undefined} data-testid={mode === "add" ? "input-company" : "input-edit-company"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={mode === "add" ? "Software Engineer" : undefined} data-testid={mode === "add" ? "input-title" : "input-edit-title"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {mode === "add" ? (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="participantType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attendee Type <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-participant-type" className={!field.value ? "text-muted-foreground" : ""}>
                            <SelectValue placeholder="Select attendee type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {attendeeTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="registrationStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "Registered"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-registration-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REGISTRATION_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <FormField
                control={form.control}
                name="participantType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attendee Type <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-participant-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {attendeeTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {mode === "add" && (
              <FormField
                control={form.control}
                name="externalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Code (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="External system ID" data-testid="input-external-id" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid={mode === "add" ? "button-save-attendee" : "button-update-attendee"}
              >
                {isPending
                  ? (mode === "add" ? "Adding..." : "Saving...")
                  : (mode === "add" ? "Add Attendee" : "Save Changes")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
