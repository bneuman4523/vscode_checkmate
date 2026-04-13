import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { stripHtml } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Monitor, 
  Lock, 
  Calendar, 
  Users, 
  ChevronRight,
  Shield,
  Maximize,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Clock,
  ArrowLeft,
  CalendarCheck,
  Loader2
} from "lucide-react";
import type { Event, Customer, Session } from "@shared/schema";

interface SessionKioskLauncherProps {
  customerId: string;
  onLaunch: (sessionId: string, eventId: string, sessionName: string, eventName: string, exitPin: string) => void;
  onBack?: () => void;
  preselectedEventId?: string;
}

export default function SessionKioskLauncher({ customerId, onLaunch, onBack, preselectedEventId }: SessionKioskLauncherProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [exitPin, setExitPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"select-event" | "select-session" | "configure">(preselectedEventId ? "select-session" : "select-event");
  const [pinError, setPinError] = useState("");
  const [eventPreselected, setEventPreselected] = useState(false);
  const [existingPin, setExistingPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const fetchKioskPin = async (eventId: string) => {
    setPinLoading(true);
    try {
      const response = await fetch(`/api/events/${eventId}/kiosk-pin`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.hasPin && data.pin) {
          setExistingPin(data.pin);
          setExitPin(data.pin);
        } else {
          setExistingPin(null);
        }
      }
    } catch (error) {
      console.error('[SessionKioskLauncher] Failed to fetch kiosk pin:', error);
    } finally {
      setPinLoading(false);
    }
  };

  const saveKioskPin = async (pin: string) => {
    if (!selectedEvent) return false;
    setSavingPin(true);
    try {
      const response = await fetch(`/api/events/${selectedEvent.id}/kiosk-pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        setExistingPin(pin);
        setIsChangingPin(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SessionKioskLauncher] Failed to save kiosk pin:', error);
      return false;
    } finally {
      setSavingPin(false);
    }
  };

  const { data: customer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/customers/${customerId}`, { credentials: 'include' });
        if (!res.ok) return { id: customerId, name: '' } as Customer;
        return res.json();
      } catch {
        return { id: customerId, name: '' } as Customer;
      }
    },
    enabled: !!customerId,
    retry: false,
  });

  const { data: customerEvents = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: [`/api/kiosk/${customerId}/events`],
    enabled: !!customerId,
    retry: 2,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: [`/api/kiosk/${selectedEvent?.id}/sessions`],
    queryFn: async () => {
      const res = await fetch(`/api/kiosk/${selectedEvent!.id}/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!selectedEvent?.id,
  });

  useEffect(() => {
    if (preselectedEventId && customerEvents.length > 0 && !eventPreselected) {
      const event = customerEvents.find(e => e.id === preselectedEventId);
      if (event) {
        setSelectedEvent(event);
        setStep("select-session");
        setEventPreselected(true);
      }
    }
  }, [preselectedEventId, customerEvents, eventPreselected]);

  const activeEvents = customerEvents.filter(e => e.status === "active" || e.status === "upcoming");
  const activeSessions = sessions.filter(s => s.status === "active");

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setStep("select-session");
  };

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setStep("configure");
    setExitPin("");
    setConfirmPin("");
    setPinError("");
    setIsChangingPin(false);
    if (selectedEvent) {
      fetchKioskPin(selectedEvent.id);
    }
  };

  const handleBackToEvents = () => {
    setStep("select-event");
    setSelectedEvent(null);
    setSelectedSession(null);
    setExistingPin(null);
    setIsChangingPin(false);
  };

  const handleBackToSessions = () => {
    setStep("select-session");
    setSelectedSession(null);
    setExitPin("");
    setConfirmPin("");
    setPinError("");
    setExistingPin(null);
    setIsChangingPin(false);
  };

  const handleLaunchKiosk = async () => {
    if (existingPin && !isChangingPin) {
      if (selectedSession && selectedEvent) {
        onLaunch(selectedSession.id, selectedEvent.id, selectedSession.name, selectedEvent.name, existingPin);
      }
      return;
    }

    if (exitPin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    if (exitPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    if (!/^\d+$/.test(exitPin)) {
      setPinError("PIN must contain only numbers");
      return;
    }

    const saved = await saveKioskPin(exitPin);
    if (saved) {
      if (selectedSession && selectedEvent) {
        onLaunch(selectedSession.id, selectedEvent.id, selectedSession.name, selectedEvent.name, exitPin);
      }
    } else {
      setPinError("Failed to save PIN. Please try again.");
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isLoading = customerLoading || eventsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="text-center space-y-4">
            <Skeleton className="h-16 w-16 rounded-full mx-auto" />
            <Skeleton className="h-10 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {step === "select-event" && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
                <CalendarCheck className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-4xl font-semibold mb-2">Session Check-In Kiosk</h1>
              <p className="text-lg text-muted-foreground">
                Select an event to view its sessions
              </p>
            </div>

            {onBack && (
              <div className="mb-4">
                <Button variant="ghost" onClick={onBack} data-testid="button-back-kiosk-type">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Kiosk Type Selection
                </Button>
              </div>
            )}

            {activeEvents.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-12 text-center">
                  <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-medium mb-2">No Active Events</h3>
                  <p className="text-muted-foreground mb-4">
                    There are no active or upcoming events with sessions available.
                  </p>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeEvents.map((event) => (
                  <Card
                    key={event.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => handleSelectEvent(event)}
                    data-testid={`card-event-${event.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {event.name}
                          </CardTitle>
                          <CardDescription className="truncate">
                            {customer?.name || ""}
                          </CardDescription>
                        </div>
                        <Badge variant={event.status === "active" ? "default" : "secondary"}>
                          {event.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(event.eventDate)}</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {step === "select-session" && selectedEvent && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
                <Clock className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-4xl font-semibold mb-2">Select Session</h1>
              <p className="text-lg text-muted-foreground">
                Choose a session from {selectedEvent.name}
              </p>
            </div>

            <div className="mb-4">
              <Button variant="ghost" onClick={handleBackToEvents} data-testid="button-back-to-events">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Events
              </Button>
            </div>

            {sessionsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            ) : activeSessions.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-12 text-center">
                  <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-medium mb-2">No Active Sessions</h3>
                  <p className="text-muted-foreground">
                    There are no active sessions for this event.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeSessions.map((session) => (
                  <Card
                    key={session.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => handleSelectSession(session)}
                    data-testid={`card-session-${session.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {session.name}
                          </CardTitle>
                          {session.description && (
                            <CardDescription className="truncate">
                              {stripHtml(session.description)}
                            </CardDescription>
                          )}
                        </div>
                        {session.restrictToRegistered && (
                          <Badge variant="outline" className="text-amber-600 border-amber-500">
                            <Lock className="h-3 w-3 mr-1" />
                            Registered Only
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {session.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            <span>{session.location}</span>
                          </div>
                        )}
                        {session.startTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatTime(session.startTime)}
                              {session.endTime && ` - ${formatTime(session.endTime)}`}
                            </span>
                          </div>
                        )}
                        {session.capacity && (
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>Capacity: {session.capacity}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {step === "configure" && selectedSession && selectedEvent && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
                <Lock className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-4xl font-semibold mb-2">Configure Kiosk</h1>
              <p className="text-lg text-muted-foreground">
                Set up security for {selectedSession.name}
              </p>
            </div>

            <Card className="border-2 max-w-md mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Exit PIN
                </CardTitle>
                <CardDescription>
                  {existingPin && !isChangingPin
                    ? "This event already has an exit PIN. All kiosk devices use the same PIN."
                    : "Set a PIN to exit kiosk mode. This PIN is shared across all devices for this event."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">{selectedSession.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedEvent.name}</p>
                  {selectedSession.location && (
                    <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {selectedSession.location}
                    </div>
                  )}
                </div>

                {pinLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Loading PIN settings...</span>
                  </div>
                ) : existingPin && !isChangingPin ? (
                  <>
                    <div className="p-4 bg-muted/50 rounded-lg text-center space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">PIN is set for this event</span>
                      </div>
                      <p className="text-2xl tracking-widest font-mono font-bold">{existingPin}</p>
                      <p className="text-xs text-muted-foreground">Share this PIN with authorized staff only</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setIsChangingPin(true);
                        setExitPin("");
                        setConfirmPin("");
                        setPinError("");
                      }}
                    >
                      Change PIN
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="exit-pin">{isChangingPin ? "New PIN" : "Exit PIN"} (minimum 4 digits)</Label>
                      <Input
                        id="exit-pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Enter PIN"
                        value={exitPin}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setExitPin(val);
                          setPinError("");
                        }}
                        maxLength={8}
                        className="text-center text-2xl tracking-widest"
                        data-testid="input-session-exit-pin"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-pin">Confirm PIN</Label>
                      <Input
                        id="confirm-pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Confirm PIN"
                        value={confirmPin}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setConfirmPin(val);
                          setPinError("");
                        }}
                        maxLength={8}
                        className="text-center text-2xl tracking-widest"
                        data-testid="input-session-confirm-pin"
                      />
                    </div>

                    {isChangingPin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setIsChangingPin(false);
                          setExitPin(existingPin || "");
                          setConfirmPin("");
                          setPinError("");
                        }}
                      >
                        Cancel — keep existing PIN
                      </Button>
                    )}
                  </>
                )}

                {pinError && (
                  <p className="text-sm text-destructive text-center">{pinError}</p>
                )}

                <div className="space-y-3 pt-4">
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg"
                    onClick={handleLaunchKiosk}
                    disabled={
                      savingPin ||
                      pinLoading ||
                      (existingPin && !isChangingPin ? false : !exitPin || !confirmPin)
                    }
                    data-testid="button-launch-session-kiosk"
                  >
                    {savingPin ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Maximize className="h-5 w-5 mr-2" />
                    )}
                    Launch Session Kiosk
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={handleBackToSessions}
                    data-testid="button-back-to-sessions"
                  >
                    Back to Session Selection
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg max-w-md mx-auto">
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Session Kiosk Features:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check attendees in to this specific session</li>
                  <li>Shows session details (location, time, capacity)</li>
                  {selectedSession.restrictToRegistered && (
                    <li className="text-amber-600">Only pre-registered attendees can check in</li>
                  )}
                  <li>Tap the logo 5 times to show exit dialog</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
