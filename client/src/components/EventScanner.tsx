import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  QrCode, 
  Search, 
  UserCheck, 
  CheckCircle,
  XCircle,
  Camera,
  CameraOff,
  Keyboard,
  Undo2
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Attendee } from "@shared/schema";
import BadgeAIChat from "@/components/BadgeAIChat";
import QRScanner from "@/components/QRScanner";
import { parseQrCode } from "@/lib/qr-parser";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";

interface EventScannerProps {
  eventId: string;
}

export default function EventScanner({ eventId }: EventScannerProps) {
  const [scanMode, setScanMode] = useState<"camera" | "manual">("manual");
  const [manualInput, setManualInput] = useState("");
  const [lastScanned, setLastScanned] = useState<Attendee | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();

  const { data: attendees = [], isLoading } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      return apiRequest("POST", `/api/attendees/${attendeeId}/checkin`);
    },
    onSuccess: (_, attendeeId) => {
      trackComplete("check_in", "confirm");
      const attendee = attendees.find(a => a.id === attendeeId);
      if (attendee) {
        setLastScanned({ ...attendee, checkedIn: true });
      }
      setScanError(null);
      setSearchResults(prev => prev.map(a => a.id === attendeeId ? { ...a, checkedIn: true } : a));
      queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
    },
    onError: (error: Error) => {
      trackAbandon("check_in", "confirm");
      setScanError(error.message);
      setLastScanned(null);
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      return apiRequest("DELETE", `/api/attendees/${attendeeId}/checkin`);
    },
    onSuccess: (_, attendeeId) => {
      trackComplete("check_in", "revert");
      const attendee = attendees.find(a => a.id === attendeeId);
      if (attendee) {
        setLastScanned({ ...attendee, checkedIn: false });
      }
      setScanError(null);
      setSearchResults(prev => prev.map(a => a.id === attendeeId ? { ...a, checkedIn: false } : a));
      queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
    },
    onError: (error: Error) => {
      setScanError(error.message);
    },
  });

  const handleManualSearch = () => {
    if (!manualInput.trim()) return;

    trackStart("check_in", "search");
    const searchLower = manualInput.toLowerCase().trim();
    
    // Find all matching attendees
    const matches = attendees.filter(a => 
      a.id === manualInput ||
      a.email.toLowerCase() === searchLower ||
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower)
    );

    if (matches.length === 0) {
      setScanError("Attendee not found");
      setLastScanned(null);
      setSearchResults([]);
    } else {
      setSearchResults(matches);
      setScanError(null);
      setLastScanned(null);
    }
  };

  const handleQRScan = useCallback((code: string) => {
    const result = parseQrCode(code, attendees);

    if (result.type === "found" && result.attendee) {
      const found = result.attendee;
      setSearchResults([]);
      if (found.checkedIn) {
        setLastScanned(found);
        setScanError("Attendee already checked in");
      } else {
        setSearchResults([found]);
        setScanError(null);
        setLastScanned(null);
      }
    } else {
      setScanError(`No attendee found for scanned code`);
      setLastScanned(null);
      setSearchResults([]);
    }
  }, [attendees]);

  const handleSelectAttendee = (attendee: Attendee) => {
    setSearchResults([]);
    setManualInput("");
    if (attendee.checkedIn) {
      setLastScanned(attendee);
      setScanError("Attendee already checked in");
    } else {
      checkInMutation.mutate(attendee.id);
    }
  };

  const checkedInCount = attendees.filter(a => a.checkedIn).length;
  const pendingCount = attendees.filter(a => !a.checkedIn).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-event-scanner">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedInCount}</div>
            <p className="text-xs text-muted-foreground">of {attendees.length} attendees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">awaiting check-in</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-in Rate</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {attendees.length > 0 ? Math.round((checkedInCount / attendees.length) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check-In</CardTitle>
          <CardDescription>Choose a mode and check in attendees</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Button
              variant={scanMode === "camera" ? "default" : "outline"}
              className="flex-1"
              onClick={() => {
                trackStart("check_in", "scan");
                setScanMode("camera");
              }}
              data-testid="button-camera-mode"
            >
              <Camera className="h-4 w-4 mr-2" />
              Camera Scan
            </Button>
            <Button
              variant={scanMode === "manual" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setScanMode("manual")}
              data-testid="button-manual-mode"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Manual Entry
            </Button>
          </div>

          {scanMode === "camera" ? (
            <QRScanner 
              onScan={handleQRScan}
              autoStart={true}
              showHeader={false}
              facingMode="environment"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter name, email, or scan barcode..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                  data-testid="input-manual-search"
                />
                <Button 
                  onClick={handleManualSearch}
                  disabled={!manualInput.trim() || checkInMutation.isPending}
                  data-testid="button-search-checkin"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
              <div className="px-3 py-2 bg-muted text-sm font-medium sticky top-0">
                {scanMode === "camera" ? "Scanned attendee — confirm to check in:" : `${searchResults.length} matches found - select one to check in:`}
              </div>
              {searchResults.map((attendee) => (
                <div
                  key={attendee.id}
                  className="px-4 py-3 hover:bg-accent flex items-center justify-between gap-4"
                >
                  <div 
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleSelectAttendee(attendee)}
                  >
                    <div className="font-medium">
                      {attendee.firstName} {attendee.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {attendee.email}
                      {attendee.company && ` - ${attendee.company}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-xs">{attendee.participantType}</Badge>
                    {attendee.checkedIn ? (
                      <>
                        <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Checked In
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            revertMutation.mutate(attendee.id);
                          }}
                          disabled={revertMutation.isPending}
                        >
                          <Undo2 className="h-3 w-3 mr-1" />
                          Revert
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkInMutation.mutate(attendee.id);
                        }}
                        disabled={checkInMutation.isPending}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Check In
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(lastScanned || scanError) && (
            <>
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Last Check-In Result</h4>
                
                {scanError && !lastScanned && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <XCircle className="h-8 w-8 text-destructive flex-shrink-0" />
                    <p className="font-medium text-destructive">{scanError}</p>
                  </div>
                )}

                {lastScanned && (
                  <div className={`p-4 rounded-lg ${lastScanned.checkedIn && !scanError ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-lg">
                        {lastScanned.firstName} {lastScanned.lastName}
                      </span>
                      {lastScanned.checkedIn && !scanError ? (
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      ) : (
                        <XCircle className="h-6 w-6 text-yellow-600" />
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>{lastScanned.email}</p>
                      {lastScanned.company && <p>{lastScanned.company}</p>}
                      <Badge variant="outline">{lastScanned.participantType}</Badge>
                    </div>
                    {scanError && (
                      <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">{scanError}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {!lastScanned && !scanError && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center border-t">
              <QrCode className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Scan or search for an attendee to check them in</p>
            </div>
          )}
        </CardContent>
      </Card>

      <BadgeAIChat eventId={eventId} compact={true} />
    </div>
  );
}
