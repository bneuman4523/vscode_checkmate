import { useKiosk } from "./KioskContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export function KioskExitDialog() {
  const { showExitDialog, setShowExitDialog, enteredPin, setEnteredPin, pinError, setPinError, handleExitAttempt, kioskSettings } = useKiosk();

  return (
    <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Exit Kiosk Mode
          </DialogTitle>
          <DialogDescription>
            Enter the exit PIN to unlock and exit kiosk mode.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter PIN"
            value={enteredPin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setEnteredPin(val);
              setPinError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleExitAttempt()}
            className="text-center text-2xl tracking-widest"
            maxLength={8}
            autoFocus
            data-testid="input-exit-pin-dialog"
          />
          {pinError && (
            <p className="text-sm text-destructive text-center">{pinError}</p>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowExitDialog(false);
                setEnteredPin("");
                setPinError("");
                if (kioskSettings?.enableFullscreen !== false && !document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleExitAttempt}
              disabled={!enteredPin}
              data-testid="button-confirm-exit"
            >
              Unlock & Exit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
