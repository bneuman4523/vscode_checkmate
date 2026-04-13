import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  Clock, 
  MapPin, 
  UserCheck, 
  User, 
  Search, 
  ScanLine, 
  XCircle,
  CheckCircle,
  Loader2 
} from "lucide-react";
import { format } from "date-fns";
import StaffQRScanner from "@/components/StaffQRScanner";
import type { Attendee, Session, SessionRegistration } from "../../types";

interface SessionDetailProps {
  session: Session;
  attendees: Attendee[];
  registrations: SessionRegistration[];
  filteredRegistrations: SessionRegistration[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  scanMode: boolean;
  onToggleScanMode: () => void;
  isLoading: boolean;
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  onBack: () => void;
  onSessionCheckin: (sessionId: string, attendeeId: string) => void;
  onSessionCheckout: (sessionId: string, attendeeId: string) => void;
  onQRScanFound: (attendee: Attendee) => void;
}

/**
 * Detailed view of a selected session with attendee registrations.
 * 
 * Why: Session detail has distinct layout and interaction patterns from
 * the session list, including registration-level check-in and QR scanning.
 */
export function SessionDetail({
  session,
  attendees,
  registrations,
  filteredRegistrations,
  searchTerm,
  onSearchChange,
  scanMode,
  onToggleScanMode,
  isLoading,
  isCheckingIn,
  isCheckingOut,
  onBack,
  onSessionCheckin,
  onSessionCheckout,
  onQRScanFound,
}: SessionDetailProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          data-testid="button-back-to-sessions"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1 text-center">
          <div className="font-medium truncate">{session.name}</div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-2">
            {session.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(session.startTime), "p")}
                {session.endTime && ` - ${format(new Date(session.endTime), "p")}`}
              </span>
            )}
            {session.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {session.location}
              </span>
            )}
          </div>
        </div>
        <Badge variant="outline" className="flex-shrink-0">
          <UserCheck className="h-3 w-3 mr-1" />
          {session.checkedInCount}{session.capacity ? `/${session.capacity}` : ""}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={scanMode ? "default" : "outline"}
          size="sm"
          onClick={onToggleScanMode}
          className="flex-shrink-0"
          data-testid="button-toggle-session-scan"
        >
          {scanMode ? (
            <>
              <XCircle className="h-4 w-4 mr-1" />
              List
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4 mr-1" />
              Scan
            </>
          )}
        </Button>
        {!scanMode && (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search attendees..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-search-session-attendees"
            />
          </div>
        )}
      </div>

      {scanMode ? (
        <StaffQRScanner
          attendees={attendees}
          onAttendeeFound={onQRScanFound}
          onCheckIn={() => {}}
          isCheckingIn={isCheckingIn || isCheckingOut}
        />
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : registrations.length === 0 ? (
        <Alert>
          <AlertDescription>
            No attendees are registered for this session.
            {!session.restrictToRegistered && " You can still check in any event attendee using the scanner."}
          </AlertDescription>
        </Alert>
      ) : (
        <ScrollArea className="h-[calc(100vh-550px)]">
          <div className="space-y-2">
            {filteredRegistrations.map((reg) => (
              <Card 
                key={reg.registrationId}
                className={reg.sessionCheckedIn ? "opacity-60" : ""}
                data-testid={`card-session-registration-${reg.registrationId}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">
                          {reg.attendee.firstName} {reg.attendee.lastName}
                        </span>
                        <Badge variant="outline" className="flex-shrink-0 text-xs">
                          {reg.attendee.participantType}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {reg.attendee.company || reg.attendee.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {reg.sessionCheckedIn ? (
                        <Badge variant="default" className="bg-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Checked In
                        </Badge>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onSessionCheckin(session.id, reg.attendee.id)}
                          disabled={isCheckingIn}
                          data-testid={`button-session-checkin-${reg.attendee.id}`}
                        >
                          {isCheckingIn ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredRegistrations.length === 0 && searchTerm && (
              <Alert>
                <AlertDescription>
                  No registered attendees found matching "{searchTerm}"
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
