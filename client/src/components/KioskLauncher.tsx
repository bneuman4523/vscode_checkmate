import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor,
  Calendar,
  Users,
  ChevronRight,
  ChevronLeft,
  Shield,
  Maximize,
  AlertTriangle,
  RefreshCw,
  Download,
  CheckCircle2,
  Wifi,
  WifiOff,
  Cloud,
  Printer,
  Loader2,
  CreditCard,
  Info,
  Rocket,
  Check,
  X,
  Eye,
  EyeOff,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/components/ThemeProvider";
import { kioskPreCacheService, PreCacheProgress } from "@/services/kiosk-precache-service";
import { offlineCheckinService } from "@/services/offline-checkin-service";
import { offlineDB } from "@/lib/offline-db";
import type { Event, Customer } from "@shared/schema";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import { getPrinterDisplayName, getSavedPrinter, migrateLegacyPreferences } from "@/lib/printerPreferences";
import { usePrinter } from "@/hooks/usePrinter";
import PrinterSelector from "@/components/PrinterSelector";
import PrinterOfflineAlert from "@/components/PrinterOfflineAlert";

export interface KioskSettings {
  timeoutMinutes: number;
  enableFullscreen: boolean;
  forcedBadgeTemplateId?: string;
  kioskTheme?: 'light' | 'dark';
}

interface KioskLauncherProps {
  customerId: string;
  onLaunch: (eventId: string, eventName: string, exitPin: string, printer?: SelectedPrinter, settings?: KioskSettings) => void;
  preselectedEventId?: string;
}

interface BadgeTemplateInfo {
  id: string;
  name: string;
  participantType: string | null;
  width: number;
  height: number;
}

interface TemplateMappingInfo {
  templateId: string | null;
  templateName: string | null;
  resolutionPath: string;
}

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS = [
  { step: 1 as WizardStep, label: "Select Event", icon: Calendar },
  { step: 2 as WizardStep, label: "Printer", icon: Printer },
  { step: 3 as WizardStep, label: "Template", icon: CreditCard },
  { step: 4 as WizardStep, label: "Launch", icon: Rocket },
];

function StepIndicator({ currentStep, completedSteps }: { currentStep: WizardStep; completedSteps: Set<number> }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto mb-8">
      {STEP_LABELS.map(({ step, label, icon: Icon }, idx) => {
        const isActive = step === currentStep;
        const isCompleted = completedSteps.has(step);
        const isPast = step < currentStep;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all
                  ${isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-md'
                    : isCompleted || isPast
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
                  }
                `}
              >
                {isCompleted || isPast ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isActive ? 'text-primary' : isPast || isCompleted ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 mt-[-18px] rounded-full transition-colors ${
                  step < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function KioskLauncher({ customerId, onLaunch, preselectedEventId }: KioskLauncherProps) {
  const { toast } = useToast();
  const { theme: currentTheme } = useTheme();

  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [kioskTheme, setKioskTheme] = useState<'light' | 'dark'>(currentTheme);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [exitPin, setExitPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [eventPreselected, setEventPreselected] = useState(false);
  const [pinError, setPinError] = useState("");
  const [existingPin, setExistingPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheProgress, setPreCacheProgress] = useState<PreCacheProgress | null>(null);
  const [isPreCached, setIsPreCached] = useState(false);
  const kioskPrinter = usePrinter({ eventId: selectedEvent?.id || '', mode: 'kiosk' });
  const selectedPrinter = kioskPrinter.savedPrinter ?? { type: 'browser' as const };
  const [kioskTimeoutMinutes, setKioskTimeoutMinutes] = useState(240);
  const [enableFullscreen, setEnableFullscreen] = useState(true);
  const [badgeTemplateMode, setBadgeTemplateMode] = useState<'auto' | 'forced'>('auto');
  const [forcedBadgeTemplateId, setForcedBadgeTemplateId] = useState<string | null>(null);
  const [eventTemplates, setEventTemplates] = useState<BadgeTemplateInfo[]>([]);
  const [templateMappings, setTemplateMappings] = useState<Record<string, TemplateMappingInfo> | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [offlineFallbackEvents, setOfflineFallbackEvents] = useState<Event[] | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      console.error('[KioskLauncher] Failed to fetch kiosk pin:', error);
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
      console.error('[KioskLauncher] Failed to save kiosk pin:', error);
      return false;
    } finally {
      setSavingPin(false);
    }
  };

  useEffect(() => {
    if (selectedEvent && customerId) {
      checkAndAutoCache();
      fetchKioskPin(selectedEvent.id);
      fetchEventTemplates(selectedEvent.id);
    }
  }, [selectedEvent, customerId]);


  const fetchEventTemplates = async (eventId: string) => {
    setTemplatesLoading(true);
    try {
      const [templatesRes, mappingsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/badge-templates`, { credentials: 'include' }),
        fetch(`/api/events/${eventId}/template-mappings`, { credentials: 'include' }),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setEventTemplates(data.map((t: any) => ({
          id: t.id,
          name: t.name,
          participantType: t.participantType || null,
          width: t.width || 4,
          height: t.height || 3,
        })));
      }

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setTemplateMappings(data);
      }
    } catch (error) {
      console.error('[KioskLauncher] Failed to fetch badge templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const checkAndAutoCache = async () => {
    if (!selectedEvent || !customerId) return;
    const status = await kioskPreCacheService.getPreCacheStatus(selectedEvent.id);
    setIsPreCached(status.cached);

    if (!status.cached && navigator.onLine) {
      handlePreCache();
    }
  };

  const handlePreCache = async () => {
    if (!selectedEvent || !customerId) return;

    setIsPreCaching(true);
    setPreCacheProgress(null);

    const unsubscribe = kioskPreCacheService.onProgress((progress) => {
      setPreCacheProgress(progress);
    });

    try {
      const result = await kioskPreCacheService.preCacheForEvent(selectedEvent.id, customerId);
      if (result.success) {
        setIsPreCached(true);
        toast({
          title: "Offline Mode Ready",
          description: `Cached ${result.attendeesCount} attendees and ${result.templatesCount} templates`,
        });
      } else {
        toast({
          title: "Pre-cache Failed",
          description: result.error || "Failed to download data for offline use",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Pre-cache Error",
        description: "An error occurred while downloading offline data",
        variant: "destructive",
      });
    } finally {
      unsubscribe();
      setIsPreCaching(false);
    }
  };

  const { data: customer, isLoading: customerLoading, refetch: refetchCustomer } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId,
    retry: false,
  });

  const { data: customerEvents = [], isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useQuery<Event[]>({
    queryKey: [`/api/kiosk/${customerId}/events`],
    enabled: !!customerId,
    retry: 2,
  });

  // Use offline fallback events when available, otherwise filter online events
  const effectiveEvents = isOfflineFallback && offlineFallbackEvents ? offlineFallbackEvents : customerEvents;
  const activeEvents = effectiveEvents.filter(e => e.status === "active" || e.status === "upcoming");

  // Offline fallback: when events API fails and we're offline, load from IndexedDB
  useEffect(() => {
    if (eventsError && !isOnline) {
      (async () => {
        try {
          const cachedEvents = await offlineDB.getAllEvents();
          const filtered = cachedEvents.filter(e => e.customerId === customerId);
          if (filtered.length > 0) {
            const mappedEvents: Event[] = filtered.map(e => ({
              id: e.id,
              name: e.name,
              eventDate: e.date,
              customerId: e.customerId,
              status: 'active',
              defaultBadgeTemplateId: e.defaultBadgeTemplateId || null,
            } as unknown as Event));
            setOfflineFallbackEvents(mappedEvents);
            setIsOfflineFallback(true);
          }
        } catch (err) {
          console.error('[KioskLauncher] Failed to load offline fallback events:', err);
        }
      })();
    } else if (!eventsError) {
      // Online and working — clear any fallback state
      if (isOfflineFallback) {
        setIsOfflineFallback(false);
        setOfflineFallbackEvents(null);
      }
    }
  }, [eventsError, isOnline, customerId]);

  useEffect(() => {
    if (preselectedEventId && effectiveEvents.length > 0 && !eventPreselected) {
      const event = effectiveEvents.find(e => e.id === preselectedEventId);
      if (event) {
        setSelectedEvent(event);
        setEventPreselected(true);
      }
    }
  }, [preselectedEventId, effectiveEvents, eventPreselected]);

  const prevEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedEvent) {
      prevEventIdRef.current = null;
      return;
    }
    if (prevEventIdRef.current === selectedEvent.id) return;
    prevEventIdRef.current = selectedEvent.id;
    migrateLegacyPreferences(selectedEvent.id);
    const saved = getSavedPrinter(selectedEvent.id);
    if (saved) {
      setWizardStep(3);
    } else {
      setWizardStep(2);
    }
  }, [selectedEvent?.id]);

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setExitPin("");
    setConfirmPin("");
    setPinError("");
    setExistingPin(null);
    setIsChangingPin(false);
    setBadgeTemplateMode('auto');
    setForcedBadgeTemplateId(null);
    setEventTemplates([]);
    setTemplateMappings(null);
  };

  const handleLaunchKiosk = async () => {
    if (!selectedEvent) {
      setPinError("Please select an event first");
      return;
    }

    const kioskSettingsPayload: KioskSettings = {
      timeoutMinutes: kioskTimeoutMinutes,
      enableFullscreen,
      forcedBadgeTemplateId: badgeTemplateMode === 'forced' && forcedBadgeTemplateId ? forcedBadgeTemplateId : undefined,
      kioskTheme,
    };

    if (existingPin && !isChangingPin) {
      onLaunch(selectedEvent.id, selectedEvent.name, existingPin, selectedPrinter, kioskSettingsPayload);
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
      onLaunch(selectedEvent.id, selectedEvent.name, exitPin, selectedPrinter, kioskSettingsPayload);
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

  const completedSteps = useMemo(() => {
    const set = new Set<number>();
    if (selectedEvent) set.add(1);
    if (wizardStep > 2) set.add(2);
    if (wizardStep > 3) set.add(3);
    return set;
  }, [selectedEvent, wizardStep]);


  const canProceedFromStep = (step: WizardStep): boolean => {
    switch (step) {
      case 1: return !!selectedEvent;
      case 2: return true;
      case 3: return true;
      case 4: return existingPin && !isChangingPin ? true : (exitPin.length >= 4 && exitPin === confirmPin);
      default: return false;
    }
  };

  const goNext = () => {
    if (wizardStep < 4 && canProceedFromStep(wizardStep)) {
      if (wizardStep === 2) {
        kioskPrinter.handleSelect(selectedPrinter);
      }
      setWizardStep((wizardStep + 1) as WizardStep);
    }
  };

  const goBack = () => {
    if (wizardStep === 1) return;
    if (wizardStep === 2) {
      setSelectedEvent(null);
      setExitPin("");
      setConfirmPin("");
      setPinError("");
      setExistingPin(null);
      setIsChangingPin(false);
    }
    setWizardStep((wizardStep - 1) as WizardStep);
  };


  const getTemplateDisplayName = () => {
    if (badgeTemplateMode === 'auto') return 'Auto — Match by Attendee Type';
    const tmpl = eventTemplates.find(t => t.id === forcedBadgeTemplateId);
    return tmpl ? tmpl.name : 'Selected Template';
  };

  const isLoading = eventsLoading && !isOfflineFallback;
  const hasError = eventsError && !isOfflineFallback;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-5xl space-y-6">
          <div className="text-center space-y-4">
            <Skeleton className="h-16 w-16 rounded-full mx-auto" />
            <Skeleton className="h-10 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-2">
          <CardContent className="p-8 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mx-auto">
              {!isOnline ? <WifiOff className="h-8 w-8 text-destructive" /> : <AlertTriangle className="h-8 w-8 text-destructive" />}
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">
                {!isOnline ? "No Cached Data Available" : "Failed to Load Events"}
              </h2>
              <p className="text-muted-foreground">
                {!isOnline
                  ? "No cached data available. Connect to the internet and sync data first."
                  : eventsError?.message?.includes("Authentication")
                    ? "Your session may have expired. Please sign in again."
                    : "Could not load event data. Please check your connection and try again."}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => {
                refetchCustomer();
                refetchEvents();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
                <Monitor className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Kiosk Mode Setup</h1>
                {selectedEvent && (
                  <p className="text-sm text-muted-foreground">{selectedEvent.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? "Online" : "Offline"}
              </Badge>
              {isPreCached && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Cached
                </Badge>
              )}
            </div>
          </div>
          <StepIndicator currentStep={wizardStep} completedSteps={completedSteps} />
        </div>
      </div>

      {isOfflineFallback && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Offline Mode — Showing cached event data. Some features may be limited.
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">

          {/* ─── STEP 1: SELECT EVENT ─── */}
          {wizardStep === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto">
                <h2 className="text-2xl font-semibold mb-2">Which event are you setting up?</h2>
                <p className="text-muted-foreground">
                  Choose the event this kiosk will serve. Only active and upcoming events are shown.
                </p>
              </div>

              {activeEvents.length === 0 ? (
                <Card className="border-2 border-dashed max-w-lg mx-auto">
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">No Active Events</h3>
                    <p className="text-muted-foreground mb-4">
                      There are no active or upcoming events available for kiosk mode.
                    </p>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeEvents.map((event) => (
                    <Card
                      key={event.id}
                      className="cursor-pointer hover:border-primary hover:shadow-md transition-all group"
                      onClick={() => handleSelectEvent(event)}
                      data-testid={`card-event-${event.id}`}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <Badge variant={event.status === "active" ? "default" : "secondary"}>
                            {event.status}
                          </Badge>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="font-semibold text-lg mb-1 truncate" data-testid={`text-event-name-${event.id}`}>
                          {event.name}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate mb-3">
                          {customer?.name || ""}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4 shrink-0" />
                          <span>{formatDate(event.eventDate)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: SELECT PRINTER ─── */}
          {wizardStep === 2 && selectedEvent && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto">
                <h2 className="text-2xl font-semibold mb-2">Which printer should badges print to?</h2>
                <p className="text-muted-foreground">
                  Select a printer for badge printing, or use the browser print dialog.
                </p>
              </div>

              <div className="max-w-lg mx-auto">
                <Card className="border-2">
                  <CardContent className="py-8 text-center space-y-4">
                    <Printer className="h-12 w-12 mx-auto text-primary" />
                    <div>
                      <p className="font-semibold text-lg">{getPrinterDisplayName(selectedPrinter)}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedPrinter.type === 'printnode' ? 'Cloud printer via PrintNode' :
                         selectedPrinter.type === 'local' ? 'Managed local printer' :
                         selectedPrinter.type === 'custom' ? 'Custom Zebra network printer' :
                         'Uses browser built-in print dialog'}
                      </p>
                    </div>
                    <Button onClick={() => kioskPrinter.openSelector()} className="gap-2">
                      <Settings className="h-4 w-4" />
                      {selectedPrinter.type === 'browser' ? 'Select a Printer' : 'Change Printer'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="max-w-3xl mx-auto mt-6 pt-6 border-t">
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOnline ? <Wifi className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-destructive" />}
                      <span className="font-medium">Offline Mode</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPreCached && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Data Cached
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Download event data to enable check-ins even when internet is unavailable.
                  </p>
                  {isPreCaching && preCacheProgress && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{preCacheProgress.message}</span>
                        <span>{Math.round((preCacheProgress.current / preCacheProgress.total) * 100)}%</span>
                      </div>
                      <Progress value={(preCacheProgress.current / preCacheProgress.total) * 100} />
                    </div>
                  )}
                  <Button
                    variant={isPreCached ? "outline" : "default"}
                    className="w-full gap-2"
                    onClick={handlePreCache}
                    disabled={!isOnline || isPreCaching}
                    data-testid="button-precache"
                  >
                    <Download className="h-4 w-4" />
                    {isPreCaching ? "Downloading..." : isPreCached ? "Refresh Cache" : "Enable Offline Mode"}
                  </Button>
                  {!isOnline && !isPreCached && (
                    <p className="text-sm text-destructive text-center">
                      Connect to internet to download offline data
                    </p>
                  )}
                </div>
              </div>

              <PrinterSelector
                open={kioskPrinter.showSelector}
                onOpenChange={kioskPrinter.setShowSelector}
                onSelect={kioskPrinter.handleSelect}
                customerId={customerId}
                currentPrinter={selectedPrinter}
                mode="admin"
              />
            </div>
          )}

          {/* ─── STEP 3: SELECT TEMPLATE ─── */}
          {wizardStep === 3 && selectedEvent && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto">
                <h2 className="text-2xl font-semibold mb-2">Which badge template should the kiosk use?</h2>
                <p className="text-muted-foreground">
                  Choose auto-match to select templates based on attendee type, or pick a specific template for all badges.
                </p>
              </div>

              {templatesLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <span className="text-muted-foreground">Loading templates...</span>
                </div>
              ) : eventTemplates.length === 0 ? (
                <div className="max-w-lg mx-auto">
                  <Card className="border-2 border-amber-200 dark:border-amber-800">
                    <CardContent className="py-8 text-center space-y-3">
                      <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
                      <div>
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          No badge templates found
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Create badge templates in the event settings before launching kiosk mode.
                          Badges may not print correctly without a configured template.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <RadioGroup
                    value={badgeTemplateMode === 'auto' ? 'auto' : (forcedBadgeTemplateId || 'auto')}
                    onValueChange={(val) => {
                      if (val === 'auto') {
                        setBadgeTemplateMode('auto');
                        setForcedBadgeTemplateId(null);
                      } else {
                        setBadgeTemplateMode('forced');
                        setForcedBadgeTemplateId(val);
                      }
                    }}
                  >
                    <div
                      className={`
                        rounded-lg border-2 p-5 cursor-pointer transition-all mb-4
                        ${badgeTemplateMode === 'auto'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-transparent bg-card hover:border-muted-foreground/20 hover:shadow-sm'
                        }
                      `}
                      onClick={() => { setBadgeTemplateMode('auto'); setForcedBadgeTemplateId(null); }}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="auto" id="kiosk-badge-auto" className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor="kiosk-badge-auto" className="text-base font-semibold cursor-pointer">
                            Auto — Match by Attendee Type
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Automatically selects the correct template based on each attendee's registration type.
                          </p>
                          {badgeTemplateMode === 'auto' && templateMappings && (
                            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {Object.entries(templateMappings)
                                .filter(([, m]) => m.templateId)
                                .slice(0, 6)
                                .map(([type, m]) => (
                                  <div key={type} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                                    <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <div className="min-w-0">
                                      <span className="text-xs font-medium uppercase text-muted-foreground block truncate">{type}</span>
                                      <span className="text-sm font-medium truncate block">{m.templateName}</span>
                                    </div>
                                  </div>
                                ))}
                              {Object.entries(templateMappings).filter(([, m]) => !m.templateId).length > 0 && (
                                <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <span className="text-xs">
                                    {Object.entries(templateMappings).filter(([, m]) => !m.templateId).length} type(s) use fallback
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {eventTemplates.map((tmpl) => {
                        const isSelected = badgeTemplateMode === 'forced' && forcedBadgeTemplateId === tmpl.id;
                        return (
                          <div
                            key={tmpl.id}
                            className={`
                              rounded-lg border-2 p-4 cursor-pointer transition-all
                              ${isSelected
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-transparent bg-card hover:border-muted-foreground/20 hover:shadow-sm'
                              }
                            `}
                            onClick={() => { setBadgeTemplateMode('forced'); setForcedBadgeTemplateId(tmpl.id); }}
                          >
                            <div className="flex items-start gap-3">
                              <RadioGroupItem value={tmpl.id} id={`kiosk-badge-${tmpl.id}`} className="mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <Label htmlFor={`kiosk-badge-${tmpl.id}`} className="font-medium cursor-pointer truncate block">
                                  {tmpl.name}
                                </Label>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {tmpl.width}" × {tmpl.height}"
                                  </Badge>
                                  {tmpl.participantType && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {tmpl.participantType}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: REVIEW & LAUNCH ─── */}
          {wizardStep === 4 && selectedEvent && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto">
                <h2 className="text-2xl font-semibold mb-2">Review & Launch</h2>
                <p className="text-muted-foreground">
                  Confirm your settings and launch kiosk mode.
                </p>
              </div>

              <div className="max-w-2xl mx-auto space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Event</span>
                    </div>
                    <p className="font-medium truncate">{selectedEvent.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">Ready</span>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Printer className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Printer</span>
                    </div>
                    <p className="font-medium truncate">{getPrinterDisplayName(selectedPrinter)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {selectedPrinter.type === 'printnode' ? (
                        <>
                          <Cloud className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs text-blue-600 dark:text-blue-400">Cloud Print</span>
                        </>
                      ) : selectedPrinter.type === 'custom' || selectedPrinter.type === 'local' ? (
                        <>
                          <Monitor className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs text-primary">{selectedPrinter.type === 'custom' ? 'Zebra' : 'Local'}</span>
                        </>
                      ) : (
                        <>
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Browser</span>
                        </>
                      )}
                    </div>
                  </div>

                  {kioskPrinter.isOffline && !kioskPrinter.offlineDismissed && selectedPrinter.type === 'printnode' && (
                    <div className="col-span-full">
                      <PrinterOfflineAlert
                        printerName={kioskPrinter.displayName}
                        onRetry={kioskPrinter.retryConnection}
                        onChangePrinter={() => { kioskPrinter.openSelector(); setWizardStep(2); }}
                        onDismiss={kioskPrinter.dismissOfflineAlert}
                      />
                    </div>
                  )}

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template</span>
                    </div>
                    <p className="font-medium truncate">{getTemplateDisplayName()}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {badgeTemplateMode === 'auto' ? 'Auto-match' : 'Fixed'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Maximize className="h-4 w-4 text-primary" />
                      <span className="font-medium">Fullscreen Mode</span>
                    </div>
                    <Checkbox
                      id="kiosk-fullscreen"
                      checked={enableFullscreen}
                      onCheckedChange={(checked) => setEnableFullscreen(checked === true)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically enter fullscreen when kiosk launches. Recommended for public-facing kiosks.
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {kioskTheme === 'dark' ? (
                        <Moon className="h-4 w-4 text-primary" />
                      ) : (
                        <Sun className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-medium">Kiosk Appearance</span>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
                      <button
                        type="button"
                        onClick={() => setKioskTheme('light')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          kioskTheme === 'light'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Sun className="h-3.5 w-3.5" />
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setKioskTheme('dark')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          kioskTheme === 'dark'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Moon className="h-3.5 w-3.5" />
                        Dark
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose the kiosk color scheme. Light mode adds a clean, bright look; dark mode is easier on the eyes in dim venues.
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-medium">Exit PIN</span>
                  </div>

                  {pinLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Loading PIN settings...</span>
                    </div>
                  ) : existingPin && !isChangingPin ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">PIN is set</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-lg tracking-widest">
                            {showPin ? existingPin : '••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setShowPin(!showPin)}
                          >
                            {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsChangingPin(true);
                          setExitPin("");
                          setConfirmPin("");
                          setPinError("");
                        }}
                      >
                        Change PIN
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {isChangingPin ? "Enter a new PIN to replace the existing one." : "Set a PIN to exit kiosk mode. This PIN is shared across all devices for this event."}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="exit-pin" className="text-xs">{isChangingPin ? "New PIN" : "Exit PIN"} (min 4 digits)</Label>
                          <Input
                            id="exit-pin"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="••••"
                            value={exitPin}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setExitPin(val);
                              setPinError("");
                            }}
                            maxLength={8}
                            className="text-center text-xl tracking-widest"
                            data-testid="input-exit-pin"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="confirm-pin" className="text-xs">Confirm PIN</Label>
                          <Input
                            id="confirm-pin"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="••••"
                            value={confirmPin}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setConfirmPin(val);
                              setPinError("");
                            }}
                            maxLength={8}
                            className="text-center text-xl tracking-widest"
                            data-testid="input-confirm-pin"
                          />
                        </div>
                      </div>
                      {isChangingPin && (
                        <Button
                          variant="ghost"
                          size="sm"
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
                    </div>
                  )}

                  {pinError && (
                    <p className="text-sm text-destructive">{pinError}</p>
                  )}
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-300">Settings cannot be changed once kiosk mode is active.</p>
                      <p className="text-amber-700 dark:text-amber-400 mt-1">
                        Tap the logo 5 times to show the exit dialog, then enter your PIN to unlock.
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full h-14 text-lg gap-2"
                  onClick={handleLaunchKiosk}
                  disabled={
                    savingPin ||
                    pinLoading ||
                    (existingPin && !isChangingPin ? false : !exitPin || !confirmPin)
                  }
                  data-testid="button-launch-kiosk"
                >
                  {savingPin ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  Launch Kiosk Mode
                </Button>
              </div>
            </div>
          )}
        </div>

        {wizardStep > 1 && (
          <div className="border-t bg-card/50 backdrop-blur-sm sticky bottom-0">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <Button variant="outline" onClick={goBack} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              {wizardStep < 4 ? (
                <Button onClick={goNext} disabled={!canProceedFromStep(wizardStep)} className="gap-2">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <div />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
