import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { QrCode, LogOut } from "lucide-react";

export function KioskWelcomeStep() {
  const { handleStartCheckIn, isLocked, exitPin, setShowExitDialog, setEnteredPin, setPinError } = useKiosk();
  return (
    <div className="text-center space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold">Welcome!</h2>
        <p className="text-lg text-muted-foreground">
          Tap below to start your check-in
        </p>
      </div>
      <Button
        size="lg"
        className="h-20 px-12 text-xl"
        onClick={handleStartCheckIn}
        data-testid="button-kiosk-start"
      >
        <QrCode className="h-6 w-6 mr-3" />
        Start Check-In
      </Button>
      {isLocked && exitPin && (
        <div className="pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowExitDialog(true);
              setEnteredPin("");
              setPinError("");
            }}
            data-testid="button-exit-kiosk"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Exit Kiosk Mode
          </Button>
        </div>
      )}
    </div>
  );
}
