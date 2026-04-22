import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { playCheckinSound, playErrorSound } from "@/lib/sounds";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useGroupCheckin } from "@/hooks/useGroupCheckin";
import type { GroupMember } from "@/hooks/useGroupCheckin";
import GroupCheckinCard from "@/components/group/GroupCheckinCard";
import {
  CheckCircle2,
  QrCode,
  Printer,
  ArrowLeft,
  Lock,
  LogOut,
  Search,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  RefreshCw,
  Download,
  Camera,
  Keyboard,
  Shield
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { printOrchestrator } from "@/services/print-orchestrator";
import { offlineCheckinService } from "@/services/offline-checkin-service";
import { kioskPreCacheService, PreCacheProgress } from "@/services/kiosk-precache-service";
import { offlineDB } from "@/lib/offline-db";
import { useNetworkPrint } from "@/hooks/use-network-print";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Attendee, Event, BadgeTemplate, KioskBrandingConfig } from "@shared/schema";
import type { OfflineAttendee } from "@/lib/offline-db";
import type { KioskSettings } from "@/components/KioskLauncher";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import KioskBrandingHeader from "@/components/KioskBrandingHeader";
import { getSavedPrinter } from "@/lib/printerPreferences";
import { useTheme } from "@/components/ThemeProvider";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import QRScanner from "@/components/QRScanner";
import { parseQrCode } from "@/lib/qr-parser";
import BadgeAIChat from "@/components/BadgeAIChat";

type KioskStep = "welcome" | "scanning" | "results" | "verify" | "walkin" | "group" | "success" | "printing" | "error";

interface TemplateMappingEntry {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: string;
}

interface KioskModeProps {
  eventId?: string;
  eventName?: string;
  exitPin?: string;
  scopedCustomerId?: string;
  onExit?: () => void;
  isLocked?: boolean;
  selectedPrinter?: SelectedPrinter;
  kioskSettings?: KioskSettings;
  forcedBadgeTemplateId?: string;
  staffToken?: string;
}

export default function KioskMode({ 
  eventId, 
  eventName = "Event Check-In",
  exitPin,
  scopedCustomerId,
  onExit,
  isLocked = false,
  selectedPrinter: printerProp,
  kioskSettings,
  forcedBadgeTemplateId,
  staffToken,
}: KioskModeProps) {
  const selectedPrinter = printerProp ?? (eventId ? getSavedPrinter(eventId) : null) ?? undefined;
  const [step, setStep] = useState<KioskStep>("welcome");
  const [lastScanned, setLastScanned] = useState<Attendee | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [searchResults, setSearchResults] = useState<(Attendee | OfflineAttendee)[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [walkinForm, setWalkinForm] = useState<Record<string, string>>({});
  const [walkinError, setWalkinError] = useState<string | null>(null);
  const [walkinSubmitting, setWalkinSubmitting] = useState(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [branding, setBranding] = useState<KioskBrandingConfig | null>(null);
  const [eventBadgeSettings, setEventBadgeSettings] = useState<any>(null);
  const [groupScannedMemberId, setGroupScannedMemberId] = useState<string | null>(null);
  const [groupCheckedInMembers, setGroupCheckedInMembers] = useState<GroupMember[]>([]);
  const [groupPrintIndex, setGroupPrintIndex] = useState(0);
  const logoTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const networkPrint = useNetworkPrint();
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const { theme: appTheme, setTheme } = useTheme();
  const previousThemeRef = useRef(appTheme);

  const groupCheckin = useGroupCheckin({
    eventId: eventId || '',
    mode: 'kiosk',
    pin: exitPin,
  });

  useEffect(() => {
    const kioskTheme = branding?.kioskTheme || kioskSettings?.kioskTheme;
    if (kioskTheme) {
      previousThemeRef.current = appTheme;
      setTheme(kioskTheme);
    }
    return () => {
      if (branding?.kioskTheme || kioskSettings?.kioskTheme) {
        setTheme(previousThemeRef.current);
      }
    };
  }, [branding?.kioskTheme]);

  const [isOnline, setIsOnline] = useState(offlineCheckinService.getOnlineStatus());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheProgress, setPreCacheProgress] = useState<PreCacheProgress | null>(null);
  const [offlineAttendees, setOfflineAttendees] = useState<OfflineAttendee[]>([]);
  const [isCached, setIsCached] = useState(false);
  const autoCachedRef = useRef(false);

  useEffect(() => {
    if (step === "success") playCheckinSound();
    if (step === "error") playErrorSound();
  }, [step]);

  useEffect(() => {
    const unsubscribe = offlineCheckinService.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        offlineCheckinService.syncPendingActions().then(() => {
          updateSyncStatus();
        });
      }
    });

    updateSyncStatus();
    checkCacheStatus();

    return () => {
      unsubscribe();
    };
  }, [eventId]);

  const updateSyncStatus = async () => {
    const stats = await offlineCheckinService.getOfflineStats();
    setPendingSyncCount(stats.pendingSyncActions);
  };

  const checkCacheStatus = async () => {
    if (eventId) {
      const status = await kioskPreCacheService.getPreCacheStatus(eventId);
      setIsCached(status.cached);
      if (status.cached) {
        const cached = await kioskPreCacheService.getCachedAttendees(eventId);
        setOfflineAttendees(cached);
        // Load cached branding if not already set (e.g. when offline)
        if (!branding) {
          const cachedBranding = await kioskPreCacheService.getCachedBranding(eventId);
          if (cachedBranding) {
            setBranding(cachedBranding);
          }
        }
      }
    }
  };

  const staffHeaders = staffToken ? { 'Authorization': `Bearer ${staffToken}`, 'Content-Type': 'application/json' } : undefined;

  const staffFetch = async (url: string) => {
    const res = await fetch(url, staffHeaders ? { headers: staffHeaders } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const eventQueryOptions = staffToken
    ? {
        queryKey: [`/api/staff/event-for-kiosk`],
        queryFn: async () => {
          const data = await staffFetch('/api/staff/session');
          return { id: data.event.id, name: data.event.name, customerId: data.event.customerId } as Event;
        },
        enabled: Boolean(eventId),
      }
    : {
        queryKey: [`/api/kiosk/${eventId}/launch-info`],
        queryFn: async () => {
          try {
            const res = await fetch(`/api/kiosk/${eventId}/launch-info`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.branding) {
              setBranding(data.branding as KioskBrandingConfig);
            }
            if (data.badgeSettings) {
              setEventBadgeSettings(data.badgeSettings);
            }
            return data.event as Event;
          } catch (err) {
            // Offline fallback: try loading from IndexedDB cache
            if (!navigator.onLine && eventId) {
              console.warn('[KioskMode] launch-info fetch failed, attempting offline fallback');
              const cachedEvent = await offlineDB.getEvent(eventId);
              if (cachedEvent) {
                // Load cached branding
                const cachedBranding = await offlineDB.getAppState(`branding_${eventId}`);
                if (cachedBranding) {
                  setBranding(cachedBranding as KioskBrandingConfig);
                }
                // Load cached badge templates as fallback badge settings
                const customerId = cachedEvent.customerId || scopedCustomerId;
                if (customerId) {
                  const cachedTemplates = await offlineDB.getBadgeTemplates(customerId);
                  if (cachedTemplates.length > 0) {
                    // Templates will be loaded by the templates query fallback
                  }
                }
                return {
                  id: cachedEvent.id,
                  name: cachedEvent.name,
                  eventDate: cachedEvent.date,
                  customerId: cachedEvent.customerId,
                  status: 'active',
                  defaultBadgeTemplateId: cachedEvent.defaultBadgeTemplateId || null,
                } as unknown as Event;
              }
            }
            throw err;
          }
        },
        enabled: Boolean(eventId),
      };

  const { data: event, isLoading: eventLoading, error: eventError } = useQuery<Event>({
    ...eventQueryOptions,
    retry: 2,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isEventValid = Boolean(event && !eventError);

  const attendeesQueryOptions = staffToken
    ? {
        queryKey: ['/api/staff/attendees-kiosk'],
        queryFn: () => staffFetch('/api/staff/attendees'),
        enabled: Boolean(eventId && isEventValid),
      }
    : {
        queryKey: [`/api/kiosk/attendees-disabled/${eventId}`],
        queryFn: async () => [] as Attendee[],
        enabled: false,
      };

  const { data: attendees = [] } = useQuery<Attendee[]>({
    ...attendeesQueryOptions,
    refetchInterval: isOnline ? 10000 : false,
  });

  useEffect(() => {
    if (
      isOnline &&
      eventId &&
      scopedCustomerId &&
      attendees.length > 0 &&
      !isCached &&
      !isPreCaching &&
      !autoCachedRef.current
    ) {
      autoCachedRef.current = true;
      handlePreCache(true);
    }
  }, [isOnline, eventId, scopedCustomerId, attendees.length, isCached, isPreCaching]);

  const handlePreCache = async (silent = false) => {
    if (!eventId || !scopedCustomerId) return;
    
    setIsPreCaching(true);
    const unsubscribe = kioskPreCacheService.onProgress((progress) => {
      setPreCacheProgress(progress);
    });

    try {
      const result = await kioskPreCacheService.preCacheForEvent(eventId, scopedCustomerId);
      if (result.success) {
        setIsCached(true);
        const cached = await kioskPreCacheService.getCachedAttendees(eventId);
        setOfflineAttendees(cached);
        if (!silent) {
          toast({
            title: "Offline Mode Ready",
            description: `${result.attendeesCount} attendees cached for offline use`,
          });
        }
      } else if (!silent) {
        toast({
          title: "Pre-cache Failed",
          description: result.error || "Failed to cache data for offline mode",
          variant: "destructive",
        });
      }
    } finally {
      setIsPreCaching(false);
      setPreCacheProgress(null);
      unsubscribe();
    }
  };

  const templatesQueryOptions = staffToken
    ? {
        queryKey: ['/api/staff/badge-templates-kiosk'],
        queryFn: () => staffFetch('/api/staff/badge-templates'),
        enabled: Boolean(isEventValid),
      }
    : {
        queryKey: [`/api/kiosk/${eventId}/badge-templates`],
        queryFn: async () => {
          try {
            const res = await fetch(`/api/kiosk/${eventId}/badge-templates`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          } catch (err) {
            // Offline fallback: load cached templates from IndexedDB
            if (!navigator.onLine) {
              const customerId = event?.customerId || scopedCustomerId;
              if (customerId) {
                console.warn('[KioskMode] badge-templates fetch failed, loading from cache');
                const cached = await offlineDB.getBadgeTemplates(customerId);
                if (cached.length > 0) return cached;
              }
            }
            throw err;
          }
        },
        enabled: Boolean(eventId && isEventValid),
      };

  const { data: templates = [] } = useQuery<BadgeTemplate[]>(templatesQueryOptions);

  const templateMappingsQueryOptions = staffToken
    ? {
        queryKey: [`/api/staff/template-mappings-kiosk`],
        queryFn: () => staffFetch(`/api/events/${eventId}/template-mappings`).catch(() => ({})),
      }
    : {
        queryKey: [`/api/kiosk/${eventId}/template-mappings`],
        queryFn: async () => {
          try {
            const res = await fetch(`/api/kiosk/${eventId}/template-mappings`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          } catch (err) {
            // Offline fallback: return empty mappings (templates will match by participant type from cache)
            if (!navigator.onLine) {
              console.warn('[KioskMode] template-mappings fetch failed offline, using empty mappings');
              return {};
            }
            throw err;
          }
        },
      };

  const { data: templateMappings } = useQuery<Record<string, TemplateMappingEntry>>({
    ...templateMappingsQueryOptions,
    enabled: Boolean(eventId && isEventValid),
  });

  const effectiveAttendees = isOnline && attendees.length > 0 ? attendees : offlineAttendees;

  useEffect(() => {
    if (!eventLoading && eventError) {
      const errMsg = eventError instanceof Error ? eventError.message : String(eventError);
      console.error("[KioskMode] Event load failed:", errMsg, eventError);
      const isAccessDenied = errMsg.toLowerCase().includes('access denied') ||
                             errMsg.toLowerCase().includes('forbidden') ||
                             errMsg.toLowerCase().includes('403');
      const isAuthError = errMsg.toLowerCase().includes('authentication') ||
                          errMsg.toLowerCase().includes('unauthorized') ||
                          errMsg.toLowerCase().includes('401');
      if (isAccessDenied) {
        setSecurityError("Access denied: This event does not belong to your organization.");
      } else if (isAuthError) {
        setSecurityError("Your session has expired. Please exit and log in again.");
      } else if (!navigator.onLine) {
        setSecurityError("No cached data available. Connect to the internet and sync data first.");
      } else {
        setSecurityError("Could not load event data. Please check your connection and try again.");
      }
      trackAbandon("kiosk", "scan");
      setStep("error");
    }
  }, [eventError, eventLoading, trackAbandon]);

  useEffect(() => {
    if (event && !eventError) {
      setSecurityError(null);
      if (step === "error") {
        setStep("welcome");
      }
    }
  }, [event, eventError]);

  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      if (staffToken) {
        const res = await fetch('/api/staff/checkin', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendeeId }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Check-in failed' }));
          throw new Error(errData.error || 'Check-in failed');
        }
        return { success: true, isOffline: false };
      }
      if (exitPin && eventId) {
        const res = await fetch(`/api/kiosk/${eventId}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: exitPin, attendeeId }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Check-in failed' }));
          throw new Error(errData.error || 'Check-in failed');
        }
        const data = await res.json();
        if (data.attendee) {
          setLastScanned(data.attendee as Attendee);
          trackComplete("kiosk", "scan");
          setStep("success");
        }
        return { success: true, isOffline: false };
      }
      const result = await offlineCheckinService.checkInAttendee(attendeeId, eventId);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (result, attendeeId) => {
      const attendee = effectiveAttendees.find(a => a.id === attendeeId);
      if (attendee) {
        setLastScanned({ ...attendee, checkedIn: true } as Attendee);
        trackComplete("kiosk", "scan");
        setStep("success");
      }
      setScanError(null);
      
      if (result.isOffline) {
        toast({
          title: "Checked In (Offline)",
          description: "Will sync when back online",
        });
        updateSyncStatus();
      }
      
      if (isOnline) {
        if (staffToken) {
          queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees-kiosk'] });
        } else {
          queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
        }
      }
    },
    onError: (error: Error) => {
      setScanError(error.message || "Failed to check in attendee");
      setStep("welcome");
    },
  });

  const kioskTimeoutMs = kioskSettings?.timeoutMinutes
    ? kioskSettings.timeoutMinutes * 60 * 1000
    : 0;
  const kioskTimeoutEnabled = kioskTimeoutMs > 0;

  const handleKioskTimeout = useCallback(() => {
    setStep("welcome");
    setLastScanned(null);
    setScanError(null);
    setManualInput("");
    groupCheckin.reset();
    setGroupScannedMemberId(null);
    setGroupCheckedInMembers([]);
    setGroupPrintIndex(0);
  }, [groupCheckin]);

  // Kiosk idle timeout disabled through beta - re-enable by removing the `false &&` below
  const { showWarning: showKioskWarning, remainingSeconds: kioskRemaining, stayActive: kioskStayActive } = useIdleTimeout({
    timeoutMs: kioskTimeoutMs || 60000,
    warningMs: Math.min(120000, (kioskTimeoutMs || 60000) / 2),
    onTimeout: handleKioskTimeout,
    enabled: false && kioskTimeoutEnabled && isLocked,
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

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, "", window.location.href);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F5" ||
        (e.ctrlKey && e.key === "r") ||
        (e.metaKey && e.key === "r") ||
        (e.altKey && e.key === "F4") ||
        (e.ctrlKey && e.key === "w") ||
        (e.metaKey && e.key === "w")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "Escape") {
        if (exitPin) {
          setShowExitDialog(true);
          setEnteredPin("");
          setPinError("");
        } else if (onExit) {
          onExit();
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.history.pushState(null, "", window.location.href);

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu);
      
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isLocked]);

  const handleLogoTap = useCallback(() => {
    if (!isLocked) return;

    setLogoTapCount(prev => prev + 1);

    if (logoTapTimeoutRef.current) {
      clearTimeout(logoTapTimeoutRef.current);
    }

    logoTapTimeoutRef.current = setTimeout(() => {
      setLogoTapCount(0);
    }, 2000);

    if (logoTapCount + 1 >= 5) {
      if (exitPin) {
        setShowExitDialog(true);
        setEnteredPin("");
        setPinError("");
      } else if (onExit) {
        onExit();
      }
      setLogoTapCount(0);
    }
  }, [isLocked, exitPin, logoTapCount, onExit]);

  const handleExitAttempt = () => {
    if (enteredPin === exitPin) {
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
    trackStart("kiosk", "scan");
    setStep("scanning");
    setManualInput("");
    setScanError(null);
  };

  const handleManualSearch = async () => {
    if (!manualInput.trim()) return;

    if (exitPin && eventId) {
      // Try group lookup first if enabled
      if (isGroupCheckinEnabled) {
        const isGroup = await attemptGroupLookup(manualInput.trim());
        if (isGroup) {
          setManualInput("");
          return;
        }
      }

      try {
        const res = await fetch(`/api/kiosk/${eventId}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: exitPin, query: manualInput.trim() }),
        });
        if (!res.ok) {
          setScanError("Search failed. Please try again.");
          return;
        }
        const data = await res.json();
        if (data.found && data.attendee) {
          if (data.attendee.checkedIn) {
            setLastScanned(data.attendee as Attendee);
            setScanError("Already checked in");
            trackComplete("kiosk", "scan");
            setStep("success");
          } else {
            checkInMutation.mutate(data.attendee.id);
          }
          setManualInput("");
        } else if (data.multipleMatches) {
          setPendingSearchQuery(manualInput.trim());
          setVerifyEmail("");
          setVerifyError(null);
          setStep("verify");
          setManualInput("");
        } else {
          const hasWalkins = event?.tempStaffSettings?.allowKioskWalkins;
          setScanError(hasWalkins
            ? "No matching registration found. You can register as a new attendee below."
            : "No matching attendee found. Please check the spelling and try again.");
          setManualInput("");
        }
      } catch {
        setScanError("Search failed. Please try again.");
      }
      return;
    }

    const searchLower = manualInput.toLowerCase().trim();
    
    const exactMatches = effectiveAttendees.filter(a => 
      a.id === manualInput ||
      ('externalId' in a && a.externalId === manualInput) ||
      ('registrationCode' in a && (a as any).registrationCode === manualInput) ||
      a.email?.toLowerCase() === searchLower
    );

    const fuzzyMatches = exactMatches.length > 0 ? exactMatches : effectiveAttendees.filter(a => 
      `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) ||
      a.firstName?.toLowerCase() === searchLower ||
      a.lastName?.toLowerCase() === searchLower ||
      a.email?.toLowerCase().includes(searchLower)
    );

    const matches = fuzzyMatches;

    if (matches.length === 0) {
      setScanError("No matching attendee found. Please check the spelling and try again.");
      setManualInput("");
    } else if (matches.length === 1) {
      const found = matches[0];
      if (found.checkedIn) {
        setLastScanned(found as Attendee);
        setScanError("Already checked in");
        trackComplete("kiosk", "scan");
        setStep("success");
      } else {
        checkInMutation.mutate(found.id);
      }
      setManualInput("");
    } else {
      setSearchResults(matches);
      setStep("results");
    }
  };

  const handleVerifyEmail = async () => {
    if (!verifyEmail.trim() || !pendingSearchQuery || !eventId || !exitPin) return;
    setVerifyError(null);
    try {
      const res = await fetch(`/api/kiosk/${eventId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: exitPin, query: pendingSearchQuery, email: verifyEmail.trim() }),
      });
      if (!res.ok) {
        setVerifyError("Verification failed. Please try again.");
        return;
      }
      const data = await res.json();
      if (data.found && data.attendee) {
        if (data.attendee.checkedIn) {
          setLastScanned(data.attendee as Attendee);
          setScanError("Already checked in");
          trackComplete("kiosk", "scan");
          setStep("success");
        } else {
          checkInMutation.mutate(data.attendee.id);
        }
      } else {
        setVerifyError("Could not verify your identity. Please see a staff member for assistance.");
      }
    } catch {
      setVerifyError("Verification failed. Please try again.");
    }
  };

  const handleWalkinSubmit = async () => {
    if (!eventId || !exitPin) return;
    setWalkinError(null);

    const config = event?.tempStaffSettings?.kioskWalkinConfig;
    const requiredFields = config?.requiredFields || ['firstName', 'lastName', 'email'];
    const fieldLabels: Record<string, string> = { firstName: 'First Name', lastName: 'Last Name', email: 'Email', company: 'Company', title: 'Title', participantType: 'Attendee Type' };
    for (const field of ['firstName', 'lastName', ...requiredFields]) {
      if (!walkinForm[field]?.trim()) {
        setWalkinError(`${fieldLabels[field] || field} is required`);
        return;
      }
    }

    if (walkinForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(walkinForm.email.trim())) {
      setWalkinError("Please enter a valid email address");
      return;
    }

    setWalkinSubmitting(true);
    try {
      const res = await fetch(`/api/kiosk/${eventId}/walkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: exitPin, ...walkinForm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWalkinError(data.error || "Registration failed. Please try again.");
        return;
      }
      if (data.success && data.attendee) {
        setLastScanned(data.attendee as Attendee);
        trackComplete("kiosk", "scan");
        setStep("success");
      }
    } catch {
      // Offline fallback: save walk-in locally when API is unreachable
      if (!navigator.onLine) {
        try {
          const tempId = `walkin-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const now = new Date();
          const offlineWalkin: OfflineAttendee = {
            id: tempId,
            eventId,
            firstName: walkinForm.firstName?.trim() || '',
            lastName: walkinForm.lastName?.trim() || '',
            email: walkinForm.email?.trim() || '',
            company: walkinForm.company?.trim(),
            title: walkinForm.title?.trim(),
            participantType: walkinForm.participantType || 'Walk-in',
            checkedIn: true,
            checkedInAt: now.toISOString(),
            badgePrinted: false,
            qrCode: tempId,
            customFields: {},
            syncStatus: 'pending',
            lastModified: now.toISOString(),
          };

          await offlineDB.saveAttendee(offlineWalkin);

          await offlineDB.addToSyncQueue({
            action: 'walkin',
            entity: 'attendee',
            entityId: tempId,
            data: {
              eventId,
              pin: exitPin,
              formData: { ...walkinForm },
              tempId,
              createdAt: now.toISOString(),
            },
            timestamp: now.toISOString(),
            retryCount: 0,
          });

          // Add to local state so the walk-in appears in kiosk search immediately
          setOfflineAttendees(prev => [...prev, offlineWalkin]);

          toast({
            title: "Walk-in Registered (Offline)",
            description: "Walk-in registered offline. Will sync when online.",
          });

          updateSyncStatus();

          // Show success as if online
          setLastScanned({
            id: tempId,
            firstName: offlineWalkin.firstName,
            lastName: offlineWalkin.lastName,
            email: offlineWalkin.email || null,
            company: offlineWalkin.company || null,
            title: offlineWalkin.title || null,
            participantType: offlineWalkin.participantType,
            checkedIn: true,
            customFields: {},
            externalId: null,
          } as Attendee);
          trackComplete("kiosk", "scan");
          setStep("success");
        } catch (offlineErr) {
          console.error('[KioskMode] Offline walk-in save failed:', offlineErr);
          setWalkinError("Failed to save walk-in registration offline. Please try again.");
        }
      } else {
        setWalkinError("Registration failed. Please try again.");
      }
    } finally {
      setWalkinSubmitting(false);
    }
  };

  const handleSelectResult = (attendee: Attendee | OfflineAttendee) => {
    setSearchResults([]);
    if (attendee.checkedIn) {
      setLastScanned(attendee as Attendee);
      setScanError("Already checked in");
      trackComplete("kiosk", "scan");
      setStep("success");
    } else {
      checkInMutation.mutate(attendee.id);
    }
  };

  const isGroupCheckinEnabled = Boolean((event?.tempStaffSettings as any)?.groupCheckinEnabled);

  // Attempt group lookup: returns {found, memberCount, scannedMemberId} or null on failure.
  // If a multi-member group is found, populates the groupCheckin hook state and transitions to group step.
  const attemptGroupLookup = useCallback(async (scannedValue: string): Promise<boolean> => {
    if (!isGroupCheckinEnabled || !exitPin || !eventId) return false;

    try {
      // Peek at the group data first via direct fetch
      const res = await fetch(`/api/kiosk/${eventId}/group-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: exitPin, orderCode: scannedValue }),
      });
      if (!res.ok) throw new Error(`Group lookup failed (${res.status})`);

      const data = await res.json();
      if (!data.found || !data.members || data.members.length <= 1) {
        return false;
      }

      // It's a real multi-member group — now populate the hook state
      await groupCheckin.lookupGroup(scannedValue);

      // Determine which member was scanned
      const scannedMember = (data.members as GroupMember[]).find(
        m => m.orderCode === scannedValue || m.externalId === scannedValue
      );
      setGroupScannedMemberId(scannedMember?.id || null);
      setStep("group");
      return true;
    } catch {
      // Offline fallback: search cached attendees by orderCode
      if (!navigator.onLine && offlineAttendees.length > 0) {
        const found = groupCheckin.offlineLookup(scannedValue, offlineAttendees);
        if (found) {
          // Determine scanned member from source data (hook state hasn't re-rendered yet)
          const scannedMember = offlineAttendees.find(
            a => (a as any).orderCode === scannedValue || (a as any).externalId === scannedValue
          );
          setGroupScannedMemberId(scannedMember?.id || null);
          toast({
            title: "Group Found (Offline)",
            description: "Using cached data. Will sync when online.",
          });
          setStep("group");
          return true;
        }
      }
      groupCheckin.reset();
      return false;
    }
  }, [isGroupCheckinEnabled, exitPin, eventId, groupCheckin, offlineAttendees, toast]);

  const handleQRScan = async (code: string) => {
    const trimmed = code.trim();

    // Pass 1: Try as orderCode for group check-in
    if (isGroupCheckinEnabled && exitPin && eventId) {
      const isGroup = await attemptGroupLookup(trimmed);
      if (isGroup) return;
    }

    // Pass 2: Standard single check-in flow (match by externalId/regCode/etc.)
    const result = parseQrCode(code, effectiveAttendees as Attendee[]);

    if (result.type === "found" && result.attendee) {
      const found = result.attendee;
      if (found.checkedIn) {
        setLastScanned(found);
        setScanError("Already checked in");
        trackComplete("kiosk", "scan");
        setStep("success");
      } else {
        checkInMutation.mutate(found.id);
      }
    } else {
      setScanError("QR code not recognized. Please try manual search.");
    }
  };

  const handleGroupConfirm = async () => {
    try {
      const result = await groupCheckin.checkInSelected();
      playCheckinSound();

      // Gather the members who were successfully checked in for printing
      const checkedInIds = Array.from(groupCheckin.selectedIds);
      const justCheckedIn = groupCheckin.members.filter(m => checkedInIds.includes(m.id));
      setGroupCheckedInMembers(justCheckedIn);

      // Find primary for the success message
      const primary = groupCheckin.members.find(m => m.id === groupCheckin.primaryId);
      if (primary) {
        setLastScanned({
          id: primary.id,
          firstName: primary.firstName,
          lastName: primary.lastName,
          email: primary.email || null,
          company: primary.company || null,
          title: primary.title || null,
          participantType: primary.participantType || "General",
          checkedIn: true,
          customFields: {},
          externalId: primary.externalId || null,
        } as Attendee);
      }

      trackComplete("kiosk", "scan");

      if (isOnline) {
        if (staffToken) {
          queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees-kiosk'] });
        } else {
          queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
        }
      }

      // Go to success — user can print from there
      setStep("success");
    } catch (error) {
      console.error("Group check-in failed:", error);
      playErrorSound();
      setScanError("Group check-in failed. Please try again.");
      setStep("scanning");
    }
  };

  const handleGroupCheckInJustMe = () => {
    // Find the scanned member and do a single check-in
    const scannedId = groupScannedMemberId || groupCheckin.primaryId;
    if (scannedId) {
      const member = groupCheckin.members.find(m => m.id === scannedId);
      if (member) {
        groupCheckin.reset();
        setGroupScannedMemberId(null);
        setGroupCheckedInMembers([]);
        if (member.checkedIn) {
          setLastScanned({
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email || null,
            company: member.company || null,
            title: member.title || null,
            participantType: member.participantType || "General",
            checkedIn: true,
            customFields: {},
            externalId: member.externalId || null,
          } as Attendee);
          setScanError("Already checked in");
          trackComplete("kiosk", "scan");
          setStep("success");
        } else {
          checkInMutation.mutate(scannedId);
        }
      }
    }
  };

  const handleGroupBack = () => {
    groupCheckin.reset();
    setGroupScannedMemberId(null);
    setGroupCheckedInMembers([]);
    setStep("scanning");
  };

  // Print a single badge for a given member (used by both single and group flows)
  const printBadgeForMember = async (memberData: {
    firstName: string;
    lastName: string;
    company: string;
    title: string;
    participantType: string;
    customFields: Record<string, any>;
    externalId?: string;
  }) => {
    const attendeeData = {
      firstName: memberData.firstName,
      lastName: memberData.lastName,
      company: memberData.company || "",
      title: memberData.title || "",
      participantType: memberData.participantType || "General",
      customFields: memberData.customFields || {},
    };

    const participantType = memberData.participantType || "General";
    let template: BadgeTemplate | undefined;

    const effectiveForcedId = forcedBadgeTemplateId || kioskSettings?.forcedBadgeTemplateId;

    if (effectiveForcedId) {
      template = templates.find(t => t.id === effectiveForcedId);
    } else if (templateMappings) {
      const normalizedType = participantType.trim().toLowerCase();
      const mapping = Object.entries(templateMappings).find(
        ([key]) => key.trim().toLowerCase() === normalizedType
      );
      if (mapping?.[1]?.templateId) {
        template = templates.find(t => t.id === mapping[1].templateId);
      }
    }

    if (!template) {
      template = templates.find(t => t.id === event?.defaultBadgeTemplateId) || templates[0];
    }

    const templateConfig = {
      width: template?.width || 4,
      height: template?.height || 3,
      backgroundColor: template?.backgroundColor || "#ffffff",
      textColor: template?.textColor || "#000000",
      accentColor: template?.accentColor || "#3b82f6",
      fontFamily: template?.fontFamily || "Arial",
      includeQR: template?.includeQR ?? true,
      qrPosition: template?.qrPosition || "bottom-right",
      customQrPosition: (template as any)?.customQrPosition || undefined,
      qrCodeConfig: eventBadgeSettings?.qrCodeConfigOverride || (template?.qrCodeConfig as any) || undefined,
      mergeFields: (template?.mergeFields as any[]) || [],
      imageElements: (template as any)?.imageElements || [],
    };

    if (selectedPrinter?.type === 'printnode' && selectedPrinter.printNodeId) {
      const printerName = selectedPrinter.printerName || '';
      const isZebraPrinter =
        printerName.toLowerCase().includes('zebra') ||
        printerName.toLowerCase().includes('zd') ||
        printerName.toLowerCase().includes('zt') ||
        printerName.toLowerCase().includes('zp');

      let printResponse: Response;

      if (isZebraPrinter) {
        const zplBadgeData = {
          firstName: attendeeData.firstName,
          lastName: attendeeData.lastName,
          company: attendeeData.company,
          title: attendeeData.title,
          externalId: memberData.externalId || undefined,
        };
        const zplTemplate = {
          width: templateConfig.width,
          height: templateConfig.height,
          includeQR: templateConfig.includeQR,
          qrData: memberData.externalId || `${attendeeData.firstName}-${attendeeData.lastName}`,
        };
        const zplData = networkPrint.generateBadgeZpl(zplBadgeData, zplTemplate);

        printResponse = await fetch('/api/printnode/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            printerId: selectedPrinter.printNodeId,
            zplData,
            title: `Badge: ${attendeeData.firstName} ${attendeeData.lastName}`,
          }),
        });
      } else {
        const pnRotation = (template?.labelRotation || 0) as 0 | 90 | 180 | 270;
        const pdfBlob = await printOrchestrator.generatePDFBlob(attendeeData, templateConfig, pnRotation);
        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
        const pdfBase64 = btoa(
          new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        printResponse = await fetch('/api/printnode/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            printerId: selectedPrinter.printNodeId,
            pdfBase64,
            title: `Badge: ${attendeeData.firstName} ${attendeeData.lastName}`,
          }),
        });
      }

      const printResult = await printResponse.json();
      if (!printResponse.ok || !printResult.success) {
        throw new Error(printResult.error || 'PrintNode print failed');
      }
    } else if (selectedPrinter?.type === 'custom' || selectedPrinter?.type === 'local') {
      const ip = selectedPrinter.type === 'custom' ? selectedPrinter.customIp : selectedPrinter.ipAddress;
      const port = selectedPrinter.type === 'custom' ? selectedPrinter.customPort : (selectedPrinter.port || 9100);
      const dpi = selectedPrinter.type === 'custom' ? selectedPrinter.customDpi : (selectedPrinter.dpi || 203);
      if (ip) {
        networkPrint.setIp(ip);
        networkPrint.setPort(port);
        networkPrint.setDpi(dpi);
      }
      const zplBadgeData = {
        firstName: attendeeData.firstName,
        lastName: attendeeData.lastName,
        company: attendeeData.company,
        title: attendeeData.title,
        externalId: memberData.externalId || undefined,
      };
      const zplTemplate = {
        width: templateConfig.width,
        height: templateConfig.height,
        includeQR: templateConfig.includeQR,
        qrData: memberData.externalId || `${attendeeData.firstName}-${attendeeData.lastName}`,
      };
      const zplData = networkPrint.generateBadgeZpl(zplBadgeData, zplTemplate);
      const result = await networkPrint.printZpl(zplData);
      if (!result.success) throw new Error(result.error || 'Network print failed');
    } else {
      const rotation = (template?.labelRotation || 0) as 0 | 90 | 180 | 270;
      await printOrchestrator.printBadge(attendeeData, templateConfig, rotation);
    }
  };

  const handlePrintBadge = async () => {
    if (!lastScanned && groupCheckedInMembers.length === 0) return;

    trackStart("kiosk", "print");
    setStep("printing");

    try {
      // Determine who to print for: group members or single attendee
      const membersToPrint: Array<{
        firstName: string;
        lastName: string;
        company: string;
        title: string;
        participantType: string;
        customFields: Record<string, any>;
        externalId?: string;
      }> = [];

      if (groupCheckedInMembers.length > 0) {
        // Group flow — print for all checked-in members
        for (const member of groupCheckedInMembers) {
          membersToPrint.push({
            firstName: member.firstName,
            lastName: member.lastName,
            company: member.company || "",
            title: member.title || "",
            participantType: member.participantType || "General",
            customFields: {},
            externalId: member.externalId || undefined,
          });
        }
      } else if (lastScanned) {
        // Single flow
        membersToPrint.push({
          firstName: lastScanned.firstName,
          lastName: lastScanned.lastName,
          company: lastScanned.company || "",
          title: lastScanned.title || "",
          participantType: lastScanned.participantType || "General",
          customFields: lastScanned.customFields || {},
          externalId: lastScanned.externalId || undefined,
        });
      }

      if (membersToPrint.length > 1) {
        // Group: send all print jobs in parallel
        let printedCount = 0;
        setGroupPrintIndex(0);
        const printResults = await Promise.allSettled(
          membersToPrint.map((member) =>
            printBadgeForMember(member).then(() => {
              printedCount++;
              setGroupPrintIndex(printedCount);
            })
          )
        );
        const succeeded = printResults.filter(r => r.status === 'fulfilled').length;
        const failed = printResults.filter(r => r.status === 'rejected').length;
        toast({
          title: failed > 0 ? `${succeeded} of ${membersToPrint.length} Badges Printed` : `${succeeded} Badges Sent to Printer`,
          description: failed > 0
            ? `${failed} badge${failed !== 1 ? 's' : ''} failed to print. Reprint from the attendee list.`
            : selectedPrinter?.type === 'printnode'
              ? `Sent to ${selectedPrinter.printerName || 'cloud printer'}`
              : `${succeeded} badges are being printed`,
          variant: failed > 0 ? "destructive" : "default",
        });
      } else {
        // Single: print one badge
        setGroupPrintIndex(1);
        await printBadgeForMember(membersToPrint[0]);
        toast({
          title: "Badge Sent to Printer",
          description: selectedPrinter?.type === 'printnode'
            ? `Sent to ${selectedPrinter.printerName || 'cloud printer'}`
            : "Your badge is being printed",
        });
      }

      setTimeout(() => {
        handleReset();
      }, 3000);
    } catch (error) {
      console.error("Print error:", error);
      toast({
        title: "Print Failed",
        description: "Could not print badge. Please try again or contact staff.",
        variant: "destructive",
      });
      trackAbandon("kiosk", "print");
      setStep("success");
    }
  };

  const handleReset = () => {
    trackComplete("kiosk", "complete");
    setStep("welcome");
    setLastScanned(null);
    setScanError(null);
    setManualInput("");
    setSearchResults([]);
    groupCheckin.reset();
    setGroupScannedMemberId(null);
    setGroupCheckedInMembers([]);
    setGroupPrintIndex(0);
  };

  const checkedInCount = effectiveAttendees.filter(a => a.checkedIn).length;
  const totalCount = effectiveAttendees.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <KioskBrandingHeader
            branding={branding}
            eventName={eventName || "Self Check-In"}
            onLogoTap={handleLogoTap}
            fallbackIcon={<QrCode className="h-8 w-8 text-primary-foreground" />}
          >
            {eventId && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Badge variant="secondary" data-testid="badge-checkin-count">
                  <UserCheck className="h-3 w-3 mr-1" />
                  {checkedInCount} / {totalCount} checked in
                </Badge>
                {!isOnline && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-offline">
                    <WifiOff className="h-3 w-3 mr-1" />
                    Offline Mode
                  </Badge>
                )}
                {pendingSyncCount > 0 && (
                  <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400" data-testid="badge-pending-sync">
                    <Cloud className="h-3 w-3 mr-1" />
                    {pendingSyncCount} pending sync
                  </Badge>
                )}
                {selectedPrinter?.type === 'printnode' && (
                  <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400" data-testid="badge-printer">
                    <Printer className="h-3 w-3 mr-1" />
                    {selectedPrinter.printerName || 'Cloud Printer'}
                  </Badge>
                )}
              </div>
            )}
          </KioskBrandingHeader>

          <Card className="border-2">
            <CardContent className="p-12">
              {step === "welcome" && (
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold">Welcome!</h2>
                    <p className="text-lg text-muted-foreground">
                      Tap below to start your check-in
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="h-20 px-12 text-xl"
                    onClick={handleStartCheckIn}
                    data-testid="button-kiosk-start"
                  >
                    <QrCode className="h-6 w-6 mr-3" />
                    Start Check-In
                  </Button>
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
                        data-testid="button-exit-kiosk"
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
                      Scan your QR code or enter your information
                    </p>
                  </div>

                  <Tabs defaultValue="qr" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 h-14 p-1.5 rounded-lg">
                      <TabsTrigger value="qr" className="h-full text-base rounded-md" data-testid="tab-kiosk-qr" aria-label="Scan QR Code">
                        <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
                        Scan QR Code
                      </TabsTrigger>
                      <TabsTrigger value="manual" className="h-full text-base rounded-md" data-testid="tab-kiosk-manual" aria-label="Type Information">
                        <Keyboard className="h-5 w-5 mr-2" aria-hidden="true" />
                        Type Info
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="qr" className="space-y-4 mt-0 pt-4">
                      <div className="max-w-md mx-auto kiosk-scanner-container">
                        <QRScanner 
                          onScan={handleQRScan} 
                          autoStart={true} 
                          showHeader={false}
                          compact={true}
                        />
                      </div>
                      <p className="text-center text-sm text-muted-foreground">
                        Position your badge QR code in front of the camera
                      </p>
                    </TabsContent>

                    <TabsContent value="manual" className="space-y-4 mt-0 pt-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter your full name or email exactly as registered..."
                          value={manualInput}
                          onChange={(e) => {
                            setManualInput(e.target.value);
                            setScanError(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                          className="h-14 text-lg"
                          autoFocus
                          data-testid="input-kiosk-search"
                        />
                        <Button 
                          size="lg"
                          className="h-14 px-6"
                          onClick={handleManualSearch}
                          disabled={!manualInput.trim() || checkInMutation.isPending}
                          data-testid="button-kiosk-search"
                        >
                          <Search className="h-5 w-5 mr-2" aria-hidden="true" />
                          Search
                        </Button>
                      </div>
                      <p className="text-center text-sm text-muted-foreground">
                        Enter your name or email exactly as it appears on your registration
                      </p>
                    </TabsContent>
                  </Tabs>

                  {scanError && (
                    <div className="flex items-center justify-center gap-2 text-destructive">
                      <XCircle className="h-5 w-5" aria-hidden="true" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  {checkInMutation.isPending && (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span>Checking in...</span>
                    </div>
                  )}

                  {event?.tempStaffSettings?.allowKioskWalkins && (
                    <div className="text-center pt-2">
                      <Button
                        variant="secondary"
                        size="lg"
                        className="h-12 px-8"
                        onClick={() => {
                          setWalkinForm({});
                          setWalkinError(null);
                          setStep("walkin");
                        }}
                        data-testid="button-kiosk-walkin"
                      >
                        <UserPlus className="h-5 w-5 mr-2" />
                        Not registered? Sign up here
                      </Button>
                    </div>
                  )}

                  <div className="text-center pt-4">
                    <Button variant="outline" onClick={handleReset} data-testid="button-kiosk-cancel">
                      <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {step === "results" && (
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
              )}

              {step === "verify" && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-2">
                      <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-semibold">Verify Your Identity</h2>
                    <p className="text-muted-foreground">
                      We found multiple registrations matching your search. Please enter the email address you registered with.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Input
                      type="email"
                      placeholder="Enter your email address..."
                      value={verifyEmail}
                      onChange={(e) => { setVerifyEmail(e.target.value); setVerifyError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyEmail()}
                      className="h-14 text-lg"
                      autoFocus
                      data-testid="input-kiosk-verify-email"
                    />
                    <Button
                      size="lg"
                      className="w-full h-14 text-lg"
                      onClick={handleVerifyEmail}
                      disabled={!verifyEmail.trim()}
                      data-testid="button-kiosk-verify"
                    >
                      Verify & Check In
                    </Button>
                  </div>

                  {verifyError && (
                    <div className="flex items-center justify-center gap-2 text-destructive">
                      <XCircle className="h-5 w-5" />
                      <span>{verifyError}</span>
                    </div>
                  )}

                  <div className="text-center pt-2">
                    <Button variant="outline" onClick={() => { setStep("scanning"); setVerifyEmail(""); setVerifyError(null); }}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Search
                    </Button>
                  </div>
                </div>
              )}

              {step === "walkin" && event && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-2">
                      <UserPlus className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-2xl font-semibold">Register as Walk-in</h2>
                    <p className="text-muted-foreground">
                      Fill in your details below to register for this event
                    </p>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const config = event.tempStaffSettings?.kioskWalkinConfig;
                      const enabledFields = config?.enabledFields || ['firstName', 'lastName', 'email'];
                      const requiredFields = config?.requiredFields || ['firstName', 'lastName', 'email'];
                      const availableTypes = config?.availableTypes || ['Walk-in'];

                      const fieldDefs = [
                        { key: 'firstName', label: 'First Name', type: 'text', alwaysShow: true },
                        { key: 'lastName', label: 'Last Name', type: 'text', alwaysShow: true },
                        { key: 'email', label: 'Email Address', type: 'email', alwaysShow: false },
                        { key: 'company', label: 'Company', type: 'text', alwaysShow: false },
                        { key: 'title', label: 'Title', type: 'text', alwaysShow: false },
                      ];

                      return (
                        <>
                          {fieldDefs
                            .filter(f => f.alwaysShow || enabledFields.includes(f.key))
                            .map(field => (
                              <div key={field.key}>
                                <Input
                                  type={field.type}
                                  placeholder={`${field.label}${requiredFields.includes(field.key) || field.alwaysShow ? ' *' : ''}`}
                                  value={walkinForm[field.key] || ''}
                                  onChange={(e) => setWalkinForm({ ...walkinForm, [field.key]: e.target.value })}
                                  className="h-12 text-base"
                                  data-testid={`input-walkin-${field.key}`}
                                />
                              </div>
                            ))}

                          {enabledFields.includes('participantType') && availableTypes.length > 1 && (
                            <Select
                              value={walkinForm.participantType || config?.defaultType || availableTypes[0]}
                              onValueChange={(value) => setWalkinForm({ ...walkinForm, participantType: value })}
                            >
                              <SelectTrigger className="h-12 text-base" data-testid="select-walkin-type">
                                <SelectValue placeholder="Select attendee type..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableTypes.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {walkinError && (
                    <div className="flex items-center justify-center gap-2 text-destructive">
                      <XCircle className="h-5 w-5" />
                      <span>{walkinError}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="h-12"
                      onClick={() => { setStep("scanning"); setWalkinForm({}); setWalkinError(null); }}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      size="lg"
                      className="flex-1 h-12 text-lg"
                      onClick={handleWalkinSubmit}
                      disabled={walkinSubmitting || !walkinForm.firstName?.trim() || !walkinForm.lastName?.trim()}
                      data-testid="button-walkin-submit"
                    >
                      {walkinSubmitting ? "Registering..." : "Register & Check In"}
                    </Button>
                  </div>
                </div>
              )}

              {step === "group" && groupCheckin.isGroupFound && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-semibold">Group Check-In</h2>
                    <p className="text-lg text-muted-foreground">
                      Select who you'd like to check in
                    </p>
                  </div>

                  <GroupCheckinCard
                    members={groupCheckin.members}
                    primaryId={groupCheckin.primaryId}
                    selectedIds={groupCheckin.selectedIds}
                    onToggleMember={groupCheckin.toggleMember}
                    onSelectAll={groupCheckin.selectAll}
                    onDeselectAll={groupCheckin.deselectAll}
                    onConfirm={handleGroupConfirm}
                    onCheckInJustMe={handleGroupCheckInJustMe}
                    mode="kiosk"
                    isProcessing={groupCheckin.isProcessing}
                    scannedMemberId={groupScannedMemberId || undefined}
                  />

                  <div className="text-center pt-2">
                    <Button variant="outline" onClick={handleGroupBack} data-testid="button-group-back">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Scan
                    </Button>
                  </div>
                </div>
              )}

              {step === "success" && lastScanned && (
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-2">
                    <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" />
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
                      <Printer className="h-6 w-6 mr-3" />
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
              )}

              {step === "printing" && (
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
              )}

              {step === "error" && (
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mb-2">
                    <XCircle className="h-12 w-12 text-destructive" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold text-destructive">
                      {securityError?.includes('Access denied') ? 'Security Error' : 
                       securityError?.includes('session has expired') ? 'Session Expired' : 'Error'}
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      {securityError || "An error occurred"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 items-center">
                    {!securityError?.includes('Access denied') && (
                      <Button
                        size="lg"
                        className="h-14 w-64"
                        onClick={() => {
                          setSecurityError(null);
                          setStep("welcome");
                          queryClient.invalidateQueries({ queryKey: staffToken ? [`/api/staff/event-for-kiosk`] : [`/api/events/${eventId}/scoped?customerId=${scopedCustomerId}`] });
                        }}
                        data-testid="button-kiosk-retry-error"
                      >
                        <RefreshCw className="h-5 w-5 mr-2" />
                        Try Again
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 w-64"
                      onClick={onExit}
                      data-testid="button-kiosk-exit-error"
                    >
                      Exit Kiosk Mode
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center mt-6 text-sm text-muted-foreground">
            Need help? Contact event staff
          </div>
        </div>
      </div>

      {isLocked && (
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
      )}

      {!isLocked && isOnline && !isCached && eventId && (
        <div className="fixed bottom-4 left-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreCache}
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

      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Exit Kiosk Mode
            </DialogTitle>
            <DialogDescription>
              Enter the exit PIN to unlock and exit kiosk mode.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter PIN"
              value={enteredPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setEnteredPin(val);
                setPinError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleExitAttempt()}
              className="text-center text-2xl tracking-widest"
              maxLength={8}
              autoFocus
              data-testid="input-exit-pin-dialog"
            />
            {pinError && (
              <p className="text-sm text-destructive text-center">{pinError}</p>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowExitDialog(false);
                  setEnteredPin("");
                  setPinError("");
                  if (kioskSettings?.enableFullscreen !== false && !document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleExitAttempt}
                disabled={!enteredPin}
                data-testid="button-confirm-exit"
              >
                Unlock & Exit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {eventId && <BadgeAIChat eventId={eventId} compact={true} />}

      <IdleTimeoutDialog
        open={showKioskWarning}
        remainingSeconds={kioskRemaining}
        onStayActive={kioskStayActive}
      />
    </div>
  );
}
