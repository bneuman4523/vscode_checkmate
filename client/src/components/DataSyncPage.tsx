import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw,
  Users,
  Calendar,
  FileText,
  Check,
  X,
  Clock,
  AlertTriangle,
  Play,
  Loader2,
  Upload,
  RotateCcw,
  Snowflake,
  Radio,
  ChevronDown,
  ChevronRight,
  Link2,
  Timer,
  Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Event, CustomerIntegration } from "@shared/schema";

interface EventSyncState {
  id: string;
  eventId: string;
  integrationId: string;
  dataType: string;
  syncEnabled: boolean;
  syncStatus: string;
  syncIntervalMinutes: number | null;
  resolvedEndpoint: string | null;
  lastSyncAt: string | null;
  lastSyncTimestamp: string | null;
  lastSyncResult: any | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  nextSyncAt: string | null;
}

interface SyncSettings {
  realtimeSyncEnabled: boolean | null;
  realtimeSessionSyncEnabled: boolean | null;
  syncFrozen: boolean;
  syncFrozenAt: string | null;
  syncIntervalMinutes: number | null;
  accountSyncIntervalMinutes: number;
  accountRealtimeEnabled: boolean;
  accountSessionRealtimeEnabled: boolean;
}

interface DataSyncPageProps {
  eventId: string;
}

const DATA_TYPE_CONFIG = {
  attendees: {
    label: "Attendees",
    icon: Users,
    description: "Registrations and attendee data",
  },
  sessions: {
    label: "Sessions",
    icon: Calendar,
    description: "Event sessions and functions",
  },
  session_registrations: {
    label: "Session Registrations",
    icon: FileText,
    description: "Attendee-to-session assignments",
  },
};

const SYNC_INTERVAL_OPTIONS = [
  { value: "1", label: "Every minute" },
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
];

export default function DataSyncPage({ eventId }: DataSyncPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const isSuperAdmin = user?.role === "super_admin";
  const [syncingDataType, setSyncingDataType] = useState<string | null>(null);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);

  const { data: event } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: integration } = useQuery<CustomerIntegration>({
    queryKey: ["/api/integrations", event?.integrationId],
    enabled: !!event?.integrationId,
  });

  const { data: syncStates = [], isLoading: syncStatesLoading, refetch: refetchSyncStates } = useQuery<EventSyncState[]>({
    queryKey: [`/api/events/${eventId}/sync-states`],
    enabled: !!eventId,
  });

  const { data: syncSettings, isLoading: syncSettingsLoading } = useQuery<SyncSettings>({
    queryKey: [`/api/events/${eventId}/sync-settings`],
    enabled: !!eventId,
  });

  const initializeSyncStatesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/sync-states/initialize`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-states`] });
      toast({ title: "Sync states initialized", description: "Ready to sync data from external platform." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to initialize sync states", description: error.message, variant: "destructive" });
    },
  });

  const updateSyncStateMutation = useMutation({
    mutationFn: async ({ dataType, updates }: { dataType: string; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/events/${eventId}/sync-states/${dataType}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-states`] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update sync settings", description: error.message, variant: "destructive" });
    },
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async (dataType: string) => {
      trackStart("sync", "trigger", { dataType });
      setSyncingDataType(dataType);
      const res = await apiRequest("POST", `/api/events/${eventId}/sync/${dataType}`, {});
      return res.json();
    },
    onSuccess: (data, dataType) => {
      trackComplete("sync", "trigger", { dataType, recordCount: data.recordCount });
      setSyncingDataType(null);
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-states`] });
      queryClient.invalidateQueries({ queryKey: [`/api/attendees?eventId=${eventId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      if (data.success) {
        toast({
          title: "Sync completed",
          description: `Synced ${data.recordCount || 0} ${dataType} records in ${data.latencyMs}ms.`
        });
      } else {
        toast({
          title: "Sync failed",
          description: data.message,
          variant: "destructive"
        });
      }
    },
    onError: (error: Error, dataType) => {
      trackAbandon("sync", "trigger", { dataType });
      setSyncingDataType(null);
      toast({ title: `Failed to sync ${dataType}`, description: error.message, variant: "destructive" });
    },
  });

  const resyncCheckinsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/resync-checkins`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Check-ins resynced", description: data.message });
      } else {
        toast({ title: "Resync completed with errors", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Resync failed", description: error.message, variant: "destructive" });
    },
  });

  const resetCheckinsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/reset-checkins`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-states`] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      toast({ title: "Check-ins reset", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const updateSyncSettingsMutation = useMutation({
    mutationFn: async (updates: { realtimeSyncEnabled?: boolean | null; realtimeSessionSyncEnabled?: boolean | null; syncFrozen?: boolean; syncIntervalMinutes?: number | null }) => {
      const res = await apiRequest("PATCH", `/api/events/${eventId}/sync-settings`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-settings`] });
      toast({ title: "Sync settings updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update sync settings", description: error.message, variant: "destructive" });
    },
  });

  const getSyncStatusBadge = (state: EventSyncState) => {
    switch (state.syncStatus) {
      case "success":
        return <Badge className="bg-green-700 text-xs"><Check className="h-3 w-3 mr-1" />Synced</Badge>;
      case "syncing":
        return <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Syncing</Badge>;
      case "error":
        return <Badge variant="destructive" className="text-xs"><X className="h-3 w-3 mr-1" />Error</Badge>;
      case "pending":
        return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{state.syncStatus}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  const getOverallSyncHealth = () => {
    if (!syncStates.length) return null;
    const hasErrors = syncStates.some(s => s.syncStatus === "error");
    const allSynced = syncStates.every(s => s.syncStatus === "success");
    const hasPending = syncStates.some(s => s.syncStatus === "pending");
    const lastSync = syncStates
      .filter(s => s.lastSyncAt)
      .sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime())[0];

    if (hasErrors) return { status: "error", text: "Sync errors detected", color: "text-red-600" };
    if (hasPending) return { status: "pending", text: "Sync pending", color: "text-amber-600" };
    if (allSynced) return {
      status: "synced",
      text: `All entities synced${lastSync ? ` · Last updated ${formatDate(lastSync.lastSyncAt)}` : ""}`,
      color: "text-green-600"
    };
    return { status: "mixed", text: "Partial sync", color: "text-amber-600" };
  };

  const effectiveInterval = syncSettings?.syncIntervalMinutes ?? syncSettings?.accountSyncIntervalMinutes ?? 60;

  if (syncStatesLoading || syncSettingsLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!event?.integrationId) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Sync</h1>
          <p className="text-muted-foreground mt-1">No integration connected</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">
              Connect this event to an integration to enable data synchronization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasSyncStates = syncStates.length > 0;
  const syncTemplates = (integration?.syncTemplates as any) || {};
  const hasTemplates = syncTemplates.attendees || syncTemplates.sessions || syncTemplates.sessionRegistrations;
  const health = getOverallSyncHealth();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Sync</h1>
          <p className="text-muted-foreground mt-1">{integration?.name || "External Integration"}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchSyncStates();
            toast({ title: "Refreshed", description: "Sync status updated" });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {health && (
        <div className="flex items-center gap-2 text-sm">
          <Activity className={`h-4 w-4 ${health.color}`} />
          <span className={health.color}>{health.text}</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Sync Frequency
          </CardTitle>
          <CardDescription>How often data is pulled from {integration?.name || "the external platform"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={syncSettings?.syncIntervalMinutes?.toString() ?? "default"}
              onValueChange={(val) => {
                if (val === "default") {
                  updateSyncSettingsMutation.mutate({ syncIntervalMinutes: null });
                } else {
                  updateSyncSettingsMutation.mutate({ syncIntervalMinutes: parseInt(val, 10) });
                }
              }}
              disabled={updateSyncSettingsMutation.isPending}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  Use account default ({SYNC_INTERVAL_OPTIONS.find(o => o.value === String(syncSettings?.accountSyncIntervalMinutes ?? 60))?.label || `${syncSettings?.accountSyncIntervalMinutes ?? 60} min`})
                </SelectItem>
                {SYNC_INTERVAL_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {syncSettings?.syncIntervalMinutes !== null && syncSettings?.syncIntervalMinutes !== undefined && (
              <Badge variant="secondary" className="text-xs">
                Override active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Account default: {SYNC_INTERVAL_OPTIONS.find(o => o.value === String(syncSettings?.accountSyncIntervalMinutes ?? 60))?.label || `${syncSettings?.accountSyncIntervalMinutes ?? 60} minutes`}
          </p>
        </CardContent>
      </Card>

      {!hasTemplates && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            No sync templates configured. Please configure endpoint templates in the integration settings first.
          </p>
        </div>
      )}

      {!hasSyncStates && hasTemplates && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Sync states not initialized for this event.
            </p>
            <Button
              onClick={() => initializeSyncStatesMutation.mutate()}
              disabled={initializeSyncStatesMutation.isPending}
            >
              {initializeSyncStatesMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Initialize Sync
            </Button>
          </CardContent>
        </Card>
      )}

      {hasSyncStates && (
        <div className="grid gap-4 md:grid-cols-3">
          {[...syncStates].sort((a, b) => {
            const order: Record<string, number> = { attendees: 1, sessions: 2, session_registrations: 3 };
            return (order[a.dataType] || 99) - (order[b.dataType] || 99);
          }).map((state) => {
            const config = DATA_TYPE_CONFIG[state.dataType as keyof typeof DATA_TYPE_CONFIG];
            if (!config) return null;
            const Icon = config.icon;
            const totalRecords = state.lastSyncResult?.processedCount || 0;
            const newRecords = state.lastSyncResult?.createdCount || 0;

            return (
              <Card key={state.id}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <h4 className="font-medium text-sm">{config.label}</h4>
                    </div>
                    {getSyncStatusBadge(state)}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Last sync: {formatDate(state.lastSyncAt)}</div>
                    {totalRecords > 0 && (
                      <div>{totalRecords} records{newRecords > 0 ? ` (${newRecords} new)` : ""}</div>
                    )}
                    {state.lastErrorMessage && (
                      <div className="text-red-500 mt-1">{state.lastErrorMessage}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Switch
                      checked={state.syncEnabled}
                      onCheckedChange={(checked) =>
                        updateSyncStateMutation.mutate({
                          dataType: state.dataType,
                          updates: { syncEnabled: checked }
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSyncMutation.mutate(state.dataType)}
                      disabled={!state.resolvedEndpoint || syncingDataType === state.dataType || triggerSyncMutation.isPending}
                    >
                      {syncingDataType === state.dataType ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 mr-1" />
                      )}
                      Sync Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {syncSettings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sync Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Snowflake className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Freeze Inbound Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    Stop pulling data from the external platform
                  </p>
                  {syncSettings.syncFrozen && syncSettings.syncFrozenAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Frozen since {new Date(syncSettings.syncFrozenAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Switch
                checked={syncSettings.syncFrozen}
                onCheckedChange={(checked) =>
                  updateSyncSettingsMutation.mutate({ syncFrozen: checked })
                }
                disabled={updateSyncSettingsMutation.isPending}
              />
            </div>

            {syncSettings.accountRealtimeEnabled && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="text-sm font-medium">Realtime Sync (Check-in Updates)</Label>
                    <p className="text-xs text-muted-foreground">
                      Push check-in status changes to the external platform in real time
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Account default: <Badge variant="outline" className="text-xs ml-1">Enabled</Badge>
                      {syncSettings.realtimeSyncEnabled === false && (
                        <Badge variant="secondary" className="text-xs ml-1">Overridden — Off</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={syncSettings.realtimeSyncEnabled !== false}
                  onCheckedChange={(checked) =>
                    updateSyncSettingsMutation.mutate({ realtimeSyncEnabled: checked ? null : false })
                  }
                  disabled={updateSyncSettingsMutation.isPending}
                />
              </div>
            )}

            {syncSettings.accountSessionRealtimeEnabled && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="text-sm font-medium">Realtime Sync (Session Check-ins)</Label>
                    <p className="text-xs text-muted-foreground">
                      Push session attendance updates to the external platform in real time
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Account default: <Badge variant="outline" className="text-xs ml-1">Enabled</Badge>
                      {syncSettings.realtimeSessionSyncEnabled === false && (
                        <Badge variant="secondary" className="text-xs ml-1">Overridden — Off</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={syncSettings.realtimeSessionSyncEnabled !== false}
                  onCheckedChange={(checked) =>
                    updateSyncSettingsMutation.mutate({ realtimeSessionSyncEnabled: checked ? null : false })
                  }
                  disabled={updateSyncSettingsMutation.isPending}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasSyncStates && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Push Check-ins
                </h4>
                <p className="text-xs text-muted-foreground">
                  Send all checked-in statuses back to {integration?.name || "the external platform"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resyncCheckinsMutation.mutate()}
                disabled={resyncCheckinsMutation.isPending}
              >
                {resyncCheckinsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {resyncCheckinsMutation.isPending ? "Syncing..." : "Resync Check-ins"}
              </Button>
            </div>

            {isSuperAdmin && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Reset Event Check-ins
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Clear all check-ins and badge prints — useful for testing
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={resetCheckinsMutation.isPending}
                      >
                        {resetCheckinsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        {resetCheckinsMutation.isPending ? "Resetting..." : "Reset Check-ins"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset all check-ins?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear all check-in statuses and badge print records for this event,
                          setting every attendee back to "Registered." This action cannot be undone.
                          Use this only for testing purposes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => resetCheckinsMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, reset all check-ins
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {event?.accountCode && event?.eventCode && (
        <Collapsible open={connectionDetailsOpen} onOpenChange={setConnectionDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  <Link2 className="h-4 w-4" />
                  Connection Details
                  {connectionDetailsOpen ? (
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  ) : (
                    <ChevronRight className="h-4 w-4 ml-auto" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Code</Label>
                    <div className="font-mono">{event.accountCode}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Event Code</Label>
                    <div className="font-mono">{event.eventCode}</div>
                  </div>
                </div>
                {syncStates.filter(s => s.resolvedEndpoint).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">API Endpoints</Label>
                    {syncStates.filter(s => s.resolvedEndpoint).map((state) => {
                      const config = DATA_TYPE_CONFIG[state.dataType as keyof typeof DATA_TYPE_CONFIG];
                      return (
                        <div key={state.id} className="space-y-0.5">
                          <span className="text-xs text-muted-foreground">{config?.label || state.dataType}</span>
                          <div className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto">
                            {state.resolvedEndpoint}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
