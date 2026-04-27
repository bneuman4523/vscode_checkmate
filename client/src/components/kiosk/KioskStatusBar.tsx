import { useKiosk } from "./KioskContext";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, CloudOff, Lock, Printer } from "lucide-react";

export function KioskStatusBar() {
  const { isLocked, isOnline, isCached, selectedPrinter } = useKiosk();

  if (!isLocked) return null;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2">
      {isOnline ? (
        <Badge variant="outline" className="bg-background/80 backdrop-blur border-green-500 text-green-600 dark:text-green-400">
          <Wifi className="h-3 w-3 mr-1" />
          Online
        </Badge>
      ) : (
        <Badge variant="outline" className="bg-background/80 backdrop-blur border-amber-500 text-amber-600 dark:text-amber-400">
          <WifiOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      )}
      {isCached && (
        <Badge variant="outline" className="bg-background/80 backdrop-blur border-blue-500 text-blue-600 dark:text-blue-400">
          <CloudOff className="h-3 w-3 mr-1" />
          Cached
        </Badge>
      )}
      <Badge variant="outline" className="bg-background/80 backdrop-blur">
        <Lock className="h-3 w-3 mr-1" />
        Kiosk Mode
      </Badge>
    </div>
  );
}
