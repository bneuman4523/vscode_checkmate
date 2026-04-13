import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Printer, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Loader2,
  Pencil,
  Save,
  ArrowLeft,
  RefreshCw,
  Zap
} from 'lucide-react';
import { printOrchestrator, type PrintCapabilities, type BadgeData } from '@/services/print-orchestrator';
import { useZebraPrint } from '@/hooks/use-zebra-print';
import { useNetworkPrint } from '@/hooks/use-network-print';
import BadgeRenderSurface from '../BadgeRenderSurface';
import type { Attendee } from '@shared/schema';

interface WorkflowBadgePrintProps {
  attendee: Attendee;
  badgeEdits: Record<string, string>;
  onBadgeEditChange: (fieldName: string, value: string) => void;
  onSaveBadgeEdits?: () => Promise<void>;
  onPrintComplete: () => void;
  onCancel?: () => void;
  templateConfig?: {
    width: number;
    height: number;
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    fontFamily: string;
    includeQR: boolean;
    qrPosition: string;
    qrCodeConfig?: {
      embedType: 'externalId' | 'simple' | 'json' | 'custom';
      fields: string[];
      separator: string;
      includeLabel: boolean;
    };
    mergeFields: any[];
    imageElements?: any[];
    labelRotation?: 0 | 90 | 180 | 270;
  };
  disabled?: boolean;
  autoPrint?: boolean;
  mode?: 'admin' | 'staff' | 'kiosk';
}

type PrintMethod = 'zebra' | 'network' | 'printnode' | 'native' | 'highDpi' | 'pdf';
type ViewMode = 'preview' | 'edit';

import { getSavedPrinter } from '@/lib/printerPreferences';
import type { SelectedPrinter as UnifiedPrinterPref } from '@/lib/printerPreferences';

interface SavedPrinterPreference {
  printerId: string;
  printerName?: string;
  type: 'printnode' | 'local' | 'custom';
  printNodeId?: number;
  customIp?: string;
  customPort?: number;
  customDpi?: number;
}

interface PrintNodePrinter {
  id: number;
  name: string;
  description: string;
  computerName: string;
  state: string;
}

const EDITABLE_FIELDS = ['firstName', 'lastName', 'company', 'title'];

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  company: 'Company',
  title: 'Title/Role',
};

export function WorkflowBadgePrint({
  attendee,
  badgeEdits,
  onBadgeEditChange,
  onSaveBadgeEdits,
  onPrintComplete,
  onCancel,
  templateConfig,
  disabled = false,
  autoPrint = false,
  mode = 'staff',
}: WorkflowBadgePrintProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
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
  const [zebraDpi, setZebraDpi] = useState<'203' | '300'>('203');
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [zebraError, setZebraError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [printNodePrinters, setPrintNodePrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrintNodePrinter, setSelectedPrintNodePrinter] = useState<number | null>(null);
  const [printNodeError, setPrintNodeError] = useState<string | null>(null);
  const [printNodeConfigured, setPrintNodeConfigured] = useState(false);
  const [forcePdfForZebra, setForcePdfForZebra] = useState<boolean>(() => {
    return localStorage.getItem('printnode_force_pdf_zebra') === 'true';
  });
  const [autoPrintAttempted, setAutoPrintAttempted] = useState(false);
  const [autoPrintStatus, setAutoPrintStatus] = useState<'pending' | 'printing' | 'success' | 'error'>('pending');
  const [autoPrintError, setAutoPrintError] = useState<string | null>(null);

  const zebra = useZebraPrint();
  const networkPrint = useNetworkPrint();

  const defaultTemplateConfig = {
    width: 4,
    height: 3,
    backgroundColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#3b82f6',
    fontFamily: 'Inter, sans-serif',
    includeQR: true,
    qrPosition: 'bottom-right',
    qrCodeConfig: {
      embedType: 'externalId' as const,
      fields: ['externalId'],
      separator: '|',
      includeLabel: false,
    },
    mergeFields: [
      { field: 'name', label: 'Name', fontSize: 24, position: { x: 50, y: 35 }, align: 'center' as const, fontWeight: 'bold' },
      { field: 'title', label: 'Title', fontSize: 14, position: { x: 50, y: 50 }, align: 'center' as const, fontWeight: 'normal' },
      { field: 'company', label: 'Company', fontSize: 12, position: { x: 50, y: 60 }, align: 'center' as const, fontWeight: 'normal' },
    ],
  };

  const config = templateConfig || defaultTemplateConfig;

  const getFieldValue = (field: string): string => {
    if (badgeEdits[field] !== undefined) {
      return badgeEdits[field];
    }
    switch (field) {
      case 'firstName': return attendee.firstName;
      case 'lastName': return attendee.lastName;
      case 'company': return attendee.company || '';
      case 'title': return attendee.title || '';
      default: return '';
    }
  };

  useEffect(() => {
    loadCapabilities();
    fetchPrintNodePrinters();
    const refreshInterval = setInterval(fetchPrintNodePrinters, 30 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  const getSavedPrinterPreference = (): SavedPrinterPreference | null => {
    const eventIdForLookup = attendee.eventId;
    if (eventIdForLookup) {
      const unified = getSavedPrinter(eventIdForLookup);
      if (unified) {
        switch (unified.type) {
          case 'printnode':
            return { printerId: String(unified.printNodeId), printerName: unified.printerName, type: 'printnode', printNodeId: unified.printNodeId };
          case 'local':
            return {
              printerId: unified.printerId,
              printerName: unified.printerName,
              type: 'local',
              customIp: unified.ipAddress,
              customPort: unified.port || 9100,
              customDpi: unified.dpi || 203,
            };
          case 'custom':
            return { printerId: 'other', type: 'custom', customIp: unified.customIp, customPort: unified.customPort, customDpi: unified.customDpi };
          case 'browser':
            return null;
        }
      }
    }
    return null;
  };

  const fetchPrintNodePrinters = async () => {
    try {
      let response: Response;
      
      if (mode === 'admin') {
        response = await fetch('/api/printnode/printers', {
          credentials: 'include',
        });
      } else {
        const token = localStorage.getItem('staffToken');
        response = await fetch('/api/staff/printnode/printers', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
      
      const data = await response.json();
      const savedPref = getSavedPrinterPreference();
      
      let printers: PrintNodePrinter[] = [];
      
      if (data.configured && data.printers) {
        setPrintNodeConfigured(true);
        printers = data.printers;
        setPrintNodePrinters(printers);
      } else if (Array.isArray(data)) {
        setPrintNodeConfigured(true);
        printers = data;
        setPrintNodePrinters(printers);
      }
      
      if (printers.length > 0) {
        if (savedPref?.type === 'printnode' && savedPref.printNodeId) {
          const savedPrinter = printers.find(p => p.id === savedPref.printNodeId);
          if (savedPrinter) {
            setSelectedPrintNodePrinter(savedPrinter.id);
          } else {
            setSelectedPrintNodePrinter(printers[0].id);
          }
        } else {
          setSelectedPrintNodePrinter(printers[0].id);
        }
      }
      
      if (savedPref?.type === 'local' || savedPref?.type === 'custom') {
        if (savedPref.customIp) {
          networkPrint.setIp(savedPref.customIp);
          networkPrint.setPort(savedPref.customPort || 9100);
          networkPrint.setDpi(savedPref.customDpi || 203);
        }
      }
    } catch (error) {
      console.error('Failed to fetch PrintNode printers:', error);
    }
  };

  useEffect(() => {
    // Only auto-select Zebra if PrintNode is not configured (PrintNode takes priority)
    if (!zebra.isLoading && zebra.isAvailable && zebra.printers.length > 0 && printMethod !== 'zebra' && !printNodeConfigured) {
      setPrintMethod('zebra');
    }
  }, [zebra.isLoading, zebra.isAvailable, zebra.printers.length, printNodeConfigured]);

  useEffect(() => {
    if (viewMode === 'edit') {
      const initialData: Record<string, string> = {};
      EDITABLE_FIELDS.forEach(field => {
        initialData[field] = getFieldValue(field);
      });
      setEditFormData(initialData);
    }
  }, [viewMode]);

  const loadCapabilities = async () => {
    const caps = await printOrchestrator.detectCapabilities();
    setCapabilities(caps);

    const info = await printOrchestrator.getBrowserCompatibilityInfo();
    setCompatibilityInfo(info);

    const savedPref = getSavedPrinterPreference();
    
    if (savedPref) {
      if (savedPref.type === 'printnode') {
        setPrintMethod('printnode');
        return;
      } else if (savedPref.type === 'local' || savedPref.type === 'custom') {
        setPrintMethod('network');
        return;
      }
    }

    if (zebra.isAvailable && zebra.printers.length > 0) {
      setPrintMethod('zebra');
    } else if (networkPrint.isConfigured && networkPrint.isConnected) {
      setPrintMethod('network');
    } else if (caps.recommendedStrategy === 'pdf') {
      setPrintMethod('pdf');
    } else if (caps.browser === 'firefox') {
      setPrintMethod('highDpi');
    } else {
      setPrintMethod('native');
    }
  };

  useEffect(() => {
    const savedPref = getSavedPrinterPreference();
    if (savedPref?.type === 'printnode' && printNodeConfigured && printNodePrinters.length > 0) {
      setPrintMethod('printnode');
    } else if ((savedPref?.type === 'local' || savedPref?.type === 'custom') && savedPref.customIp) {
      setPrintMethod('network');
    } else if (printNodeConfigured && printNodePrinters.length > 0) {
      setPrintMethod('printnode');
    }
  }, [printNodeConfigured, printNodePrinters]);

  // Auto-print logic: when autoPrint is true, print automatically once a printer is configured
  // Important: Wait for printMethod to be updated correctly to avoid race conditions
  useEffect(() => {
    if (!autoPrint || autoPrintAttempted || isPrinting) {
      return;
    }

    // Determine if we have a valid print configuration
    const hasPrintNodeReady = printNodeConfigured && printNodePrinters.length > 0 && selectedPrintNodePrinter;
    const hasNetworkReady = networkPrint.isConfigured && networkPrint.isConnected;
    const hasZebraReady = zebra.isAvailable && zebra.printers.length > 0;
    
    // Wait for capabilities to load first
    if (!capabilities) {
      return;
    }
    
    // Check if we have a valid print method ready AND printMethod is correctly set
    // This prevents race conditions where printMethod hasn't been updated yet
    const printMethodMatchesPrinter = 
      (hasPrintNodeReady && printMethod === 'printnode') ||
      (hasNetworkReady && printMethod === 'network') ||
      (hasZebraReady && printMethod === 'zebra');
    
    if (printMethodMatchesPrinter) {
      setAutoPrintAttempted(true);
      setAutoPrintStatus('printing');
      
      // Trigger print
      handlePrint().catch((err) => {
        console.error('[WorkflowBadgePrint] Auto-print failed:', err);
        setAutoPrintStatus('error');
        setAutoPrintError(err instanceof Error ? err.message : 'Auto-print failed');
      });
    }
  }, [
    autoPrint,
    autoPrintAttempted,
    isPrinting,
    capabilities,
    printMethod,
    printNodeConfigured,
    printNodePrinters,
    selectedPrintNodePrinter,
    networkPrint.isConfigured,
    networkPrint.isConnected,
    zebra.isAvailable,
    zebra.printers.length,
  ]);

  const handlePrint = async () => {
    setIsPrinting(true);
    setZebraError(null);
    setNetworkError(null);
    setPrintNodeError(null);
    
    try {
      if (onSaveBadgeEdits && Object.keys(badgeEdits).length > 0) {
        await onSaveBadgeEdits();
      }
      
      const badgeData: BadgeData = {
        firstName: getFieldValue('firstName'),
        lastName: getFieldValue('lastName'),
        company: getFieldValue('company'),
        title: getFieldValue('title'),
        participantType: attendee.participantType,
        externalId: attendee.externalId || undefined,
        customFields: attendee.customFields as Record<string, string> | undefined,
      };

      switch (printMethod) {
        case 'zebra':
          const zebraBadgeData = {
            firstName: getFieldValue('firstName'),
            lastName: getFieldValue('lastName'),
            company: getFieldValue('company'),
            title: getFieldValue('title'),
            participantType: attendee.participantType,
            externalId: attendee.externalId || undefined,
            customFields: attendee.customFields as Record<string, string> | undefined,
          };
          
          const zebraTemplate = {
            width: config.width,
            height: config.height,
            dpi: parseInt(zebraDpi),
            includeQR: config.includeQR,
            qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}`,
          };
          
          const result = await zebra.printBadge(zebraBadgeData, zebraTemplate);
          
          if (!result.success) {
            setZebraError(result.error || 'Print failed');
            setIsPrinting(false);
            return;
          }
          break;
        
        case 'network':
          if (!networkPrint.isConfigured) {
            setNetworkError('Please configure printer IP in settings first');
            setIsPrinting(false);
            return;
          }
          
          const networkBadgeData = {
            firstName: getFieldValue('firstName'),
            lastName: getFieldValue('lastName'),
            company: getFieldValue('company'),
            title: getFieldValue('title'),
            externalId: attendee.externalId || undefined,
          };
          
          const networkTemplate = {
            width: config.width,
            height: config.height,
            includeQR: config.includeQR,
            qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}`,
          };
          
          const zplData = networkPrint.generateBadgeZpl(networkBadgeData, networkTemplate);
          const networkResult = await networkPrint.printZpl(zplData);
          
          if (!networkResult.success) {
            setNetworkError(networkResult.error || 'Network print failed');
            setIsPrinting(false);
            return;
          }
          break;

        case 'printnode':
          if (!selectedPrintNodePrinter) {
            setPrintNodeError('Please select a PrintNode printer');
            setIsPrinting(false);
            return;
          }
          
          // Check if selected printer is a Zebra (for ZPL) or standard printer (for PDF)
          const selectedPrinter = printNodePrinters.find(p => p.id === selectedPrintNodePrinter);
          const isZebraPrinter = selectedPrinter && 
            (selectedPrinter.name.toLowerCase().includes('zebra') || 
             selectedPrinter.name.toLowerCase().includes('zd') ||
             selectedPrinter.name.toLowerCase().includes('zt') ||
             selectedPrinter.name.toLowerCase().includes('zp') ||
             selectedPrinter.description?.toLowerCase().includes('zebra'));
          
          // Use ZPL for Zebra printers unless force PDF is enabled
          const useZpl = isZebraPrinter && !forcePdfForZebra;
          
          // Determine API endpoint and auth based on mode
          const printNodeEndpoint = mode === 'admin' ? '/api/printnode/print' : '/api/staff/printnode/print';
          const token = localStorage.getItem('staffToken');
          const printNodeHeaders: HeadersInit = mode === 'admin' 
            ? { 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
          
          let printNodeResponse: Response;
          let printNodeResult: any;
          
          if (useZpl) {
            // Zebra printer: send ZPL
            const printNodeBadgeData = {
              firstName: getFieldValue('firstName'),
              lastName: getFieldValue('lastName'),
              company: getFieldValue('company'),
              title: getFieldValue('title'),
              externalId: attendee.externalId || undefined,
            };
            
            const printNodeTemplate = {
              width: config.width,
              height: config.height,
              includeQR: config.includeQR,
              qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}`,
            };
            
            const printNodeZpl = networkPrint.generateBadgeZpl(printNodeBadgeData, printNodeTemplate);
            
            printNodeResponse = await fetch(printNodeEndpoint, {
              method: 'POST',
              headers: printNodeHeaders,
              credentials: mode === 'admin' ? 'include' : 'same-origin',
              body: JSON.stringify({
                printerId: selectedPrintNodePrinter,
                zplData: printNodeZpl,
                title: `Badge: ${printNodeBadgeData.firstName} ${printNodeBadgeData.lastName}`,
              }),
            });
          } else {
            // Standard printer or Zebra with PDF forced: send PDF
            
            // Generate PDF blob
            const pdfBlob = await printOrchestrator.generatePDFBlob(badgeData, config);
            
            // Convert blob to base64
            const pdfArrayBuffer = await pdfBlob.arrayBuffer();
            const pdfBase64 = btoa(
              new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            
            printNodeResponse = await fetch(printNodeEndpoint, {
              method: 'POST',
              headers: printNodeHeaders,
              credentials: mode === 'admin' ? 'include' : 'same-origin',
              body: JSON.stringify({
                printerId: selectedPrintNodePrinter,
                pdfBase64: pdfBase64,
                title: `Badge: ${getFieldValue('firstName')} ${getFieldValue('lastName')}`,
                badgeWidth: config.width,
                badgeHeight: config.height,
              }),
            });
          }
          
          printNodeResult = await printNodeResponse.json();
          
          if (!printNodeResponse.ok || !printNodeResult.success) {
            setPrintNodeError(printNodeResult.error || 'PrintNode print failed');
            setIsPrinting(false);
            return;
          }
          
          break;
          
        case 'native':
          await printOrchestrator.printBadge(badgeData, config, (config as any).labelRotation || 0);
          break;
        case 'highDpi':
          await printOrchestrator.printHighDPI(badgeData, config, parseInt(dpi), (config as any).labelRotation || 0);
          break;
        case 'pdf':
          await printOrchestrator.downloadPDF(badgeData, config, (config as any).labelRotation || 0);
          break;
      }

      onPrintComplete();
    } catch (error) {
      console.error('[WorkflowBadgePrint] Print failed:', error);
      if (printMethod === 'zebra') {
        setZebraError(error instanceof Error ? error.message : 'Print failed');
      } else if (printMethod === 'network') {
        setNetworkError(error instanceof Error ? error.message : 'Print failed');
      } else if (printMethod === 'printnode') {
        setPrintNodeError(error instanceof Error ? error.message : 'Print failed');
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSaveEdits = () => {
    Object.entries(editFormData).forEach(([field, value]) => {
      if (value !== getFieldValue(field)) {
        onBadgeEditChange(field, value);
      }
    });
    setViewMode('preview');
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

  if (viewMode === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setViewMode('preview')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Preview
          </Button>
        </div>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Badge Information
          </h3>
          
          <div className="space-y-4">
            {EDITABLE_FIELDS.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`edit-${field}`}>
                  {FIELD_LABELS[field]}
                </Label>
                <Input
                  id={`edit-${field}`}
                  value={editFormData[field] || ''}
                  onChange={(e) => setEditFormData(prev => ({
                    ...prev,
                    [field]: e.target.value
                  }))}
                  placeholder={`Enter ${FIELD_LABELS[field].toLowerCase()}`}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button 
            onClick={handleSaveEdits}
            disabled={disabled}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>
    );
  }

  // Auto-print mode: show simplified UI while printing automatically
  if (autoPrint && autoPrintStatus === 'printing') {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Printing Badge...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {getFieldValue('firstName')} {getFieldValue('lastName')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Auto-print mode: show error with retry option
  if (autoPrint && autoPrintStatus === 'error') {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Auto-print failed: {autoPrintError || 'Unknown error'}
          </AlertDescription>
        </Alert>
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Badge Preview</div>
          <div className="flex justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <BadgeRenderSurface
              firstName={getFieldValue('firstName')}
              lastName={getFieldValue('lastName')}
              email={attendee.email}
              company={getFieldValue('company')}
              title={getFieldValue('title')}
              participantType={attendee.participantType}
              externalId={attendee.externalId || undefined}
              orderCode={(attendee as any).orderCode || undefined}
              customFields={attendee.customFields as Record<string, string> | undefined}
              templateConfig={config}
            />
          </div>
        </Card>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => {
              setAutoPrintAttempted(false);
              setAutoPrintStatus('pending');
              setAutoPrintError(null);
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Print
          </Button>
          <Button variant="outline" onClick={onPrintComplete}>
            Skip Printing
          </Button>
        </div>
      </div>
    );
  }

  // Auto-print mode: waiting for printer to be configured
  if (autoPrint && autoPrintStatus === 'pending' && !autoPrintAttempted) {
    const hasPrinterConfigured = 
      (printNodeConfigured && printNodePrinters.length > 0) || 
      (networkPrint.isConfigured && networkPrint.isConnected) ||
      (zebra.isAvailable && zebra.printers.length > 0);
    
    if (!hasPrinterConfigured && capabilities) {
      // No printer configured - show message and allow manual print
      return (
        <div className="space-y-6">
          <Alert className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              No printer configured for auto-print. Please configure a printer in settings or print manually.
            </AlertDescription>
          </Alert>
          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Badge Preview</div>
            <div className="flex justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <BadgeRenderSurface
                firstName={getFieldValue('firstName')}
                lastName={getFieldValue('lastName')}
                email={attendee.email}
                company={getFieldValue('company')}
                title={getFieldValue('title')}
                participantType={attendee.participantType}
                externalId={attendee.externalId || undefined}
                orderCode={(attendee as any).orderCode || undefined}
                customFields={attendee.customFields as Record<string, string> | undefined}
                templateConfig={config}
              />
            </div>
          </Card>
          <div className="flex gap-3 justify-center">
            <Button onClick={handlePrint} disabled={isPrinting} className="gap-2">
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print Badge
            </Button>
            <Button variant="outline" onClick={onPrintComplete}>
              Skip Printing
            </Button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setViewMode('edit')}
          disabled={disabled || isPrinting}
          className="gap-2"
        >
          <Pencil className="h-4 w-4" />
          Edit Badge
        </Button>
      </div>

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
        <div className="flex justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
          <div className="print-preview-badge">
            <BadgeRenderSurface
              firstName={getFieldValue('firstName')}
              lastName={getFieldValue('lastName')}
              email={attendee.email}
              company={getFieldValue('company')}
              title={getFieldValue('title')}
              participantType={attendee.participantType}
              externalId={attendee.externalId || undefined}
              orderCode={(attendee as any).orderCode || undefined}
              customFields={attendee.customFields as Record<string, string> | undefined}
              templateConfig={config}
              scale={0.4}
              printMode={false}
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-center mt-2">
          Badge size: {config.width}" × {config.height}"
        </div>
      </Card>

      {printMethod === 'zebra' && (
        <Card className={`p-4 ${zebra.isAvailable && zebra.printers.length > 0 ? 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className={`h-4 w-4 ${zebra.isAvailable && zebra.printers.length > 0 ? 'text-green-600' : 'text-yellow-600'}`} />
            <span className={`text-sm font-medium ${zebra.isAvailable && zebra.printers.length > 0 ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'}`}>
              {zebra.isAvailable && zebra.printers.length > 0 ? 'Zebra Silent Printing Available' : 'Zebra Browser Print Setup Required'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2"
              onClick={() => zebra.refreshPrinters()}
              disabled={zebra.isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${zebra.isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          {zebra.isAvailable && zebra.printers.length > 0 ? (
            <>
              <p className="text-xs text-green-700 dark:text-green-300 mb-3">
                Prints instantly without dialog. Uses standard badge layout with name, title, company, and QR code.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-green-700 dark:text-green-300">
                  Select Zebra Printer
                </label>
                <Select 
                  value={zebra.selectedPrinter?.uid || ''} 
                  onValueChange={(uid) => {
                    const printer = zebra.printers.find(p => p.uid === uid);
                    if (printer) zebra.selectPrinter(printer);
                  }}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-800">
                    <SelectValue placeholder="Select a printer" />
                  </SelectTrigger>
                  <SelectContent>
                    {zebra.printers.map((printer) => (
                      <SelectItem key={printer.uid} value={printer.uid}>
                        {printer.name} ({printer.connection})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {zebra.selectedPrinter && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-600 dark:text-green-400">
                        Ready: {zebra.selectedPrinter.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => zebra.printTestLabel()}
                      >
                        Test Print
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-green-700 dark:text-green-300">
                        Printer DPI:
                      </label>
                      <Select value={zebraDpi} onValueChange={(v) => setZebraDpi(v as '203' | '300')}>
                        <SelectTrigger className="h-7 w-28 text-xs bg-white dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="203">203 DPI</SelectItem>
                          <SelectItem value="300">300 DPI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Zebra Browser Print app not detected. This method requires the Zebra Browser Print desktop application.
              </p>
              <div className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                <p><strong>To enable:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Download Zebra Browser Print from zebra.com</li>
                  <li>Install and run the application</li>
                  <li>Connect your Zebra printer via USB</li>
                  <li>Click "Refresh" above to detect printers</li>
                </ol>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                <strong>Note:</strong> Only works on Mac/Windows. For iPad/iOS, use "Network Print (IP)" instead.
              </p>
            </div>
          )}
        </Card>
      )}

      {printMethod === 'network' && (
        <Card className={`p-4 ${networkPrint.isConfigured && networkPrint.isConnected ? 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className={`h-4 w-4 ${networkPrint.isConfigured && networkPrint.isConnected ? 'text-blue-600' : 'text-yellow-600'}`} />
            <span className={`text-sm font-medium ${networkPrint.isConfigured && networkPrint.isConnected ? 'text-blue-800 dark:text-blue-200' : 'text-yellow-800 dark:text-yellow-200'}`}>
              {networkPrint.isConfigured && networkPrint.isConnected ? 'Network Printer Connected' : 'Network Printer Setup Required'}
            </span>
          </div>
          
          {networkPrint.isConfigured ? (
            <div className="space-y-2">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Printer IP: {networkPrint.settings.printerIp}:{networkPrint.settings.port} | DPI: {networkPrint.settings.dpi}
              </p>
              {networkPrint.isConnected ? (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Connection verified
                </p>
              ) : (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Connection not tested - click the Printer button in the header to test
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                No network printer configured. Click the "Printer" button in the header to set up your printer's IP address.
              </p>
              <div className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                <p><strong>To configure:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Find your Zebra printer's IP address (print network config)</li>
                  <li>Click "Printer" button in the top navigation</li>
                  <li>Enter the IP address and test the connection</li>
                </ol>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                <strong>Best for:</strong> iPad, iPhone, and any device on the same network as the printer.
              </p>
            </div>
          )}
        </Card>
      )}

      {zebraError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{zebraError}</AlertDescription>
        </Alert>
      )}

      {networkError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{networkError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Print Method</label>
          <Select value={printMethod} onValueChange={(v) => setPrintMethod(v as PrintMethod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {printNodeConfigured && printNodePrinters.length > 0 && (
                <SelectItem value="printnode">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-600" />
                    PrintNode (Cloud)
                  </div>
                </SelectItem>
              )}
              <SelectItem value="network">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  Network Print (IP)
                  {!networkPrint.isConfigured && <span className="text-xs text-muted-foreground ml-1">(not configured)</span>}
                </div>
              </SelectItem>
              <SelectItem value="zebra">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-600" />
                  Zebra Browser Print
                  {(!zebra.isAvailable || zebra.printers.length === 0) && <span className="text-xs text-muted-foreground ml-1">(not detected)</span>}
                </div>
              </SelectItem>
              <SelectItem value="native">
                Native Print Dialog
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

        {printMethod === 'printnode' && printNodePrinters.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">PrintNode Printer</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => fetchPrintNodePrinters()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
              <Select 
                value={selectedPrintNodePrinter?.toString() || ''} 
                onValueChange={(v) => setSelectedPrintNodePrinter(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a printer" />
                </SelectTrigger>
                <SelectContent>
                  {printNodePrinters.map((printer) => (
                    <SelectItem key={printer.id} value={printer.id.toString()}>
                      <div className="flex flex-col">
                        <span>{printer.name}</span>
                        <span className="text-xs text-muted-foreground">{printer.computerName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPrintNodePrinter && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    setPrintNodeError(null);
                    const token = localStorage.getItem('staffToken');
                    const response = await fetch('/api/staff/printnode/test-print', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      },
                      body: JSON.stringify({ printerId: selectedPrintNodePrinter }),
                    });
                    const result = await response.json();
                    if (result.success) {
                      alert('Test print sent! Check your Zebra printer for a test label.');
                    } else {
                      setPrintNodeError(result.error || 'Test print failed');
                    }
                  } catch (err) {
                    setPrintNodeError('Failed to send test print');
                  }
                }}
              >
                Send Test Print
              </Button>
            )}
            
            {(() => {
              const selPrinter = printNodePrinters.find(p => p.id === selectedPrintNodePrinter);
              const isZebra = selPrinter && 
                (selPrinter.name.toLowerCase().includes('zebra') || 
                 selPrinter.name.toLowerCase().includes('zd') ||
                 selPrinter.name.toLowerCase().includes('zt') ||
                 selPrinter.name.toLowerCase().includes('zp') ||
                 selPrinter.description?.toLowerCase().includes('zebra'));
              if (!isZebra) return null;
              return (
                <>
                  <div className="space-y-2 pt-2 border-t">
                    <label className="text-sm font-medium">Zebra Printer DPI</label>
                    <Select 
                      value={String(networkPrint.settings.dpi)} 
                      onValueChange={(v) => networkPrint.setDpi(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="203">203 DPI (Most Zebra ZD Series)</SelectItem>
                        <SelectItem value="300">300 DPI (High Resolution Models)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Match to your printer's hardware DPI. Most ZD621 = 203 DPI.
                    </p>
                  </div>
                  
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="forcePdfForZebra"
                        checked={forcePdfForZebra}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForcePdfForZebra(checked);
                          localStorage.setItem('printnode_force_pdf_zebra', String(checked));
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor="forcePdfForZebra" className="text-sm font-medium cursor-pointer">
                        Use PDF instead of ZPL for Zebra printers
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enable this if ZPL commands print as text instead of rendering as a badge. 
                      PDF works with any CUPS driver configuration.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

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

      {printNodeError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{printNodeError}</AlertDescription>
        </Alert>
      )}

      <div className="pt-4 border-t">
        <Button 
          onClick={handlePrint} 
          disabled={isPrinting || disabled}
          className="w-full gap-2"
          size="lg"
        >
          {isPrinting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {printMethod === 'pdf' ? 'Generating PDF...' : 
               printMethod === 'zebra' ? 'Sending to Zebra...' : 
               printMethod === 'network' ? 'Sending to Printer...' : 
               printMethod === 'printnode' ? 'Sending to PrintNode...' : 'Printing...'}
            </>
          ) : (
            <>
              {printMethod === 'zebra' || printMethod === 'network' || printMethod === 'printnode' ? <Zap className="h-5 w-5" /> : <Printer className="h-5 w-5" />}
              {printMethod === 'pdf' 
                ? 'Download PDF & Complete Check-In' 
                : printMethod === 'zebra' 
                  ? 'Print Badge (Silent)' 
                  : printMethod === 'network'
                    ? 'Print Badge (Network)'
                    : printMethod === 'printnode'
                      ? 'Print Badge (PrintNode)'
                      : 'Print Badge & Complete Check-In'}
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Check-in will be completed automatically after printing
        </p>
      </div>
    </div>
  );
}
