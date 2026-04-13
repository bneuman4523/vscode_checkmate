import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, FileText, Check, Settings } from "lucide-react";
import type { Event, EventConfigurationTemplate } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ApplyConfigurationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  customerId: string;
  onConfigurationApplied?: () => void;
}

export function ApplyConfigurationModal({
  open,
  onOpenChange,
  event,
  customerId,
  onConfigurationApplied,
}: ApplyConfigurationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [configMethod, setConfigMethod] = useState<"template" | "copy" | "manual">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedSourceEventId, setSelectedSourceEventId] = useState<string>("");
  const [passcode, setPasscode] = useState<string>("");

  const { data: templates = [] } = useQuery<EventConfigurationTemplate[]>({
    queryKey: [`/api/configuration-templates?customerId=${customerId}`],
    enabled: open && !!customerId,
  });

  const { data: configuredEvents = [] } = useQuery<Event[]>({
    queryKey: [`/api/events?customerId=${customerId}`],
    enabled: open && !!customerId,
    select: (events) => events.filter(
      (e) => e.id !== event.id && e.configStatus === "configured"
    ),
  });

  const applyConfigMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | boolean> = {};
      if (configMethod === "template" && selectedTemplateId) {
        body.templateId = selectedTemplateId;
      } else if (configMethod === "copy" && selectedSourceEventId) {
        body.sourceEventId = selectedSourceEventId;
      } else if (configMethod === "manual") {
        body.manualSetup = true;
      }
      if (passcode) {
        body.passcode = passcode;
      }
      
      const response = await apiRequest("POST", `/api/events/${event.id}/apply-configuration`, body);
      return response.json();
    },
    onSuccess: () => {
      if (configMethod === "manual") {
        toast({
          title: "Manual Setup Started",
          description: `Taking you to the event settings for "${event.name}".`,
        });
        onOpenChange(false);
        setLocation(`/customers/${customerId}/events/${event.id}/settings`);
      } else {
        toast({
          title: "Configuration Applied",
          description: `Event "${event.name}" has been configured successfully.`,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/events?customerId=${customerId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/events/${event.id}`] });
        onOpenChange(false);
        onConfigurationApplied?.();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Configuration Failed",
        description: error.message || "Failed to apply configuration",
        variant: "destructive",
      });
    },
  });

  const handleApply = () => {
    if (configMethod === "template" && !selectedTemplateId) {
      toast({
        title: "Select a Template",
        description: "Please select a configuration template to apply.",
        variant: "destructive",
      });
      return;
    }
    if (configMethod === "copy" && !selectedSourceEventId) {
      toast({
        title: "Select an Event",
        description: "Please select an event to copy configuration from.",
        variant: "destructive",
      });
      return;
    }
    applyConfigMutation.mutate();
  };

  const canApply = 
    configMethod === "manual" ||
    (configMethod === "template" && selectedTemplateId) ||
    (configMethod === "copy" && selectedSourceEventId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Event</DialogTitle>
          <DialogDescription>
            Set up "{event.name}" for check-in. Choose how you'd like to configure this event.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <RadioGroup
            value={configMethod}
            onValueChange={(v) => setConfigMethod(v as "template" | "copy" | "manual")}
            className="space-y-3"
          >
            <div 
              className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
              onClick={() => setConfigMethod("template")}
            >
              <RadioGroupItem value="template" id="template" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="template" className="flex items-center gap-2 cursor-pointer font-medium">
                  <FileText className="h-4 w-4" />
                  Use Configuration Template
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Apply a saved configuration template with predefined settings
                </p>
              </div>
            </div>

            <div 
              className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
              onClick={() => setConfigMethod("copy")}
            >
              <RadioGroupItem value="copy" id="copy" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="copy" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Copy className="h-4 w-4" />
                  Copy from Another Event
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Duplicate settings from an existing configured event
                </p>
              </div>
            </div>

            <div 
              className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
              onClick={() => setConfigMethod("manual")}
            >
              <RadioGroupItem value="manual" id="manual" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="manual" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Settings className="h-4 w-4" />
                  I'll Configure Myself
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Skip templates and set up the event manually in settings
                </p>
              </div>
            </div>
          </RadioGroup>

          {configMethod === "template" && (
            <div className="space-y-2">
              <Label>Select Template</Label>
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No configuration templates found. Create one first, or copy from another event.
                </p>
              ) : (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          {template.name}
                          {template.isDefault && (
                            <span className="text-xs text-muted-foreground">(Default)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {configMethod === "copy" && (
            <div className="space-y-2">
              <Label>Copy from Event</Label>
              {configuredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No configured events available to copy from. Configure another event first, or use a template.
                </p>
              ) : (
                <Select value={selectedSourceEventId} onValueChange={setSelectedSourceEventId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredEvents.map((evt) => (
                      <SelectItem key={evt.id} value={evt.id}>
                        {evt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {configMethod !== "manual" && (
            <div className="space-y-2">
              <Label htmlFor="passcode">Staff Passcode (Optional)</Label>
              <Input
                id="passcode"
                placeholder="Leave blank to auto-generate"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <p className="text-xs text-muted-foreground">
                This passcode will be used for staff check-in access. If left blank, one will be generated automatically.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={!canApply || applyConfigMutation.isPending}
          >
            {applyConfigMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {configMethod === "manual" ? "Opening..." : "Applying..."}
              </>
            ) : configMethod === "manual" ? (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Go to Settings
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Apply Configuration
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
