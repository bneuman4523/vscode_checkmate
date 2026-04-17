import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Settings, 
  Palette, 
  Bell,
  Trash2,
  Link2,
  RefreshCw,
  Unlink,
  Plus,
  Check,
  X,
  Users,
  Copy,
  Clock,
  ExternalLink,
  MapPin,
  Eye,
  EyeOff,
  Shield,
  ListChecks,
  AlertTriangle,
  UserPlus,
  UsersRound,
  Upload,
  Sun,
  Moon,
  ImageIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Event, CustomerIntegration, EventIntegration, Location, KioskBrandingConfig } from "@shared/schema";
import { WorkflowConfigurator } from "./workflow/WorkflowConfigurator";
import EventNotifications from "./EventNotifications";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Checkbox } from "@/components/ui/checkbox";

interface EventSettingsProps {
  eventId: string;
}

const PROVIDER_VARIABLE_FIELDS: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  certain_oauth: [
    { key: "accountCode", label: "Account Code", placeholder: "e.g., ACME" },
    { key: "eventCode", label: "Event Code", placeholder: "e.g., CONF2025" },
  ],
  certain: [
    { key: "accountCode", label: "Account Code", placeholder: "e.g., ACME" },
    { key: "eventCode", label: "Event Code", placeholder: "e.g., CONF2025" },
  ],
  bearer_token: [
    { key: "eventId", label: "Event ID", placeholder: "External event identifier" },
  ],
};

interface KioskWalkinConfig {
  enabledFields: string[];
  requiredFields: string[];
  availableTypes: string[];
  defaultType: string;
}

interface TempStaffSettings {
  enabled: boolean;
  startTime: string | null;
  endTime: string | null;
  badgeTemplateId: string | null;
  allowedSessionIds: string[] | null;
  hasPasscode: boolean;
  passcode: string | null;
  allowWalkins: boolean;
  allowKioskFromStaff: boolean;
  allowGroupCheckin?: boolean;
  allowKioskWalkins?: boolean;
  kioskWalkinConfig?: KioskWalkinConfig;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EventSettings({ eventId }: EventSettingsProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedIntegrationToAdd, setSelectedIntegrationToAdd] = useState<string>("");
  const [editingVariables, setEditingVariables] = useState<Record<string, Record<string, string>>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const featureFlags = useFeatureFlags();
  
  const [staffEnabled, setStaffEnabled] = useState(false);
  const [staffPasscode, setStaffPasscode] = useState("");
  const [staffStartTime, setStaffStartTime] = useState("");
  const [staffEndTime, setStaffEndTime] = useState("");
  const [staffAllowWalkins, setStaffAllowWalkins] = useState(false);
  const [staffAllowKiosk, setStaffAllowKiosk] = useState(false);
  const [staffAllowGroupCheckin, setStaffAllowGroupCheckin] = useState(false);
  const [kioskWalkinsEnabled, setKioskWalkinsEnabled] = useState(false);
  const [kioskWalkinConfig, setKioskWalkinConfig] = useState<KioskWalkinConfig>({
    enabledFields: ['firstName', 'lastName', 'email', 'participantType'],
    requiredFields: ['firstName', 'lastName', 'email'],
    availableTypes: ['Walk-in'],
    defaultType: 'Walk-in',
  });
  const [newAttendeeType, setNewAttendeeType] = useState("");
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [staffQrDataUrl, setStaffQrDataUrl] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("access");

  // Kiosk branding override state
  const [brandingOverrideEnabled, setBrandingOverrideEnabled] = useState(false);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingBannerUrl, setBrandingBannerUrl] = useState<string | null>(null);
  const [brandingKioskTheme, setBrandingKioskTheme] = useState<"light" | "dark">("light");
  const [brandingInitialized, setBrandingInitialized] = useState(false);
  const brandingLogoInputRef = useRef<HTMLInputElement>(null);
  const brandingBannerInputRef = useRef<HTMLInputElement>(null);

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: accountIntegrations = [] } = useQuery<CustomerIntegration[]>({
    queryKey: [`/api/integrations?customerId=${event?.customerId}`],
    enabled: !!event?.customerId,
  });

  const { data: eventIntegrations = [], isLoading: eventIntegrationsLoading } = useQuery<EventIntegration[]>({
    queryKey: ["/api/events", eventId, "integrations"],
    enabled: !!eventId,
  });

  const { data: tempStaffSettings } = useQuery<TempStaffSettings>({
    queryKey: ["/api/events", eventId, "staff-settings"],
    enabled: !!eventId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations", event?.customerId],
    queryFn: async () => {
      if (!event?.customerId) return [];
      const res = await fetch(`/api/locations?customerId=${event.customerId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch locations');
      return res.json();
    },
    enabled: !!event?.customerId,
  });

  const updateEventLocationMutation = useMutation({
    mutationFn: async (locationId: string | null) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}`, {
        locationId: locationId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      toast({
        title: "Location updated",
        description: "The event location has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update location",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const vars: Record<string, Record<string, string>> = {};
    eventIntegrations.forEach(ei => {
      vars[ei.id] = ei.variables || {};
    });
    setEditingVariables(vars);
  }, [eventIntegrations]);

  useEffect(() => {
    if (staffEnabled && eventId) {
      const staffUrl = `${window.location.origin}/staff/${eventId}`;
      QRCode.toDataURL(staffUrl, { width: 200, margin: 2 })
        .then((url: string) => setStaffQrDataUrl(url))
        .catch(() => setStaffQrDataUrl(null));
    } else {
      setStaffQrDataUrl(null);
    }
  }, [staffEnabled, eventId]);

  const parseIanaTimezone = useCallback((tz: string | null | undefined): string => {
    if (!tz) return Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      // Not a valid IANA ID — try to extract from display labels like "(UTC-05:00) Central Time (US & Canada)"
    }
    const displayToIana: Record<string, string> = {
      "Eastern Time (US & Canada)": "America/New_York",
      "Central Time (US & Canada)": "America/Chicago",
      "Mountain Time (US & Canada)": "America/Denver",
      "Pacific Time (US & Canada)": "America/Los_Angeles",
      "Alaska": "America/Anchorage",
      "Hawaii": "Pacific/Honolulu",
      "Arizona": "America/Phoenix",
      "Atlantic Time (Canada)": "America/Halifax",
      "Newfoundland": "America/St_Johns",
      "London, Edinburgh, Dublin, Lisbon": "Europe/London",
      "Brussels, Copenhagen, Madrid, Paris": "Europe/Paris",
      "Amsterdam, Berlin, Rome, Vienna": "Europe/Berlin",
      "Athens, Bucharest, Istanbul": "Europe/Athens",
      "Moscow, St. Petersburg": "Europe/Moscow",
      "Dubai, Abu Dhabi": "Asia/Dubai",
      "Kolkata, Mumbai, New Delhi": "Asia/Kolkata",
      "Bangkok, Hanoi, Jakarta": "Asia/Bangkok",
      "Beijing, Hong Kong, Shanghai": "Asia/Shanghai",
      "Kuala Lumpur, Singapore": "Asia/Singapore",
      "Tokyo, Osaka, Sapporo": "Asia/Tokyo",
      "Seoul": "Asia/Seoul",
      "Sydney, Melbourne": "Australia/Sydney",
      "Auckland, Wellington": "Pacific/Auckland",
      "Samoa": "Pacific/Samoa",
    };
    const stripped = tz.replace(/^\(UTC[^)]*\)\s*/, "").trim();
    if (displayToIana[stripped]) return displayToIana[stripped];
    const offsetMatch = tz.match(/UTC([+-]\d{2}):(\d{2})/);
    if (offsetMatch) {
      const sign = offsetMatch[1].startsWith("-") ? -1 : 1;
      const hours = parseInt(offsetMatch[1].replace(/[+-]/, ""), 10);
      const totalMinutes = sign * (hours * 60 + parseInt(offsetMatch[2], 10));
      const etcSign = totalMinutes <= 0 ? "+" : "-";
      const etcHours = Math.abs(Math.round(totalMinutes / 60));
      return `Etc/GMT${etcSign}${etcHours}`;
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  const eventTimezone = parseIanaTimezone(event?.timezone);

  const utcToEventTzInput = useCallback((isoStr: string, tz: string): string => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(isoStr));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }, []);

  const eventTzInputToUtc = useCallback((localStr: string, tz: string): string => {
    const [datePart, timePart] = localStr.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const offsetMs = probe.getTime() - new Date(
      probe.toLocaleString("en-US", { timeZone: tz })
    ).getTime();
    return new Date(probe.getTime() + offsetMs).toISOString();
  }, []);

  useEffect(() => {
    if (tempStaffSettings) {
      setStaffEnabled(tempStaffSettings.enabled);
      if (tempStaffSettings.startTime) {
        setStaffStartTime(utcToEventTzInput(tempStaffSettings.startTime, eventTimezone));
      }
      if (tempStaffSettings.endTime) {
        setStaffEndTime(utcToEventTzInput(tempStaffSettings.endTime, eventTimezone));
      }
      setStaffAllowWalkins(tempStaffSettings.allowWalkins || false);
      setStaffAllowKiosk(tempStaffSettings.allowKioskFromStaff || false);
      setStaffAllowGroupCheckin(tempStaffSettings.allowGroupCheckin || false);
      setKioskWalkinsEnabled(tempStaffSettings.allowKioskWalkins || false);
      if (tempStaffSettings.kioskWalkinConfig) {
        setKioskWalkinConfig(tempStaffSettings.kioskWalkinConfig);
      }
    }
  }, [tempStaffSettings, eventTimezone, utcToEventTzInput]);

  // Initialize branding override state from event data
  useEffect(() => {
    if (event && !brandingInitialized) {
      const override = (event as any).kioskBrandingOverride as (KioskBrandingConfig & { enabled: boolean }) | null | undefined;
      if (override) {
        setBrandingOverrideEnabled(override.enabled ?? false);
        setBrandingLogoUrl(override.logoUrl ?? null);
        setBrandingBannerUrl(override.bannerUrl ?? null);
        setBrandingKioskTheme(override.kioskTheme ?? "light");
      }
      setBrandingInitialized(true);
    }
  }, [event, brandingInitialized]);

  const addEventIntegrationMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/integrations`, {
        integrationId,
        variables: {},
        isPrimary: eventIntegrations.length === 0,
        enabled: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "integrations"] });
      setSelectedIntegrationToAdd("");
      toast({
        title: "Integration added",
        description: "The integration has been linked to this event.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add integration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEventIntegrationMutation = useMutation({
    mutationFn: async ({ id, variables, enabled, isPrimary }: { id: string; variables?: Record<string, string>; enabled?: boolean; isPrimary?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}/integrations/${id}`, {
        variables,
        enabled,
        isPrimary,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "integrations"] });
      toast({
        title: "Integration updated",
        description: "Integration settings have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update integration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/events/${eventId}/integrations/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "integrations"] });
      toast({
        title: "Integration removed",
        description: "The integration has been unlinked from this event.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove integration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/events/${eventId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event deleted", description: "The event and all its data have been permanently removed." });
      if (event?.customerId) {
        setLocation(`/customers/${event.customerId}`);
      } else {
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete event",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncAttendeesMutation = useMutation({
    mutationFn: async (eventIntegrationId: string) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/integrations/${eventIntegrationId}/sync`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendees"] });
      toast({
        title: "Sync complete",
        description: `Synced ${data.synced || 0} attendees from integration.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTempStaffSettingsMutation = useMutation({
    mutationFn: async (settings: { enabled?: boolean; passcode?: string; startTime?: string; endTime?: string; allowWalkins?: boolean; allowKioskWalkins?: boolean; kioskWalkinConfig?: KioskWalkinConfig }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}/staff-settings`, settings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "staff-settings"] });
      setStaffPasscode("");
      toast({
        title: "Staff access updated",
        description: "Staff access settings have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateBrandingOverrideMutation = useMutation({
    mutationFn: async (branding: KioskBrandingConfig & { enabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}`, {
        kioskBrandingOverride: branding,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      setBrandingInitialized(false); // Allow re-init from fresh data
      toast({
        title: "Branding updated",
        description: "Event kiosk branding override has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update branding",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveBrandingOverride = () => {
    updateBrandingOverrideMutation.mutate({
      enabled: brandingOverrideEnabled,
      logoUrl: brandingLogoUrl || null,
      bannerUrl: brandingBannerUrl || null,
      kioskTheme: brandingKioskTheme,
    });
  };

  const handleBrandingImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select an image file." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Maximum file size is 2MB." });
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setter(dataUrl);
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Could not read the image file." });
    }

    e.target.value = "";
  };

  const handleSaveTempStaffSettings = () => {
    // Validate passcode minimum length
    if (staffPasscode && staffPasscode.length < 4) {
      toast({
        title: "Invalid passcode",
        description: "Passcode must be at least 4 characters long.",
        variant: "destructive",
      });
      return;
    }
    
    const settings: { enabled?: boolean; passcode?: string; startTime?: string; endTime?: string; allowWalkins?: boolean; allowKioskFromStaff?: boolean; allowGroupCheckin?: boolean; allowKioskWalkins?: boolean; kioskWalkinConfig?: KioskWalkinConfig } = {
      enabled: staffEnabled,
      allowWalkins: staffAllowWalkins,
      allowKioskFromStaff: staffAllowKiosk,
      allowGroupCheckin: staffAllowGroupCheckin,
      allowKioskWalkins: kioskWalkinsEnabled,
      kioskWalkinConfig: kioskWalkinsEnabled ? kioskWalkinConfig : undefined,
    };
    
    if (staffPasscode) {
      settings.passcode = staffPasscode;
    }
    if (staffStartTime) {
      settings.startTime = eventTzInputToUtc(staffStartTime, eventTimezone);
    }
    if (staffEndTime) {
      settings.endTime = eventTzInputToUtc(staffEndTime, eventTimezone);
    }
    
    updateTempStaffSettingsMutation.mutate(settings);
  };

  const copyStaffLink = () => {
    const link = `${window.location.origin}/staff/${eventId}`;
    navigator.clipboard.writeText(link);
    setShowCopiedMessage(true);
    setTimeout(() => setShowCopiedMessage(false), 2000);
    toast({
      title: "Link copied",
      description: "Staff login link has been copied to clipboard.",
    });
  };

  const handleVariableChange = (eventIntegrationId: string, key: string, value: string) => {
    setEditingVariables(prev => ({
      ...prev,
      [eventIntegrationId]: {
        ...(prev[eventIntegrationId] || {}),
        [key]: value,
      },
    }));
  };

  const handleSaveVariables = (eventIntegrationId: string) => {
    const variables = editingVariables[eventIntegrationId] || {};
    updateEventIntegrationMutation.mutate({ id: eventIntegrationId, variables });
  };

  const getProviderForEventIntegration = (eventIntegration: EventIntegration): CustomerIntegration | undefined => {
    return accountIntegrations.find(ai => ai.id === eventIntegration.integrationId);
  };

  const getAvailableIntegrationsToAdd = () => {
    const linkedIds = new Set(eventIntegrations.map(ei => ei.integrationId));
    return accountIntegrations.filter(ai => !linkedIds.has(ai.id));
  };

  const switchPanel = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
  }, []);

  const accessStatus = (() => {
    if (!tempStaffSettings) return "needs-setup" as const;
    if (tempStaffSettings.enabled && tempStaffSettings.hasPasscode) return "configured" as const;
    if (tempStaffSettings.enabled && !tempStaffSettings.hasPasscode) return "needs-attention" as const;
    return "needs-setup" as const;
  })();

  type SettingsNavItem = {
    id: string;
    label: string;
    icon: typeof Shield;
    status: "configured" | "needs-setup" | "needs-attention" | "count" | "danger";
    count?: number;
    belowLine?: boolean;
  };

  const navItems: SettingsNavItem[] = [
    { id: "access", label: "Access", icon: Shield, status: accessStatus },
    { id: "workflow", label: "Check-in Workflow", icon: ListChecks, status: "configured" },
    { id: "notifications", label: "Notifications", icon: Bell, status: "configured" },
    { id: "branding", label: "Kiosk Branding", icon: Palette, status: brandingOverrideEnabled ? "configured" : "needs-setup" },
    { id: "danger", label: "Danger Zone", icon: Trash2, status: "danger" },
  ];

  const renderStatusIndicator = (item: SettingsNavItem) => {
    switch (item.status) {
      case "needs-setup":
        return <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />;
      case "needs-attention":
        return <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />;
      case "configured":
        return <span className="h-2.5 w-2.5 rounded-full bg-[#2FB36D] shrink-0" />;
      case "count":
        return item.count ? (
          <Badge variant="secondary" className="h-5 min-w-[20px] flex items-center justify-center text-xs px-1.5">{item.count}</Badge>
        ) : null;
      case "danger":
        return null;
      default:
        return null;
    }
  };

  if (eventLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-6" data-testid="section-event-settings">
      <nav className="hidden md:block w-[220px] shrink-0 sticky top-0 self-start" aria-label="Settings sections">
        <div className="space-y-1" role="tablist" aria-orientation="vertical">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 pb-2">Settings</p>
          {navItems.map((item) => {
            const statusLabel = item.status === "needs-setup" ? "needs setup" : item.status === "needs-attention" ? "needs attention" : item.status === "configured" ? "configured" : "";
            return (
            <button
              key={item.id}
              role="tab"
              aria-selected={activeSection === item.id}
              aria-label={`${item.label}${statusLabel ? `: ${statusLabel}` : ""}`}
              onClick={() => switchPanel(item.id)}
              className={cn(
                "flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
                activeSection === item.id
                  ? "bg-[#0B2958]/10 text-[#0B2958] dark:bg-[#0B2958]/30 dark:text-white"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                item.status === "danger" && "mt-4 pt-4 border-t border-border",
                item.status === "danger" && activeSection === item.id && "text-destructive bg-destructive/10"
              )}
              data-testid={`settings-nav-${item.id}`}
            >
              <item.icon className={cn(
                "h-4 w-4 shrink-0",
                item.status === "danger" && "text-destructive"
              )} />
              <span className={cn(
                "flex-1",
                item.status === "danger" && "text-destructive"
              )}>{item.label}</span>
              {renderStatusIndicator(item)}
            </button>
            );
          })}
        </div>
      </nav>

      <div className="md:hidden w-full overflow-x-auto pb-3 mb-3 border-b">
        <div className="flex gap-1.5 min-w-max px-1" role="tablist" aria-label="Settings sections">
          {navItems.map((item) => {
            const statusLabel = item.status === "needs-setup" ? "needs setup" : item.status === "needs-attention" ? "needs attention" : item.status === "configured" ? "configured" : "";
            return (
            <button
              key={item.id}
              role="tab"
              aria-selected={activeSection === item.id}
              aria-label={`${item.label}${statusLabel ? `: ${statusLabel}` : ""}`}
              onClick={() => switchPanel(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeSection === item.id
                  ? "bg-[#0B2958] text-white dark:bg-[#0B2958]/80"
                  : "bg-muted text-muted-foreground hover:bg-accent",
                item.status === "danger" && activeSection === item.id && "bg-destructive text-destructive-foreground"
              )}
              data-testid={`settings-pill-${item.id}`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
              {renderStatusIndicator(item)}
            </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full md:max-w-[680px] space-y-6" role="tabpanel" aria-label={activeSection}>
        {activeSection === "access" && <div>
      <Card data-testid="card-staff-settings">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Staff Access
              </CardTitle>
              <CardDescription>
                Passcode-based access for onsite staff to check in attendees and print badges
              </CardDescription>
            </div>
            <Switch
              checked={staffEnabled}
              onCheckedChange={setStaffEnabled}
              data-testid="switch-staff-enabled"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {staffEnabled && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Staff Login URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded border text-sm font-mono break-all" data-testid="text-staff-url">
                    {window.location.origin}/staff/{eventId}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyStaffLink}
                    data-testid="button-copy-staff-link"
                  >
                    {showCopiedMessage ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/staff/${eventId}`, '_blank')}
                    data-testid="button-open-staff-link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                {staffQrDataUrl && (
                  <div className="mt-3 flex flex-col items-start" data-testid="staff-url-qr-code">
                    <p className="text-xs text-muted-foreground mb-1">Scan to open staff page</p>
                    <img src={staffQrDataUrl} alt="Staff login QR code" className="rounded border" width={160} height={160} />
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {tempStaffSettings?.hasPasscode ? "Current Passcode" : "Passcode"}
                  </Label>
                  {tempStaffSettings?.hasPasscode ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted rounded border font-mono text-lg tracking-wider">
                        {tempStaffSettings.passcode}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(tempStaffSettings.passcode!);
                          toast({
                            title: "Copied",
                            description: "Passcode copied to clipboard",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 py-2">No passcode set — staff cannot log in yet</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staffPasscode" className="text-sm font-medium">
                    {tempStaffSettings?.hasPasscode ? "Change Passcode" : "Set Passcode"}
                  </Label>
                  <Input
                    id="staffPasscode"
                    type="text"
                    placeholder={tempStaffSettings?.hasPasscode ? "Enter new passcode to change" : "Enter passcode (min 4 characters)"}
                    value={staffPasscode}
                    onChange={(e) => setStaffPasscode(e.target.value)}
                    minLength={4}
                    data-testid="input-staff-passcode"
                  />
                  {staffPasscode && staffPasscode.length > 0 && staffPasscode.length < 4 && (
                    <p className="text-xs text-destructive">Passcode must be at least 4 characters long</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="staffStartTime" className="text-sm font-medium">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Access Window Start
                    </Label>
                    <Input
                      id="staffStartTime"
                      type="datetime-local"
                      value={staffStartTime}
                      onChange={(e) => setStaffStartTime(e.target.value)}
                      data-testid="input-staff-start-time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staffEndTime" className="text-sm font-medium">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Access Window End
                    </Label>
                    <Input
                      id="staffEndTime"
                      type="datetime-local"
                      value={staffEndTime}
                      onChange={(e) => setStaffEndTime(e.target.value)}
                      data-testid="input-staff-end-time"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Times shown in event timezone: <span className="font-medium text-foreground">{eventTimezone.replace(/_/g, " ")}</span>
                  {event?.timezone ? "" : " (no event timezone set — using your local timezone)"}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Allow Walk-ins</Label>
                  <p className="text-xs text-muted-foreground">
                    Let staff add new attendees directly from the check-in dashboard
                  </p>
                </div>
                <Switch
                  checked={staffAllowWalkins}
                  onCheckedChange={setStaffAllowWalkins}
                  data-testid="switch-allow-walkins"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Allow Kiosk Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Let staff launch self-service kiosk mode directly from their dashboard
                  </p>
                </div>
                <Switch
                  checked={staffAllowKiosk}
                  onCheckedChange={setStaffAllowKiosk}
                  data-testid="switch-allow-kiosk"
                />
              </div>

              {featureFlags.groupCheckin && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <UsersRound className="h-4 w-4" />
                      Group Check-in
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Allow staff to check in multiple attendees at once from the same party or group
                    </p>
                  </div>
                  <Switch
                    checked={staffAllowGroupCheckin}
                    onCheckedChange={setStaffAllowGroupCheckin}
                    data-testid="switch-allow-group-checkin"
                  />
                </div>
              )}

              {featureFlags.kioskWalkinRegistration && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Kiosk Walk-in Registration
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Allow unregistered attendees to sign up directly at the kiosk
                      </p>
                    </div>
                    <Switch
                      checked={kioskWalkinsEnabled}
                      onCheckedChange={setKioskWalkinsEnabled}
                      data-testid="switch-kiosk-walkins"
                    />
                  </div>

                  {kioskWalkinsEnabled && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fields to Collect</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: 'firstName', label: 'First Name', alwaysOn: true },
                            { key: 'lastName', label: 'Last Name', alwaysOn: true },
                            { key: 'email', label: 'Email', alwaysOn: false },
                            { key: 'company', label: 'Company', alwaysOn: false },
                            { key: 'title', label: 'Title', alwaysOn: false },
                            { key: 'participantType', label: 'Attendee Type', alwaysOn: false },
                          ].map(field => (
                            <div key={field.key} className="flex items-center gap-2">
                              <Checkbox
                                id={`field-${field.key}`}
                                checked={field.alwaysOn || kioskWalkinConfig.enabledFields.includes(field.key)}
                                disabled={field.alwaysOn}
                                onCheckedChange={(checked) => {
                                  if (field.alwaysOn) return;
                                  const newEnabled = checked
                                    ? [...kioskWalkinConfig.enabledFields, field.key]
                                    : kioskWalkinConfig.enabledFields.filter(f => f !== field.key);
                                  const newRequired = checked
                                    ? kioskWalkinConfig.requiredFields
                                    : kioskWalkinConfig.requiredFields.filter(f => f !== field.key);
                                  setKioskWalkinConfig({ ...kioskWalkinConfig, enabledFields: newEnabled, requiredFields: newRequired });
                                }}
                              />
                              <label htmlFor={`field-${field.key}`} className="text-sm">{field.label}</label>
                              {(field.alwaysOn || kioskWalkinConfig.enabledFields.includes(field.key)) && !field.alwaysOn && (
                                <div className="flex items-center gap-1 ml-auto">
                                  <Checkbox
                                    id={`required-${field.key}`}
                                    checked={kioskWalkinConfig.requiredFields.includes(field.key)}
                                    onCheckedChange={(checked) => {
                                      const newRequired = checked
                                        ? [...kioskWalkinConfig.requiredFields, field.key]
                                        : kioskWalkinConfig.requiredFields.filter(f => f !== field.key);
                                      setKioskWalkinConfig({ ...kioskWalkinConfig, requiredFields: newRequired });
                                    }}
                                  />
                                  <label htmlFor={`required-${field.key}`} className="text-xs text-muted-foreground">Required</label>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Attendee Types</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {kioskWalkinConfig.availableTypes.map(type => (
                            <Badge key={type} variant="secondary" className="gap-1 pr-1">
                              {type}
                              {type === kioskWalkinConfig.defaultType && (
                                <span className="text-xs text-primary">(default)</span>
                              )}
                              {kioskWalkinConfig.availableTypes.length > 1 && (
                                <button
                                  className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                                  onClick={() => {
                                    const newTypes = kioskWalkinConfig.availableTypes.filter(t => t !== type);
                                    const newDefault = type === kioskWalkinConfig.defaultType ? newTypes[0] || 'Walk-in' : kioskWalkinConfig.defaultType;
                                    setKioskWalkinConfig({ ...kioskWalkinConfig, availableTypes: newTypes, defaultType: newDefault });
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add attendee type..."
                            value={newAttendeeType}
                            onChange={(e) => setNewAttendeeType(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newAttendeeType.trim()) {
                                e.preventDefault();
                                if (!kioskWalkinConfig.availableTypes.includes(newAttendeeType.trim())) {
                                  setKioskWalkinConfig({
                                    ...kioskWalkinConfig,
                                    availableTypes: [...kioskWalkinConfig.availableTypes, newAttendeeType.trim()],
                                  });
                                }
                                setNewAttendeeType("");
                              }
                            }}
                            className="h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              if (newAttendeeType.trim() && !kioskWalkinConfig.availableTypes.includes(newAttendeeType.trim())) {
                                setKioskWalkinConfig({
                                  ...kioskWalkinConfig,
                                  availableTypes: [...kioskWalkinConfig.availableTypes, newAttendeeType.trim()],
                                });
                              }
                              setNewAttendeeType("");
                            }}
                            disabled={!newAttendeeType.trim()}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default Attendee Type</Label>
                        <Select
                          value={kioskWalkinConfig.defaultType}
                          onValueChange={(value) => setKioskWalkinConfig({ ...kioskWalkinConfig, defaultType: value })}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {kioskWalkinConfig.availableTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t">
                <Button
                  onClick={handleSaveTempStaffSettings}
                  disabled={updateTempStaffSettingsMutation.isPending || (!tempStaffSettings?.hasPasscode && !staffPasscode) || (staffPasscode.length > 0 && staffPasscode.length < 4)}
                  data-testid="button-save-staff-settings"
                >
                  {updateTempStaffSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </>
          )}

          {!staffEnabled && tempStaffSettings?.hasPasscode && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-600">
                Staff access is configured but currently disabled. Toggle the switch above to re-enable.
              </p>
              <Button
                size="sm"
                onClick={handleSaveTempStaffSettings}
                disabled={updateTempStaffSettingsMutation.isPending}
                data-testid="button-disable-staff"
              >
                {updateTempStaffSettingsMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}

          {!staffEnabled && !tempStaffSettings?.hasPasscode && (
            <p className="text-sm text-muted-foreground">
              Toggle the switch above to set up staff access for this event.
            </p>
          )}
        </CardContent>
      </Card>
        </div>}

        {activeSection === "workflow" && <div>
          <WorkflowConfigurator eventId={eventId} />
        </div>}

        {activeSection === "notifications" && <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Check-in Notifications
              </CardTitle>
              <CardDescription>Get SMS alerts when specific attendees check in</CardDescription>
            </CardHeader>
            <CardContent>
              <EventNotifications eventId={eventId} />
            </CardContent>
          </Card>
        </div>}

        {activeSection === "branding" && <div>
          <Card data-testid="card-branding-override">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Kiosk Branding
                  </CardTitle>
                  <CardDescription>
                    Override account-level branding for this event's kiosk screens
                  </CardDescription>
                </div>
                <Switch
                  checked={brandingOverrideEnabled}
                  onCheckedChange={setBrandingOverrideEnabled}
                  data-testid="switch-branding-override"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!brandingOverrideEnabled && (
                <p className="text-sm text-muted-foreground">
                  Using account default branding. Toggle the switch above to override branding for this event.
                </p>
              )}

              {brandingOverrideEnabled && (
                <>
                  {/* Logo upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Logo
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Square or horizontal logo for the kiosk header. Recommended: 200x60px. Max 2MB.
                    </p>
                    {brandingLogoUrl ? (
                      <div className="space-y-2">
                        <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                          <img
                            src={brandingLogoUrl}
                            alt="Logo preview"
                            className="max-h-16 max-w-full object-contain"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => brandingLogoInputRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Replace
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBrandingLogoUrl(null)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 cursor-pointer transition-colors flex flex-col items-center justify-center py-6"
                        onClick={() => brandingLogoInputRef.current?.click()}
                      >
                        <Upload className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
                        <span className="text-sm text-muted-foreground">Click to upload logo</span>
                        <span className="text-xs text-muted-foreground/60 mt-0.5">PNG, JPG, or SVG up to 2MB</span>
                      </div>
                    )}
                    <input
                      ref={brandingLogoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleBrandingImageUpload(e, setBrandingLogoUrl)}
                      className="hidden"
                    />
                  </div>

                  {/* Banner upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Banner
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Wide banner for the top of the kiosk screen. Recommended: 800x200px. Max 2MB.
                    </p>
                    {brandingBannerUrl ? (
                      <div className="space-y-2">
                        <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                          <img
                            src={brandingBannerUrl}
                            alt="Banner preview"
                            className="max-h-24 max-w-full object-contain"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => brandingBannerInputRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Replace
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBrandingBannerUrl(null)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 cursor-pointer transition-colors flex flex-col items-center justify-center py-6"
                        onClick={() => brandingBannerInputRef.current?.click()}
                      >
                        <Upload className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
                        <span className="text-sm text-muted-foreground">Click to upload banner</span>
                        <span className="text-xs text-muted-foreground/60 mt-0.5">PNG, JPG, or SVG up to 2MB</span>
                      </div>
                    )}
                    <input
                      ref={brandingBannerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleBrandingImageUpload(e, setBrandingBannerUrl)}
                      className="hidden"
                    />
                  </div>

                  {/* Theme selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Kiosk Theme</Label>
                    <RadioGroup
                      value={brandingKioskTheme}
                      onValueChange={(value) => setBrandingKioskTheme(value as "light" | "dark")}
                      className="grid grid-cols-2 gap-3"
                    >
                      <Label
                        htmlFor="branding-theme-light"
                        className={`flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
                          brandingKioskTheme === "light"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                        }`}
                      >
                        <RadioGroupItem value="light" id="branding-theme-light" />
                        <Sun className="h-4 w-4" />
                        <span className="text-sm font-medium">Light</span>
                      </Label>
                      <Label
                        htmlFor="branding-theme-dark"
                        className={`flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
                          brandingKioskTheme === "dark"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                        }`}
                      >
                        <RadioGroupItem value="dark" id="branding-theme-dark" />
                        <Moon className="h-4 w-4" />
                        <span className="text-sm font-medium">Dark</span>
                      </Label>
                    </RadioGroup>
                  </div>

                  <div className="flex justify-end pt-2 border-t">
                    <Button
                      onClick={handleSaveBrandingOverride}
                      disabled={updateBrandingOverrideMutation.isPending}
                      data-testid="button-save-branding"
                    >
                      {updateBrandingOverrideMutation.isPending ? "Saving..." : "Save Branding"}
                    </Button>
                  </div>
                </>
              )}

              {!brandingOverrideEnabled && (event as any)?.kioskBrandingOverride?.enabled && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-amber-600">
                    Branding override was previously enabled. Save to switch back to account defaults.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleSaveBrandingOverride}
                    disabled={updateBrandingOverrideMutation.isPending}
                    data-testid="button-disable-branding"
                  >
                    {updateBrandingOverrideMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>}

        {activeSection === "danger" && <div>
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Delete Event</Label>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete this event and all attendee data
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-event"
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{event?.name}"? This will permanently remove the event and all associated attendees, check-in data, and settings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEventMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
