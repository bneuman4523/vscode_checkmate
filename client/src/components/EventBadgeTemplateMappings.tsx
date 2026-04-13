import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Palette, Plus, Trash2, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BadgeTemplate, EventBadgeTemplateOverride } from "@shared/schema";

interface EventBadgeTemplateMappingsProps {
  eventId: string;
  customerId: string;
}

const DEFAULT_PARTICIPANT_TYPES = [
  "General",
  "VIP",
  "Speaker",
  "Sponsor",
  "Staff",
  "Press",
  "Media",
  "Exhibitor",
];

interface TemplateMappingResult {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: 'event_override' | 'customer_default' | 'any_template' | 'none';
}

export default function EventBadgeTemplateMappings({ eventId, customerId }: EventBadgeTemplateMappingsProps) {
  const { toast } = useToast();
  const [newMappingType, setNewMappingType] = useState<string>("");
  const [newMappingTemplate, setNewMappingTemplate] = useState<string>("");

  const { data: templates = [], isLoading: templatesLoading, isError: templatesError } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/badge-templates?customerId=${customerId}`],
  });

  const { data: overrides = [], isLoading: overridesLoading, isError: overridesError } = useQuery<EventBadgeTemplateOverride[]>({
    queryKey: ["/api/events", eventId, "badge-template-overrides"],
  });

  const { data: resolvedMappings = {}, isLoading: mappingsLoading, isError: mappingsError, refetch: refetchMappings } = useQuery<Record<string, TemplateMappingResult>>({
    queryKey: ["/api/events", eventId, "template-mappings"],
  });

  const { data: eventParticipantTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/events", eventId, "participant-types"],
    enabled: !!eventId,
  });

  const PARTICIPANT_TYPES = useMemo(() => {
    const typesSet = new Set<string>(DEFAULT_PARTICIPANT_TYPES);
    eventParticipantTypes.forEach(t => typesSet.add(t));
    return Array.from(typesSet).sort();
  }, [eventParticipantTypes]);

  const createOverrideMutation = useMutation({
    mutationFn: async (data: { participantType: string; badgeTemplateId: string }) => {
      return apiRequest("POST", `/api/events/${eventId}/badge-template-overrides`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "badge-template-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "template-mappings"] });
      setNewMappingType("");
      setNewMappingTemplate("");
      toast({
        title: "Mapping Created",
        description: "Template mapping has been added for this event.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create mapping",
        variant: "destructive",
      });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}/badge-template-overrides/${overrideId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "badge-template-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "template-mappings"] });
      toast({
        title: "Mapping Removed",
        description: "Template mapping has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete mapping",
        variant: "destructive",
      });
    },
  });

  const handleAddMapping = () => {
    if (!newMappingType || !newMappingTemplate) return;
    createOverrideMutation.mutate({
      participantType: newMappingType,
      badgeTemplateId: newMappingTemplate,
    });
  };

  const getTemplateById = (id: string): BadgeTemplate | undefined => {
    return templates.find((t) => t.id === id);
  };

  const getOverrideForType = (type: string): EventBadgeTemplateOverride | undefined => {
    return overrides.find((o) => o.participantType === type);
  };

  const alreadyConfiguredTypes = overrides.map((o) => o.participantType);
  const availableTypes = PARTICIPANT_TYPES.filter((t) => !alreadyConfiguredTypes.includes(t));

  const unassignedTypes = useMemo(() => {
    return PARTICIPANT_TYPES.filter(type => {
      const resolved = resolvedMappings[type];
      return !resolved?.templateId;
    });
  }, [PARTICIPANT_TYPES, resolvedMappings]);

  const isLoading = templatesLoading || overridesLoading || mappingsLoading;
  const hasError = templatesError || overridesError || mappingsError;

  if (hasError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Badge Template Mappings
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Unable to load template mappings. Please log in and try again.</p>
          <Button variant="outline" onClick={() => refetchMappings()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Badge Template Mappings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-badge-template-mappings">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Badge Template Mappings
            </CardTitle>
            <CardDescription>
              Configure which badge template to use for each attendee type. Event-specific overrides take priority over account defaults.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetchMappings()}
            data-testid="button-refresh-mappings"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {unassignedTypes.length > 0 && templates.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{unassignedTypes.length} attendee type{unassignedTypes.length > 1 ? 's' : ''} without a badge template:</strong>{' '}
              {unassignedTypes.join(', ')}. 
              Attendees with these types won't have a badge to print. Assign a template to each type below.
            </AlertDescription>
          </Alert>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attendee Type</TableHead>
                <TableHead>Assigned Template</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PARTICIPANT_TYPES.map((type) => {
                const override = getOverrideForType(type);
                const resolved = resolvedMappings[type];
                const resolutionPath = resolved?.resolutionPath || 'none';

                return (
                  <TableRow key={type} data-testid={`row-mapping-${type}`}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{type}</Badge>
                    </TableCell>
                    <TableCell>
                      {resolved?.templateName ? (
                        <span className="text-sm">{resolved.templateName}</span>
                      ) : (
                        <span className="text-destructive text-sm font-medium">No template assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {resolutionPath === 'event_override' ? (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Event Override
                        </Badge>
                      ) : resolutionPath === 'customer_default' ? (
                        <Badge variant="secondary" className="text-xs">
                          Account Default
                        </Badge>
                      ) : resolutionPath === 'any_template' ? (
                        <Badge variant="outline" className="text-xs">
                          Fallback
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {override && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteOverrideMutation.mutate(override.id)}
                          disabled={deleteOverrideMutation.isPending}
                          data-testid={`button-delete-override-${type}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {templates.length > 0 && availableTypes.length > 0 && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <h4 className="font-medium mb-3">Add Event Override</h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-1 block">Attendee Type</label>
                <Select value={newMappingType} onValueChange={setNewMappingType}>
                  <SelectTrigger data-testid="select-mapping-type">
                    <SelectValue placeholder="Select type..." />
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
              
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-1 block">Badge Template</label>
                <Select value={newMappingTemplate} onValueChange={setNewMappingTemplate}>
                  <SelectTrigger data-testid="select-mapping-template">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleAddMapping}
                disabled={!newMappingType || !newMappingTemplate || createOverrideMutation.isPending}
                data-testid="button-add-mapping"
              >
                {createOverrideMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add Override
              </Button>
            </div>
          </div>
        )}

        {templates.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p>No badge templates found. Create templates first to set up mappings.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
