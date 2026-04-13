import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Clock, Play, AlertCircle, CheckCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface IntegrationSyncScheduleProps {
  integrationId: string;
  dataType: string;
  integrationName?: string;
}

interface SyncSchedule {
  syncEnabled: boolean;
  syncIntervalSeconds: number;
  syncMinIntervalSeconds: number;
  syncMaxIntervalSeconds: number;
  syncWindowStart: string | null;
  syncWindowEnd: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncCount: number | null;
  runOnCheckInRequest: boolean;
}

const INTERVAL_PRESETS = [
  { label: "Every minute", value: 60 },
  { label: "Every 5 minutes", value: 300 },
  { label: "Every 15 minutes", value: 900 },
  { label: "Every 30 minutes", value: 1800 },
  { label: "Every hour", value: 3600 },
  { label: "Every 2 hours", value: 7200 },
  { label: "Every 6 hours", value: 21600 },
  { label: "Every 12 hours", value: 43200 },
  { label: "Daily", value: 86400 },
];

export default function IntegrationSyncSchedule({ 
  integrationId, 
  dataType,
  integrationName = "Integration"
}: IntegrationSyncScheduleProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const { data: schedule, isLoading, isError, refetch } = useQuery<SyncSchedule>({
    queryKey: ["/api/integrations", integrationId, "endpoint-configs", dataType, "sync-schedule"],
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (updates: Partial<SyncSchedule>) => {
      return apiRequest("PATCH", `/api/integrations/${integrationId}/endpoint-configs/${dataType}/sync-schedule`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/integrations", integrationId, "endpoint-configs", dataType, "sync-schedule"] 
      });
      setIsEditing(false);
      toast({
        title: "Schedule Updated",
        description: "Sync schedule has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update sync schedule",
        variant: "destructive",
      });
    },
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/integrations/${integrationId}/endpoint-configs/${dataType}/sync-now`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/integrations", integrationId, "endpoint-configs", dataType, "sync-schedule"] 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendees"] });
      toast({
        title: "Sync Triggered",
        description: "A sync job has been queued and will start shortly.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to trigger sync",
        variant: "destructive",
      });
    },
  });

  const formatInterval = (seconds: number): string => {
    const preset = INTERVAL_PRESETS.find((p) => p.value === seconds);
    if (preset) return preset.label;
    
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    return `${Math.round(seconds / 86400)} days`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sync Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sync Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Unable to load sync schedule. Please log in and try again.</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!schedule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Sync Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No endpoint configuration found for {dataType}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-sync-schedule">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sync Schedule - {dataType}
            </CardTitle>
            <CardDescription>
              Configure how often to sync {dataType.toLowerCase()} data from {integrationName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-schedule"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSyncMutation.mutate()}
              disabled={triggerSyncMutation.isPending}
              data-testid="button-sync-now"
            >
              {triggerSyncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="flex items-center gap-2 mt-1">
                {schedule.syncEnabled ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="font-medium text-green-600">Active</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">Disabled</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Last Sync</div>
              <div className="mt-1">
                {schedule.lastSyncAt ? (
                  <div>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(schedule.lastSyncAt), { addSuffix: true })}
                    </span>
                    {schedule.lastSyncStatus && (
                      <Badge
                        variant={schedule.lastSyncStatus === "success" ? "default" : "destructive"}
                        className="ml-2 text-xs"
                      >
                        {schedule.lastSyncStatus}
                      </Badge>
                    )}
                    {schedule.lastSyncCount !== null && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({schedule.lastSyncCount} records)
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Never</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Next Sync</div>
              <div className="mt-1">
                {schedule.nextSyncAt && schedule.syncEnabled ? (
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(schedule.nextSyncAt), { addSuffix: true })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not scheduled</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {schedule.lastSyncError && (
          <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Last Sync Error</p>
                <p className="text-sm text-destructive/80">{schedule.lastSyncError}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sync-enabled">Enable Automatic Sync</Label>
              <p className="text-sm text-muted-foreground">
                Automatically sync data at the configured interval
              </p>
            </div>
            <Switch
              id="sync-enabled"
              checked={schedule.syncEnabled}
              onCheckedChange={(checked) => updateScheduleMutation.mutate({ syncEnabled: checked })}
              disabled={updateScheduleMutation.isPending}
              data-testid="switch-sync-enabled"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="check-in-sync">Sync on Check-In Request</Label>
              <p className="text-sm text-muted-foreground">
                Trigger a sync when an attendee is not found during check-in
              </p>
            </div>
            <Switch
              id="check-in-sync"
              checked={schedule.runOnCheckInRequest}
              onCheckedChange={(checked) => updateScheduleMutation.mutate({ runOnCheckInRequest: checked })}
              disabled={updateScheduleMutation.isPending}
              data-testid="switch-checkin-sync"
            />
          </div>

          <div className="space-y-2">
            <Label>Sync Interval</Label>
            <Select
              value={String(schedule.syncIntervalSeconds)}
              onValueChange={(value) => updateScheduleMutation.mutate({ syncIntervalSeconds: parseInt(value) })}
              disabled={updateScheduleMutation.isPending}
            >
              <SelectTrigger data-testid="select-sync-interval">
                <SelectValue placeholder="Select interval..." />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_PRESETS.map((preset) => (
                  <SelectItem 
                    key={preset.value} 
                    value={String(preset.value)}
                    disabled={
                      preset.value < (schedule.syncMinIntervalSeconds || 60) ||
                      preset.value > (schedule.syncMaxIntervalSeconds || 86400)
                    }
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Allowed range: {formatInterval(schedule.syncMinIntervalSeconds || 60)} to {formatInterval(schedule.syncMaxIntervalSeconds || 86400)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Sync Window Start (optional)</Label>
              <Input
                type="time"
                value={schedule.syncWindowStart || ""}
                onChange={(e) => updateScheduleMutation.mutate({ syncWindowStart: e.target.value || null })}
                disabled={updateScheduleMutation.isPending}
                data-testid="input-sync-window-start"
              />
              <p className="text-xs text-muted-foreground">
                Only sync during this time window
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sync Window End (optional)</Label>
              <Input
                type="time"
                value={schedule.syncWindowEnd || ""}
                onChange={(e) => updateScheduleMutation.mutate({ syncWindowEnd: e.target.value || null })}
                disabled={updateScheduleMutation.isPending}
                data-testid="input-sync-window-end"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
