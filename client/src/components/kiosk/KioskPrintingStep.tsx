import { useKiosk } from "./KioskContext";
import { Printer } from "lucide-react";

export function KioskPrintingStep() {
  const { groupCheckedInMembers, groupPrintIndex } = useKiosk();

  return (
    <div className="text-center space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold">
          {groupCheckedInMembers.length > 1
            ? `Printing ${groupCheckedInMembers.length} Badges...`
            : "Printing Your Badge..."}
        </h2>
        <p className="text-lg text-muted-foreground">
          Please wait, this will only take a moment
        </p>
      </div>
      <div className="flex items-center justify-center">
        <Printer className="h-24 w-24 text-primary animate-pulse" />
      </div>
      {groupCheckedInMembers.length > 1 && groupPrintIndex > 0 ? (
        <p className="text-sm text-muted-foreground">
          Printing badge {groupPrintIndex} of {groupCheckedInMembers.length}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your badge will be ready shortly
        </p>
      )}
    </div>
  );
}
