import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Printer,
  Cloud,
  Monitor,
  Settings2,
  Loader2,
  XCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { SelectedPrinter, PrintNodePrinterInfo } from "@/lib/printerPreferences";

interface AccountPrinter {
  id: string;
  name: string;
  connectionType: string;
  ipAddress?: string;
  port?: number;
  dpi?: number;
}

interface PrinterSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (printer: SelectedPrinter) => void;
  customerId?: string;
  currentPrinter?: SelectedPrinter | null;
  mode?: 'admin' | 'staff' | 'kiosk';
}

function getStaffAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('staffToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export default function PrinterSelector({
  open,
  onOpenChange,
  onSelect,
  customerId,
  currentPrinter,
  mode = 'admin',
}: PrinterSelectorProps) {
  const [accountPrinters, setAccountPrinters] = useState<AccountPrinter[]>([]);
  const [printNodePrinters, setPrintNodePrinters] = useState<PrintNodePrinterInfo[]>([]);
  const [printNodeConfigured, setPrintNodeConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  const [customIp, setCustomIp] = useState('');
  const [customPort, setCustomPort] = useState(9100);
  const [customDpi, setCustomDpi] = useState(203);

  useEffect(() => {
    if (!open) return;

    if (currentPrinter) {
      switch (currentPrinter.type) {
        case 'printnode':
          setSelectedTab('printnode');
          break;
        case 'local':
          setSelectedTab('local');
          break;
        case 'custom':
          setSelectedTab('custom');
          setCustomIp(currentPrinter.customIp);
          setCustomPort(currentPrinter.customPort);
          setCustomDpi(currentPrinter.customDpi);
          break;
        case 'browser':
          setSelectedTab('browser');
          break;
      }
    }

    fetchAllPrinters();
  }, [open]);

  const fetchAllPrinters = async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const promises: Promise<Response>[] = [];

      if (mode === 'admin') {
        if (customerId) {
          promises.push(fetch(`/api/printers?customerId=${customerId}`, { credentials: 'include' }));
        } else {
          promises.push(Promise.resolve(new Response(JSON.stringify([]), { status: 200 })));
        }
        promises.push(fetch('/api/printnode/printers', { credentials: 'include' }));
      } else {
        promises.push(fetch('/api/staff/printers', { headers: getStaffAuthHeaders() }));
        promises.push(fetch('/api/staff/printnode/printers', { headers: getStaffAuthHeaders() }));
      }

      const [localRes, printNodeRes] = await Promise.all(promises);

      let localPrinters: AccountPrinter[] = [];
      if (localRes.ok) {
        const data = await localRes.json();
        localPrinters = Array.isArray(data) ? data : (data.printers || []);
        setAccountPrinters(localPrinters);
      }

      if (printNodeRes.ok) {
        const data = await printNodeRes.json();
        const configured = data.configured ?? (Array.isArray(data));
        const printers = data.printers || (Array.isArray(data) ? data : []);
        setPrintNodeConfigured(configured);
        setPrintNodePrinters(printers);

        if (!selectedTab) {
          if (configured && printers.length > 0) {
            setSelectedTab('printnode');
          } else if (localPrinters.length > 0) {
            setSelectedTab('local');
          } else {
            setSelectedTab('browser');
          }
        }
      }
    } catch (error) {
      console.error('[PrinterSelector] Failed to fetch printers:', error);
      setFetchError('Could not load printers.');
      if (!selectedTab) setSelectedTab('browser');
    } finally {
      setIsLoading(false);
    }
  };

  const onlinePrinters = useMemo(() =>
    printNodePrinters.filter(p => p.state === 'online'),
  [printNodePrinters]);

  const offlinePrinters = useMemo(() =>
    printNodePrinters.filter(p => p.state !== 'online'),
  [printNodePrinters]);

  const handleSelectPrintNode = (printer: PrintNodePrinterInfo) => {
    const selected: SelectedPrinter = {
      type: 'printnode',
      printNodeId: printer.id,
      printerName: printer.name,
    };
    onSelect(selected);
    onOpenChange(false);
  };

  const handleSelectLocal = (printer: AccountPrinter) => {
    const selected: SelectedPrinter = {
      type: 'local',
      printerId: printer.id,
      printerName: printer.name,
      ipAddress: printer.ipAddress,
      port: printer.port,
      dpi: printer.dpi,
    };
    onSelect(selected);
    onOpenChange(false);
  };

  const handleSelectCustom = () => {
    if (!customIp) return;
    const selected: SelectedPrinter = {
      type: 'custom',
      customIp,
      customPort: customPort,
      customDpi: customDpi,
    };
    onSelect(selected);
    onOpenChange(false);
  };

  const handleSelectBrowser = () => {
    const selected: SelectedPrinter = { type: 'browser' };
    onSelect(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Select Printer
          </DialogTitle>
          <DialogDescription>
            Choose how you want to print badges on this device.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {fetchError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{fetchError}</span>
              </div>
            )}

            <Tabs value={selectedTab || 'browser'} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="printnode" className="flex items-center gap-1 text-xs">
                  <Cloud className="h-3 w-3" />
                  <span className="hidden sm:inline">Cloud</span>
                </TabsTrigger>
                <TabsTrigger value="local" className="flex items-center gap-1 text-xs">
                  <Monitor className="h-3 w-3" />
                  <span className="hidden sm:inline">Local</span>
                </TabsTrigger>
                <TabsTrigger value="custom" className="flex items-center gap-1 text-xs">
                  <Settings2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Zebra</span>
                </TabsTrigger>
                <TabsTrigger value="browser" className="flex items-center gap-1 text-xs">
                  <Printer className="h-3 w-3" />
                  <span className="hidden sm:inline">Browser</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="printnode" className="space-y-3">
                {!printNodeConfigured ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <Cloud className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          PrintNode is not configured. Ask your administrator to set up PrintNode for cloud-based printing.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : printNodePrinters.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <Printer className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No printers found. Make sure PrintNode client is running.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {onlinePrinters.length > 0 && (
                      <div className="space-y-1.5">
                        {onlinePrinters.map((printer) => (
                          <div
                            key={printer.id}
                            className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => handleSelectPrintNode(printer)}
                          >
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4 text-blue-500" />
                              <div>
                                <span className="font-medium text-sm">{printer.name}</span>
                                {printer.computerName && (
                                  <p className="text-xs text-muted-foreground">{printer.computerName}</p>
                                )}
                              </div>
                            </div>
                            <Badge variant="default" className="text-xs">
                              <Wifi className="h-3 w-3 mr-1" />
                              online
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {offlinePrinters.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground mt-2">Offline</p>
                        {offlinePrinters.map((printer) => (
                          <div
                            key={printer.id}
                            className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors opacity-60"
                            onClick={() => handleSelectPrintNode(printer)}
                          >
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium text-sm">{printer.name}</span>
                                {printer.computerName && (
                                  <p className="text-xs text-muted-foreground">{printer.computerName}</p>
                                )}
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              <WifiOff className="h-3 w-3 mr-1" />
                              offline
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="local" className="space-y-3">
                {accountPrinters.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-2">
                        <Printer className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No local printers configured. Use the Custom tab to enter printer details manually.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-1.5">
                    {accountPrinters.map((printer) => (
                      <div
                        key={printer.id}
                        className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleSelectLocal(printer)}
                      >
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium text-sm">{printer.name}</span>
                            {printer.ipAddress && (
                              <p className="text-xs text-muted-foreground">
                                {printer.ipAddress}:{printer.port || 9100}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {printer.connectionType}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="space-y-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Custom Zebra Printer</CardTitle>
                    <CardDescription>Enter IP address and port for a network Zebra printer</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="printer-ip">IP Address</Label>
                      <Input
                        id="printer-ip"
                        placeholder="192.168.1.100"
                        value={customIp}
                        onChange={(e) => setCustomIp(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="printer-port">Port</Label>
                        <Input
                          id="printer-port"
                          type="number"
                          value={customPort}
                          onChange={(e) => setCustomPort(parseInt(e.target.value) || 9100)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="printer-dpi">DPI</Label>
                        <Select value={String(customDpi)} onValueChange={(v) => setCustomDpi(parseInt(v))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="203">203 DPI</SelectItem>
                            <SelectItem value="300">300 DPI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleSelectCustom} className="w-full" disabled={!customIp}>
                      <Settings2 className="h-4 w-4 mr-2" />
                      Use This Printer
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="browser" className="space-y-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Printer className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div className="space-y-2">
                        <p className="font-medium">Browser Print</p>
                        <p className="text-sm text-muted-foreground">
                          Uses your browser's built-in print dialog. Works on any device with any connected printer.
                        </p>
                      </div>
                      <Button onClick={handleSelectBrowser} className="w-full">
                        <Printer className="h-4 w-4 mr-2" />
                        Use Browser Print
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
