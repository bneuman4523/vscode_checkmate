import { useState, useEffect, useRef } from 'react';
import { useBehaviorTracking } from '@/hooks/useBehaviorTracking';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Printer, Download, AlertCircle, CheckCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { printOrchestrator, type PrintCapabilities, type BadgeData } from '@/services/print-orchestrator';
import BadgeRenderSurface from './BadgeRenderSurface';

interface BadgePrintPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendee: {
    firstName: string;
    lastName: string;
    email?: string;
    company?: string;
    title?: string;
    participantType: string;
    externalId?: string;
    customFields?: Record<string, string>;
  };
  templateConfig: {
    width: number;
    height: number;
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    fontFamily: string;
    includeQR: boolean;
    qrPosition: string;
    mergeFields: any[];
    imageElements?: any[];
    labelRotation?: 0 | 90 | 180 | 270;
  };
  onPrint?: () => void;
}

type PrintMethod = 'native' | 'highDpi' | 'pdf';

export default function BadgePrintPreview({
  open,
  onOpenChange,
  attendee,
  templateConfig,
  onPrint,
}: BadgePrintPreviewProps) {
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const [capabilities, setCapabilities] = useState<PrintCapabilities | null>(null);
  const [compatibilityInfo, setCompatibilityInfo] = useState<{
    platform: string;
    browser: string;
    printSupport: 'full' | 'limited' | 'none';
    pageSizeSupport: 'full' | 'limited' | 'none';
    recommendedAction: string;
    tips: string[];
  } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printMethod, setPrintMethod] = useState<PrintMethod>('native');
  const [dpi, setDpi] = useState<'300' | '600'>('300');

  useEffect(() => {
    if (open) {
      loadCapabilities();
    }
  }, [open]);

  const loadCapabilities = async () => {
    const caps = await printOrchestrator.detectCapabilities();
    setCapabilities(caps);

    const info = await printOrchestrator.getBrowserCompatibilityInfo();
    setCompatibilityInfo(info);

    if (caps.recommendedStrategy === 'pdf') {
      setPrintMethod('pdf');
    } else if (caps.browser === 'firefox') {
      setPrintMethod('highDpi');
    } else {
      setPrintMethod('native');
    }
  };

  const handlePrint = async () => {
    trackStart("print", "send");
    setIsPrinting(true);
    try {
      const badgeData: BadgeData = {
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        company: attendee.company,
        title: attendee.title,
        participantType: attendee.participantType,
        customFields: attendee.customFields,
      };

      const rotation = (templateConfig.labelRotation || 0) as 0 | 90 | 180 | 270;
      switch (printMethod) {
        case 'native':
          await printOrchestrator.printBadge(badgeData, templateConfig, rotation);
          break;
        case 'highDpi':
          await printOrchestrator.printHighDPI(badgeData, templateConfig, parseInt(dpi), rotation);
          break;
        case 'pdf':
          await printOrchestrator.downloadPDF(badgeData, templateConfig, rotation);
          break;
      }

      onPrint?.();
      trackComplete("print", "send");
    } catch (error) {
      trackAbandon("print", "send");
      console.error('[BadgePrintPreview] Print failed:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  const getSupportIcon = (level: 'full' | 'limited' | 'none') => {
    switch (level) {
      case 'full':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'limited':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'none':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getSupportClass = (level: 'full' | 'limited' | 'none') => {
    switch (level) {
      case 'full':
        return 'print-compatibility-badge supported';
      case 'limited':
        return 'print-compatibility-badge limited';
      case 'none':
        return 'print-compatibility-badge unsupported';
    }
  };

  const getBrowserDisplayName = (browser: string) => {
    const names: Record<string, string> = {
      safari: 'Safari',
      chrome: 'Chrome',
      firefox: 'Firefox',
      edge: 'Edge',
      unknown: 'Unknown Browser',
    };
    return names[browser] || browser;
  };

  const getPlatformDisplayName = (platform: string) => {
    const names: Record<string, string> = {
      ios: 'iPad/iPhone',
      android: 'Android',
      windows: 'Windows',
      macos: 'Mac',
      linux: 'Linux',
      unknown: 'Unknown',
    };
    return names[platform] || platform;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Badge Preview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {compatibilityInfo && (
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">
                  {getPlatformDisplayName(compatibilityInfo.platform)} - {getBrowserDisplayName(compatibilityInfo.browser)}
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    {getSupportIcon(compatibilityInfo.printSupport)}
                    <span>Print: {compatibilityInfo.printSupport}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getSupportIcon(compatibilityInfo.pageSizeSupport)}
                    <span>Custom Size: {compatibilityInfo.pageSizeSupport}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {compatibilityInfo?.printSupport === 'none' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {compatibilityInfo.recommendedAction}
              </AlertDescription>
            </Alert>
          )}

          {compatibilityInfo?.tips && compatibilityInfo.tips.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <ul className="text-sm space-y-1 mt-1">
                  {compatibilityInfo.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Badge Preview</div>
            <div className="flex justify-center bg-gray-100 p-4 rounded-lg">
              <div className="print-preview-badge">
                <BadgeRenderSurface
                  firstName={attendee.firstName}
                  lastName={attendee.lastName}
                  email={attendee.email}
                  company={attendee.company}
                  title={attendee.title}
                  participantType={attendee.participantType}
                  externalId={attendee.externalId}
                  customFields={attendee.customFields}
                  templateConfig={templateConfig}
                  scale={0.4}
                  printMode={false}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center mt-2">
              Badge size: {templateConfig.width}" × {templateConfig.height}"
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Print Method</label>
              <Select value={printMethod} onValueChange={(v) => setPrintMethod(v as PrintMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">
                    Native Print (Recommended)
                  </SelectItem>
                  <SelectItem value="highDpi">
                    High-DPI Print
                  </SelectItem>
                  <SelectItem value="pdf">
                    Download PDF
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {printMethod === 'highDpi' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Print Quality</label>
                <Select value={dpi} onValueChange={(v) => setDpi(v as '300' | '600')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="300">300 DPI (Standard)</SelectItem>
                    <SelectItem value="600">600 DPI (High Quality)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-xs text-green-800">
              <strong>Clean print output:</strong> All print methods now generate a PDF before printing, so browser headers and footers (page URL, date) will not appear on your badges.
            </AlertDescription>
          </Alert>

          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
            <strong>Print Method Guide:</strong>
            <ul className="mt-1 space-y-1 ml-4 list-disc">
              <li><strong>Native Print:</strong> Generates a PDF and opens the browser print dialog.</li>
              <li><strong>High-DPI Print:</strong> Renders badge at 300 DPI for crisp output via PDF.</li>
              <li><strong>Download PDF:</strong> Creates a PDF file for manual printing.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => setPrintMethod('pdf')}
            disabled={isPrinting}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting}>
            {isPrinting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {printMethod === 'pdf' ? 'Generating...' : 'Printing...'}
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                {printMethod === 'pdf' ? 'Download PDF' : 'Print Badge'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
