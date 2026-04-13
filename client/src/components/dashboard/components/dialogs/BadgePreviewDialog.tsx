import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QrCode, Loader2 } from "lucide-react";
import BadgeRenderSurface from "@/components/BadgeRenderSurface";
import FlippableBadge from "@/components/FlippableBadge";

import type { BadgeTemplateConfig, Attendee } from "../../types";

interface BadgePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendees: Attendee[];
  eventId: string;
  getAuthHeaders: () => Record<string, string>;
}

export function BadgePreviewDialog({
  open,
  onOpenChange,
  attendees,
  eventId,
  getAuthHeaders,
}: BadgePreviewDialogProps) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [resolvedTemplate, setResolvedTemplate] = useState<BadgeTemplateConfig | null>(null);
  const [resolutionPath, setResolutionPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participantTypes = useMemo(() => {
    const types = new Set<string>();
    attendees.forEach(a => {
      if (a.participantType) types.add(a.participantType);
    });
    const sorted = Array.from(types).sort();
    if (sorted.length === 0) sorted.push("General");
    return sorted;
  }, [attendees]);

  useEffect(() => {
    if (open && participantTypes.length > 0 && !selectedType) {
      setSelectedType(participantTypes[0]);
    }
  }, [open, participantTypes, selectedType]);

  const resolveTemplate = useCallback(async (type: string) => {
    if (!type || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      const sampleAttendee = attendees.find(a => a.participantType === type);
      if (sampleAttendee) {
        const response = await fetch(`/api/staff/attendees/${sampleAttendee.id}/resolve-template`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error("Failed to resolve template");
        const data = await response.json();
        setResolvedTemplate(data.template || null);
        setResolutionPath(data.resolutionPath || "");
      } else {
        setResolvedTemplate(null);
        setResolutionPath("");
      }
    } catch (err) {
      console.error("Error resolving badge template:", err);
      setError("Could not load badge template for this type.");
      setResolvedTemplate(null);
    } finally {
      setLoading(false);
    }
  }, [attendees, eventId, getAuthHeaders]);

  useEffect(() => {
    if (open && selectedType) {
      resolveTemplate(selectedType);
    }
  }, [open, selectedType, resolveTemplate]);

  useEffect(() => {
    if (!open) {
      setSelectedType("");
      setResolvedTemplate(null);
      setError(null);
    }
  }, [open]);

  const resolutionLabel = resolutionPath === "event_override"
    ? "Event-specific assignment"
    : resolutionPath === "customer_default"
      ? "Account default template"
      : resolutionPath === "any_template"
        ? "Fallback (first available)"
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Badge Template Preview
          </DialogTitle>
          <DialogDescription>
            Preview how badges look for each attendee type at this event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">Attendee Type:</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {participantTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center items-center p-12 bg-muted rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center p-12 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : resolvedTemplate ? (
            <>
              <div className="flex justify-center p-4 bg-muted rounded-lg">
                {(resolvedTemplate as any).layoutMode === 'foldable' ? (
                  <FlippableBadge
                    front={
                      <BadgeRenderSurface
                        firstName="Sample"
                        lastName="Attendee"
                        email="sample@example.com"
                        company="Example Company"
                        title="Event Participant"
                        participantType={selectedType}
                        externalId="SAMPLE-001"
                        orderCode="ORD-1234"
                        templateConfig={resolvedTemplate}
                        renderSide="front"
                      />
                    }
                    back={
                      <BadgeRenderSurface
                        firstName="Sample"
                        lastName="Attendee"
                        email="sample@example.com"
                        company="Example Company"
                        title="Event Participant"
                        participantType={selectedType}
                        externalId="SAMPLE-001"
                        orderCode="ORD-1234"
                        templateConfig={resolvedTemplate}
                        renderSide="back"
                      />
                    }
                  />
                ) : (
                  <BadgeRenderSurface
                    firstName="Sample"
                    lastName="Attendee"
                    email="sample@example.com"
                    company="Example Company"
                    title="Event Participant"
                    participantType={selectedType}
                    externalId="SAMPLE-001"
                    orderCode="ORD-1234"
                    templateConfig={resolvedTemplate}
                  />
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Template:</strong> {resolvedTemplate.name}</p>
                <p><strong>Size:</strong> {resolvedTemplate.width}" x {resolvedTemplate.height}"</p>
                <p><strong>Font:</strong> {resolvedTemplate.fontFamily}</p>
                {resolutionLabel && <p><strong>Source:</strong> {resolutionLabel}</p>}
              </div>
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Print settings for exact size:</strong> In the browser print dialog, set Margins to "None" and turn off "Headers and footers" under "More settings".
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <div className="flex justify-center items-center p-12 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                No badge template configured for "{selectedType}" attendees. Set one up in the event's badge settings.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
