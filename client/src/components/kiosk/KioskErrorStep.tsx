import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { XCircle, RefreshCw } from "lucide-react";

export function KioskErrorStep() {
  const { securityError, onExit, setStep, staffToken, eventId, scopedCustomerId } = useKiosk();

  return (
    <div className="text-center space-y-6">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mb-2">
        <XCircle className="h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold text-destructive">
          {securityError?.includes('Access denied') ? 'Security Error' :
           securityError?.includes('session has expired') ? 'Session Expired' : 'Error'}
        </h2>
        <p className="text-lg text-muted-foreground">
          {securityError || "An error occurred"}
        </p>
      </div>
      <div className="flex flex-col gap-3 items-center">
        {!securityError?.includes('Access denied') && (
          <Button
            size="lg"
            className="h-14 w-64"
            onClick={() => {
              setStep("welcome");
              queryClient.invalidateQueries({ queryKey: staffToken ? [`/api/staff/event-for-kiosk`] : [`/api/events/${eventId}/scoped?customerId=${scopedCustomerId}`] });
            }}
            data-testid="button-kiosk-retry-error"
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            Try Again
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          className="h-14 w-64"
          onClick={onExit}
          data-testid="button-kiosk-exit-error"
        >
          Exit Kiosk Mode
        </Button>
      </div>
    </div>
  );
}
