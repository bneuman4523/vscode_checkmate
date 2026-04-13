import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Shield, Clock, Trash2, Eye, AlertTriangle, FileText, CalendarDays } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DataRetentionPolicy {
  enabled: boolean;
  retentionDays: number;
  action: 'anonymize' | 'delete';
  notifyDaysBefore: number;
  retentionBasis: 'event_end_date' | 'last_check_in';
}

interface RetentionPreviewEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  endDate: string | null;
  attendeeCount: number;
  eligibleDate: string;
  action: string;
  daysUntilAction: number;
}

interface RetentionLogEntry {
  id: string;
  customerId: string;
  eventId: string | null;
  eventName: string | null;
  action: 'anonymize' | 'delete' | 'notify';
  attendeesAffected: number;
  retentionDays: number;
  retentionBasis: string | null;
  eligibleDate: string | null;
  policySource: string;
  details: Record<string, any> | null;
  processedAt: string;
}

export default function DataRetentionSettings({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [action, setAction] = useState<'anonymize' | 'delete'>('anonymize');
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(7);
  const [retentionBasis, setRetentionBasis] = useState<'event_end_date' | 'last_check_in'>('event_end_date');
  const [hasChanges, setHasChanges] = useState(false);

  const { data: policyData, isLoading: policyLoading } = useQuery({
    queryKey: [`/api/customers/${customerId}/retention-policy`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${customerId}/retention-policy`);
      return res.json();
    },
  });

  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: [`/api/customers/${customerId}/retention-preview`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${customerId}/retention-preview`);
      return res.json();
    },
    enabled: enabled,
  });

  const { data: logData } = useQuery({
    queryKey: [`/api/customers/${customerId}/retention-log`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${customerId}/retention-log`);
      return res.json();
    },
  });

  useEffect(() => {
    if (policyData?.policy) {
      const p = policyData.policy as DataRetentionPolicy;
      setEnabled(p.enabled);
      setRetentionDays(p.retentionDays);
      setAction(p.action);
      setNotifyDaysBefore(p.notifyDaysBefore);
      setRetentionBasis(p.retentionBasis);
      setHasChanges(false);
    }
  }, [policyData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/customers/${customerId}/retention-policy`, {
        enabled,
        retentionDays,
        action,
        notifyDaysBefore,
        retentionBasis,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/retention-policy`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/retention-preview`] });
      setHasChanges(false);
      toast({ title: "Retention policy saved", description: "Data retention settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const markChanged = () => setHasChanges(true);

  const previewEvents = (previewData?.events || []) as RetentionPreviewEvent[];
  const logs = (logData?.logs || []) as RetentionLogEntry[];

  if (policyLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Retention
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Retention Policy
          </CardTitle>
          <CardDescription>
            Configure automated cleanup of attendee data after events end. Supports GDPR compliance by ensuring personal data isn't kept longer than necessary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Automated Retention</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, attendee data will be automatically processed after the retention period
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => { setEnabled(v); markChanged(); }}
            />
          </div>

          {enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Retention Period (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={retentionDays}
                    onChange={(e) => { setRetentionDays(parseInt(e.target.value) || 90); markChanged(); }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Days after reference date before data is processed
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Advance Notice (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={notifyDaysBefore}
                    onChange={(e) => { setNotifyDaysBefore(parseInt(e.target.value) || 7); markChanged(); }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Days before action to log a notification
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={action} onValueChange={(v: 'anonymize' | 'delete') => { setAction(v); markChanged(); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anonymize">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Anonymize — Remove PII, keep aggregate data
                        </div>
                      </SelectItem>
                      <SelectItem value="delete">
                        <div className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Delete — Remove event and all data entirely
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {action === 'anonymize'
                      ? "Names, emails, and custom fields will be replaced. Check-in counts and timestamps are preserved."
                      : "The entire event and all associated records will be permanently deleted."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Reference Date</Label>
                  <Select value={retentionBasis} onValueChange={(v: 'event_end_date' | 'last_check_in') => { setRetentionBasis(v); markChanged(); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event_end_date">Event End Date</SelectItem>
                      <SelectItem value="last_check_in">Last Check-in Activity</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The retention period starts counting from this date
                  </p>
                </div>
              </div>

              {action === 'delete' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">
                    Delete mode will permanently remove events and all associated data (attendees, check-in logs, sessions, badges). This cannot be undone. Consider using Anonymize instead to preserve aggregate reporting data.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Retention Policy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {enabled && previewEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Upcoming Retention Actions
            </CardTitle>
            <CardDescription>
              Events that will be processed based on current policy settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Attendees</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Eligible Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewEvents.map((event) => (
                  <TableRow key={event.eventId}>
                    <TableCell className="font-medium">{event.eventName}</TableCell>
                    <TableCell>{event.attendeeCount}</TableCell>
                    <TableCell>
                      <Badge variant={event.action === 'delete' ? 'destructive' : 'secondary'}>
                        {event.action === 'anonymize' ? 'Anonymize' : 'Delete'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(event.eligibleDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {event.daysUntilAction <= 0 ? (
                        <Badge variant="destructive">Due</Badge>
                      ) : event.daysUntilAction <= 7 ? (
                        <Badge className="bg-orange-500">
                          {event.daysUntilAction}d remaining
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {event.daysUntilAction}d remaining
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Retention Activity Log
            </CardTitle>
            <CardDescription>
              History of automated data retention actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="log">
                <AccordionTrigger>
                  {logs.length} recorded {logs.length === 1 ? 'action' : 'actions'}
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Attendees</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {new Date(log.processedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{log.eventName || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={
                              log.action === 'delete' ? 'destructive' :
                              log.action === 'notify' ? 'outline' : 'secondary'
                            }>
                              {log.action === 'notify' ? 'Notified' :
                               log.action === 'anonymize' ? 'Anonymized' : 'Deleted'}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.attendeesAffected}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.policySource === 'event_override' ? 'Event override' : 'Account policy'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
