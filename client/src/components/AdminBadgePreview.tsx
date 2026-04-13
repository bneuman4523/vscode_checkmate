import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Printer, QrCode, User, FileCheck, Loader2 } from "lucide-react";
import BadgeRenderSurface from "./BadgeRenderSurface";
import FlippableBadge from "./FlippableBadge";
import BadgeTemplateInfo from "./BadgeTemplateInfo";
import { useFonts } from "@/contexts/FontContext";
import { printOrchestrator } from "@/services/print-orchestrator";
import { useToast } from "@/hooks/use-toast";
import type { Attendee, BadgeTemplate } from "@shared/schema";

interface AdminBadgePreviewProps {
  eventId: string;
  customerId: string;
}

interface TemplateMappingResult {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: 'event_override' | 'customer_default' | 'any_template' | 'none';
}

export default function AdminBadgePreview({ eventId, customerId }: AdminBadgePreviewProps) {
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<BadgeTemplate | null>(null);
  const [templateResolutionPath, setTemplateResolutionPath] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const fontContext = useFonts();
  const { toast } = useToast();

  const { data: attendees = [], isLoading: attendeesLoading } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/badge-templates?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: templateMappings = {}, isLoading: mappingsLoading } = useQuery<Record<string, TemplateMappingResult>>({
    queryKey: ["/api/events", eventId, "template-mappings"],
    enabled: !!eventId,
  });

  const handlePreview = (attendee: Attendee) => {
    setSelectedAttendee(attendee);
    const participantType = attendee.participantType || "General";
    
    const mapping = templateMappings[participantType];
    if (mapping && mapping.templateId) {
      const resolvedTemplate = templates.find(t => t.id?.toString() === mapping.templateId);
      if (resolvedTemplate) {
        setSelectedTemplate(resolvedTemplate);
        setTemplateResolutionPath(mapping.resolutionPath);
        setPreviewOpen(true);
        return;
      }
    }
    
    const matchingTemplate = templates.find(t => 
      t.participantTypes?.includes(participantType) ||
      t.participantType === participantType ||
      t.participantType === "General"
    ) || templates[0];
    setSelectedTemplate(matchingTemplate || null);
    setTemplateResolutionPath(matchingTemplate ? 'any_template' : null);
    setPreviewOpen(true);
  };

  const getTemplateConfig = (template: BadgeTemplate | null) => {
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

  const getResolutionBadge = (path: string | null) => {
    switch (path) {
      case 'event_override':
        return <Badge variant="default" className="text-xs"><FileCheck className="h-3 w-3 mr-1" />Event Override</Badge>;
      case 'customer_default':
        return <Badge variant="secondary" className="text-xs">Account Default</Badge>;
      case 'any_template':
        return <Badge variant="outline" className="text-xs">Fallback</Badge>;
      default:
        return null;
    }
  };

  const handlePrintBadge = async () => {
    if (!selectedAttendee || !selectedTemplate) return;
    
    setIsPrinting(true);
    try {
      const config = getTemplateConfig(selectedTemplate);
      const badgeData = {
        firstName: selectedAttendee.firstName,
        lastName: selectedAttendee.lastName,
        company: selectedAttendee.company || undefined,
        title: selectedAttendee.title || undefined,
        participantType: selectedAttendee.participantType,
        customFields: selectedAttendee.customFields as Record<string, string> | undefined,
      };

      await printOrchestrator.printBadge(badgeData, {
        ...config,
        mergeFields: config.mergeFields || [],
      });

      toast({
        title: "Print initiated",
        description: `Badge for ${selectedAttendee.firstName} ${selectedAttendee.lastName} sent to printer.`,
      });
    } catch (error) {
      console.error("[AdminBadgePreview] Print failed:", error);
      toast({
        title: "Print failed",
        description: error instanceof Error ? error.message : "Could not print badge",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  if (attendeesLoading || templatesLoading || mappingsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-admin-badge-preview">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Badge Preview
            </CardTitle>
            <CardDescription>
              Preview and test badges with real attendee data before printing
            </CardDescription>
          </div>
          <Badge variant="secondary" data-testid="badge-template-count">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <QrCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No badge templates available.</p>
            <p className="text-sm mt-2">Create a badge template first to preview badges.</p>
          </div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No attendees registered yet.</p>
            <p className="text-sm mt-2">Add attendees to preview their badges.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">
                {attendees.length} attendee{attendees.length !== 1 ? "s" : ""} available for preview
              </Label>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {attendees.slice(0, 20).map((attendee) => (
                  <div
                    key={attendee.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                    onClick={() => handlePreview(attendee)}
                    data-testid={`badge-preview-attendee-${attendee.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid={`text-attendee-name-${attendee.id}`}>
                          {attendee.firstName} {attendee.lastName}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{attendee.company || "No company"}</span>
                          {attendee.externalId && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-xs">{attendee.externalId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" data-testid={`badge-participant-type-${attendee.id}`}>
                        {attendee.participantType || "General"}
                      </Badge>
                      <Button size="sm" variant="ghost" data-testid={`button-preview-${attendee.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {attendees.length > 20 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing first 20 of {attendees.length} attendees
              </p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Badge Preview
            </DialogTitle>
            <DialogDescription>
              {selectedAttendee && (
                <>Preview badge for {selectedAttendee.firstName} {selectedAttendee.lastName}</>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedAttendee && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Template</Label>
                    {templateResolutionPath && getResolutionBadge(templateResolutionPath)}
                  </div>
                  <Select
                    value={selectedTemplate?.id?.toString() || ""}
                    onValueChange={(val) => {
                      const template = templates.find(t => t.id?.toString() === val);
                      setSelectedTemplate(template || null);
                      setTemplateResolutionPath(null);
                    }}
                  >
                    <SelectTrigger data-testid="select-preview-template">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id?.toString() || ""}>
                          <div className="flex items-center gap-2">
                            <span>{template.name}</span>
                            {template.participantTypes && template.participantTypes.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {template.participantTypes.join(", ")}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Attendee Info</Label>
                  <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">{selectedAttendee.firstName} {selectedAttendee.lastName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant="outline">{selectedAttendee.participantType || "General"}</Badge>
                    </div>
                    {selectedAttendee.externalId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reg Code:</span>
                        <code className="font-mono text-xs">{selectedAttendee.externalId}</code>
                      </div>
                    )}
                    {selectedAttendee.company && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Company:</span>
                        <span>{selectedAttendee.company}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Badge Render</Label>
                  <div className="flex items-center gap-2">
                    {selectedTemplate?.qrCodeConfig && (
                      <Badge variant="secondary" className="text-xs">
                        <QrCode className="h-3 w-3 mr-1" />
                        {(selectedTemplate.qrCodeConfig as any).embedType || "externalId"}
                      </Badge>
                    )}
                    <BadgeTemplateInfo
                      templateName={selectedTemplate?.name}
                      width={selectedTemplate?.width || undefined}
                      height={selectedTemplate?.height || undefined}
                      fontFamily={selectedTemplate?.fontFamily || undefined}
                      includeQR={selectedTemplate?.includeQR ?? true}
                      qrEmbedType={(selectedTemplate?.qrCodeConfig as any)?.embedType}
                      participantTypes={selectedTemplate?.participantTypes as string[] | undefined}
                      layoutMode={(selectedTemplate as any)?.layoutMode || 'single'}
                    />
                  </div>
                </div>
                
                <div className="flex justify-center p-4 bg-muted/50 rounded-lg">
                  {(selectedTemplate as any)?.layoutMode === 'foldable' ? (
                    <FlippableBadge
                      front={
                        <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg" data-testid="badge-render-container">
                          <BadgeRenderSurface
                            firstName={selectedAttendee.firstName}
                            lastName={selectedAttendee.lastName}
                            email={selectedAttendee.email || undefined}
                            company={selectedAttendee.company || undefined}
                            title={selectedAttendee.title || undefined}
                            participantType={selectedAttendee.participantType || "General"}
                            externalId={selectedAttendee.externalId || undefined}
                            orderCode={(selectedAttendee as any).orderCode || undefined}
                            templateConfig={getTemplateConfig(selectedTemplate)}
                            renderSide="front"
                            scale={0.6}
                            onLoadFont={fontContext?.loadFont}
                          />
                        </div>
                      }
                      back={
                        <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg" data-testid="badge-render-back-container">
                          <BadgeRenderSurface
                            firstName={selectedAttendee.firstName}
                            lastName={selectedAttendee.lastName}
                            email={selectedAttendee.email || undefined}
                            company={selectedAttendee.company || undefined}
                            title={selectedAttendee.title || undefined}
                            participantType={selectedAttendee.participantType || "General"}
                            externalId={selectedAttendee.externalId || undefined}
                            orderCode={(selectedAttendee as any).orderCode || undefined}
                            templateConfig={getTemplateConfig(selectedTemplate)}
                            renderSide="back"
                            scale={0.6}
                            onLoadFont={fontContext?.loadFont}
                          />
                        </div>
                      }
                    />
                  ) : (
                    <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg" data-testid="badge-render-container">
                      <BadgeRenderSurface
                        firstName={selectedAttendee.firstName}
                        lastName={selectedAttendee.lastName}
                        email={selectedAttendee.email || undefined}
                        company={selectedAttendee.company || undefined}
                        title={selectedAttendee.title || undefined}
                        participantType={selectedAttendee.participantType || "General"}
                        externalId={selectedAttendee.externalId || undefined}
                        orderCode={(selectedAttendee as any).orderCode || undefined}
                        templateConfig={getTemplateConfig(selectedTemplate)}
                        scale={0.6}
                        onLoadFont={fontContext?.loadFont}
                      />
                    </div>
                  )}
                </div>

                {selectedTemplate?.qrCodeConfig && (
                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="text-xs text-muted-foreground mb-2 block">QR Code Content</Label>
                    <code className="text-xs font-mono block break-all">
                      {(() => {
                        const config = (selectedTemplate.qrCodeConfig as any);
                        const getVal = (f: string) => {
                          switch (f) {
                            case 'externalId': return selectedAttendee.externalId || '';
                            case 'firstName': return selectedAttendee.firstName;
                            case 'lastName': return selectedAttendee.lastName;
                            case 'email': return selectedAttendee.email || '';
                            case 'company': return selectedAttendee.company || '';
                            case 'title': return selectedAttendee.title || '';
                            case 'participantType': return selectedAttendee.participantType || '';
                            default: return '';
                          }
                        };

                        if (config.embedType === 'externalId') {
                          return selectedAttendee.externalId || '(no external ID)';
                        }
                        if (config.embedType === 'json') {
                          return JSON.stringify(
                            Object.fromEntries((config.fields || []).map((f: string) => [f, getVal(f)]))
                          );
                        }
                        if (config.embedType === 'simple') {
                          return config.includeLabel
                            ? (config.fields || []).map((f: string) => `${f}:${getVal(f)}`).join(config.separator)
                            : (config.fields || []).map((f: string) => getVal(f)).join(config.separator);
                        }
                        if (config.embedType === 'custom') {
                          return config.includeLabel
                            ? (config.fields || []).map((f: string) => `${f}=${getVal(f)}`).join(config.separator)
                            : (config.fields || []).map((f: string) => getVal(f)).join(config.separator);
                        }
                        return selectedAttendee.externalId || '(no external ID)';
                      })()}
                    </code>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)} data-testid="button-close-preview">
                  Close
                </Button>
                <Button 
                  onClick={handlePrintBadge} 
                  disabled={isPrinting || !selectedTemplate}
                  data-testid="button-print-badge"
                >
                  {isPrinting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  {isPrinting ? "Printing..." : "Print Badge"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
