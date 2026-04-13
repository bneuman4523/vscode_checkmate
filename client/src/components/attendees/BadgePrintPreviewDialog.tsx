import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Printer, Cloud, Monitor, Settings2, Clock } from "lucide-react";
import BadgeRenderSurface from "../BadgeRenderSurface";
import FlippableBadge from "../FlippableBadge";
import BadgeTemplateInfo from "../BadgeTemplateInfo";
import { useFontsOptional } from "@/contexts/FontContext";
import type { Attendee, BadgeTemplate } from "@shared/schema";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import { getPrinterDisplayName } from "@/lib/printerPreferences";

interface BadgePrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  attendee: Attendee | null;
  template: BadgeTemplate | null;
  templates: BadgeTemplate[];
  resolutionPath: string | null;
  onTemplateChange: (template: BadgeTemplate | null) => void;
  onPrint: () => void;
  isPrinting: boolean;
  currentPrinter: SelectedPrinter | null;
  onOpenPrinterSettings: () => void;
  getPreviewTemplateConfig: (template: BadgeTemplate | null) => Record<string, unknown>;
}

export function BadgePrintPreviewDialog({
  open,
  onClose,
  attendee,
  template,
  templates,
  resolutionPath,
  onTemplateChange,
  onPrint,
  isPrinting,
  currentPrinter,
  onOpenPrinterSettings,
  getPreviewTemplateConfig,
}: BadgePrintPreviewDialogProps) {
  const fontContext = useFontsOptional();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onClose();
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Badge Print Preview
          </DialogTitle>
          <DialogDescription>
            {attendee && (
              <>Preview badge for {attendee.firstName} {attendee.lastName}</>
            )}
          </DialogDescription>
        </DialogHeader>

        {attendee && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Template</Label>
                  {resolutionPath && (
                    resolutionPath === 'event_override' ? (
                      <Badge variant="default" className="text-xs">Event Override</Badge>
                    ) : resolutionPath === 'customer_default' ? (
                      <Badge variant="secondary" className="text-xs">Account Default</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Fallback</Badge>
                    )
                  )}
                </div>
                <Select
                  value={template?.id?.toString() || ""}
                  onValueChange={(val) => {
                    const t = templates.find(t => t.id?.toString() === val);
                    onTemplateChange(t || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id?.toString() || ""}>
                        <div className="flex items-center gap-2">
                          <span>{t.name}</span>
                          {t.participantTypes && (t.participantTypes as string[]).length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {(t.participantTypes as string[]).join(", ")}
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
                    <span className="font-medium">{attendee.firstName} {attendee.lastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="outline">{attendee.participantType || "General"}</Badge>
                  </div>
                  {attendee.externalId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reg Code:</span>
                      <code className="font-mono text-xs">{attendee.externalId}</code>
                    </div>
                  )}
                  {attendee.company && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Company:</span>
                      <span>{attendee.company}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Badge Render</Label>
                <BadgeTemplateInfo
                  templateName={template?.name}
                  width={template?.width || undefined}
                  height={template?.height || undefined}
                  fontFamily={template?.fontFamily || undefined}
                  includeQR={template?.includeQR ?? true}
                  qrEmbedType={(template?.qrCodeConfig as any)?.embedType}
                  participantTypes={template?.participantTypes as string[] | undefined}
                  layoutMode={(template as any)?.layoutMode || 'single'}
                />
              </div>

              <div className="flex justify-center p-4 bg-muted/50 rounded-lg">
                {(template as any)?.layoutMode === 'foldable' ? (
                  <FlippableBadge
                    front={
                      <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg">
                        <BadgeRenderSurface
                          firstName={attendee.firstName}
                          lastName={attendee.lastName}
                          email={attendee.email || undefined}
                          company={attendee.company || undefined}
                          title={attendee.title || undefined}
                          participantType={attendee.participantType || "General"}
                          externalId={attendee.externalId || undefined}
                          orderCode={(attendee as any).orderCode || undefined}
                          customFields={attendee.customFields as Record<string, string> | undefined}
                          templateConfig={getPreviewTemplateConfig(template) as any}
                          renderSide="front"
                          scale={0.6}
                          onLoadFont={fontContext?.loadFont}
                        />
                      </div>
                    }
                    back={
                      <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg">
                        <BadgeRenderSurface
                          firstName={attendee.firstName}
                          lastName={attendee.lastName}
                          email={attendee.email || undefined}
                          company={attendee.company || undefined}
                          title={attendee.title || undefined}
                          participantType={attendee.participantType || "General"}
                          externalId={attendee.externalId || undefined}
                          orderCode={(attendee as any).orderCode || undefined}
                          customFields={attendee.customFields as Record<string, string> | undefined}
                          templateConfig={getPreviewTemplateConfig(template) as any}
                          renderSide="back"
                          scale={0.6}
                          onLoadFont={fontContext?.loadFont}
                        />
                      </div>
                    }
                  />
                ) : (
                  <div className="border-2 border-border rounded-lg overflow-hidden shadow-lg">
                    <BadgeRenderSurface
                      firstName={attendee.firstName}
                      lastName={attendee.lastName}
                      email={attendee.email || undefined}
                      company={attendee.company || undefined}
                      title={attendee.title || undefined}
                      participantType={attendee.participantType || "General"}
                      externalId={attendee.externalId || undefined}
                      orderCode={(attendee as any).orderCode || undefined}
                      customFields={attendee.customFields as Record<string, string> | undefined}
                      templateConfig={getPreviewTemplateConfig(template)}
                      scale={0.6}
                      onLoadFont={fontContext?.loadFont}
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {currentPrinter?.type === 'printnode' ? (
                  <Cloud className="h-4 w-4" />
                ) : currentPrinter?.type === 'local' ? (
                  <Monitor className="h-4 w-4" />
                ) : currentPrinter?.type === 'custom' ? (
                  <Settings2 className="h-4 w-4" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                <span>{getPrinterDisplayName(currentPrinter)}</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onOpenPrinterSettings}>
                  Change
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button
                  onClick={onPrint}
                  disabled={isPrinting || !template || !currentPrinter}
                >
                  {isPrinting ? (
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  {isPrinting ? "Printing..." : "Print Badge"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
