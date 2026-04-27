import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, UserCheck, WifiOff, Cloud, Printer } from "lucide-react";
import KioskBrandingHeader from "@/components/KioskBrandingHeader";
import { KioskProvider, useKiosk, type KioskModeProps } from "./kiosk/KioskContext";
import { KioskWelcomeStep } from "./kiosk/KioskWelcomeStep";
import { KioskScanningStep } from "./kiosk/KioskScanningStep";
import { KioskResultsStep } from "./kiosk/KioskResultsStep";
import { KioskVerifyStep } from "./kiosk/KioskVerifyStep";
import { KioskWalkinStep } from "./kiosk/KioskWalkinStep";
import { KioskGroupStep } from "./kiosk/KioskGroupStep";
import { KioskWorkflowStep } from "./kiosk/KioskWorkflowStep";
import { KioskSuccessStep } from "./kiosk/KioskSuccessStep";
import { KioskPrintingStep } from "./kiosk/KioskPrintingStep";
import { KioskErrorStep } from "./kiosk/KioskErrorStep";
import { KioskStatusBar } from "./kiosk/KioskStatusBar";
import { KioskOverlays } from "./kiosk/KioskOverlays";

function KioskModeInner() {
  const {
    step,
    eventId,
    eventName,
    branding,
    selectedPrinter,
    isOnline,
    pendingSyncCount,
    checkedInCount,
    totalCount,
    handleLogoTap,
    lastScanned,
    workflowAttendee,
    kioskWorkflow,
    groupCheckin,
  } = useKiosk();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <KioskBrandingHeader
            branding={branding}
            eventName={eventName || "Self Check-In"}
            onLogoTap={handleLogoTap}
            fallbackIcon={<QrCode className="h-8 w-8 text-primary-foreground" />}
          >
            {eventId && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Badge variant="secondary" data-testid="badge-checkin-count">
                  <UserCheck className="h-3 w-3 mr-1" />
                  {checkedInCount} / {totalCount} checked in
                </Badge>
                {!isOnline && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-offline">
                    <WifiOff className="h-3 w-3 mr-1" />
                    Offline Mode
                  </Badge>
                )}
                {pendingSyncCount > 0 && (
                  <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400" data-testid="badge-pending-sync">
                    <Cloud className="h-3 w-3 mr-1" />
                    {pendingSyncCount} pending sync
                  </Badge>
                )}
                {selectedPrinter?.type === 'printnode' && (
                  <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400" data-testid="badge-printer">
                    <Printer className="h-3 w-3 mr-1" />
                    {selectedPrinter.printerName || 'Cloud Printer'}
                  </Badge>
                )}
              </div>
            )}
          </KioskBrandingHeader>

          <Card className="border-2">
            <CardContent className="p-12">
              {step === "welcome" && <KioskWelcomeStep />}
              {step === "scanning" && <KioskScanningStep />}
              {step === "results" && <KioskResultsStep />}
              {step === "verify" && <KioskVerifyStep />}
              {step === "walkin" && <KioskWalkinStep />}
              {step === "group" && groupCheckin.isGroupFound && <KioskGroupStep />}
              {step === "workflow" && workflowAttendee && kioskWorkflow && <KioskWorkflowStep />}
              {step === "success" && lastScanned && <KioskSuccessStep />}
              {step === "printing" && <KioskPrintingStep />}
              {step === "error" && <KioskErrorStep />}
            </CardContent>
          </Card>

          <div className="text-center mt-6 text-sm text-muted-foreground">
            Need help? Contact event staff
          </div>
        </div>
      </div>

      <KioskStatusBar />
      <KioskOverlays />
    </div>
  );
}

export default function KioskMode(props: KioskModeProps) {
  return (
    <KioskProvider {...props}>
      <KioskModeInner />
    </KioskProvider>
  );
}
