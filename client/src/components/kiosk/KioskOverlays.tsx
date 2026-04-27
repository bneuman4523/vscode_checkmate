import { useKiosk } from "./KioskContext";
import { KioskExitDialog } from "./KioskExitDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import BadgeAIChat from "@/components/BadgeAIChat";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import { RefreshCw, Download } from "lucide-react";

export function KioskOverlays() {
  const {
    isPreCaching,
    preCacheProgress,
    showKioskWarning,
    kioskRemaining,
    kioskStayActive,
    eventId,
    isLocked,
    isOnline,
    isCached,
    handlePreCache,
  } = useKiosk();

  return (
    <>
      {!isLocked && isOnline && !isCached && eventId && (
        <div className="fixed bottom-4 left-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePreCache()}
            disabled={isPreCaching}
            className="bg-background/80 backdrop-blur"
            data-testid="button-precache"
          >
            {isPreCaching ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Caching...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Enable Offline Mode
              </>
            )}
          </Button>
        </div>
      )}

      {isPreCaching && preCacheProgress && (
        <Dialog open={true}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Preparing Offline Mode</DialogTitle>
              <DialogDescription>
                Downloading data for offline check-in...
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{preCacheProgress.message}</span>
                  <span>{preCacheProgress.current} / {preCacheProgress.total}</span>
                </div>
                <Progress
                  value={(preCacheProgress.current / preCacheProgress.total) * 100}
                  className="h-2"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <KioskExitDialog />

      {eventId && <BadgeAIChat eventId={eventId} compact={true} />}

      <IdleTimeoutDialog
        open={showKioskWarning}
        remainingSeconds={kioskRemaining}
        onStayActive={kioskStayActive}
      />
    </>
  );
}
