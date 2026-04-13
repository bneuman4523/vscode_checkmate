import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, CheckCircle2, XCircle, Clock, Loader2, RefreshCw } from "lucide-react";

interface SyncLog {
  id: string;
  integrationId: string;
  customerId: string;
  syncType: string;
  status: string;
  processedCount?: number | null;
  createdCount?: number | null;
  updatedCount?: number | null;
  skippedCount?: number | null;
  errorCount?: number | null;
  errors?: any[] | null;
  apiResponseSummary?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

interface SyncHistoryProps {
  integrationId: string;
  integrationName: string;
}

export default function SyncHistory({ integrationId, integrationName }: SyncHistoryProps) {
  const { data: syncLogs, isLoading, refetch } = useQuery<SyncLog[]>({
    queryKey: ["/api/integrations", integrationId, "sync-logs"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/integrations/${integrationId}/sync-logs?limit=20`);
      return response.json();
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "started":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="View sync history">
          <History className="h-3 w-3 mr-1" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Sync History</DialogTitle>
              <DialogDescription>{integrationName}</DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !syncLogs || syncLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No sync history yet</p>
              <p className="text-sm">Run a sync to see results here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{formatDate(log.startedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {log.syncType}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">{log.processedCount ?? "-"}</TableCell>
                    <TableCell className="text-right text-green-600">{log.createdCount ?? "-"}</TableCell>
                    <TableCell className="text-right text-blue-600">{log.updatedCount ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {log.errorCount && log.errorCount > 0 ? (
                        <span className="text-red-600">{log.errorCount}</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {syncLogs && syncLogs.length > 0 && syncLogs[0].apiResponseSummary && (
          <div className="mt-4 p-3 bg-muted rounded text-xs">
            <div className="font-medium mb-1">Last API Response</div>
            <div className="text-muted-foreground break-all">{syncLogs[0].apiResponseSummary}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
