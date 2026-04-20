import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { playCheckinSound, playErrorSound } from "@/lib/sounds";
import { 
  CheckCircle2, 
  QrCode, 
  ArrowLeft, 
  Lock,
  Search,
  UserCheck,
  XCircle,
  Users,
  MapPin,
  Clock,
  AlertTriangle,
  LogIn,
  LogOut,
  Calendar,
  Camera,
  SwitchCamera,
  Keyboard
} from "lucide-react";
import QRScanner from "./QRScanner";
import { parseQrCode } from "@/lib/qr-parser";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Attendee, Session, KioskBrandingConfig } from "@shared/schema";
import KioskBrandingHeader from "@/components/KioskBrandingHeader";
import type { KioskSettings } from "@/components/KioskLauncher";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SessionKioskStep = "welcome" | "scanning" | "qr-scanning" | "success" | "error" | "restricted";
type ScanMode = "self" | "managed";

interface SessionKioskModeProps {
  sessionId: string;
  eventId: string;
  eventName?: string;
  exitPin?: string;
  scopedCustomerId?: string;
  onExit?: () => void;
  isLocked?: boolean;
  kioskSettings?: KioskSettings;
}

interface SessionStatus {
  sessionId: string;
  attendeeId: string;
  isRegistered: boolean;
  registrationStatus: string | null;
  waitlistPosition: number | null;
  isCheckedIn: boolean;
  lastAction: string | null;
  lastActionTime: string | null;
  session: {
    name: string;
    location: string;
    restrictToRegistered: boolean;
  };
  attendee: {
    firstName: string;
    lastName: string;
    company: string;
  };
}

interface CheckinResponse {
  id: string;
  sessionId: string;
  attendeeId: string;
  action: string;
  timestamp: string;
  attendee: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
  };
  session: {
    id: string;
    name: string;
    location: string;
  };
}

export default function SessionKioskMode({ 
  sessionId,
  eventId, 
  eventName = "Session Check-In",
  exitPin,
  scopedCustomerId,
  onExit,
  isLocked = false,
  kioskSettings,
}: SessionKioskModeProps) {
  const [step, setStep] = useState<SessionKioskStep>("welcome");
  const [lastCheckedIn, setLastCheckedIn] = useState<CheckinResponse | null>(null);
  const [attendeeStatus, setAttendeeStatus] = useState<SessionStatus | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("self");
  const [branding, setBranding] = useState<KioskBrandingConfig | null>(null);
  const logoTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intentionalExitRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (step === "success") playCheckinSound();
    if (step === "error") playErrorSound();
  }, [step]);

  const kioskFetch = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery<Session>({
    queryKey: [`/api/kiosk/${eventId}/sessions/${sessionId}`],
    queryFn: () => kioskFetch(`/api/kiosk/${eventId}/sessions/${sessionId}`),
    enabled: Boolean(sessionId && eventId),
    retry: false,
  });

  // Fetch branding from launch-info
  useQuery({
    queryKey: [`/api/kiosk/${eventId}/launch-info`, 'branding'],
    queryFn: async () => {
      const res = await fetch(`/api/kiosk/${eventId}/launch-info`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.branding) {
        setBranding(data.branding as KioskBrandingConfig);
      }
      return data.branding || null;
    },
    enabled: Boolean(eventId),
    staleTime: 5 * 60 * 1000,
  });

  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: [`/api/kiosk/session-attendees-disabled/${eventId}`],
    queryFn: async () => [] as Attendee[],
    enabled: false,
  });

  const { data: checkins = [] } = useQuery<Array<{ attendeeId: string; action: string }>>({
    queryKey: [`/api/kiosk/${eventId}/sessions/${sessionId}/checkins`],
    queryFn: () => kioskFetch(`/api/kiosk/${eventId}/sessions/${sessionId}/checkins`),
    enabled: Boolean(sessionId && eventId),
    refetchInterval: 5000,
  });
  
  const { data: registrations = [], isLoading: registrationsLoading } = useQuery<Array<{ attendeeId: string; status: string }>>({
    queryKey: [`/api/kiosk/${eventId}/sessions/${sessionId}/registrations`],
    queryFn: () => kioskFetch(`/api/kiosk/${eventId}/sessions/${sessionId}/registrations`),
    enabled: Boolean(sessionId && eventId),
    refetchInterval: 10000,
  });

  const isDataReady = !sessionLoading && session && (!session.restrictToRegistered || !registrationsLoading);

  useEffect(() => {
    if (!sessionLoading && sessionError) {
      setSecurityError("Access denied: Session not found or access restricted.");
      setStep("error");
    }
  }, [sessionError, sessionLoading]);

  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await fetch(`/api/kiosk/${eventId}/sessions/${sessionId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId,
          source: "kiosk",
          pin: exitPin,
        }),
      });
      if (!response.ok) {
        const err: any = new Error(`HTTP ${response.status}`);
        err.response = response;
        throw err;
      }
      return response.json();
    },
    onSuccess: (data: CheckinResponse) => {
      setLastCheckedIn(data);
      setStep("success");
      setScanError(null);
      queryClient.invalidateQueries({ queryKey: [`/api/kiosk/${eventId}/sessions/${sessionId}/checkins`] });
    },
    onError: (error: Error & { response?: Response }) => {
      try {
        error.response?.json().then(errData => {
          if (errData.error?.includes("restricted")) {
            setScanError("This session is restricted to pre-registered attendees only");
            setStep("restricted");
          } else if (errData.alreadyCheckedIn) {
            setScanError("Already checked in to this session");
            setStep("success");
          } else {
            setScanError(errData.error || "Check-in failed");
            setStep("welcome");
          }
        }).catch(() => {
          setScanError(error.message || "Failed to check in");
          setStep("welcome");
        });
      } catch {
        setScanError(error.message || "Failed to check in");
        setStep("welcome");
      }
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await fetch(`/api/kiosk/${eventId}/sessions/${sessionId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId,
          source: "kiosk",
          pin: exitPin,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Checked Out",
        description: "You have been checked out of this session",
      });
      handleReset();
      queryClient.invalidateQueries({ queryKey: [`/api/kiosk/${eventId}/sessions/${sessionId}/checkins`] });
    },
    onError: (error: Error) => {
      setScanError(error.message || "Failed to check out");
    },
  });

  const sessionKioskTimeoutMs = kioskSettings?.timeoutMinutes
    ? kioskSettings.timeoutMinutes * 60 * 1000
    : 0;
  const sessionKioskTimeoutEnabled = sessionKioskTimeoutMs > 0;

  const handleSessionKioskTimeout = useCallback(() => {
    setStep("welcome");
    setLastCheckedIn(null);
    setAttendeeStatus(null);
    setScanError(null);
    setManualInput("");
  }, []);

  // Kiosk idle timeout disabled through beta - re-enable by removing the `false &&` below
  const { showWarning: showSessionKioskWarning, remainingSeconds: sessionKioskRemaining, stayActive: sessionKioskStayActive } = useIdleTimeout({
    timeoutMs: sessionKioskTimeoutMs || 60000,
    warningMs: Math.min(120000, (sessionKioskTimeoutMs || 60000) / 2),
    onTimeout: handleSessionKioskTimeout,
    enabled: false && sessionKioskTimeoutEnabled && isLocked,
  });

  useEffect(() => {
    if (!isLocked) return;

    const shouldFullscreen = kioskSettings?.enableFullscreen !== false;

    const enterFullscreen = async () => {
      if (!shouldFullscreen) return;
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {
      }
    };

    enterFullscreen();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F5" ||
        (e.ctrlKey && e.key === "r") ||
        (e.metaKey && e.key === "r") ||
        e.key === "Escape" ||
        (e.altKey && e.key === "F4") ||
        (e.ctrlKey && e.key === "w") ||
        (e.metaKey && e.key === "w")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    intentionalExitRef.current = false;
    
    const handleFullscreenChange = () => {
      if (!shouldFullscreen) return;
      if (!document.fullscreenElement && !intentionalExitRef.current) {
        setShowExitDialog(true);
        setEnteredPin("");
        setPinError("Please enter PIN to exit kiosk mode");
        
        setTimeout(() => {
          if (!document.fullscreenElement && !intentionalExitRef.current) {
            enterFullscreen();
          }
        }, 100);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleKeyDown, true);
    if (shouldFullscreen) {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleKeyDown, true);
      if (shouldFullscreen) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
      
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isLocked]);

  const handleLogoTap = useCallback(() => {
    if (!isLocked || !exitPin) return;

    setLogoTapCount(prev => prev + 1);

    if (logoTapTimeoutRef.current) {
      clearTimeout(logoTapTimeoutRef.current);
    }

    logoTapTimeoutRef.current = setTimeout(() => {
      setLogoTapCount(0);
    }, 2000);

    if (logoTapCount + 1 >= 5) {
      setShowExitDialog(true);
      setLogoTapCount(0);
      setEnteredPin("");
      setPinError("");
    }
  }, [isLocked, exitPin, logoTapCount]);

  const handleExitAttempt = () => {
    if (enteredPin === exitPin) {
      // Mark as intentional exit so fullscreenchange handler doesn't re-enter fullscreen
      intentionalExitRef.current = true;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      onExit?.();
    } else {
      setPinError("Incorrect PIN");
      setEnteredPin("");
    }
  };

  const handleStartCheckIn = () => {
    setStep("scanning");
    setManualInput("");
    setScanError(null);
  };

  const handleStartQRScan = () => {
    setStep("qr-scanning");
    setScanError(null);
  };

  const resolveAttendeeFromQR = async (code: string): Promise<Attendee | undefined> => {
    const qrResult = parseQrCode(code, attendees);
    if (qrResult.type === "found") return qrResult.attendee;

    try {
      const res = await fetch(`/api/kiosk/${eventId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: exitPin, query: code.trim() }),
      });
      if (res.ok) {
        const results = await res.json();
        if (results.length > 0) return results[0];
      }
    } catch {}
    return undefined;
  };

  const handleQRScan = async (code: string) => {
    const searchValue = code.trim();
    if (!searchValue) return;

    const found = await resolveAttendeeFromQR(code);

    if (found) {
      if (session?.restrictToRegistered) {
        const registration = registrations.find(r => r.attendeeId === found.id);
        if (!registration) {
          setScanError("You are not registered for this session. Please visit the registration desk.");
          setStep("restricted");
          return;
        }
        if (registration.status === "waitlisted") {
          setScanError("You are currently on the waitlist for this session.");
          setStep("restricted");
          return;
        }
        if (registration.status === "cancelled") {
          setScanError("Your registration for this session has been cancelled.");
          setStep("restricted");
          return;
        }
      }
      checkInMutation.mutate(found.id);
    } else {
      setScanError("Badge not recognized. Please try searching by name instead.");
      setStep("scanning");
    }
  };

  const handleManualSearch = async () => {
    if (!manualInput.trim()) return;

    try {
      const res = await fetch(`/api/kiosk/${eventId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: exitPin, query: manualInput.trim() }),
      });
      if (!res.ok) {
        setScanError("Search failed. Please try again.");
        setManualInput("");
        return;
      }
      const results = await res.json();
      const found = results.length > 0 ? results[0] : undefined;

      if (found) {
        if (session?.restrictToRegistered) {
          const registration = registrations.find(r => r.attendeeId === found.id);
          if (!registration) {
            setScanError("You are not registered for this session. Please visit the registration desk.");
            setStep("restricted");
            setManualInput("");
            return;
          }
          if (registration.status === "waitlisted") {
            setScanError("You are currently on the waitlist for this session.");
            setStep("restricted");
            setManualInput("");
            return;
          }
          if (registration.status === "cancelled") {
            setScanError("Your registration for this session has been cancelled.");
            setStep("restricted");
            setManualInput("");
            return;
          }
        }
        checkInMutation.mutate(found.id);
      } else {
        setScanError("Attendee not found. Please check the name or email.");
      }
    } catch {
      setScanError("Search failed. Please try again.");
    }
    setManualInput("");
  };

  const handleReset = () => {
    setStep("welcome");
    setLastCheckedIn(null);
    setAttendeeStatus(null);
    setScanError(null);
    setManualInput("");
  };

  const currentCheckedInCount = checkins.filter(c => c.action === "checkin").length;
  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-2xl my-auto">
          <KioskBrandingHeader
            branding={branding}
            eventName={session?.name || eventName || "Session Check-In"}
            onLogoTap={handleLogoTap}
            fallbackIcon={<Calendar className="h-8 w-8 text-primary-foreground" />}
          >
            {session && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                {session.location && (
                  <Badge variant="outline" className="text-sm" data-testid="badge-session-location">
                    <MapPin className="h-3 w-3 mr-1" />
                    {session.location}
                  </Badge>
                )}
                {session.startTime && (
                  <Badge variant="outline" className="text-sm" data-testid="badge-session-time">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatTime(session.startTime)}
                    {session.endTime && ` - ${formatTime(session.endTime)}`}
                  </Badge>
                )}
                {session.capacity && (
                  <Badge
                    variant={currentCheckedInCount >= session.capacity ? "destructive" : "secondary"}
                    data-testid="badge-session-capacity"
                  >
                    <Users className="h-3 w-3 mr-1" />
                    {currentCheckedInCount} / {session.capacity}
                  </Badge>
                )}
                {session.restrictToRegistered && (
                  <Badge variant="outline" className="text-sm border-amber-500 text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3 mr-1" />
                    Pre-registration required
                  </Badge>
                )}
              </div>
            )}
          </KioskBrandingHeader>

          <Card className="border-2">
            <CardContent className="p-6 sm:p-8 md:p-12">
              {step === "welcome" && (
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold">Welcome!</h2>
                    <p className="text-lg text-muted-foreground">
                      {!isDataReady ? "Loading session data..." : "Choose how to check in to this session"}
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 p-1 bg-muted rounded-lg">
                    <Button
                      variant={scanMode === "self" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setScanMode("self")}
                      className="flex-1"
                      data-testid="button-mode-self"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Self Scan
                    </Button>
                    <Button
                      variant={scanMode === "managed" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setScanMode("managed")}
                      className="flex-1"
                      data-testid="button-mode-managed"
                    >
                      <SwitchCamera className="h-4 w-4 mr-2" />
                      Managed
                    </Button>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {scanMode === "self" 
                      ? "Front camera - attendees scan their own badge" 
                      : "Back camera - staff scans attendee badges"}
                  </p>

                  <div className="flex flex-col gap-3">
                    <Button
                      size="lg"
                      className="h-16 px-8 text-lg"
                      onClick={handleStartQRScan}
                      disabled={!isDataReady}
                      data-testid="button-session-qr-scan"
                    >
                      <QrCode className="h-5 w-5 mr-2" />
                      Scan QR Code
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 px-8"
                      onClick={handleStartCheckIn}
                      disabled={!isDataReady}
                      data-testid="button-session-start"
                    >
                      <Keyboard className="h-5 w-5 mr-2" />
                      Search by Name
                    </Button>
                  </div>
                  
                  {scanError && (
                    <div className="mt-4 p-4 bg-destructive/10 rounded-lg flex items-center gap-3 text-destructive">
                      <XCircle className="h-5 w-5 flex-shrink-0" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  {isLocked && exitPin && (
                    <div className="pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setShowExitDialog(true);
                          setEnteredPin("");
                          setPinError("");
                        }}
                        data-testid="button-exit-session-kiosk"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Exit Kiosk Mode
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {step === "scanning" && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-semibold">Find Your Registration</h2>
                    <p className="text-lg text-muted-foreground">
                      Enter your name or email address
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type your name or email..."
                        value={manualInput}
                        onChange={(e) => {
                          setManualInput(e.target.value);
                          setScanError(null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && isDataReady && handleManualSearch()}
                        className="h-14 text-lg"
                        autoFocus
                        data-testid="input-session-search"
                      />
                      <Button 
                        size="lg"
                        className="h-14 px-6"
                        onClick={handleManualSearch}
                        disabled={!manualInput.trim() || checkInMutation.isPending || !isDataReady}
                        data-testid="button-session-search"
                      >
                        <Search className="h-5 w-5 mr-2" />
                        Search
                      </Button>
                    </div>
                    
                    {session?.restrictToRegistered && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                        <Lock className="h-4 w-4 flex-shrink-0" />
                        <span>This session is restricted to pre-registered attendees</span>
                      </div>
                    )}

                    {scanError && (
                      <div className="p-4 bg-destructive/10 rounded-lg flex items-center gap-3 text-destructive">
                        <XCircle className="h-5 w-5 flex-shrink-0" />
                        <span>{scanError}</span>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={handleReset}
                      className="w-full"
                      data-testid="button-session-back"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {step === "qr-scanning" && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold">Scan Your Badge</h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      {scanMode === "self" 
                        ? "Hold your badge QR code up to the front camera" 
                        : "Point the camera at the attendee's badge"}
                    </p>
                  </div>

                  <div className="relative max-h-[40vh] sm:max-h-[45vh] overflow-hidden rounded-lg">
                    <QRScanner
                      key={`qr-scanner-${scanMode}`}
                      onScan={handleQRScan}
                      autoStart={true}
                      showHeader={false}
                      compact={true}
                      facingMode={scanMode === "self" ? "user" : "environment"}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 p-1 bg-muted rounded-lg">
                    <Button
                      variant={scanMode === "self" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setScanMode("self")}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Self Scan
                    </Button>
                    <Button
                      variant={scanMode === "managed" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setScanMode("managed")}
                      className="flex-1"
                    >
                      <SwitchCamera className="h-4 w-4 mr-2" />
                      Managed
                    </Button>
                  </div>

                  {session?.restrictToRegistered && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs sm:text-sm">
                      <Lock className="h-3 w-3 flex-shrink-0" />
                      <span>Pre-registration required</span>
                    </div>
                  )}

                  {scanError && (
                    <div className="p-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive text-sm">
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartCheckIn}
                      className="flex-1"
                    >
                      <Keyboard className="h-4 w-4 mr-2" />
                      Search by Name
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {step === "success" && lastCheckedIn && (
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/20 mb-2">
                    <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold text-green-600 dark:text-green-400">
                      Checked In!
                    </h2>
                    <p className="text-2xl font-medium" data-testid="text-attendee-name">
                      {lastCheckedIn.attendee.firstName} {lastCheckedIn.attendee.lastName}
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <Badge variant="outline">{lastCheckedIn.attendee.participantType}</Badge>
                      <Badge variant="default">Attended</Badge>
                    </div>
                    {lastCheckedIn.attendee.company && (
                      <p className="text-lg text-muted-foreground">
                        {lastCheckedIn.attendee.company}
                      </p>
                    )}
                    {lastCheckedIn.attendee.title && (
                      <p className="text-muted-foreground">
                        {lastCheckedIn.attendee.title}
                      </p>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    <p>Session: {lastCheckedIn.session.name}</p>
                    {lastCheckedIn.session.location && (
                      <p className="flex items-center justify-center gap-1 mt-1">
                        <MapPin className="h-4 w-4" />
                        {lastCheckedIn.session.location}
                      </p>
                    )}
                  </div>
                  <Button
                    size="lg"
                    className="h-14 px-8"
                    onClick={handleReset}
                    data-testid="button-session-done"
                  >
                    Done
                  </Button>
                </div>
              )}

              {step === "restricted" && (
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-900/20 mb-2">
                    <AlertTriangle className="h-12 w-12 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold text-amber-600 dark:text-amber-400">
                      Registration Required
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      This session is restricted to pre-registered attendees only.
                    </p>
                    <p className="text-muted-foreground">
                      Please visit the registration desk to register for this session.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="h-14 px-8"
                    onClick={handleReset}
                    data-testid="button-session-back-home"
                  >
                    Back
                  </Button>
                </div>
              )}

              {step === "error" && (
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-destructive/10 mb-2">
                    <XCircle className="h-12 w-12 text-destructive" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold text-destructive">
                      Error
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      {securityError || scanError || "An error occurred"}
                    </p>
                  </div>
                  {onExit && !isLocked && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={onExit}
                      data-testid="button-session-exit"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Exit Kiosk
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!isLocked && onExit && step !== "error" && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onExit}
                data-testid="button-session-exit-kiosk"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Exit Kiosk Mode
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Exit Kiosk Mode
            </DialogTitle>
            <DialogDescription>
              Enter the admin PIN to exit kiosk mode
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="password"
              placeholder="Enter PIN"
              value={enteredPin}
              onChange={(e) => {
                setEnteredPin(e.target.value);
                setPinError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleExitAttempt()}
              autoFocus
              data-testid="input-session-exit-pin"
            />
            {pinError && (
              <p className="text-sm text-destructive">{pinError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowExitDialog(false)}
                data-testid="button-session-cancel-exit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleExitAttempt}
                data-testid="button-session-confirm-exit"
              >
                Exit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <IdleTimeoutDialog
        open={showSessionKioskWarning}
        remainingSeconds={sessionKioskRemaining}
        onStayActive={sessionKioskStayActive}
      />
    </div>
  );
}
