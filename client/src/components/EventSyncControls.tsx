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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

interface EventSyncControlsProps {
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

export default function EventSyncControls({ eventId }: EventSyncControlsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const isSuperAdmin = user?.role === "super_admin";
  const [syncingDataType, setSyncingDataType] = useState<string | null>(null);

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
        toast({ 
          title: "Check-ins resynced", 
          description: data.message,
        });
      } else {
        toast({ 
          title: "Resync completed with errors", 
          description: data.message,
          variant: "destructive",
        });
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
      toast({ 
        title: "Check-ins reset", 
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: syncSettings, isLoading: syncSettingsLoading } = useQuery<{
    realtimeSyncEnabled: boolean | null;
    realtimeSessionSyncEnabled: boolean | null;
    syncFrozen: boolean;
    syncFrozenAt: string | null;
    accountRealtimeEnabled: boolean;
    accountSessionRealtimeEnabled: boolean;
  }>({
    queryKey: [`/api/events/${eventId}/sync-settings`],
    enabled: !!eventId,
  });

  const updateSyncSettingsMutation = useMutation({
    mutationFn: async (updates: { realtimeSyncEnabled?: boolean | null; realtimeSessionSyncEnabled?: boolean | null; syncFrozen?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/events/${eventId}/sync-settings`, updates);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sync-settings`] });
      const messages: string[] = [];
      if (data.syncFrozen) messages.push("Inbound sync paused");
      if (data.realtimeSyncEnabled === false) messages.push("Realtime sync disabled");
      if (data.realtimeSessionSyncEnabled === false) messages.push("Session realtime sync disabled");
      toast({ 
        title: "Sync settings updated", 
        description: messages.length > 0 ? messages.join(", ") : "Settings saved",
      });
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

  if (!event?.integrationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Data Sync
          </CardTitle>
          <CardDescription>
            Connect this event to an integration to enable data synchronization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {syncSettings && !syncSettingsLoading && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <h4 className="font-medium text-sm">Event Sync Overrides</h4>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Snowflake className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="text-sm font-medium">Freeze Inbound Sync</Label>
                    <p className="text-xs text-muted-foreground">
                      Stop pulling attendees, sessions, and registrations from the external platform
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
                        Push check-in and revert status changes to the external platform in real time
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
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            No integration linked to this event. Configure an event integration first to enable per-data-type sync controls.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (syncStatesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Data Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasSyncStates = syncStates.length > 0;
  const syncTemplates = integration?.syncTemplates as any || {};
  const hasTemplates = syncTemplates.attendees || syncTemplates.sessions || syncTemplates.sessionRegistrations;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Data Sync
            </CardTitle>
            <CardDescription>
              Synchronize attendees, sessions, and registrations from {integration?.name || "external platform"}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              refetchSyncStates();
              toast({ title: "Refreshed", description: "Sync status updated" });
            }}
            title="Refresh sync status"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncSettings && !syncSettingsLoading && (
          <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
            <h4 className="font-medium text-sm">Event Sync Overrides</h4>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Snowflake className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Freeze Inbound Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    Stop pulling attendees, sessions, and registrations from the external platform
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
                      Push check-in and revert status changes to the external platform in real time
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
          </div>
        )}

        {!hasTemplates && (
          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
            <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No sync templates configured. Please configure endpoint templates in the integration settings first.
            </p>
          </div>
        )}

        {!hasSyncStates && hasTemplates && (
          <div className="text-center py-4">
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
          </div>
        )}

        {hasSyncStates && (
          <div className="space-y-4">
            {syncStates.map((state) => {
              const config = DATA_TYPE_CONFIG[state.dataType as keyof typeof DATA_TYPE_CONFIG];
              if (!config) return null;
              const Icon = config.icon;

              return (
                <div key={state.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{config.label}</h4>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getSyncStatusBadge(state)}
                      <Switch
                        checked={state.syncEnabled}
                        onCheckedChange={(checked) => 
                          updateSyncStateMutation.mutate({ 
                            dataType: state.dataType, 
                            updates: { syncEnabled: checked } 
                          })
                        }
                      />
                    </div>
                  </div>

                  {state.resolvedEndpoint && (
                    <div className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto">
                      {state.resolvedEndpoint}
                    </div>
                  )}

                  {!state.resolvedEndpoint && (
                    <p className="text-xs text-amber-600">
                      No endpoint configured for this data type.
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="space-y-1">
                      <div>Last sync: {formatDate(state.lastSyncAt)}</div>
                      {state.lastSyncResult && (
                        <div>
                          Records: {state.lastSyncResult.processedCount || 0} 
                          {state.lastSyncResult.createdCount ? ` (${state.lastSyncResult.createdCount} new)` : ""}
                        </div>
                      )}
                      {state.lastErrorMessage && (
                        <div className="text-red-500">{state.lastErrorMessage}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSyncMutation.mutate(state.dataType)}
                      disabled={!state.resolvedEndpoint || syncingDataType === state.dataType || triggerSyncMutation.isPending}
                    >
                      {syncingDataType === state.dataType ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Sync Now
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasSyncStates && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Push Check-ins to {integration?.name || "External Platform"}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Send all checked-in statuses back to the external platform to keep records in sync
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
            </div>
          </>
        )}

        {hasSyncStates && isSuperAdmin && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset Event Check-ins
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Clear all check-ins and badge prints for this event — useful for testing and starting fresh
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
            </div>
          </>
        )}

        {event.accountCode && event.eventCode && (
          <>
            <Separator />
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
