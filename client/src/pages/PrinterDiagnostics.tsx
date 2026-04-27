import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Stethoscope,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Monitor,
  Printer,
  Lightbulb,
  Clock,
  Activity,
} from "lucide-react";

interface DiagnosticCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: any;
}

interface DiagnosticResult {
  printerId: number;
  printerName: string;
  timestamp: string;
  overallStatus: "healthy" | "warning" | "error" | "offline";
  checks: DiagnosticCheck[];
  recommendation: string;
}

interface PrinterOverview {
  printerId: number;
  printerName: string;
  computerName: string;
  computerOnline: boolean;
  printerState: string;
  lastJobTime: string | null;
  lastJobState: string | null;
}

const STATUS_CONFIG = {
  healthy: { label: "Healthy", color: "bg-green-500", textColor: "text-green-700 dark:text-green-400", icon: CheckCircle2, badgeVariant: "default" as const },
  warning: { label: "Warning", color: "bg-amber-500", textColor: "text-amber-700 dark:text-amber-400", icon: AlertTriangle, badgeVariant: "secondary" as const },
  error: { label: "Error", color: "bg-red-500", textColor: "text-red-700 dark:text-red-400", icon: XCircle, badgeVariant: "destructive" as const },
  offline: { label: "Offline", color: "bg-gray-500", textColor: "text-gray-700 dark:text-gray-400", icon: WifiOff, badgeVariant: "outline" as const },
} as const;

const CHECK_STATUS_ICON = {
  pass: { icon: CheckCircle2, color: "text-green-500" },
  warn: { icon: AlertTriangle, color: "text-amber-500" },
  fail: { icon: XCircle, color: "text-red-500" },
};

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getQuickStatus(printer: PrinterOverview): "healthy" | "warning" | "error" | "offline" {
  if (!printer.computerOnline) return "offline";
  const offlineStates = ["offline", "out_of_paper", "error"];
  if (offlineStates.includes(printer.printerState)) return "error";
  if (printer.lastJobState === "error" || printer.lastJobState === "expired") return "warning";
  return "healthy";
}

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.badgeVariant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function PrinterDiagnostics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [diagnosticResults, setDiagnosticResults] = useState<Map<number, DiagnosticResult>>(new Map());
  const [runningPrinters, setRunningPrinters] = useState<Set<number>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterOverview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (user?.role !== "super_admin") {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Printer diagnostics is only available to super admins.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<{ configured: boolean; printers: PrinterOverview[]; message?: string }>({
    queryKey: ["/api/admin/printers/overview"],
    refetchInterval: 60_000,
  });

  const printers = overviewData?.printers || [];
  const configured = overviewData?.configured !== false;

  const runDiagnostic = async (printerId: number) => {
    setRunningPrinters(prev => new Set(prev).add(printerId));
    try {
      const res = await apiRequest("GET", `/api/admin/printers/diagnostics/${printerId}`);
      const result: DiagnosticResult = await res.json();
      setDiagnosticResults(prev => {
        const next = new Map(prev);
        next.set(printerId, result);
        return next;
      });
    } catch (error: any) {
      toast({
        title: "Diagnostic failed",
        description: error.message || "Could not run diagnostic",
        variant: "destructive",
      });
    } finally {
      setRunningPrinters(prev => {
        const next = new Set(prev);
        next.delete(printerId);
        return next;
      });
    }
  };

  const runAllDiagnostics = async () => {
    setRunningAll(true);
    const allIds = new Set(printers.map(p => p.printerId));
    setRunningPrinters(allIds);

    try {
      const res = await apiRequest("GET", "/api/admin/printers/diagnostics");
      const data: { configured: boolean; results: DiagnosticResult[] } = await res.json();
      const newMap = new Map<number, DiagnosticResult>();
      for (const r of (data.results || [])) {
        newMap.set(r.printerId, r);
      }
      setDiagnosticResults(newMap);
      const errors = (data.results || []).filter(r => r.overallStatus === "error" || r.overallStatus === "offline").length;
      toast({
        title: "Diagnostics complete",
        description: errors > 0 ? `${errors} printer(s) need attention` : "All printers healthy",
        variant: errors > 0 ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({ title: "Diagnostics failed", description: error.message, variant: "destructive" });
    } finally {
      setRunningPrinters(new Set());
      setRunningAll(false);
    }
  };

  const handlePrinterClick = async (printer: PrinterOverview) => {
    setSelectedPrinter(printer);
    setSheetOpen(true);
    // Auto-run diagnostic when opening the sheet
    if (!diagnosticResults.has(printer.printerId)) {
      await runDiagnostic(printer.printerId);
    }
  };

  const selectedResult = selectedPrinter ? diagnosticResults.get(selectedPrinter.printerId) : null;
  const isSelectedRunning = selectedPrinter ? runningPrinters.has(selectedPrinter.printerId) : false;

  // Summary counts
  const statusCounts = { healthy: 0, warning: 0, error: 0, offline: 0 };
  for (const p of printers) {
    const s = diagnosticResults.get(p.printerId)?.overallStatus || getQuickStatus(p);
    statusCounts[s]++;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Stethoscope className="h-6 w-6" />
            Printer Diagnostics
          </h1>
          <p className="text-muted-foreground mt-1">Monitor printer health and diagnose issues</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={runAllDiagnostics} disabled={runningAll || printers.length === 0}>
            {runningAll ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Running...</>
            ) : (
              <><Stethoscope className="h-4 w-4 mr-1.5" />Run All Diagnostics</>
            )}
          </Button>
        </div>
      </div>

      {/* Status summary bar */}
      {printers.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{printers.length} printer{printers.length !== 1 ? "s" : ""}</span>
          {statusCounts.healthy > 0 && (
            <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />{statusCounts.healthy} healthy</span>
          )}
          {statusCounts.warning > 0 && (
            <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />{statusCounts.warning} warning</span>
          )}
          {statusCounts.error > 0 && (
            <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" />{statusCounts.error} error</span>
          )}
          {statusCounts.offline > 0 && (
            <span className="flex items-center gap-1 text-gray-500"><WifiOff className="h-3.5 w-3.5" />{statusCounts.offline} offline</span>
          )}
        </div>
      )}

      {/* Loading / Not configured states */}
      {overviewLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!overviewLoading && !configured && (
        <Alert>
          <Printer className="h-4 w-4" />
          <AlertTitle>PrintNode not configured</AlertTitle>
          <AlertDescription>Set the PRINTNODE_API_KEY environment variable to enable printer diagnostics.</AlertDescription>
        </Alert>
      )}

      {/* Printer cards grid */}
      {!overviewLoading && configured && printers.length === 0 && (
        <Alert>
          <Printer className="h-4 w-4" />
          <AlertTitle>No printers found</AlertTitle>
          <AlertDescription>No printers are registered with PrintNode. Install the PrintNode client on a venue computer and add a printer.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {printers.map(printer => {
          const quickStatus = diagnosticResults.get(printer.printerId)?.overallStatus || getQuickStatus(printer);
          const config = STATUS_CONFIG[quickStatus];

          return (
            <Card
              key={printer.printerId}
              className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handlePrinterClick(printer)}
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${config.color}`} />

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Printer className="h-4 w-4 text-muted-foreground" />
                      {printer.printerName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5">
                      <Monitor className="h-3 w-3" />
                      {printer.computerName}
                      <span className={`ml-1 inline-flex h-2 w-2 rounded-full ${printer.computerOnline ? "bg-green-500" : "bg-gray-400"}`} />
                    </CardDescription>
                  </div>
                  <StatusBadge status={quickStatus} />
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    <span>State:</span>
                    <span className="font-medium text-foreground capitalize">{printer.printerState}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last job:</span>
                    <span className="font-medium text-foreground">{formatTimeAgo(printer.lastJobTime)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Diagnostic detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        if (!open) {
          setSheetOpen(false);
          setSelectedPrinter(null);
        }
      }}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {selectedPrinter && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Printer className="h-5 w-5" />
                  {selectedPrinter.printerName}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  {selectedPrinter.computerName}
                  <span className={`ml-1 inline-flex h-2 w-2 rounded-full ${selectedPrinter.computerOnline ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className="ml-1">{selectedPrinter.computerOnline ? "Online" : "Offline"}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Quick Info */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Printer State</p>
                        <p className="font-medium capitalize">{selectedPrinter.printerState}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Job</p>
                        <p className="font-medium">{formatTimeAgo(selectedPrinter.lastJobTime)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Job State</p>
                        <p className="font-medium capitalize">{selectedPrinter.lastJobState || "None"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Printer ID</p>
                        <p className="font-medium font-mono text-xs">{selectedPrinter.printerId}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Run / Re-run diagnostic button */}
                <Button
                  className="w-full"
                  onClick={() => runDiagnostic(selectedPrinter.printerId)}
                  disabled={isSelectedRunning}
                >
                  {isSelectedRunning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Diagnostic...</>
                  ) : selectedResult ? (
                    <><RefreshCw className="h-4 w-4 mr-2" />Re-run Diagnostic</>
                  ) : (
                    <><Stethoscope className="h-4 w-4 mr-2" />Run Diagnostic</>
                  )}
                </Button>

                {/* Loading state */}
                {isSelectedRunning && !selectedResult && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Checking computer, printer, and recent jobs...</p>
                    </div>
                  </div>
                )}

                {/* Diagnostic results */}
                {selectedResult && (
                  <>
                    {/* Overall status */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Overall Status</span>
                      <StatusBadge status={selectedResult.overallStatus} />
                    </div>

                    {/* Recommendation */}
                    <Alert className={`border-l-4 ${
                      selectedResult.overallStatus === "healthy" ? "border-l-green-500 bg-green-50 dark:bg-green-900/20" :
                      selectedResult.overallStatus === "warning" ? "border-l-amber-500 bg-amber-50 dark:bg-amber-900/20" :
                      "border-l-red-500 bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <Lightbulb className="h-4 w-4" />
                      <AlertTitle className="text-base">Recommendation</AlertTitle>
                      <AlertDescription className="text-sm font-medium mt-1">
                        {selectedResult.recommendation}
                      </AlertDescription>
                    </Alert>

                    {/* Individual checks */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Diagnostic Checks</CardTitle>
                        <CardDescription className="text-xs">
                          Run at {new Date(selectedResult.timestamp).toLocaleTimeString()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {selectedResult.checks.map((check, i) => {
                          const { icon: Icon, color } = CHECK_STATUS_ICON[check.status];
                          return (
                            <div key={i} className="border-b last:border-b-0 py-3">
                              <div className="flex items-start gap-3">
                                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{check.name}</p>
                                  <p className="text-sm text-muted-foreground mt-0.5">{check.message}</p>
                                  {check.details && (
                                    <Collapsible>
                                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 cursor-pointer">
                                        <ChevronRight className="h-3 w-3" />
                                        View raw details
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap break-words">
                                          {JSON.stringify(check.details, null, 2)}
                                        </pre>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
