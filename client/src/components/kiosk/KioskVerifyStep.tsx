import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, XCircle, ArrowLeft } from "lucide-react";

export function KioskVerifyStep() {
  const { verifyEmail, setVerifyEmail, verifyError, setVerifyError, handleVerifyEmail, setStep } = useKiosk();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-2">
          <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-2xl font-semibold">Verify Your Identity</h2>
        <p className="text-muted-foreground">
          We found multiple registrations matching your search. Please enter the email address you registered with.
        </p>
      </div>

      <div className="space-y-3">
        <Input
          type="email"
          placeholder="Enter your email address..."
          value={verifyEmail}
          onChange={(e) => { setVerifyEmail(e.target.value); setVerifyError(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleVerifyEmail()}
          className="h-14 text-lg"
          autoFocus
          data-testid="input-kiosk-verify-email"
        />
        <Button
          size="lg"
          className="w-full h-14 text-lg"
          onClick={handleVerifyEmail}
          disabled={!verifyEmail.trim()}
          data-testid="button-kiosk-verify"
        >
          Verify & Check In
        </Button>
      </div>

      {verifyError && (
        <div className="flex items-center justify-center gap-2 text-destructive">
          <XCircle className="h-5 w-5" />
          <span>{verifyError}</span>
        </div>
      )}

      <div className="text-center pt-2">
        <Button variant="outline" onClick={() => { setStep("scanning"); setVerifyEmail(""); setVerifyError(null); }}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Search
        </Button>
      </div>
    </div>
  );
}
