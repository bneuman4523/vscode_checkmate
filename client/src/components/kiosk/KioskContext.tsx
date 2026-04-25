import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { playCheckinSound, playErrorSound } from "@/lib/sounds";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useGroupCheckin } from "@/hooks/useGroupCheckin";
import type { GroupMember } from "@/hooks/useGroupCheckin";
import { printOrchestrator } from "@/services/print-orchestrator";
import { offlineCheckinService } from "@/services/offline-checkin-service";
import { kioskPreCacheService, type PreCacheProgress } from "@/services/kiosk-precache-service";
import { offlineDB } from "@/lib/offline-db";
import { useNetworkPrint } from "@/hooks/use-network-print";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Attendee, Event, BadgeTemplate, KioskBrandingConfig } from "@shared/schema";
import type { OfflineAttendee } from "@/lib/offline-db";
import type { KioskSettings } from "@/components/KioskLauncher";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import { getSavedPrinter } from "@/lib/printerPreferences";
import { useTheme } from "@/components/ThemeProvider";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { parseQrCode } from "@/lib/qr-parser";
import type { EventWorkflowWithSteps } from "@shared/schema";

export type KioskStep = "welcome" | "scanning" | "results" | "verify" | "walkin" | "group" | "workflow" | "success" | "printing" | "error";

interface TemplateMappingEntry {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: string;
}

export interface KioskModeProps {
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

export interface KioskContextValue {
  // Props
  eventId?: string;
  eventName: string;
  exitPin?: string;
  scopedCustomerId?: string;
  onExit?: () => void;
  isLocked: boolean;
  selectedPrinter?: SelectedPrinter;
  kioskSettings?: KioskSettings;
  forcedBadgeTemplateId?: string;
  staffToken?: string;

  // Core flow state
  step: KioskStep;
  setStep: (step: KioskStep) => void;
  lastScanned: Attendee | null;
  setLastScanned: (a: Attendee | null) => void;
  scanError: string | null;
  setScanError: (e: string | null) => void;
  securityError: string | null;

  // Scanning state
  manualInput: string;
  setManualInput: (v: string) => void;
  searchResults: (Attendee | OfflineAttendee)[];
  checkInMutation: ReturnType<typeof useMutation<any, Error, string>>;

  // Verify state
  verifyEmail: string;
  setVerifyEmail: (v: string) => void;
  verifyError: string | null;
  setVerifyError: (e: string | null) => void;

  // Walkin state
  walkinForm: Record<string, string>;
  setWalkinForm: (f: Record<string, string>) => void;
  walkinError: string | null;
  walkinSubmitting: boolean;

  // Group state
  groupCheckin: ReturnType<typeof useGroupCheckin>;
  groupScannedMemberId: string | null;
  groupCheckedInMembers: GroupMember[];
  groupPrintIndex: number;

  // Workflow state
  workflowAttendee: Attendee | null;
  kioskWorkflow: EventWorkflowWithSteps | null;

  // Exit dialog state
  showExitDialog: boolean;
  setShowExitDialog: (v: boolean) => void;
  enteredPin: string;
  setEnteredPin: (v: string) => void;
  pinError: string;
  setPinError: (v: string) => void;

  // Data
  event: Event | undefined;
  effectiveAttendees: (Attendee | OfflineAttendee)[];
  templates: BadgeTemplate[];
  branding: KioskBrandingConfig | null;

  // Offline state
  isOnline: boolean;
  isCached: boolean;
  pendingSyncCount: number;
  isPreCaching: boolean;
  preCacheProgress: PreCacheProgress | null;

  // Idle timeout
  showKioskWarning: boolean;
  kioskRemaining: number;
  kioskStayActive: () => void;

  // Derived
  checkedInCount: number;
  totalCount: number;

  // Handlers
  handleStartCheckIn: () => void;
  handleManualSearch: () => void;
  handleQRScan: (code: string) => void;
  handleSelectResult: (attendee: Attendee | OfflineAttendee) => void;
  handleVerifyEmail: () => void;
  handleWalkinSubmit: () => void;
  handleGroupConfirm: () => void;
  handleGroupCheckInJustMe: () => void;
  handleGroupBack: () => void;
  handleWorkflowComplete: () => void;
  handleWorkflowCancel: () => void;
  handlePrintBadge: () => void;
  handleReset: () => void;
  handleLogoTap: () => void;
  handleExitAttempt: () => void;
  handlePreCache: (silent?: boolean) => void;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function useKiosk(): KioskContextValue {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used inside <KioskProvider>");
  return ctx;
}

export function KioskProvider({ children, ...props }: KioskModeProps & { children: React.ReactNode }) {
  const {
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
  } = props;

  const selectedPrinter = printerProp ?? (eventId ? getSavedPrinter(eventId) : null) ?? undefined;

  // ── State ──────────────────────────────────────────────────────────────
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
  const [workflowAttendee, setWorkflowAttendee] = useState<Attendee | null>(null);
  const [kioskWorkflow, setKioskWorkflow] = useState<EventWorkflowWithSteps | null>(null);
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(offlineCheckinService.getOnlineStatus());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheProgress, setPreCacheProgress] = useState<PreCacheProgress | null>(null);
  const [offlineAttendees, setOfflineAttendees] = useState<OfflineAttendee[]>([]);
  const [isCached, setIsCached] = useState(false);

  const logoTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const printResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoCachedRef = useRef(false);
  const previousThemeRef = useRef("");

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { toast } = useToast();
  const networkPrint = useNetworkPrint();
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const { theme: appTheme, setTheme } = useTheme();
  previousThemeRef.current = previousThemeRef.current || appTheme;

  const groupCheckin = useGroupCheckin({
    eventId: eventId || '',
    mode: 'kiosk',
    pin: exitPin,
  });

  // ── Effects ────────────────────────────────────────────────────────────

  // Fetch workflow config for kiosk on mount
  useEffect(() => {
    if (!eventId || !exitPin || workflowLoaded) return;
    fetch(`/api/kiosk/${eventId}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: exitPin }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setKioskWorkflow(data); setWorkflowLoaded(true); })
      .catch(() => setWorkflowLoaded(true));
  }, [eventId, exitPin, workflowLoaded]);

  // Theme branding
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

  // Sound effects
  useEffect(() => {
    if (step === "success") playCheckinSound();
    if (step === "error") playErrorSound();
  }, [step]);

  // Offline sync listener
  const updateSyncStatus = useCallback(async () => {
    const stats = await offlineCheckinService.getOfflineStats();
    setPendingSyncCount(stats.pendingSyncActions);
  }, []);

  const checkCacheStatus = useCallback(async () => {
    if (eventId) {
      const status = await kioskPreCacheService.getPreCacheStatus(eventId);
      setIsCached(status.cached);
      if (status.cached) {
        const cached = await kioskPreCacheService.getCachedAttendees(eventId);
        setOfflineAttendees(cached);
        if (!branding) {
          const cachedBranding = await kioskPreCacheService.getCachedBranding(eventId);
          if (cachedBranding) setBranding(cachedBranding);
        }
      }
    }
  }, [eventId, branding]);

  useEffect(() => {
    const unsubscribe = offlineCheckinService.onStatusChange((online) => {
      setIsOnline(online);
      if (online) offlineCheckinService.syncPendingActions().then(() => updateSyncStatus());
    });
    updateSyncStatus();
    checkCacheStatus();
    return () => { unsubscribe(); };
  }, [eventId, updateSyncStatus, checkCacheStatus]);

  // ── Fetch helpers ───────────────────────────────────────────────────────
  const staffHeaders = staffToken ? { 'Authorization': `Bearer ${staffToken}`, 'Content-Type': 'application/json' } : undefined;
  const staffFetch = useCallback(async (url: string) => {
    const res = await fetch(url, staffHeaders ? { headers: staffHeaders } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [staffHeaders]);

  /** POST to a PIN-protected kiosk endpoint with consistent error handling */
  const kioskPost = useCallback(async (url: string, body: Record<string, unknown>): Promise<Response> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: exitPin, ...body }),
    });
    return res;
  }, [exitPin]);

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
            if (data.branding) setBranding(data.branding as KioskBrandingConfig);
            if (data.badgeSettings) setEventBadgeSettings(data.badgeSettings);
            return data.event as Event;
          } catch (err) {
            if (!navigator.onLine && eventId) {
              const cachedEvent = await offlineDB.getEvent(eventId);
              if (cachedEvent) {
                const cachedBranding = await offlineDB.getAppState(`branding_${eventId}`);
                if (cachedBranding) setBranding(cachedBranding as KioskBrandingConfig);
                return { id: cachedEvent.id, name: cachedEvent.name, eventDate: cachedEvent.date, customerId: cachedEvent.customerId, status: 'active', defaultBadgeTemplateId: cachedEvent.defaultBadgeTemplateId || null } as unknown as Event;
              }
            }
            throw err;
          }
        },
        enabled: Boolean(eventId),
      };

  const { data: event, isLoading: eventLoading, error: eventError } = useQuery<Event>({
    ...eventQueryOptions, retry: 2, staleTime: 0, refetchOnMount: 'always',
  });

  const isEventValid = Boolean(event && !eventError);

  const attendeesQueryOptions = staffToken
    ? { queryKey: ['/api/staff/attendees-kiosk'], queryFn: () => staffFetch('/api/staff/attendees'), enabled: Boolean(eventId && isEventValid) }
    : { queryKey: [`/api/kiosk/attendees-disabled/${eventId}`], queryFn: async () => [] as Attendee[], enabled: false };

  const { data: attendees = [] } = useQuery<Attendee[]>({ ...attendeesQueryOptions, refetchInterval: isOnline ? 10000 : false });

  // Auto pre-cache
  useEffect(() => {
    if (isOnline && eventId && scopedCustomerId && attendees.length > 0 && !isCached && !isPreCaching && !autoCachedRef.current) {
      autoCachedRef.current = true;
      handlePreCache(true);
    }
  }, [isOnline, eventId, scopedCustomerId, attendees.length, isCached, isPreCaching]);

  const templatesQueryOptions = staffToken
    ? { queryKey: ['/api/staff/badge-templates-kiosk'], queryFn: () => staffFetch('/api/staff/badge-templates'), enabled: Boolean(isEventValid) }
    : {
        queryKey: [`/api/kiosk/${eventId}/badge-templates`],
        queryFn: async () => {
          try {
            const res = await fetch(`/api/kiosk/${eventId}/badge-templates`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          } catch (err) {
            if (!navigator.onLine) {
              const customerId = event?.customerId || scopedCustomerId;
              if (customerId) { const cached = await offlineDB.getBadgeTemplates(customerId); if (cached.length > 0) return cached; }
            }
            throw err;
          }
        },
        enabled: Boolean(eventId && isEventValid),
      };

  const { data: templates = [] } = useQuery<BadgeTemplate[]>(templatesQueryOptions);

  const templateMappingsQueryOptions = staffToken
    ? { queryKey: [`/api/staff/template-mappings-kiosk`], queryFn: () => staffFetch(`/api/events/${eventId}/template-mappings`).catch(() => ({})) }
    : {
        queryKey: [`/api/kiosk/${eventId}/template-mappings`],
        queryFn: async () => {
          try {
            const res = await fetch(`/api/kiosk/${eventId}/template-mappings`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          } catch (err) {
            if (!navigator.onLine) return {};
            throw err;
          }
        },
      };

  const { data: templateMappings } = useQuery<Record<string, TemplateMappingEntry>>({ ...templateMappingsQueryOptions, enabled: Boolean(eventId && isEventValid) });

  const effectiveAttendees = isOnline && attendees.length > 0 ? attendees : offlineAttendees;

  // Event error/recovery effects
  useEffect(() => {
    if (!eventLoading && eventError) {
      const errMsg = eventError instanceof Error ? eventError.message : String(eventError);
      const isAccessDenied = errMsg.toLowerCase().includes('access denied') || errMsg.toLowerCase().includes('forbidden') || errMsg.toLowerCase().includes('403');
      const isAuthError = errMsg.toLowerCase().includes('authentication') || errMsg.toLowerCase().includes('unauthorized') || errMsg.toLowerCase().includes('401');
      if (isAccessDenied) setSecurityError("Access denied: This event does not belong to your organization.");
      else if (isAuthError) setSecurityError("Your session has expired. Please exit and log in again.");
      else if (!navigator.onLine) setSecurityError("No cached data available. Connect to the internet and sync data first.");
      else setSecurityError("Could not load event data. Please check your connection and try again.");
      trackAbandon("kiosk", "scan");
      setStep("error");
    }
  }, [eventError, eventLoading, trackAbandon]);

  useEffect(() => {
    if (event && !eventError) {
      setSecurityError(null);
      if (step === "error") setStep("welcome");
    }
  }, [event, eventError]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      if (staffToken) {
        const res = await fetch('/api/staff/checkin', { method: 'POST', headers: { 'Authorization': `Bearer ${staffToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ attendeeId }) });
        if (!res.ok) { const errData = await res.json().catch(() => ({ error: 'Check-in failed' })); throw new Error(errData.error || 'Check-in failed'); }
        return { success: true, isOffline: false };
      }
      if (exitPin && eventId) {
        const res = await kioskPost(`/api/kiosk/${eventId}/checkin`, { attendeeId });
        if (!res.ok) { const errData = await res.json().catch(() => ({ error: 'Check-in failed' })); throw new Error(errData.error || 'Check-in failed'); }
        const data = await res.json();
        if (data.requiresWorkflow && data.attendee) {
          setWorkflowAttendee(data.attendee as Attendee);
          setLastScanned(data.attendee as Attendee);
          setStep("workflow");
          return { success: true, isOffline: false, requiresWorkflow: true };
        }
        if (data.attendee) { setLastScanned(data.attendee as Attendee); trackComplete("kiosk", "scan"); setStep("success"); }
        return { success: true, isOffline: false };
      }
      const result = await offlineCheckinService.checkInAttendee(attendeeId, eventId);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: (result, attendeeId) => {
      if ((result as any)?.requiresWorkflow) return;
      const attendee = effectiveAttendees.find(a => a.id === attendeeId);
      if (attendee) { setLastScanned({ ...attendee, checkedIn: true } as Attendee); trackComplete("kiosk", "scan"); setStep("success"); }
      setScanError(null);
      if (result.isOffline) { toast({ title: "Checked In (Offline)", description: "Will sync when back online" }); updateSyncStatus(); }
      if (isOnline) {
        if (staffToken) queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees-kiosk'] });
        else queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
      }
    },
    onError: (error: Error) => { setScanError(error.message || "Failed to check in attendee"); setStep("welcome"); },
  });

  // ── Idle timeout ───────────────────────────────────────────────────────
  const kioskTimeoutMs = kioskSettings?.timeoutMinutes ? kioskSettings.timeoutMinutes * 60 * 1000 : 0;
  const kioskTimeoutEnabled = kioskTimeoutMs > 0;

  const handleKioskTimeout = useCallback(() => {
    if (printResetTimeoutRef.current) { clearTimeout(printResetTimeoutRef.current); printResetTimeoutRef.current = null; }
    setStep("welcome"); setLastScanned(null); setScanError(null); setManualInput("");
    groupCheckin.reset(); setGroupScannedMemberId(null); setGroupCheckedInMembers([]); setGroupPrintIndex(0); setWorkflowAttendee(null);
  }, [groupCheckin]);

  const { showWarning: showKioskWarning, remainingSeconds: kioskRemaining, stayActive: kioskStayActive } = useIdleTimeout({
    timeoutMs: kioskTimeoutMs || 60000,
    warningMs: Math.min(120000, (kioskTimeoutMs || 60000) / 2),
    onTimeout: handleKioskTimeout,
    enabled: false && kioskTimeoutEnabled && isLocked,
  });

  // Kiosk lock effect (fullscreen, key blocking, etc.)
  useEffect(() => {
    if (!isLocked) return;
    const shouldFullscreen = kioskSettings?.enableFullscreen !== false;
    const enterFullscreen = async () => {
      if (!shouldFullscreen) return;
      try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch {}
    };
    enterFullscreen();
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    const handlePopState = (e: PopStateEvent) => { e.preventDefault(); window.history.pushState(null, "", window.location.href); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || (e.ctrlKey && e.key === "r") || (e.metaKey && e.key === "r") || (e.altKey && e.key === "F4") || (e.ctrlKey && e.key === "w") || (e.metaKey && e.key === "w")) { e.preventDefault(); e.stopPropagation(); }
      if (e.key === "Escape") {
        if (exitPin) { setShowExitDialog(true); setEnteredPin(""); setPinError(""); }
        else if (onExit) onExit();
      }
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };
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
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [isLocked]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleLogoTap = useCallback(() => {
    if (!isLocked) return;
    setLogoTapCount(prev => prev + 1);
    if (logoTapTimeoutRef.current) clearTimeout(logoTapTimeoutRef.current);
    logoTapTimeoutRef.current = setTimeout(() => setLogoTapCount(0), 2000);
    if (logoTapCount + 1 >= 5) {
      if (exitPin) { setShowExitDialog(true); setEnteredPin(""); setPinError(""); }
      else if (onExit) onExit();
      setLogoTapCount(0);
    }
  }, [isLocked, exitPin, logoTapCount, onExit]);

  const handleExitAttempt = useCallback(() => {
    if (enteredPin === exitPin) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      onExit?.();
    } else { setPinError("Incorrect PIN"); setEnteredPin(""); }
  }, [enteredPin, exitPin, onExit]);

  const handleWorkflowComplete = useCallback(async () => {
    if (!workflowAttendee || !exitPin || !eventId) return;
    try {
      const res = await kioskPost(`/api/kiosk/${eventId}/checkin`, { attendeeId: workflowAttendee.id, skipWorkflow: true });
      if (res.ok) { const data = await res.json(); if (data.attendee) setLastScanned(data.attendee as Attendee); }
    } catch {}
    trackComplete("kiosk", "scan"); setWorkflowAttendee(null); setStep("success");
  }, [workflowAttendee, exitPin, eventId, trackComplete]);

  const handleWorkflowCancel = useCallback(() => { setWorkflowAttendee(null); setStep("scanning"); }, []);

  const handleStartCheckIn = useCallback(() => {
    trackStart("kiosk", "scan"); setStep("scanning"); setManualInput(""); setScanError(null);
  }, [trackStart]);

  const isGroupCheckinEnabled = Boolean((event?.tempStaffSettings as any)?.groupCheckinEnabled);

  const attemptGroupLookup = useCallback(async (scannedValue: string): Promise<boolean> => {
    if (!isGroupCheckinEnabled || !exitPin || !eventId) return false;
    try {
      const res = await kioskPost(`/api/kiosk/${eventId}/group-lookup`, { orderCode: scannedValue });
      if (!res.ok) throw new Error(`Group lookup failed (${res.status})`);
      const data = await res.json();
      if (!data.found || !data.members || data.members.length <= 1) return false;
      await groupCheckin.lookupGroup(scannedValue);
      const scannedMember = (data.members as GroupMember[]).find(m => m.orderCode === scannedValue || m.externalId === scannedValue);
      setGroupScannedMemberId(scannedMember?.id || null);
      setStep("group");
      return true;
    } catch {
      if (!navigator.onLine && offlineAttendees.length > 0) {
        const found = groupCheckin.offlineLookup(scannedValue, offlineAttendees);
        if (found) {
          const scannedMember = offlineAttendees.find(a => a.orderCode === scannedValue || a.externalId === scannedValue);
          setGroupScannedMemberId(scannedMember?.id || null);
          toast({ title: "Group Found (Offline)", description: "Using cached data. Will sync when online." });
          setStep("group");
          return true;
        }
      }
      groupCheckin.reset();
      return false;
    }
  }, [isGroupCheckinEnabled, exitPin, eventId, groupCheckin, offlineAttendees, toast]);

  const handleManualSearch = useCallback(async () => {
    if (!manualInput.trim()) return;
    if (exitPin && eventId) {
      if (isGroupCheckinEnabled) { const isGroup = await attemptGroupLookup(manualInput.trim()); if (isGroup) { setManualInput(""); return; } }
      try {
        const res = await kioskPost(`/api/kiosk/${eventId}/search`, { query: manualInput.trim() });
        if (!res.ok) { setScanError("Search failed. Please try again."); return; }
        const data = await res.json();
        if (data.found && data.attendee) {
          if (data.attendee.checkedIn) { setLastScanned(data.attendee as Attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
          else checkInMutation.mutate(data.attendee.id);
          setManualInput("");
        } else if (data.multipleMatches) { setPendingSearchQuery(manualInput.trim()); setVerifyEmail(""); setVerifyError(null); setStep("verify"); setManualInput(""); }
        else {
          const hasWalkins = event?.tempStaffSettings?.allowKioskWalkins;
          setScanError(hasWalkins ? "No matching registration found. You can register as a new attendee below." : "No matching attendee found. Please check the spelling and try again.");
          setManualInput("");
        }
      } catch { setScanError("Search failed. Please try again."); }
      return;
    }
    const searchLower = manualInput.toLowerCase().trim();
    const exactMatches = effectiveAttendees.filter(a => a.id === manualInput || ('externalId' in a && a.externalId === manualInput) || ('registrationCode' in a && (a as any).registrationCode === manualInput) || a.email?.toLowerCase() === searchLower);
    const fuzzyMatches = exactMatches.length > 0 ? exactMatches : effectiveAttendees.filter(a => `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) || a.firstName?.toLowerCase() === searchLower || a.lastName?.toLowerCase() === searchLower || a.email?.toLowerCase().includes(searchLower));
    if (fuzzyMatches.length === 0) { setScanError("No matching attendee found. Please check the spelling and try again."); setManualInput(""); }
    else if (fuzzyMatches.length === 1) {
      const found = fuzzyMatches[0];
      if (found.checkedIn) { setLastScanned(found as Attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
      else checkInMutation.mutate(found.id);
      setManualInput("");
    } else { setSearchResults(fuzzyMatches); setStep("results"); }
  }, [manualInput, exitPin, eventId, isGroupCheckinEnabled, attemptGroupLookup, effectiveAttendees, event, checkInMutation, trackComplete]);

  const handleQRScan = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (isGroupCheckinEnabled && exitPin && eventId) { const isGroup = await attemptGroupLookup(trimmed); if (isGroup) return; }
    const result = parseQrCode(code, effectiveAttendees as Attendee[]);
    if (result.type === "found" && result.attendee) {
      if (result.attendee.checkedIn) { setLastScanned(result.attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
      else checkInMutation.mutate(result.attendee.id);
    } else setScanError("QR code not recognized. Please try manual search.");
  }, [isGroupCheckinEnabled, exitPin, eventId, attemptGroupLookup, effectiveAttendees, checkInMutation, trackComplete]);

  const handleSelectResult = useCallback((attendee: Attendee | OfflineAttendee) => {
    setSearchResults([]);
    if (attendee.checkedIn) { setLastScanned(attendee as Attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
    else checkInMutation.mutate(attendee.id);
  }, [checkInMutation, trackComplete]);

  const handleVerifyEmail = useCallback(async () => {
    if (!verifyEmail.trim() || !pendingSearchQuery || !eventId || !exitPin) return;
    setVerifyError(null);
    try {
      const res = await kioskPost(`/api/kiosk/${eventId}/verify`, { query: pendingSearchQuery, email: verifyEmail.trim() });
      if (!res.ok) { setVerifyError("Verification failed. Please try again."); return; }
      const data = await res.json();
      if (data.found && data.attendee) {
        if (data.attendee.checkedIn) { setLastScanned(data.attendee as Attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
        else checkInMutation.mutate(data.attendee.id);
      } else setVerifyError("Could not verify your identity. Please see a staff member for assistance.");
    } catch { setVerifyError("Verification failed. Please try again."); }
  }, [verifyEmail, pendingSearchQuery, eventId, exitPin, checkInMutation, trackComplete]);

  const handleWalkinSubmit = useCallback(async () => {
    if (!eventId || !exitPin) return;
    setWalkinError(null);
    const config = event?.tempStaffSettings?.kioskWalkinConfig;
    const requiredFields = config?.requiredFields || ['firstName', 'lastName', 'email'];
    const fieldLabels: Record<string, string> = { firstName: 'First Name', lastName: 'Last Name', email: 'Email', company: 'Company', title: 'Title', participantType: 'Attendee Type' };
    for (const field of ['firstName', 'lastName', ...requiredFields]) {
      if (!walkinForm[field]?.trim()) { setWalkinError(`${fieldLabels[field] || field} is required`); return; }
    }
    if (walkinForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(walkinForm.email.trim())) { setWalkinError("Please enter a valid email address"); return; }
    setWalkinSubmitting(true);
    try {
      const res = await kioskPost(`/api/kiosk/${eventId}/walkin`, { ...walkinForm });
      const data = await res.json();
      if (!res.ok) { setWalkinError(data.error || "Registration failed. Please try again."); return; }
      if (data.success && data.attendee) { setLastScanned(data.attendee as Attendee); trackComplete("kiosk", "scan"); setStep("success"); }
    } catch {
      if (!navigator.onLine) {
        try {
          const tempId = `walkin-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const now = new Date();
          const offlineWalkin: OfflineAttendee = { id: tempId, eventId, firstName: walkinForm.firstName?.trim() || '', lastName: walkinForm.lastName?.trim() || '', email: walkinForm.email?.trim() || '', company: walkinForm.company?.trim(), title: walkinForm.title?.trim(), participantType: walkinForm.participantType || 'Walk-in', checkedIn: true, checkedInAt: now.toISOString(), badgePrinted: false, qrCode: tempId, customFields: {}, syncStatus: 'pending', lastModified: now.toISOString() };
          await offlineDB.saveAttendee(offlineWalkin);
          await offlineDB.addToSyncQueue({ action: 'walkin', entity: 'attendee', entityId: tempId, data: { eventId, pin: exitPin, formData: { ...walkinForm }, tempId, createdAt: now.toISOString() }, timestamp: now.toISOString(), retryCount: 0 });
          setOfflineAttendees(prev => [...prev, offlineWalkin]);
          toast({ title: "Walk-in Registered (Offline)", description: "Walk-in registered offline. Will sync when online." });
          updateSyncStatus();
          setLastScanned({ id: tempId, firstName: offlineWalkin.firstName, lastName: offlineWalkin.lastName, email: offlineWalkin.email || null, company: offlineWalkin.company || null, title: offlineWalkin.title || null, participantType: offlineWalkin.participantType, checkedIn: true, customFields: {}, externalId: null } as Attendee);
          trackComplete("kiosk", "scan"); setStep("success");
        } catch { setWalkinError("Failed to save walk-in registration offline. Please try again."); }
      } else setWalkinError("Registration failed. Please try again.");
    } finally { setWalkinSubmitting(false); }
  }, [eventId, exitPin, event, walkinForm, trackComplete, toast, updateSyncStatus]);

  const handleGroupConfirm = useCallback(async () => {
    try {
      await groupCheckin.checkInSelected();
      playCheckinSound();
      const checkedInIds = Array.from(groupCheckin.selectedIds);
      const justCheckedIn = groupCheckin.members.filter(m => checkedInIds.includes(m.id));
      setGroupCheckedInMembers(justCheckedIn);
      const primary = groupCheckin.members.find(m => m.id === groupCheckin.primaryId);
      if (primary) setLastScanned({ id: primary.id, firstName: primary.firstName, lastName: primary.lastName, email: primary.email || null, company: primary.company || null, title: primary.title || null, participantType: primary.participantType || "General", checkedIn: true, customFields: {}, externalId: primary.externalId || null } as Attendee);
      trackComplete("kiosk", "scan");
      if (isOnline) {
        if (staffToken) queryClient.invalidateQueries({ queryKey: ['/api/staff/attendees-kiosk'] });
        else queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
      }
      setStep("success");
    } catch (error) { playErrorSound(); setScanError("Group check-in failed. Please try again."); setStep("scanning"); }
  }, [groupCheckin, trackComplete, isOnline, staffToken, eventId]);

  const handleGroupCheckInJustMe = useCallback(() => {
    const scannedId = groupScannedMemberId || groupCheckin.primaryId;
    if (scannedId) {
      const member = groupCheckin.members.find(m => m.id === scannedId);
      if (member) {
        groupCheckin.reset(); setGroupScannedMemberId(null); setGroupCheckedInMembers([]);
        if (member.checkedIn) { setLastScanned({ id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email || null, company: member.company || null, title: member.title || null, participantType: member.participantType || "General", checkedIn: true, customFields: {}, externalId: member.externalId || null } as Attendee); setScanError("Already checked in"); trackComplete("kiosk", "scan"); setStep("success"); }
        else checkInMutation.mutate(scannedId);
      }
    }
  }, [groupScannedMemberId, groupCheckin, checkInMutation, trackComplete]);

  const handleGroupBack = useCallback(() => { groupCheckin.reset(); setGroupScannedMemberId(null); setGroupCheckedInMembers([]); setStep("scanning"); }, [groupCheckin]);

  // Print logic
  const printBadgeForMember = useCallback(async (memberData: { firstName: string; lastName: string; company: string; title: string; participantType: string; customFields: Record<string, any>; externalId?: string }) => {
    const attendeeData = { firstName: memberData.firstName, lastName: memberData.lastName, company: memberData.company || "", title: memberData.title || "", participantType: memberData.participantType || "General", customFields: memberData.customFields || {} };
    const participantType = memberData.participantType || "General";
    let template: BadgeTemplate | undefined;
    const effectiveForcedId = forcedBadgeTemplateId || kioskSettings?.forcedBadgeTemplateId;
    if (effectiveForcedId) template = templates.find(t => t.id === effectiveForcedId);
    else if (templateMappings) {
      const normalizedType = participantType.trim().toLowerCase();
      const mapping = Object.entries(templateMappings).find(([key]) => key.trim().toLowerCase() === normalizedType);
      if (mapping?.[1]?.templateId) template = templates.find(t => t.id === mapping[1].templateId);
    }
    if (!template) template = templates.find(t => t.id === event?.defaultBadgeTemplateId) || templates[0];
    const templateConfig = { width: template?.width || 4, height: template?.height || 3, backgroundColor: template?.backgroundColor || "#ffffff", textColor: template?.textColor || "#000000", accentColor: template?.accentColor || "#3b82f6", fontFamily: template?.fontFamily || "Arial", includeQR: template?.includeQR ?? true, qrPosition: template?.qrPosition || "bottom-right", customQrPosition: template?.customQrPosition || undefined, qrCodeConfig: eventBadgeSettings?.qrCodeConfigOverride || (template?.qrCodeConfig as any) || undefined, mergeFields: template?.mergeFields || [], imageElements: template?.imageElements || [] };

    if (selectedPrinter?.type === 'printnode' && selectedPrinter.printNodeId) {
      const printerName = selectedPrinter.printerName || '';
      const isZebraPrinter = printerName.toLowerCase().includes('zebra') || printerName.toLowerCase().includes('zd') || printerName.toLowerCase().includes('zt') || printerName.toLowerCase().includes('zp');
      let printResponse: Response;
      if (isZebraPrinter) {
        const zplData = networkPrint.generateBadgeZpl({ firstName: attendeeData.firstName, lastName: attendeeData.lastName, company: attendeeData.company, title: attendeeData.title, externalId: memberData.externalId }, { width: templateConfig.width, height: templateConfig.height, includeQR: templateConfig.includeQR, qrData: memberData.externalId || `${attendeeData.firstName}-${attendeeData.lastName}` });
        printResponse = await apiRequest('POST', '/api/printnode/print', { printerId: selectedPrinter.printNodeId, zplData, title: `Badge: ${attendeeData.firstName} ${attendeeData.lastName}` });
      } else {
        const pnRotation = (template?.labelRotation || 0) as 0 | 90 | 180 | 270;
        const pdfBlob = await printOrchestrator.generatePDFBlob(attendeeData, templateConfig, pnRotation);
        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
        const pdfBase64 = btoa(new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        printResponse = await apiRequest('POST', '/api/printnode/print', { printerId: selectedPrinter.printNodeId, pdfBase64, title: `Badge: ${attendeeData.firstName} ${attendeeData.lastName}` });
      }
      const printResult = await printResponse.json();
      if (!printResult.success) throw new Error(printResult.error || 'PrintNode print failed');
    } else if (selectedPrinter?.type === 'custom' || selectedPrinter?.type === 'local') {
      const ip = selectedPrinter.type === 'custom' ? selectedPrinter.customIp : selectedPrinter.ipAddress;
      const port = selectedPrinter.type === 'custom' ? selectedPrinter.customPort : (selectedPrinter.port || 9100);
      const dpi = selectedPrinter.type === 'custom' ? selectedPrinter.customDpi : (selectedPrinter.dpi || 203);
      if (ip) { networkPrint.setIp(ip); networkPrint.setPort(port); networkPrint.setDpi(dpi); }
      const zplData = networkPrint.generateBadgeZpl({ firstName: attendeeData.firstName, lastName: attendeeData.lastName, company: attendeeData.company, title: attendeeData.title, externalId: memberData.externalId }, { width: templateConfig.width, height: templateConfig.height, includeQR: templateConfig.includeQR, qrData: memberData.externalId || `${attendeeData.firstName}-${attendeeData.lastName}` });
      const result = await networkPrint.printZpl(zplData);
      if (!result.success) throw new Error(result.error || 'Network print failed');
    } else {
      const rotation = (template?.labelRotation || 0) as 0 | 90 | 180 | 270;
      await printOrchestrator.printBadge(attendeeData, templateConfig, rotation);
    }
  }, [templates, templateMappings, event, eventBadgeSettings, selectedPrinter, forcedBadgeTemplateId, kioskSettings, networkPrint]);

  const handlePrintBadge = useCallback(async () => {
    if (!lastScanned && groupCheckedInMembers.length === 0) return;
    trackStart("kiosk", "print"); setStep("printing");
    try {
      const membersToPrint: Array<{ firstName: string; lastName: string; company: string; title: string; participantType: string; customFields: Record<string, any>; externalId?: string }> = [];
      if (groupCheckedInMembers.length > 0) {
        for (const member of groupCheckedInMembers) membersToPrint.push({ firstName: member.firstName, lastName: member.lastName, company: member.company || "", title: member.title || "", participantType: member.participantType || "General", customFields: {}, externalId: member.externalId || undefined });
      } else if (lastScanned) {
        membersToPrint.push({ firstName: lastScanned.firstName, lastName: lastScanned.lastName, company: lastScanned.company || "", title: lastScanned.title || "", participantType: lastScanned.participantType || "General", customFields: lastScanned.customFields || {}, externalId: lastScanned.externalId || undefined });
      }
      if (membersToPrint.length > 1) {
        let printedCount = 0; setGroupPrintIndex(0);
        const printResults = await Promise.allSettled(membersToPrint.map((member) => printBadgeForMember(member).then(() => { printedCount++; setGroupPrintIndex(printedCount); })));
        const succeeded = printResults.filter(r => r.status === 'fulfilled').length;
        const failed = printResults.filter(r => r.status === 'rejected').length;
        toast({ title: failed > 0 ? `${succeeded} of ${membersToPrint.length} Badges Printed` : `${succeeded} Badges Sent to Printer`, description: failed > 0 ? `${failed} badge${failed !== 1 ? 's' : ''} failed to print.` : selectedPrinter?.type === 'printnode' ? `Sent to ${selectedPrinter.printerName || 'cloud printer'}` : `${succeeded} badges are being printed`, variant: failed > 0 ? "destructive" : "default" });
      } else {
        setGroupPrintIndex(1); await printBadgeForMember(membersToPrint[0]);
        toast({ title: "Badge Sent to Printer", description: selectedPrinter?.type === 'printnode' ? `Sent to ${selectedPrinter.printerName || 'cloud printer'}` : "Your badge is being printed" });
      }
      if (printResetTimeoutRef.current) clearTimeout(printResetTimeoutRef.current);
      printResetTimeoutRef.current = setTimeout(() => { handleReset(); }, 3000);
    } catch (error) {
      toast({ title: "Print Failed", description: "Could not print badge. Please try again or contact staff.", variant: "destructive" });
      trackAbandon("kiosk", "print"); setStep("success");
    }
  }, [lastScanned, groupCheckedInMembers, printBadgeForMember, selectedPrinter, toast, trackStart, trackAbandon]);

  const handleReset = useCallback(() => {
    trackComplete("kiosk", "complete"); setStep("welcome"); setLastScanned(null); setScanError(null); setManualInput(""); setSearchResults([]);
    groupCheckin.reset(); setGroupScannedMemberId(null); setGroupCheckedInMembers([]); setGroupPrintIndex(0);
  }, [groupCheckin, trackComplete]);

  const handlePreCache = useCallback(async (silent = false) => {
    if (!eventId || !scopedCustomerId) return;
    setIsPreCaching(true);
    const unsubscribe = kioskPreCacheService.onProgress((progress) => setPreCacheProgress(progress));
    try {
      const result = await kioskPreCacheService.preCacheForEvent(eventId, scopedCustomerId);
      if (result.success) { setIsCached(true); const cached = await kioskPreCacheService.getCachedAttendees(eventId); setOfflineAttendees(cached); if (!silent) toast({ title: "Offline Mode Ready", description: `${result.attendeesCount} attendees cached for offline use` }); }
      else if (!silent) toast({ title: "Pre-cache Failed", description: result.error || "Failed to cache data for offline mode", variant: "destructive" });
    } finally { setIsPreCaching(false); setPreCacheProgress(null); unsubscribe(); }
  }, [eventId, scopedCustomerId, toast]);

  // ── Derived ────────────────────────────────────────────────────────────
  const checkedInCount = effectiveAttendees.filter(a => a.checkedIn).length;
  const totalCount = effectiveAttendees.length;

  // ── Context value ──────────────────────────────────────────────────────
  const value: KioskContextValue = useMemo(() => ({
    eventId, eventName, exitPin, scopedCustomerId, onExit, isLocked, selectedPrinter, kioskSettings, forcedBadgeTemplateId, staffToken,
    step, setStep, lastScanned, setLastScanned, scanError, setScanError, securityError,
    manualInput, setManualInput, searchResults, checkInMutation,
    verifyEmail, setVerifyEmail, verifyError, setVerifyError,
    walkinForm, setWalkinForm, walkinError, walkinSubmitting,
    groupCheckin, groupScannedMemberId, groupCheckedInMembers, groupPrintIndex,
    workflowAttendee, kioskWorkflow,
    showExitDialog, setShowExitDialog, enteredPin, setEnteredPin, pinError, setPinError,
    event, effectiveAttendees, templates, branding,
    isOnline, isCached, pendingSyncCount, isPreCaching, preCacheProgress,
    showKioskWarning, kioskRemaining, kioskStayActive,
    checkedInCount, totalCount,
    handleStartCheckIn, handleManualSearch, handleQRScan, handleSelectResult, handleVerifyEmail, handleWalkinSubmit,
    handleGroupConfirm, handleGroupCheckInJustMe, handleGroupBack,
    handleWorkflowComplete, handleWorkflowCancel,
    handlePrintBadge, handleReset, handleLogoTap, handleExitAttempt, handlePreCache,
  }), [
    eventId, eventName, exitPin, scopedCustomerId, onExit, isLocked, selectedPrinter, kioskSettings, forcedBadgeTemplateId, staffToken,
    step, lastScanned, scanError, securityError,
    manualInput, searchResults, checkInMutation,
    verifyEmail, verifyError,
    walkinForm, walkinError, walkinSubmitting,
    groupCheckin, groupScannedMemberId, groupCheckedInMembers, groupPrintIndex,
    workflowAttendee, kioskWorkflow,
    showExitDialog, enteredPin, pinError,
    event, effectiveAttendees, templates, branding,
    isOnline, isCached, pendingSyncCount, isPreCaching, preCacheProgress,
    showKioskWarning, kioskRemaining, kioskStayActive,
    checkedInCount, totalCount,
    handleStartCheckIn, handleManualSearch, handleQRScan, handleSelectResult, handleVerifyEmail, handleWalkinSubmit,
    handleGroupConfirm, handleGroupCheckInJustMe, handleGroupBack,
    handleWorkflowComplete, handleWorkflowCancel,
    handlePrintBadge, handleReset, handleLogoTap, handleExitAttempt, handlePreCache,
  ]);

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}
