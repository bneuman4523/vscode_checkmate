import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  MoreVertical,
  FileText,
  Star,
  Trash2,
  Pencil,
  Copy,
  Loader2,
  Settings2,
  Printer as PrinterIcon,
  Users,
  ClipboardList,
} from "lucide-react";
import type { EventConfigurationTemplate, BadgeTemplate, Printer, Event, WorkflowSnapshot, RegistrationStatus } from "@shared/schema";
import { registrationStatuses } from "@shared/schema";
import { TemplateWorkflowEditor, emptyWorkflowSnapshot } from "@/components/workflow/TemplateWorkflowEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConfigurationTemplates() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<EventConfigurationTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<EventConfigurationTemplate | null>(null);
  const [createFromEventOpen, setCreateFromEventOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery<EventConfigurationTemplate[]>({
    queryKey: [`/api/configuration-templates?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: badgeTemplates = [] } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/badge-templates?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: printers = [] } = useQuery<Printer[]>({
    queryKey: [`/api/printers?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: [`/api/events?customerId=${customerId}`],
    enabled: !!customerId,
    select: (events) => events.filter(e => e.configStatus === "configured"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/configuration-templates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Template Deleted", description: "Configuration template has been removed." });
      queryClient.invalidateQueries({ queryKey: [`/api/configuration-templates?customerId=${customerId}`] });
      setDeleteTemplate(null);
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/configuration-templates/${id}`, { isDefault: true });
    },
    onSuccess: () => {
      toast({ title: "Default Updated", description: "This template will be used for new events." });
      queryClient.invalidateQueries({ queryKey: [`/api/configuration-templates?customerId=${customerId}`] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Configuration Templates</h1>
          <p className="text-muted-foreground">
            Create reusable configurations to quickly set up new events
          </p>
        </div>
        <div className="flex gap-2">
          {events.length > 0 && (
            <Button variant="outline" onClick={() => setCreateFromEventOpen(true)}>
              <Copy className="h-4 w-4 mr-2" />
              Create from Event
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Settings2 className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="font-medium">No configuration templates yet</h3>
              <p className="text-sm text-muted-foreground">
                Create a template to quickly configure new events with predefined settings
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              badgeTemplates={badgeTemplates}
              printers={printers}
              onEdit={() => setEditTemplate(template)}
              onDelete={() => setDeleteTemplate(template)}
              onSetDefault={() => setDefaultMutation.mutate(template.id)}
            />
          ))}
        </div>
      )}

      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        customerId={customerId}
        badgeTemplates={badgeTemplates}
        printers={printers}
      />

      {editTemplate && (
        <EditTemplateDialog
          open={!!editTemplate}
          onOpenChange={(open) => !open && setEditTemplate(null)}
          template={editTemplate}
          customerId={customerId}
          badgeTemplates={badgeTemplates}
          printers={printers}
        />
      )}

      <CreateFromEventDialog
        open={createFromEventOpen}
        onOpenChange={setCreateFromEventOpen}
        customerId={customerId}
        events={events}
      />

      <AlertDialog open={!!deleteTemplate} onOpenChange={(open) => !open && setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplate && deleteMutation.mutate(deleteTemplate.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({
  template,
  badgeTemplates,
  printers,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  template: EventConfigurationTemplate;
  badgeTemplates: BadgeTemplate[];
  printers: Printer[];
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const badgeTemplate = badgeTemplates.find(b => b.id === template.defaultBadgeTemplateId);
  const printer = printers.find(p => p.id === template.defaultPrinterId);

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{template.name}</span>
            </CardTitle>
            {template.description && (
              <CardDescription className="line-clamp-2">
                {template.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {!template.isDefault && (
                <DropdownMenuItem onClick={onSetDefault}>
                  <Star className="h-4 w-4 mr-2" />
                  Set as Default
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {template.isDefault && (
          <Badge variant="secondary" className="w-fit mt-2">
            <Star className="h-3 w-3 mr-1" />
            Default
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {badgeTemplate && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">Badge: {badgeTemplate.name}</span>
          </div>
        )}
        {printer && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <PrinterIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Printer: {printer.name}</span>
          </div>
        )}
        {template.staffSettings?.enabled && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span>Staff Check-in Enabled</span>
          </div>
        )}
        {template.staffSettings?.defaultRegistrationStatusFilter && template.staffSettings.defaultRegistrationStatusFilter.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span>Status Filter: {template.staffSettings.defaultRegistrationStatusFilter.join(', ')}</span>
          </div>
        )}
        {template.workflowSnapshot?.enabled && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span>Workflow Enabled</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateTemplateDialog({
  open,
  onOpenChange,
  customerId,
  badgeTemplates,
  printers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  badgeTemplates: BadgeTemplate[];
  printers: Printer[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [badgeTemplateId, setBadgeTemplateId] = useState<string>("");
  const [printerId, setPrinterId] = useState<string>("");
  const [isDefault, setIsDefault] = useState(false);
  const [staffEnabled, setStaffEnabled] = useState(true);
  const [defaultStatusFilter, setDefaultStatusFilter] = useState<RegistrationStatus[]>([]);
  const [workflowSnapshot, setWorkflowSnapshot] = useState<WorkflowSnapshot>(emptyWorkflowSnapshot);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        customerId,
        name,
        description: description || null,
        defaultBadgeTemplateId: badgeTemplateId || null,
        defaultPrinterId: printerId || null,
        isDefault,
        staffSettings: {
          enabled: staffEnabled,
          startPreset: "event_day",
          endPreset: "event_end",
          defaultRegistrationStatusFilter: defaultStatusFilter.length > 0 ? defaultStatusFilter : undefined,
        },
        workflowSnapshot: workflowSnapshot.enabled ? workflowSnapshot : null,
      };
      const response = await apiRequest("POST", "/api/configuration-templates", body);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Template Created", description: "Configuration template has been saved." });
      queryClient.invalidateQueries({ queryKey: [`/api/configuration-templates?customerId=${customerId}`] });
      onOpenChange(false);
      setName("");
      setDescription("");
      setBadgeTemplateId("");
      setPrinterId("");
      setIsDefault(false);
      setStaffEnabled(true);
      setWorkflowSnapshot(emptyWorkflowSnapshot);
    },
    onError: (error: Error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Configuration Template</DialogTitle>
          <DialogDescription>
            Set up a reusable configuration for new events
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="workflow">Check-in Workflow</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="flex-1 min-h-0">
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Standard Conference Setup"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description of this template..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Default Badge Template</Label>
                  <Select value={badgeTemplateId} onValueChange={setBadgeTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a badge template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {badgeTemplates.map((bt) => (
                        <SelectItem key={bt.id} value={bt.id}>
                          {bt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Default Printer</Label>
                  <Select value={printerId} onValueChange={setPrinterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a printer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Enable Staff Check-in</Label>
                    <p className="text-xs text-muted-foreground">Allow staff to check in attendees</p>
                  </div>
                  <Switch checked={staffEnabled} onCheckedChange={setStaffEnabled} />
                </div>

                <div className="space-y-2 py-2">
                  <div>
                    <Label>Default Registration Status Filter</Label>
                    <p className="text-xs text-muted-foreground">Pre-filter check-in lists to these statuses by default</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {registrationStatuses.map((status) => {
                      const isActive = defaultStatusFilter.includes(status);
                      return (
                        <Button
                          key={status}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDefaultStatusFilter(prev =>
                            prev.includes(status)
                              ? prev.filter(s => s !== status)
                              : [...prev, status]
                          )}
                          className="h-7 text-xs"
                        >
                          {status}
                        </Button>
                      );
                    })}
                    {defaultStatusFilter.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultStatusFilter([])}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {defaultStatusFilter.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No filter - all statuses shown</p>
                  )}
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Set as Default</Label>
                    <p className="text-xs text-muted-foreground">Auto-apply to new synced events</p>
                  </div>
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="workflow" className="flex-1 min-h-0">
            <ScrollArea className="h-[350px] pr-4">
              <div className="py-4">
                <TemplateWorkflowEditor 
                  value={workflowSnapshot} 
                  onChange={setWorkflowSnapshot} 
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({
  open,
  onOpenChange,
  template,
  customerId,
  badgeTemplates,
  printers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EventConfigurationTemplate;
  customerId: string;
  badgeTemplates: BadgeTemplate[];
  printers: Printer[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [badgeTemplateId, setBadgeTemplateId] = useState(template.defaultBadgeTemplateId || "");
  const [printerId, setPrinterId] = useState(template.defaultPrinterId || "");
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [staffEnabled, setStaffEnabled] = useState(template.staffSettings?.enabled ?? true);
  const [defaultStatusFilter, setDefaultStatusFilter] = useState<RegistrationStatus[]>(
    template.staffSettings?.defaultRegistrationStatusFilter || []
  );
  const [workflowSnapshot, setWorkflowSnapshot] = useState<WorkflowSnapshot>(
    template.workflowSnapshot || emptyWorkflowSnapshot
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        defaultBadgeTemplateId: badgeTemplateId || null,
        defaultPrinterId: printerId || null,
        isDefault,
        staffSettings: {
          ...(template.staffSettings || {}),
          enabled: staffEnabled,
          defaultRegistrationStatusFilter: defaultStatusFilter.length > 0 ? defaultStatusFilter : undefined,
        },
        workflowSnapshot: workflowSnapshot.enabled ? workflowSnapshot : null,
      };
      const response = await apiRequest("PATCH", `/api/configuration-templates/${template.id}`, body);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Template Updated", description: "Configuration template has been saved." });
      queryClient.invalidateQueries({ queryKey: [`/api/configuration-templates?customerId=${customerId}`] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Configuration Template</DialogTitle>
          <DialogDescription>
            Update the settings for this template
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="workflow">Check-in Workflow</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="flex-1 min-h-0">
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Template Name *</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Default Badge Template</Label>
                  <Select value={badgeTemplateId} onValueChange={setBadgeTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a badge template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {badgeTemplates.map((bt) => (
                        <SelectItem key={bt.id} value={bt.id}>
                          {bt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Default Printer</Label>
                  <Select value={printerId} onValueChange={setPrinterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a printer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Enable Staff Check-in</Label>
                    <p className="text-xs text-muted-foreground">Allow staff to check in attendees</p>
                  </div>
                  <Switch checked={staffEnabled} onCheckedChange={setStaffEnabled} />
                </div>

                <div className="space-y-2 py-2">
                  <div>
                    <Label>Default Registration Status Filter</Label>
                    <p className="text-xs text-muted-foreground">Pre-filter check-in lists to these statuses by default</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {registrationStatuses.map((status) => {
                      const isActive = defaultStatusFilter.includes(status);
                      return (
                        <Button
                          key={status}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDefaultStatusFilter(prev =>
                            prev.includes(status)
                              ? prev.filter(s => s !== status)
                              : [...prev, status]
                          )}
                          className="h-7 text-xs"
                        >
                          {status}
                        </Button>
                      );
                    })}
                    {defaultStatusFilter.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultStatusFilter([])}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {defaultStatusFilter.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No filter - all statuses shown</p>
                  )}
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label>Set as Default</Label>
                    <p className="text-xs text-muted-foreground">Auto-apply to new synced events</p>
                  </div>
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="workflow" className="flex-1 min-h-0">
            <ScrollArea className="h-[350px] pr-4">
              <div className="py-4">
                <TemplateWorkflowEditor 
                  value={workflowSnapshot} 
                  onChange={setWorkflowSnapshot} 
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={!name || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFromEventDialog({
  open,
  onOpenChange,
  customerId,
  events,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  events: Event[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/configuration-templates/from-event/${selectedEventId}`, {
        name,
        description: description || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Template Created", description: "Configuration template has been created from the event." });
      queryClient.invalidateQueries({ queryKey: [`/api/configuration-templates?customerId=${customerId}`] });
      onOpenChange(false);
      setSelectedEventId("");
      setName("");
      setDescription("");
    },
    onError: (error: Error) => {
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Template from Event</DialogTitle>
          <DialogDescription>
            Copy all settings from an existing configured event
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Source Event</Label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an event..." />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-event-name">Template Name *</Label>
            <Input
              id="from-event-name"
              placeholder="e.g., Copy of Annual Conference 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-event-description">Description</Label>
            <Textarea
              id="from-event-description"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!selectedEventId || !name || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
