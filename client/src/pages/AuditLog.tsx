import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Filter, Clock, User, Building2, ArrowRight } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  customerId?: string;
  customerName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  changedFields?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface AuditLogStats {
  total: number;
  last24h: number;
  last7d: number;
  byAction: { action: string; count: number }[];
  byUser: { userId: string; userEmail: string; count: number }[];
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    integration_update: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    realtime_sync_update: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    sync_templates_update: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    sync_settings_update: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    webhook_config_update: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  };
  const colors = colorMap[action] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  const labels: Record<string, string> = {
    integration_update: "Integration Update",
    realtime_sync_update: "Realtime Sync",
    sync_templates_update: "Sync Templates",
    sync_settings_update: "Sync Settings",
    webhook_config_update: "Webhook Config",
  };
  return <Badge className={colors}>{labels[action] || action}</Badge>;
}

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    super_admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    admin: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    manager: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    staff: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };
  const colors = colorMap[role] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  return <Badge variant="outline" className={colors}>{role.replace("_", " ")}</Badge>;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const { data: stats } = useQuery<AuditLogStats>({
    queryKey: ["/api/audit-logs/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/audit-logs/stats");
      return res.json();
    },
  });

  const { data: logs = [], isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/audit-logs", actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (actionFilter && actionFilter !== "all") {
        params.set("action", actionFilter);
      }
      const res = await apiRequest("GET", `/api/audit-logs?${params}`);
      return res.json();
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Settings Audit Log</h1>
          <p className="text-muted-foreground">
            Track changes to integration and webhook settings made by admins during beta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Changes</CardDescription>
            <CardTitle className="text-2xl">{stats?.total ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 24 Hours</CardDescription>
            <CardTitle className="text-2xl">{stats?.last24h ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 7 Days</CardDescription>
            <CardTitle className="text-2xl">{stats?.last7d ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Users</CardDescription>
            <CardTitle className="text-2xl">{stats?.byUser?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {stats && stats.byUser.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changes by Action Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.byAction.map((item) => (
                  <div key={item.action} className="flex items-center justify-between">
                    <ActionBadge action={item.action} />
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changes by User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.byUser.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.userEmail}</span>
                    </div>
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Change History</CardTitle>
              <CardDescription>Detailed log of all settings changes</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="integration_update">Integration Update</SelectItem>
                  <SelectItem value="realtime_sync_update">Realtime Sync</SelectItem>
                  <SelectItem value="sync_templates_update">Sync Templates</SelectItem>
                  <SelectItem value="sync_settings_update">Sync Settings</SelectItem>
                  <SelectItem value="webhook_config_update">Webhook Config</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No settings changes have been recorded yet. Changes will appear here once admins modify integration or webhook settings.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Fields Changed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEntry(entry)}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{entry.userEmail}</TableCell>
                    <TableCell><RoleBadge role={entry.userRole} /></TableCell>
                    <TableCell><ActionBadge action={entry.action} /></TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{entry.resourceName || entry.resourceId}</TableCell>
                    <TableCell>
                      {entry.customerName && (
                        <div className="flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {entry.customerName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.changedFields?.length ?? 0} field(s)
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Detail</DialogTitle>
            <DialogDescription>
              {selectedEntry && format(new Date(selectedEntry.createdAt), "PPpp")}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">User</p>
                    <p className="text-sm">{selectedEntry.userEmail}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                    <RoleBadge role={selectedEntry.userRole} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Action</p>
                    <ActionBadge action={selectedEntry.action} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Resource</p>
                    <p className="text-sm">{selectedEntry.resourceName || selectedEntry.resourceId}</p>
                  </div>
                  {selectedEntry.customerName && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Account</p>
                      <p className="text-sm">{selectedEntry.customerName}</p>
                    </div>
                  )}
                  {selectedEntry.ipAddress && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">IP Address</p>
                      <p className="text-sm font-mono">{selectedEntry.ipAddress}</p>
                    </div>
                  )}
                </div>

                {selectedEntry.changedFields && selectedEntry.changedFields.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Changed Fields</p>
                    <div className="space-y-3">
                      {selectedEntry.changedFields.map((change, i) => (
                        <Card key={i} className="bg-muted/30">
                          <CardContent className="p-3">
                            <p className="text-sm font-medium mb-2">{change.field}</p>
                            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Before</p>
                                <pre className="text-xs bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-200 dark:border-red-900 whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                                  {formatValue(change.oldValue)}
                                </pre>
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground mt-6" />
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">After</p>
                                <pre className="text-xs bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-200 dark:border-green-900 whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                                  {formatValue(change.newValue)}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
