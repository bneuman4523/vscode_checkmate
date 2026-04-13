import { AlertTriangle, RefreshCw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrinterOfflineAlertProps {
  printerName: string;
  onRetry: () => void;
  onChangePrinter: () => void;
  onDismiss?: () => void;
}

export default function PrinterOfflineAlert({
  printerName,
  onRetry,
  onChangePrinter,
  onDismiss,
}: PrinterOfflineAlertProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium">{printerName}</span> is offline
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onChangePrinter}>
          <Printer className="h-3 w-3 mr-1" />
          Change
        </Button>
        {onDismiss && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
