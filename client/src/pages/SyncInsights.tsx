import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@/contexts/NavigationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  CalendarDays,
  Layers,
  TrendingUp,
  AlertTriangle,
  Timer,
  RefreshCw,
  Zap,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Types
interface SyncMetrics {
  timeRange: { start: string; end: string };
  syncsCompleted: number;
  syncsFailed: number;
  attendeesSynced: number;
  eventsSynced: number;
  sessionsSynced: number;
  activeIntegrations: number;
  successRate: number;
  avgDurationMs: number;
  byDataType: Record<string, { completed: number; failed: number; records: number }>;
}

interface SyncJob {
  id: string;
  jobType: string;
  eventId: string | null;
  eventName: string | null;
  status: string;
  triggerType: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  processedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  errorMessage: string | null;
  createdAt: string;
}

interface SyncJobsResponse {
  jobs: SyncJob[];
  total: number;
  page: number;
  limit: number;
}

interface SyncJobDetail {
  job: SyncJob & {
    payload: any;
    result: any;
    errorStack: string | null;
    attempts: number;
    maxAttempts: number;
    syncTier: string | null;
    priority: number;
  };
  event: { id: string; name: string; eventDate: string } | null;
  integration: { id: string; name: string; providerId: string; baseUrl: string } | null;
  syncState: any | null;
  result: any | null;
}

interface ScheduleEntry {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  dataType: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  syncStatus: string;
  syncIntervalMinutes: number | null;
  phase: string;
  phaseLabel: string;
  isOverdue: boolean;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
  lastSyncDurationMs: number | null;
  adaptiveScheduleEnabled: boolean;
  syncTier: string;
}

interface SyncHealth {
  status: 'healthy' | 'warning' | 'critical';
  integrationCount: number;
  stuckJobCount: number;
  failingStateCount: number;
  recentFailureCount: number;
  issues: string[];
  integrations: Array<{ id: string; name: string; providerId: string }>;
}

// Time range options
const TIME_RANGES = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '60d', label: '60d' },
  { value: '90d', label: '90d' },
];

const DATA_TYPE_FILTERS = [
  { value: 'all', label: 'All Types' },
  { value: 'attendees', label: 'Attendees' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'session_registrations', label: 'Session Regs' },
  { value: 'events', label: 'Events' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'dead_letter', label: 'Dead Letter' },
];

const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

// Helpers
function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatJobType(jobType: string): string {
  switch (jobType) {
    case 'event_attendee_sync': return 'Attendees';
    case 'event_session_sync': return 'Sessions';
    case 'event_session_registration_sync': return 'Session Regs';
    case 'event_discovery': return 'Event Discovery';
    case 'attendee_sync': return 'Attendees (Legacy)';
    default: return jobType;
  }
}

function formatDataType(dt: string): string {
  switch (dt) {
    case 'attendees': return 'Attendees';
    case 'sessions': return 'Sessions';
    case 'session_registrations': return 'Session Regs';
    case 'events': return 'Events';
    default: return dt;
  }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    // Future
    const futureMins = Math.abs(diffMins);
    if (futureMins < 60) return `in ${futureMins}m`;
    const futureHours = Math.abs(diffHours);
    if (futureHours < 24) return `in ${futureHours}h`;
    return `in ${Math.abs(diffDays)}d`;
  }

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'success':
      return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20 hover:bg-green-500/15">Success</Badge>;
    case 'failed':
    case 'dead_letter':
      return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/15">Failed</Badge>;
    case 'pending':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15">Pending</Badge>;
    case 'running':
    case 'syncing':
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/15">Running</Badge>;
    case 'error':
      return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/15">Error</Badge>;
    case 'disabled':
      return <Badge variant="secondary">Disabled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function HealthBadge({ status }: { status: string }) {
  switch (status) {
    case 'healthy':
      return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20 hover:bg-green-500/15">Healthy</Badge>;
    case 'warning':
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15">Warning</Badge>;
    case 'critical':
      return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/15">Critical</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Metric card component
function MetricCard({ title, value, icon: Icon, description, variant }: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const variantClasses = {
    default: '',
    success: 'border-green-500/20',
    danger: 'border-red-500/20 bg-red-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
  };

  return (
    <Card className={variantClasses[variant || 'default']}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function SyncInsights() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const { user } = useAuth();
  const { selectedCustomer, setSelectedCustomer } = useNavigation();

  // Restore customer context on hard refresh
  const { data: apiCustomer } = useQuery<{ id: string; name: string }>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId && !selectedCustomer,
  });

  useEffect(() => {
    if (apiCustomer && !selectedCustomer) {
      setSelectedCustomer(apiCustomer as any);
    }
  }, [apiCustomer, selectedCustomer, setSelectedCustomer]);

  const [timeRange, setTimeRange] = useState('7d');
  const [dataTypeFilter, setDataTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobPage, setJobPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Queries
  const { data: metrics, isLoading: metricsLoading } = useQuery<SyncMetrics>({
    queryKey: [`/api/sync/metrics/${customerId}?range=${timeRange}`],
    enabled: !!customerId,
    refetchInterval: 30000,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<SyncJobsResponse>({
    queryKey: [`/api/sync/jobs/${customerId}?range=${timeRange}&status=${statusFilter}&dataType=${dataTypeFilter}&page=${jobPage}&limit=20`],
    enabled: !!customerId,
    refetchInterval: 30000,
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<{ schedules: ScheduleEntry[] }>({
    queryKey: [`/api/sync/schedule/${customerId}`],
    enabled: !!customerId,
    refetchInterval: 60000,
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<SyncHealth>({
    queryKey: [`/api/sync/health/${customerId}`],
    enabled: !!customerId,
    refetchInterval: 30000,
  });

  const { data: jobDetail, isLoading: jobDetailLoading } = useQuery<SyncJobDetail>({
    queryKey: [`/api/sync/job-detail/${selectedJobId}`],
    enabled: !!selectedJobId,
  });

  // Build chart data from metrics
  const buildPieData = () => {
    if (!metrics) return [];
    const data = [];
    if (metrics.syncsCompleted > 0) data.push({ name: 'Completed', value: metrics.syncsCompleted });
    if (metrics.syncsFailed > 0) data.push({ name: 'Failed', value: metrics.syncsFailed });
    // Also count pending/running from byDataType if available
    return data;
  };

  const buildByTypeData = () => {
    if (!metrics?.byDataType) return [];
    return Object.entries(metrics.byDataType).map(([type, data]) => ({
      name: formatDataType(type),
      completed: data.completed,
      failed: data.failed,
      records: data.records,
    }));
  };

  const totalPages = jobsData ? Math.ceil(jobsData.total / jobsData.limit) : 1;

  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Sync Insights</h1>
            <p className="text-muted-foreground text-sm">
              Monitor sync activity, diagnose failures, and review schedules
            </p>
          </div>
          {healthData && (
            <HealthBadge status={healthData.status} />
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range pills */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => { setTimeRange(tr.value); setJobPage(1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === tr.value
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>

          <Select value={dataTypeFilter} onValueChange={(v) => { setDataTypeFilter(v); setJobPage(1); }}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_TYPE_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Health issues banner */}
      {healthData && healthData.issues.length > 0 && (
        <Card className={healthData.status === 'critical' ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5'}>
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${healthData.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="space-y-1">
                {healthData.issues.map((issue, i) => (
                  <p key={i} className="text-sm">{issue}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="activity">Activity Feed</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="space-y-6 mt-4">
          {metricsLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : metrics ? (
            <>
              {/* Row 1: Primary metrics */}
              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  title="Syncs Completed"
                  value={metrics.syncsCompleted}
                  icon={CheckCircle}
                  variant="success"
                />
                <MetricCard
                  title="Attendees Synced"
                  value={metrics.attendeesSynced}
                  icon={Users}
                />
                <MetricCard
                  title="Events Discovered"
                  value={metrics.eventsSynced}
                  icon={CalendarDays}
                />
                <MetricCard
                  title="Success Rate"
                  value={`${metrics.successRate}%`}
                  icon={TrendingUp}
                  variant={metrics.successRate < 90 ? 'warning' : metrics.successRate < 75 ? 'danger' : 'default'}
                />
              </div>

              {/* Row 2: Secondary metrics */}
              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  title="Sessions Synced"
                  value={metrics.sessionsSynced}
                  icon={Layers}
                />
                <MetricCard
                  title="Session Registrations"
                  value={metrics.byDataType?.session_registrations?.records || 0}
                  icon={Layers}
                />
                <MetricCard
                  title="Avg Duration"
                  value={formatDuration(metrics.avgDurationMs)}
                  icon={Timer}
                />
                <MetricCard
                  title="Failed Syncs"
                  value={metrics.syncsFailed}
                  icon={XCircle}
                  variant={metrics.syncsFailed > 0 ? 'danger' : 'default'}
                />
              </div>

              {/* Charts row */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* By data type bar chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sync Activity by Type</CardTitle>
                    <CardDescription>Completed vs failed syncs per data type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {buildByTypeData().length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={buildByTypeData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 12 }} />
                          <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                          <RechartsTooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
                          />
                          <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">
                        No sync activity in this time range
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Processing status donut */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Processing Status</CardTitle>
                    <CardDescription>Overall sync outcome distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {buildPieData().length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={buildPieData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {buildPieData().map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">
                        No sync activity in this time range
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* By data type detail table */}
              {Object.keys(metrics.byDataType).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Breakdown by Data Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data Type</TableHead>
                          <TableHead className="text-right">Completed</TableHead>
                          <TableHead className="text-right">Failed</TableHead>
                          <TableHead className="text-right">Records</TableHead>
                          <TableHead className="text-right">Success Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(metrics.byDataType).map(([type, data]) => {
                          const total = data.completed + data.failed;
                          const rate = total > 0 ? Math.round((data.completed / total) * 100) : 100;
                          return (
                            <TableRow key={type}>
                              <TableCell className="font-medium">{formatDataType(type)}</TableCell>
                              <TableCell className="text-right text-green-600">{data.completed}</TableCell>
                              <TableCell className="text-right text-red-600">{data.failed}</TableCell>
                              <TableCell className="text-right">{data.records.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <span className={rate < 90 ? 'text-amber-600' : rate < 75 ? 'text-red-600' : ''}>
                                  {rate}%
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No sync data available for this account
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ACTIVITY FEED TAB */}
        <TabsContent value="activity" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setJobPage(1); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {jobsData && (
              <span className="text-xs text-muted-foreground">
                {jobsData.total} job{jobsData.total !== 1 ? 's' : ''} found
              </span>
            )}
          </div>

          {jobsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : jobsData && jobsData.jobs.length > 0 ? (
            <>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Data Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Records</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobsData.jobs.map((job) => (
                        <TableRow
                          key={job.id}
                          className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                            job.status === 'failed' || job.status === 'dead_letter'
                              ? 'bg-red-500/5 hover:bg-red-500/10'
                              : ''
                          }`}
                          onClick={() => setSelectedJobId(job.id)}
                        >
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatRelativeTime(job.createdAt)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {job.eventName || '--'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatJobType(job.jobType)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={job.status} />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {job.processedRecords > 0 ? job.processedRecords.toLocaleString() : '--'}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatDuration(job.durationMs)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {job.triggerType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Page {jobsData.page} of {totalPages} ({jobsData.total} total)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={jobPage <= 1}
                      onClick={() => setJobPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={jobPage >= totalPages}
                      onClick={() => setJobPage(p => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No sync jobs found for the selected filters
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="space-y-4 mt-4">
          {scheduleLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : scheduleData && scheduleData.schedules.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Data Type</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Next Sync</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Interval</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduleData.schedules.map((entry, idx) => (
                      <TableRow
                        key={`${entry.eventId}-${entry.dataType}-${idx}`}
                        className={
                          entry.isOverdue
                            ? 'bg-amber-500/5'
                            : entry.consecutiveFailures >= 3
                            ? 'bg-red-500/5'
                            : ''
                        }
                      >
                        <TableCell className="max-w-[200px] truncate font-medium text-sm">
                          {entry.eventName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDataType(entry.dataType)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatRelativeTime(entry.lastSyncAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {entry.syncEnabled ? (
                            <span className={entry.isOverdue ? 'text-amber-600 font-medium' : ''}>
                              {entry.isOverdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                              {formatRelativeTime(entry.nextSyncAt)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Disabled</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              entry.phase === 'day-of' || entry.phase === 'imminent'
                                ? 'border-green-500/40 text-green-700 dark:text-green-400'
                                : entry.phase === 'approaching'
                                ? 'border-blue-500/40 text-blue-700 dark:text-blue-400'
                                : entry.phase === 'past'
                                ? 'border-muted text-muted-foreground'
                                : ''
                            }`}
                          >
                            {entry.phaseLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {entry.syncIntervalMinutes ? `${entry.syncIntervalMinutes}m` : 'Adaptive'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={entry.syncStatus} />
                            {entry.consecutiveFailures >= 3 && (
                              <span className="text-xs text-red-600">{entry.consecutiveFailures}x</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No sync schedules configured for this account
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Job Detail Sheet */}
      <Sheet open={!!selectedJobId} onOpenChange={(open) => !open && setSelectedJobId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Sync Job Detail</SheetTitle>
            <SheetDescription>
              Full execution detail for debugging
            </SheetDescription>
          </SheetHeader>

          {jobDetailLoading ? (
            <div className="space-y-4 mt-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : jobDetail ? (
            <div className="space-y-4 mt-4">
              {/* Status header */}
              <div className="flex items-center gap-2">
                <StatusBadge status={jobDetail.job.status} />
                <span className="text-sm font-medium">{formatJobType(jobDetail.job.jobType)}</span>
                <Badge variant="outline" className="text-xs capitalize ml-auto">
                  {jobDetail.job.triggerType}
                </Badge>
              </div>

              {/* Timing */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Timing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{jobDetail.job.createdAt ? new Date(jobDetail.job.createdAt).toLocaleString() : '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span>{jobDetail.job.startedAt ? new Date(jobDetail.job.startedAt).toLocaleString() : '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{jobDetail.job.completedAt ? new Date(jobDetail.job.completedAt).toLocaleString() : '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{formatDuration(jobDetail.job.durationMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Attempts</span>
                    <span>{jobDetail.job.attempts} / {jobDetail.job.maxAttempts}</span>
                  </div>
                  {jobDetail.job.priority && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Priority</span>
                      <span>{jobDetail.job.priority}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Event / Integration */}
              {(jobDetail.event || jobDetail.integration) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Context</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {jobDetail.event && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Event</span>
                          <span className="font-medium">{jobDetail.event.name}</span>
                        </div>
                        {jobDetail.event.eventDate && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Event Date</span>
                            <span>{new Date(jobDetail.event.eventDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </>
                    )}
                    {jobDetail.integration && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Integration</span>
                          <span>{jobDetail.integration.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Provider</span>
                          <span>{jobDetail.integration.providerId}</span>
                        </div>
                      </>
                    )}
                    {jobDetail.job.syncTier && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sync Tier</span>
                        <span className="capitalize">{jobDetail.job.syncTier.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Records */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Processed</span>
                      <span className="font-medium">{jobDetail.job.processedRecords?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span className="text-green-600">{jobDetail.job.createdRecords?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated</span>
                      <span className="text-blue-600">{jobDetail.job.updatedRecords?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Skipped</span>
                      <span>{jobDetail.job.skippedRecords?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-muted-foreground">Failed</span>
                      <span className={jobDetail.job.failedRecords > 0 ? 'text-red-600 font-medium' : ''}>
                        {jobDetail.job.failedRecords?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Error */}
              {jobDetail.job.errorMessage && (
                <Card className="border-red-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-red-600">Error</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-red-500/5 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words border border-red-500/10">
                      {jobDetail.job.errorMessage}
                    </pre>
                    {jobDetail.job.errorStack && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Stack trace
                        </summary>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words mt-1">
                          {jobDetail.job.errorStack}
                        </pre>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Request details */}
              {jobDetail.job.payload && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Request Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(jobDetail.job.payload as any).requestUrl && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Request URL</p>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words">
                          {(jobDetail.job.payload as any).requestUrl}
                        </pre>
                      </div>
                    )}
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words max-h-32">
                      {JSON.stringify(jobDetail.job.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Result payload */}
              {(jobDetail.result || jobDetail.job.result) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Result Payload</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                      {JSON.stringify(jobDetail.result || jobDetail.job.result, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Sync state */}
              {jobDetail.syncState && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Sync State</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data Type</span>
                      <span>{formatDataType(jobDetail.syncState.dataType)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <StatusBadge status={jobDetail.syncState.syncStatus} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Consecutive Failures</span>
                      <span className={jobDetail.syncState.consecutiveFailures > 0 ? 'text-red-600' : ''}>
                        {jobDetail.syncState.consecutiveFailures}
                      </span>
                    </div>
                    {jobDetail.syncState.lastSyncResult && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Last sync result
                        </summary>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words mt-1 max-h-48">
                          {JSON.stringify(jobDetail.syncState.lastSyncResult, null, 2)}
                        </pre>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Job ID for reference */}
              <div className="text-xs text-muted-foreground border-t pt-3">
                Job ID: <code className="bg-muted px-1 py-0.5 rounded">{jobDetail.job.id}</code>
              </div>
            </div>
          ) : selectedJobId ? (
            <div className="text-center text-muted-foreground mt-8">
              Job not found
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
