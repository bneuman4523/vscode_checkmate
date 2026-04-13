import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Loader2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CustomerIntegration, Event } from "@shared/schema";

const createEventSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  eventDate: z.string().min(1, "Event date is required"),
  integrationId: z.string().optional(),
  status: z.enum(["upcoming", "active", "completed"]).default("upcoming"),
});

type CreateEventFormData = z.infer<typeof createEventSchema>;

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  onEventCreated?: (event: Event) => void;
}

export function CreateEventDialog({ 
  open, 
  onOpenChange, 
  customerId,
  onEventCreated 
}: CreateEventDialogProps) {
  const { toast } = useToast();

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<CustomerIntegration[]>({
    queryKey: [`/api/integrations?customerId=${customerId}`],
    enabled: open && !!customerId,
  });

  const form = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      eventDate: "",
      integrationId: undefined,
      status: "upcoming",
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: CreateEventFormData) => {
      const response = await apiRequest("POST", "/api/events", {
        ...data,
        customerId,
        eventDate: new Date(data.eventDate),
        integrationId: data.integrationId === "none" ? null : data.integrationId,
      });
      return response.json();
    },
    onSuccess: (event: Event) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events?customerId=${customerId}`] });
      toast({
        title: "Event created",
        description: `"${event.name}" has been created successfully.`,
      });
      form.reset();
      onOpenChange(false);
      onEventCreated?.(event);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create event",
        description: error.message || "An error occurred while creating the event.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateEventFormData) => {
    createEventMutation.mutate(data);
  };

  const activeIntegrations = integrations.filter(i => i.status === "active");

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && createEventMutation.isPending) return;
    onOpenChange(newOpen);
    if (!newOpen) form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => { if (createEventMutation.isPending) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
          <DialogDescription>
            Set up a new event for registration and badge printing.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Annual Developer Conference 2025" 
                      data-testid="input-event-name"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Date <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      data-testid="input-event-date"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="integrationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Attendee Sync Integration
                  </FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={integrationsLoading}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-integration">
                        <SelectValue placeholder="Select an integration (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No integration</SelectItem>
                      {activeIntegrations.map((integration) => (
                        <SelectItem 
                          key={integration.id} 
                          value={integration.id}
                          data-testid={`option-integration-${integration.id}`}
                        >
                          {integration.name} ({integration.providerId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Link this event to an integration to sync attendees automatically.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-create-event"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createEventMutation.isPending}
                data-testid="button-submit-create-event"
              >
                {createEventMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Event
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
