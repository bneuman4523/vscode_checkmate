import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import QRScanner from "@/components/QRScanner";
import {
  Camera,
  Keyboard,
  Search,
  XCircle,
  ArrowLeft,
  UserPlus,
} from "lucide-react";

export function KioskScanningStep() {
  const {
    handleQRScan,
    manualInput,
    setManualInput,
    handleManualSearch,
    scanError,
    setScanError,
    checkInMutation,
    event,
    handleReset,
    setStep,
    setWalkinForm,
    setWalkinError,
  } = useKiosk();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-semibold">Find Your Registration</h2>
        <p className="text-lg text-muted-foreground">
          Scan your QR code or enter your information
        </p>
      </div>

      <Tabs defaultValue="qr" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 h-14 p-1.5 rounded-lg">
          <TabsTrigger value="qr" className="h-full text-base rounded-md" data-testid="tab-kiosk-qr" aria-label="Scan QR Code">
            <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
            Scan QR Code
          </TabsTrigger>
          <TabsTrigger value="manual" className="h-full text-base rounded-md" data-testid="tab-kiosk-manual" aria-label="Type Information">
            <Keyboard className="h-5 w-5 mr-2" aria-hidden="true" />
            Type Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qr" className="space-y-4 mt-0 pt-4">
          <div className="max-w-md mx-auto kiosk-scanner-container">
            <QRScanner
              onScan={handleQRScan}
              autoStart={true}
              showHeader={false}
              compact={true}
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Position your badge QR code in front of the camera
          </p>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4 mt-0 pt-4">
          <div className="flex gap-2">
            <label htmlFor="kiosk-manual-search" className="sr-only">Name or email</label>
            <Input
              id="kiosk-manual-search"
              placeholder="Enter your full name or email exactly as registered..."
              value={manualInput}
              onChange={(e) => {
                setManualInput(e.target.value);
                setScanError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              className="h-14 text-lg"
              autoFocus
              aria-describedby={scanError ? "scan-error" : undefined}
              data-testid="input-kiosk-search"
            />
            <Button
              size="lg"
              className="h-14 px-6"
              onClick={handleManualSearch}
              disabled={!manualInput.trim() || checkInMutation.isPending}
              data-testid="button-kiosk-search"
            >
              <Search className="h-5 w-5 mr-2" aria-hidden="true" />
              Search
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Enter your name or email exactly as it appears on your registration
          </p>
        </TabsContent>
      </Tabs>

      {scanError && (
        <div id="scan-error" role="alert" className="flex items-center justify-center gap-2 text-destructive">
          <XCircle className="h-5 w-5" aria-hidden="true" />
          <span>{scanError}</span>
        </div>
      )}

      {checkInMutation.isPending && (
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span>Checking in...</span>
        </div>
      )}

      {event?.tempStaffSettings?.allowKioskWalkins && (
        <div className="text-center pt-2">
          <Button
            variant="secondary"
            size="lg"
            className="h-12 px-8"
            onClick={() => {
              setWalkinForm({});
              setWalkinError(null);
              setStep("walkin");
            }}
            data-testid="button-kiosk-walkin"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Not registered? Sign up here
          </Button>
        </div>
      )}

      <div className="text-center pt-4">
        <Button variant="outline" onClick={handleReset} data-testid="button-kiosk-cancel">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
