import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Users, Printer } from "lucide-react";

export function KioskSuccessStep() {
  const { lastScanned, groupCheckedInMembers, scanError, handlePrintBadge, handleReset, templates } = useKiosk();

  if (!lastScanned) return null;

  return (
    <div className="text-center space-y-6" role="status" aria-live="polite">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-2">
        <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold" data-testid="text-kiosk-welcome">
          {groupCheckedInMembers.length > 1
            ? `Welcome, ${lastScanned.firstName} & Party!`
            : `Welcome, ${lastScanned.firstName}!`}
        </h2>
        {groupCheckedInMembers.length > 1 && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{groupCheckedInMembers.length} checked in</span>
          </div>
        )}
        {scanError === "Already checked in" ? (
          <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-base px-4 py-1">
            Already Checked In
          </Badge>
        ) : (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 text-base px-4 py-1">
            Successfully Checked In
          </Badge>
        )}
        {lastScanned.email && (
          <p className="text-sm text-muted-foreground">{lastScanned.email}</p>
        )}
        {lastScanned.company && (
          <p className="text-muted-foreground">{lastScanned.company}</p>
        )}
        {lastScanned.externalId && (
          <p className="text-xs text-muted-foreground">Reg Code: <span className="font-mono">{lastScanned.externalId}</span></p>
        )}
      </div>
      <div className="space-y-3 pt-4">
        <Button
          size="lg"
          className="h-16 px-12 text-xl w-full"
          onClick={handlePrintBadge}
          disabled={templates.length === 0}
          data-testid="button-kiosk-print"
        >
          <Printer className="h-6 w-6 mr-3" aria-hidden="true" />
          {groupCheckedInMembers.length > 1
            ? `Print ${groupCheckedInMembers.length} Badges`
            : "Print My Badge"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 px-12 text-xl w-full"
          onClick={handleReset}
          data-testid="button-kiosk-skip"
        >
          Skip (I have my badge)
        </Button>
      </div>
    </div>
  );
}
