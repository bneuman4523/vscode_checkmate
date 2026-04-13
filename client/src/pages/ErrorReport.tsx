import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
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
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Trash2, Bug, XCircle, Filter } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ApplicationError {
  id: string;
  errorType: string;
  message: string;
  stack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  customerId?: string;
  eventId?: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  createdAt: string;
}

interface ErrorStats {
  total: number;
  unresolved: number;
  byType: { type: string; count: number }[];
  last24h: number;
  last7d: number;
}

function ErrorTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    API_ERROR: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    SYNC_ERROR: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    AUTH_ERROR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    PRINT_ERROR: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    CLIENT_ERROR: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    WEBHOOK_ERROR: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  };
  const colors = colorMap[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  return <Badge className={colors}>{type}</Badge>;
}

export default function ErrorReport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedError, setSelectedError] = useState<ApplicationError | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("unresolved");

  const { data: stats, isLoading: statsLoading } = useQuery<ErrorStats>({
    queryKey: ["/api/errors/stats"],
  });

  const { data: errors, isLoading: errorsLoading, refetch } = useQuery<ApplicationError[]>({
    queryKey: ["/api/errors", filterType, filterResolved],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("errorType", filterType);
      if (filterResolved !== "all") params.set("isResolved", filterResolved === "resolved" ? "true" : "false");
      params.set("limit", "100");
      const response = await fetch(`/api/errors?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch errors");
      return response.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const response = await apiRequest("POST", `/api/errors/${id}/resolve`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/errors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/errors/stats"] });
      setSelectedError(null);
      setResolveNotes("");
      toast({ title: "Error marked as resolved" });
    },
    onError: () => {
      toast({ title: "Failed to resolve error", variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async (days: number) => {
      const response = await apiRequest("DELETE", `/api/errors/cleanup?days=${days}`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/errors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/errors/stats"] });
      toast({ title: `Deleted ${data.deleted} old errors` });
    },
    onError: () => {
      toast({ title: "Failed to clean up errors", variant: "destructive" });
    },
  });

  const errorTypes = stats?.byType?.map(t => t.type) || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bug className="h-8 w-8" />
            Error Report
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and track application errors during alpha testing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            onClick={() => cleanupMutation.mutate(30)}
            disabled={cleanupMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clean up (30+ days)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Unresolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats?.unresolved ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last 24 Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.last24h ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.last7d ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {stats?.byType && stats.byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Errors by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {stats.byType.map(({ type, count }) => (
                <div key={type} className="flex items-center gap-2">
                  <ErrorTypeBadge type={type} />
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Error Log</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Error Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {errorTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterResolved} onValueChange={setFilterResolved}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {errorsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading errors...</div>
          ) : errors?.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
              <p className="text-muted-foreground">No errors found!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors?.map((error) => (
                  <TableRow key={error.id} className={error.isResolved ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm">{format(new Date(error.createdAt), "MMM d, HH:mm")}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ErrorTypeBadge type={error.errorType} />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate font-mono text-sm" title={error.message}>
                        {error.message}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {error.endpoint && (
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {error.method} {error.endpoint}
                        </code>
                      )}
                    </TableCell>
                    <TableCell>
                      {error.isResolved ? (
                        <Badge variant="outline" className="text-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Open
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedError(error)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ErrorTypeBadge type={selectedError?.errorType || ""} />
              Error Details
            </DialogTitle>
            <DialogDescription>
              {selectedError?.createdAt && format(new Date(selectedError.createdAt), "PPpp")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-1">Message</h4>
              <p className="text-sm bg-muted p-2 rounded font-mono">{selectedError?.message}</p>
            </div>

            {selectedError?.endpoint && (
              <div>
                <h4 className="font-semibold mb-1">Endpoint</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  {selectedError.method} {selectedError.endpoint}
                  {selectedError.statusCode && ` → ${selectedError.statusCode}`}
                </code>
              </div>
            )}

            {selectedError?.stack && (
              <div>
                <h4 className="font-semibold mb-1">Stack Trace</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">
                  {selectedError.stack}
                </pre>
              </div>
            )}

            {selectedError?.metadata && Object.keys(selectedError.metadata).length > 0 && (
              <div>
                <h4 className="font-semibold mb-1">Metadata</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                  {JSON.stringify(selectedError.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {selectedError?.userId && (
                <div>
                  <span className="text-muted-foreground">User ID:</span>{" "}
                  <code className="text-xs">{selectedError.userId}</code>
                </div>
              )}
              {selectedError?.customerId && (
                <div>
                  <span className="text-muted-foreground">Customer ID:</span>{" "}
                  <code className="text-xs">{selectedError.customerId}</code>
                </div>
              )}
              {selectedError?.eventId && (
                <div>
                  <span className="text-muted-foreground">Event ID:</span>{" "}
                  <code className="text-xs">{selectedError.eventId}</code>
                </div>
              )}
              {selectedError?.userAgent && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">User Agent:</span>{" "}
                  <span className="text-xs">{selectedError.userAgent}</span>
                </div>
              )}
            </div>

            {selectedError?.isResolved && (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Resolved</span>
                </div>
                {selectedError.notes && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">{selectedError.notes}</p>
                )}
              </div>
            )}

            {!selectedError?.isResolved && (
              <div className="space-y-2">
                <h4 className="font-semibold">Resolve this error</h4>
                <Textarea
                  placeholder="Add notes about how this was resolved (optional)"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedError(null)}>
              Close
            </Button>
            {selectedError && !selectedError.isResolved && (
              <Button
                onClick={() => resolveMutation.mutate({ id: selectedError.id, notes: resolveNotes })}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
