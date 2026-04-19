import { useState, useMemo } from "react";
import { playCheckinSound } from "@/lib/sounds";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  MoreVertical,
  UserCheck,
  Printer,
  CheckCircle,
  XCircle,
  Upload,
  Download,
  Edit,
  Trash2,
  Send,
  Mail,
  Cloud,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WorkflowRunner } from "./workflow/WorkflowRunner";
import { printOrchestrator } from "@/services/print-orchestrator";
import { useNetworkPrint } from "@/hooks/use-network-print";
import BadgeRenderSurface from "./BadgeRenderSurface";
import FlippableBadge from "./FlippableBadge";
import { useFontsOptional } from "@/contexts/FontContext";

import { usePrinter } from "@/hooks/usePrinter";
import PrinterSelector from "./PrinterSelector";
import PrinterOfflineAlert from "./PrinterOfflineAlert";
import { getPrinterDisplayName } from "@/lib/printerPreferences";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import type { Attendee, EventWorkflowStep, EventBuyerQuestion, EventDisclaimer, BadgeTemplate } from "@shared/schema";
import { registrationStatuses } from "@shared/schema";

import {
  AttendeeFormDialog,
  AttendeeImportDialog,
  BadgePrintPreviewDialog,
  useAttendeeMutations,
  exportAttendeesToCSV,
} from "./attendees";
import type { AttendeeFormValues } from "./attendees";

const PARTICIPANT_TYPES = [
  "Attendee",
  "Speaker",
  "Sponsor",
  "Staff",
  "VIP",
  "Press",
  "Exhibitor",
  "Volunteer",
];

interface WorkflowConfig {
  id: string;
  enabled: boolean;
  steps: (EventWorkflowStep & {
    questions?: EventBuyerQuestion[];
    disclaimers?: EventDisclaimer[];
  })[];
}

interface TemplateMappingResult {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: 'event_override' | 'customer_default' | 'any_template' | 'none';
}

interface EventAttendeesProps {
  eventId: string;
}

export default function EventAttendees({ eventId }: EventAttendeesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [showWorkflowRunner, setShowWorkflowRunner] = useState(false);
  const [workflowAttendee, setWorkflowAttendee] = useState<Attendee | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrintingBulk, setIsPrintingBulk] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printPreviewAttendee, setPrintPreviewAttendee] = useState<Attendee | null>(null);
  const [printPreviewTemplate, setPrintPreviewTemplate] = useState<BadgeTemplate | null>(null);
  const [printPreviewResolution, setPrintPreviewResolution] = useState<string | null>(null);
  const [isPrintingFromPreview, setIsPrintingFromPreview] = useState(false);
  const { toast } = useToast();
  const networkPrint = useNetworkPrint();
  const fontContext = useFontsOptional();


  const { data: eventData } = useQuery<{
    customerId?: string;
    syncSettings?: { selectedStatuses?: string[]; statusesConfigured?: boolean } | null;
  }>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const printer = usePrinter({ eventId, mode: 'admin' });

  const mutations = useAttendeeMutations(eventId, {
    onAddSuccess: () => {
      setIsAddDialogOpen(false);
    },
    onEditSuccess: () => {
      setIsEditDialogOpen(false);
      setSelectedAttendee(null);
    },
    onDeleteSuccess: () => {
      setIsDeleteDialogOpen(false);
      setSelectedAttendee(null);
    },
  });

  const { data: attendees = [], isLoading } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const eventAttendeeTypes = useMemo(() => {
    const typesFromEvent = new Set<string>();
    attendees.forEach(a => {
      if (a.participantType) typesFromEvent.add(a.participantType);
    });
    PARTICIPANT_TYPES.forEach(t => typesFromEvent.add(t));
    return Array.from(typesFromEvent).sort();
  }, [attendees]);

  // Pre-filter attendees by the event's selected statuses (from sync config)
  const selectedStatuses = eventData?.syncSettings?.selectedStatuses;

  const includedAttendees = useMemo(() => {
    if (!selectedStatuses || selectedStatuses.length === 0) {
      return attendees;
    }
    return attendees.filter(a => {
      const status = a.registrationStatusLabel || a.registrationStatus;
      return selectedStatuses.includes(status);
    });
  }, [attendees, selectedStatuses]);

  // Determine which statuses to show as filter buttons
  const availableStatuses = useMemo(() => {
    if (selectedStatuses && selectedStatuses.length > 0) {
      return selectedStatuses;
    }
    return [...registrationStatuses];
  }, [selectedStatuses]);

  const { data: workflowConfig } = useQuery<WorkflowConfig | null>({
    queryKey: [`/api/events/${eventId}/workflow`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/events/${eventId}/workflow`);
      if (!response.ok) return null;
      const workflow = await response.json();
      if (!workflow || !workflow.enabled) return null;
      return {
        ...workflow,
        steps: workflow.steps?.filter((s: EventWorkflowStep) => s.enabled) || [],
      };
    },
    enabled: !!eventId,
  });

  const { data: templates = [] } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/events/${eventId}/badge-templates`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/events/${eventId}/badge-templates`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!eventId,
  });

  const { data: templateMappings = {} } = useQuery<Record<string, TemplateMappingResult>>({
    queryKey: ["/api/events", eventId, "template-mappings"],
    enabled: !!eventId,
  });

  const hasActiveWorkflow = workflowConfig?.enabled &&
    (workflowConfig?.steps?.filter(s => s.enabled).length ?? 0) > 0;

  const getTemplateForParticipantType = (participantType: string): BadgeTemplate | null => {
    const mapping = templateMappings[participantType];
    if (mapping?.templateId) {
      const template = templates.find(t => t.id === mapping.templateId);
      if (template) return template;
    }
    const generalMapping = templateMappings['General'];
    if (generalMapping?.templateId) {
      const template = templates.find(t => t.id === generalMapping.templateId);
      if (template) return template;
    }
    return templates[0] || null;
  };

  const getPreviewTemplateConfig = (template: BadgeTemplate | null) => {
    if (!template) {
      return {
        width: 4,
        height: 3,
        backgroundColor: "#1e3a5f",
        textColor: "#ffffff",
        accentColor: "#3b82f6",
        fontFamily: "Arial",
        includeQR: true,
        qrPosition: "bottom-right",
        qrCodeConfig: {
          embedType: "externalId" as const,
          fields: ["externalId"],
          separator: "|",
          includeLabel: false,
        },
        mergeFields: [
          { field: "firstName", label: "First Name", fontSize: 24, position: { x: 20, y: 40 }, align: "left" as const },
          { field: "lastName", label: "Last Name", fontSize: 24, position: { x: 20, y: 70 }, align: "left" as const },
        ],
      };
    }
    return {
      width: template.width || 4,
      height: template.height || 3,
      backgroundColor: template.backgroundColor || "#1e3a5f",
      textColor: template.textColor || "#ffffff",
      accentColor: template.accentColor || "#3b82f6",
      fontFamily: template.fontFamily || "Arial",
      includeQR: template.includeQR ?? true,
      qrPosition: template.qrPosition || "bottom-right",
      customQrPosition: (template as any).customQrPosition || undefined,
      qrCodeConfig: (template.qrCodeConfig as any) || {
        embedType: "externalId" as const,
        fields: ["externalId"],
        separator: "|",
        includeLabel: false,
      },
      mergeFields: (template.mergeFields as any[]) || [],
      imageElements: (template as any).imageElements || [],
      layoutMode: (template as any).layoutMode || 'single',
      backSideMode: (template as any).backSideMode || 'blank',
      backSideMergeFields: (template as any).backSideMergeFields || [],
      backSideImageElements: (template as any).backSideImageElements || [],
      backSideIncludeQR: (template as any).backSideIncludeQR ?? false,
      backSideQrPosition: (template as any).backSideQrPosition || 'bottom-right',
      backSideCustomQrPosition: (template as any).backSideCustomQrPosition || undefined,
      backSideQrCodeConfig: (template as any).backSideQrCodeConfig || undefined,
      backSideBackgroundColor: (template as any).backSideBackgroundColor || undefined,
    };
  };

  const handleCheckIn = (attendee: Attendee) => {
    if (hasActiveWorkflow) {
      setWorkflowAttendee(attendee);
      setShowWorkflowRunner(true);
    } else {
      mutations.checkInMutation.mutate(attendee.id);
    }
  };

  const handleWorkflowComplete = async () => {
    if (workflowAttendee) {
      try {
        if (!workflowAttendee.checkedIn) {
          await apiRequest("POST", `/api/attendees/${workflowAttendee.id}/checkin`, {
            checkedInBy: 'Admin Workflow'
          });
        }
      } catch (error) {
        console.warn("[EventAttendees] Failed to update check-in status after workflow:", error);
      }
    }
    setShowWorkflowRunner(false);
    setWorkflowAttendee(null);
    queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
    toast({ title: "Check-in workflow completed" });
    playCheckinSound();
  };

  const handleWorkflowCancel = () => {
    setShowWorkflowRunner(false);
    setWorkflowAttendee(null);
  };

  const handleOpenPrintPreview = (attendee: Attendee) => {
    const template = getTemplateForParticipantType(attendee.participantType);
    if (!template) {
      toast({
        title: "No badge template found",
        description: "Please assign a badge template to this event first.",
        variant: "destructive"
      });
      return;
    }

    const mapping = templateMappings[attendee.participantType];
    let resolutionPath: string;
    if (mapping?.templateId) {
      resolutionPath = mapping.resolutionPath;
    } else {
      const generalMapping = templateMappings['General'];
      if (generalMapping?.templateId) {
        resolutionPath = generalMapping.resolutionPath;
      } else {
        resolutionPath = 'any_template';
      }
    }

    setPrintPreviewAttendee(attendee);
    setPrintPreviewTemplate(template);
    setPrintPreviewResolution(resolutionPath);
    setShowPrintPreview(true);
  };

  const routePrintJob = async (
    attendee: Attendee,
    template: BadgeTemplate,
    selectedPrinter: SelectedPrinter,
  ) => {
    const badgeData = {
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      company: attendee.company || undefined,
      title: attendee.title || undefined,
      participantType: attendee.participantType,
      externalId: attendee.externalId || undefined,
      customFields: attendee.customFields as Record<string, string> | undefined,
    };

    const config = getPreviewTemplateConfig(template);
    const labelRotation = (template.labelRotation || 0) as 0 | 90 | 180 | 270;
    const title = `Badge: ${attendee.firstName} ${attendee.lastName}`;

    switch (selectedPrinter.type) {
      case 'printnode': {
        const pName = selectedPrinter.printerName.toLowerCase();
        const isZebra = pName.includes('zebra') || pName.includes('zd') || pName.includes('zt') || pName.includes('zp');

        if (isZebra) {
          const zplData = networkPrint.generateBadgeZpl(
            { firstName: attendee.firstName, lastName: attendee.lastName, company: attendee.company || undefined, title: attendee.title || undefined, externalId: attendee.externalId || undefined },
            { width: config.width, height: config.height, includeQR: config.includeQR, qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}` },
          );
          const response = await apiRequest("POST", "/api/printnode/print", { printerId: selectedPrinter.printNodeId, zplData, title });
          if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'PrintNode print failed'); }
        } else {
          const pdfBlob = await printOrchestrator.generatePDFBlob(badgeData, config, labelRotation);
          const pdfArrayBuffer = await pdfBlob.arrayBuffer();
          const pdfBase64 = btoa(new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          const response = await apiRequest("POST", "/api/printnode/print", { printerId: selectedPrinter.printNodeId, pdfBase64, title });
          if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'PrintNode print failed'); }
        }
        break;
      }
      case 'custom':
      case 'local': {
        let ip: string | undefined;
        let port: number;
        let dpi: number;
        if (selectedPrinter.type === 'custom') {
          ip = selectedPrinter.customIp;
          port = selectedPrinter.customPort;
          dpi = selectedPrinter.customDpi;
        } else {
          ip = selectedPrinter.ipAddress;
          port = selectedPrinter.port || 9100;
          dpi = selectedPrinter.dpi || 203;
        }
        if (ip) {
          networkPrint.setIp(ip);
          networkPrint.setPort(port);
          networkPrint.setDpi(dpi);
        }
        const zebraBadge = {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company || undefined,
          title: attendee.title || undefined,
          externalId: attendee.externalId || undefined,
        };
        const zebraTemplate = {
          width: config.width,
          height: config.height,
          includeQR: config.includeQR,
          qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}`,
        };
        const zplData = networkPrint.generateBadgeZpl(zebraBadge, zebraTemplate);
        const result = await networkPrint.printZpl(zplData);
        if (!result.success) throw new Error(result.error || 'Network print failed');
        break;
      }
      case 'browser':
      default:
        await printOrchestrator.printBadge(badgeData, config, labelRotation);
        break;
    }
  };

  const handlePrintFromPreview = async () => {
    if (!printPreviewAttendee || !printPreviewTemplate) return;

    if (!printer.savedPrinter) {
      printer.openSelector();
      return;
    }

    const attendee = printPreviewAttendee;
    const template = printPreviewTemplate;

    setIsPrintingFromPreview(true);

    try {
      await routePrintJob(attendee, template, printer.savedPrinter);

      try {
        let wasCheckedIn = false;
        if (attendee.registrationStatus !== 'Attended') {
          await apiRequest("POST", `/api/attendees/${attendee.id}/checkin`, {
            checkedInBy: 'Admin Print'
          });
          wasCheckedIn = true;
        }
        await apiRequest("PATCH", `/api/attendees/${attendee.id}`, {
          badgePrinted: true,
          badgePrintedAt: new Date().toISOString()
        });
        queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
        toast({
          title: "Print initiated",
          description: `Badge for ${attendee.firstName} ${attendee.lastName} sent to printer.${wasCheckedIn ? ' Attendee marked as checked in.' : ''}`,
        });
      } catch (updateError) {
        console.warn("[EventAttendees] Failed to update badge printed/check-in status:", updateError);
        toast({
          title: "Print initiated",
          description: `Badge sent to printer, but status update failed.`,
        });
      }

      setShowPrintPreview(false);
      setPrintPreviewAttendee(null);
    } catch (error) {
      console.error("[EventAttendees] Print failed:", error);
      toast({
        title: "Print failed",
        description: error instanceof Error ? error.message : "Could not print badge",
        variant: "destructive",
      });
    } finally {
      setIsPrintingFromPreview(false);
    }
  };

  const handleDirectPrint = async (attendee: Attendee) => {
    if (!printer.savedPrinter) {
      printer.openSelector();
      throw new Error("No printer selected");
    }

    const template = getTemplateForParticipantType(attendee.participantType);
    if (!template) throw new Error("No badge template found");

    await routePrintJob(attendee, template, printer.savedPrinter);

    try {
      let wasCheckedIn = false;
      if (attendee.registrationStatus !== 'Attended') {
        await apiRequest("POST", `/api/attendees/${attendee.id}/checkin`, { checkedInBy: 'Admin Print' });
        wasCheckedIn = true;
      }
      await apiRequest("PATCH", `/api/attendees/${attendee.id}`, { badgePrinted: true, badgePrintedAt: new Date().toISOString() });
    } catch (updateError) {
      console.warn("[EventAttendees] Failed to update badge printed/check-in status:", updateError);
    }
  };

  const handleBulkPrint = async () => {
    if (selectedIds.size === 0) return;
    if (!printer.savedPrinter) {
      printer.openSelector();
      return;
    }
    setIsPrintingBulk(true);
    const selectedAttendees = attendees.filter(a => selectedIds.has(a.id));
    let successCount = 0;
    let failCount = 0;

    for (const attendee of selectedAttendees) {
      try {
        await handleDirectPrint(attendee);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`Failed to print badge for ${attendee.firstName} ${attendee.lastName}:`, error);
      }
    }

    setIsPrintingBulk(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
    toast({
      title: "Bulk print complete",
      description: `Printed ${successCount} badge${successCount !== 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAttendees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAttendees.map(a => a.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleExport = () => {
    exportAttendeesToCSV(attendees as any, eventId);
    toast({ title: "Attendees exported successfully" });
  };

  const handleAddSubmit = (data: AttendeeFormValues) => {
    mutations.createAttendeeMutation.mutate(data);
  };

  const handleEditSubmit = (data: AttendeeFormValues) => {
    if (selectedAttendee) {
      mutations.updateAttendeeMutation.mutate({ ...data, id: selectedAttendee.id });
    }
  };

  const handleEditClick = (attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setIsDeleteDialogOpen(true);
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const filteredAttendees = includedAttendees
    .filter((attendee) => {
      if (statusFilter.length > 0) {
        const attendeeStatus = attendee.registrationStatusLabel || attendee.registrationStatus;
        if (!statusFilter.includes(attendeeStatus)) {
          return false;
        }
      }
      const searchLower = searchQuery.toLowerCase();
      return (
        attendee.firstName.toLowerCase().includes(searchLower) ||
        attendee.lastName.toLowerCase().includes(searchLower) ||
        attendee.email.toLowerCase().includes(searchLower) ||
        attendee.company?.toLowerCase().includes(searchLower) ||
        attendee.participantType.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-event-attendees">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search attendees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-attendees"
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={handleBulkPrint}
              disabled={isPrintingBulk}
              data-testid="button-bulk-print"
            >
              <Printer className="h-4 w-4 mr-2" />
              {isPrintingBulk ? `Printing...` : `Print Badges (${selectedIds.size})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="button-import-attendees"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={attendees.length === 0}
            data-testid="button-export-attendees"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={printer.openSelector}
            data-testid="button-printer-settings"
          >
            {printer.savedPrinter?.type === 'printnode' ? (
              <Cloud className="h-4 w-4 mr-2" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            {printer.savedPrinter ? printer.displayName : 'Select Printer'}
          </Button>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-attendee">
            <Plus className="h-4 w-4 mr-2" />
            Add Attendee
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Status:</span>
        {availableStatuses.map((status) => {
          const count = includedAttendees.filter(a => (a.registrationStatusLabel || a.registrationStatus) === status).length;
          const isActive = statusFilter.includes(status);
          return (
            <Button
              key={status}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => toggleStatusFilter(status)}
              className="h-7 text-xs"
              data-testid={`filter-status-${status.toLowerCase()}`}
            >
              {status} ({count})
            </Button>
          );
        })}
        {statusFilter.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter([])}
            className="h-7 text-xs text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Attendees ({filteredAttendees.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAttendees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No attendees match your search" : "No attendees registered yet"}
              </p>
              {!searchQuery && (
                <Button variant="outline" className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first attendee
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={filteredAttendees.length > 0 && selectedIds.size === filteredAttendees.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Attendee Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead className="hidden md:table-cell">Check-in Time</TableHead>
                  <TableHead className="hidden lg:table-cell">Reg Code</TableHead>
                  <TableHead className="hidden lg:table-cell">Order Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttendees.map((attendee) => (
                  <TableRow key={attendee.id} data-testid={`row-attendee-${attendee.id}`}>
                    <TableCell className="p-1">
                      <Checkbox
                        checked={selectedIds.has(attendee.id)}
                        onCheckedChange={() => toggleSelectOne(attendee.id)}
                        aria-label={`Select ${attendee.firstName} ${attendee.lastName}`}
                        data-testid={`checkbox-select-${attendee.id}`}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-attendee-actions-${attendee.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {!attendee.checkedIn ? (
                            <DropdownMenuItem
                              onClick={() => handleCheckIn(attendee)}
                              disabled={mutations.checkInMutation.isPending || showWorkflowRunner}
                              data-testid={`menu-checkin-${attendee.id}`}
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              {hasActiveWorkflow ? "Check In (Workflow)" : "Check In"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => mutations.revertCheckInMutation.mutate(attendee.id)}
                              disabled={mutations.revertCheckInMutation.isPending}
                              data-testid={`menu-revert-checkin-${attendee.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Revert Check-In
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleOpenPrintPreview(attendee)}
                            data-testid={`menu-print-badge-${attendee.id}`}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Preview & Print Badge
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleEditClick(attendee)}
                            data-testid={`menu-edit-${attendee.id}`}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(attendee)}
                            className="text-destructive"
                            data-testid={`menu-delete-${attendee.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="font-medium">
                      {attendee.lastName}, {attendee.firstName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{attendee.participantType}</Badge>
                    </TableCell>
                    <TableCell data-testid={`text-registration-status-${attendee.id}`}>
                      <div className="flex flex-wrap items-center gap-1">
                        {attendee.checkedIn || attendee.registrationStatus === 'Attended' ? (
                          <Badge variant="default" className="gap-1 text-xs">
                            <CheckCircle className="h-3 w-3" />
                            <span className="hidden sm:inline">Attended</span>
                          </Badge>
                        ) : attendee.registrationStatus === 'Registered' ? (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Send className="h-3 w-3" />
                            <span className="hidden sm:inline">{attendee.registrationStatusLabel || 'Registered'}</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Mail className="h-3 w-3" />
                            <span className="hidden sm:inline">{attendee.registrationStatusLabel || 'Invited'}</span>
                          </Badge>
                        )}
                        {attendee.badgePrinted && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Printer className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{attendee.company || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {attendee.checkedInAt
                        ? new Date(attendee.checkedInAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground" data-testid={`text-external-id-${attendee.id}`}>
                      {attendee.externalId || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground" data-testid={`text-order-code-${attendee.id}`}>
                      {attendee.orderCode || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AttendeeFormDialog
        mode="add"
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        attendee={null}
        attendeeTypes={eventAttendeeTypes}
        isPending={mutations.createAttendeeMutation.isPending}
        onSubmit={handleAddSubmit}
      />

      <AttendeeFormDialog
        mode="edit"
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        attendee={selectedAttendee}
        attendeeTypes={eventAttendeeTypes}
        isPending={mutations.updateAttendeeMutation.isPending}
        onSubmit={handleEditSubmit}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-attendee">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attendee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedAttendee?.firstName} {selectedAttendee?.lastName}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAttendee && mutations.deleteAttendeeMutation.mutate(selectedAttendee.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {mutations.deleteAttendeeMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AttendeeImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImport={(data) => mutations.bulkImportMutation.mutate(data)}
        isPending={mutations.bulkImportMutation.isPending}
      />

      <Dialog open={showWorkflowRunner} onOpenChange={(open) => {
        if (!open) handleWorkflowCancel();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Check-In Workflow</DialogTitle>
            <DialogDescription>
              {workflowAttendee && (
                <>Completing check-in for {workflowAttendee.firstName} {workflowAttendee.lastName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {workflowAttendee && workflowConfig && eventId && (
            <WorkflowRunner
              eventId={eventId}
              attendeeId={workflowAttendee.id}
              attendeeData={{
                firstName: workflowAttendee.firstName,
                lastName: workflowAttendee.lastName,
                email: workflowAttendee.email,
                company: workflowAttendee.company || undefined,
                title: workflowAttendee.title || undefined,
                participantType: workflowAttendee.participantType,
              }}
              workflow={workflowConfig}
              onComplete={handleWorkflowComplete}
              onCancel={handleWorkflowCancel}
              mode="admin"
              badgeTemplate={(() => {
                const template = getTemplateForParticipantType(workflowAttendee.participantType);
                if (!template) return undefined;
                return {
                  width: template.width || 4,
                  height: template.height || 3,
                  backgroundColor: template.backgroundColor || "#1e3a5f",
                  textColor: template.textColor || "#ffffff",
                  accentColor: template.accentColor || "#3b82f6",
                  fontFamily: template.fontFamily || "Arial",
                  includeQR: template.includeQR ?? true,
                  qrPosition: template.qrPosition || "bottom-right",
                  qrCodeConfig: template.qrCodeConfig as any,
                  mergeFields: (template.mergeFields as any[]) || [],
                };
              })()}
            />
          )}
        </DialogContent>
      </Dialog>

      <BadgePrintPreviewDialog
        open={showPrintPreview}
        onClose={() => {
          setShowPrintPreview(false);
          setPrintPreviewAttendee(null);
        }}
        attendee={printPreviewAttendee}
        template={printPreviewTemplate}
        templates={templates}
        resolutionPath={printPreviewResolution}
        onTemplateChange={(t) => {
          setPrintPreviewTemplate(t);
          setPrintPreviewResolution(null);
        }}
        onPrint={handlePrintFromPreview}
        isPrinting={isPrintingFromPreview}
        currentPrinter={printer.savedPrinter}
        onOpenPrinterSettings={printer.openSelector}
        getPreviewTemplateConfig={getPreviewTemplateConfig}
      />

      <PrinterSelector
        open={printer.showSelector}
        onOpenChange={printer.setShowSelector}
        onSelect={printer.handleSelect}
        customerId={eventData?.customerId}
        currentPrinter={printer.savedPrinter}
        mode="admin"
      />

      {printer.isOffline && !printer.offlineDismissed && printer.savedPrinter?.type === 'printnode' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
          <PrinterOfflineAlert
            printerName={printer.displayName}
            onRetry={printer.retryConnection}
            onChangePrinter={printer.openSelector}
            onDismiss={printer.dismissOfflineAlert}
          />
        </div>
      )}
    </div>
  );
}
