import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Palette, 
  Printer, 
  AlertCircle,
  Type,
  Check,
  Plus,
  X,
  Info,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReadOnlyBadgePreview from "./ReadOnlyBadgePreview";
import type { BadgeTemplate, Event, EventBadgeTemplateOverride } from "@shared/schema";
import { WEB_SAFE_FONTS, GOOGLE_FONTS } from "@shared/schema";

interface EventBadgeSetupProps {
  eventId: string;
}

export default function EventBadgeSetup({ eventId }: EventBadgeSetupProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedTemplateForAdd, setSelectedTemplateForAdd] = useState<string>("");
  const [selectedTypesForAdd, setSelectedTypesForAdd] = useState<string[]>([]);

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/badge-templates?customerId=${event?.customerId}`],
    enabled: !!event?.customerId,
  });

  const { data: participantTypes = [], isLoading: typesLoading } = useQuery<string[]>({
    queryKey: ["/api/events", eventId, "participant-types"],
    enabled: !!eventId,
  });

  const { data: overrides = [], isLoading: overridesLoading } = useQuery<EventBadgeTemplateOverride[]>({
    queryKey: ["/api/events", eventId, "badge-template-overrides"],
    enabled: !!eventId,
  });

  const createOverrideMutation = useMutation({
    mutationFn: async (data: { participantType: string; badgeTemplateId: string }) => {
      return apiRequest("POST", `/api/events/${eventId}/badge-template-overrides`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "badge-template-overrides"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}/badge-template-overrides/${overrideId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "badge-template-overrides"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateBadgeSettingsMutation = useMutation({
    mutationFn: async (badgeSettings: { fontOverrides?: Record<string, string> }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}`, { badgeSettings });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      toast({ title: "Font updated", description: "Badge font has been saved for this event." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update font", description: error.message, variant: "destructive" });
    },
  });

  const handleFontChange = (templateId: string, fontFamily: string) => {
    const currentOverrides = { ...(event?.badgeSettings?.fontOverrides || {}) };
    if (fontFamily === "" || fontFamily === undefined) {
      delete currentOverrides[templateId];
    } else {
      currentOverrides[templateId] = fontFamily;
    }
    updateBadgeSettingsMutation.mutate({ fontOverrides: currentOverrides });
  };

  const getFontForTemplate = (templateId: string): string => {
    return event?.badgeSettings?.fontOverrides?.[templateId] || "";
  };

  const allFonts = [...WEB_SAFE_FONTS, ...GOOGLE_FONTS];

  const handleRemoveType = (participantType: string) => {
    const existingOverride = overrides.find(o => o.participantType === participantType);
    if (existingOverride) {
      deleteOverrideMutation.mutate(existingOverride.id);
    }
  };

  const handleAssignType = (templateId: string, participantType: string) => {
    createOverrideMutation.mutate({ 
      participantType, 
      badgeTemplateId: templateId 
    });
  };

  const getTemplateById = (id: string) => templates.find(t => t.id === id);

  const getTypesForTemplate = (templateId: string): string[] => {
    return overrides.filter(o => o.badgeTemplateId === templateId).map(o => o.participantType);
  };

  const unassignedTypes = participantTypes.filter(type => 
    !overrides.some(o => o.participantType === type)
  );

  const assignedTemplateIds = Array.from(new Set(overrides.map(o => o.badgeTemplateId)));

  const handleOpenAddDialog = () => {
    setSelectedTemplateForAdd("");
    setSelectedTypesForAdd([]);
    setShowAddDialog(true);
  };

  const handleCloseAddDialog = () => {
    setShowAddDialog(false);
    setSelectedTemplateForAdd("");
    setSelectedTypesForAdd([]);
  };

  const handleAddAssignment = async () => {
    if (!selectedTemplateForAdd || selectedTypesForAdd.length === 0) return;
    
    const templateExists = templates.some(t => t.id === selectedTemplateForAdd);
    if (!templateExists) {
      toast({ title: "Error", description: "Selected template no longer exists.", variant: "destructive" });
      handleCloseAddDialog();
      return;
    }
    
    for (const type of selectedTypesForAdd) {
      await createOverrideMutation.mutateAsync({ 
        participantType: type, 
        badgeTemplateId: selectedTemplateForAdd 
      });
    }
    
    handleCloseAddDialog();
    toast({ title: "Badge assignments added", description: `${selectedTypesForAdd.length} type(s) assigned to template.` });
  };

  const toggleTypeSelection = (type: string) => {
    setSelectedTypesForAdd(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTypesForAdd.length === unassignedTypes.length) {
      setSelectedTypesForAdd([]);
    } else {
      setSelectedTypesForAdd([...unassignedTypes]);
    }
  };

  const isLoading = eventLoading || templatesLoading || typesLoading || overridesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-badge-setup">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Badge Setup</h1>
          <p className="text-muted-foreground">Configure badge templates and printing for this event</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Badge Assignments
                  </CardTitle>
                  <CardDescription>
                    Assign badge templates to attendee types
                  </CardDescription>
                </div>
                {unassignedTypes.length > 0 && templates.length > 0 && (
                  <Button 
                    size="sm" 
                    onClick={handleOpenAddDialog}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No badge templates available.</p>
                  <p className="text-xs text-muted-foreground mt-1">Create templates in the Badge Templates page.</p>
                </div>
              ) : assignedTemplateIds.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <Palette className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No badge assignments yet</p>
                  {unassignedTypes.length > 0 ? (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleOpenAddDialog}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Add Badge Assignment
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sync attendees to see attendee types</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {assignedTemplateIds.map(templateId => {
                    const template = getTemplateById(templateId);
                    if (!template) return null;
                    const assignedTypes = getTypesForTemplate(templateId);
                    
                    return (
                      <div 
                        key={templateId}
                        className="border rounded-lg p-4 space-y-4"
                      >
                        <div className="flex gap-4">
                          <div className="w-32 flex-shrink-0">
                            <ReadOnlyBadgePreview template={template} maxWidth={128} />
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <h4 className="font-medium">{template.name}</h4>
                              <p className="text-xs text-muted-foreground">
                                {template.width}" × {template.height}"
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground">Attendee Types</Label>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {assignedTypes.map(type => (
                                  <Badge 
                                    key={type} 
                                    variant="secondary"
                                    className="gap-1 text-xs"
                                  >
                                    {type}
                                    <button
                                      onClick={() => handleRemoveType(type)}
                                      className="ml-0.5 hover:text-destructive"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                                {unassignedTypes.length > 0 && (
                                  <Select 
                                    onValueChange={(type) => handleAssignType(templateId, type)}
                                  >
                                    <SelectTrigger className="h-6 w-6 p-0 border-dashed">
                                      <Plus className="h-3 w-3" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {unassignedTypes.map(type => (
                                        <SelectItem key={type} value={type}>
                                          {type}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-2 border-t">
                              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Type className="h-3 w-3" />
                                Font Override
                              </Label>
                              <Select
                                value={getFontForTemplate(template.id) || "__default__"}
                                onValueChange={(font) => handleFontChange(template.id, font === "__default__" ? "" : font)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={`Default: ${template.fontFamily}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__default__">
                                    Default ({template.fontFamily})
                                  </SelectItem>
                                  {allFonts.map(font => (
                                    <SelectItem key={font.family} value={font.family} style={{ fontFamily: font.family }}>
                                      {font.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {participantTypes.length === 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-200">No attendee types found</p>
                      <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                        Sync attendees from your integration to see available attendee types.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Printer Settings
              </CardTitle>
              <CardDescription>Badge printing configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium">Printers are configured per-device</p>
                  <p className="text-blue-700 dark:text-blue-300 mt-1">
                    Printer selection happens when you're ready to print — from the attendee list, staff dashboard, or kiosk. Each device remembers its own printer choice for this event.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Badge Assignments at a Glance</CardTitle>
              <CardDescription>Quick reference showing which badge template each attendee type will use</CardDescription>
            </CardHeader>
            <CardContent>
              {participantTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendee types available</p>
              ) : (
                <div className="space-y-2">
                  {participantTypes.map(type => {
                    const override = overrides.find(o => o.participantType === type);
                    const template = override ? getTemplateById(override.badgeTemplateId) : null;
                    return (
                      <div 
                        key={type}
                        className="flex items-center justify-between p-2 rounded-lg border bg-muted/30"
                      >
                        <span className="font-medium text-sm">{type}</span>
                        {template ? (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-4 h-5 rounded border"
                              style={{ backgroundColor: template.backgroundColor }}
                            />
                            <span className="text-sm text-muted-foreground">{template.name}</span>
                            <Check className="h-4 w-4 text-green-600" />
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-amber-600">Not assigned</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={(open) => !open && handleCloseAddDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Badge Assignment</DialogTitle>
            <DialogDescription>
              Select a badge template and the attendee types it should apply to
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Badge Template</Label>
                <Select value={selectedTemplateForAdd} onValueChange={setSelectedTemplateForAdd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-5 rounded border flex-shrink-0"
                            style={{ backgroundColor: template.backgroundColor }}
                          />
                          {template.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplateForAdd && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Attendee Types</Label>
                    {unassignedTypes.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs"
                        onClick={toggleSelectAll}
                      >
                        {selectedTypesForAdd.length === unassignedTypes.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {unassignedTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">All types are already assigned</p>
                    ) : (
                      unassignedTypes.map(type => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={`type-${type}`}
                            checked={selectedTypesForAdd.includes(type)}
                            onCheckedChange={() => toggleTypeSelection(type)}
                          />
                          <label
                            htmlFor={`type-${type}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {type}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedTypesForAdd.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTypesForAdd.length} type(s) selected
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/30 flex items-center justify-center min-h-[200px]">
                {selectedTemplateForAdd && getTemplateById(selectedTemplateForAdd) ? (
                  <ReadOnlyBadgePreview 
                    template={getTemplateById(selectedTemplateForAdd)!} 
                    maxWidth={200}
                    showDimensions
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Select a template to preview</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAddDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddAssignment}
              disabled={!selectedTemplateForAdd || selectedTypesForAdd.length === 0 || createOverrideMutation.isPending}
            >
              {createOverrideMutation.isPending ? "Adding..." : "Add Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
