import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, UserCheck } from "lucide-react";

export function KioskResultsStep() {
  const { searchResults, handleSelectResult, checkInMutation, setStep } = useKiosk();

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Multiple Results Found</h2>
        <p className="text-muted-foreground">
          {searchResults.length > 0
            ? `We found ${searchResults.length} matches. Please select your name below.`
            : "No results to display."}
        </p>
      </div>
      {searchResults.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {searchResults.map((attendee) => {
            const uniqueId = ('externalId' in attendee && attendee.externalId)
              || ('registrationCode' in attendee && (attendee as any).registrationCode)
              || null;
            return (
              <button
                key={attendee.id}
                onClick={() => handleSelectResult(attendee)}
                className="w-full text-left p-4 rounded-lg border hover:bg-accent hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={checkInMutation.isPending}
                data-testid={`button-select-result-${attendee.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">
                      {attendee.lastName}, {attendee.firstName}
                    </p>
                    {attendee.email && (
                      <p className="text-sm text-muted-foreground">{attendee.email}</p>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {uniqueId && (
                        <span>Reg Code: <span className="font-mono">{uniqueId}</span></span>
                      )}
                      {attendee.company && (
                        <span>{attendee.company}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {attendee.checkedIn ? (
                      <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                        Checked In
                      </Badge>
                    ) : (
                      <UserCheck className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-center pt-2">
        <Button variant="outline" onClick={() => { setStep("scanning"); }} data-testid="button-results-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Search
        </Button>
      </div>
    </div>
  );
}
