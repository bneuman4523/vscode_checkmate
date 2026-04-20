import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useNavigation } from "@/contexts/NavigationContext";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  MessageSquare,
  Lightbulb,
  Bug,
  MessageCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  BarChart3,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Target,
  Activity,
  Loader2,
  RefreshCw,
  Building2,
} from "lucide-react";

interface FeedbackEntry {
  id: string;
  customerId?: string;
  customerName?: string;
  eventId?: string;
  userId?: string;
  userRole?: string;
  submitterName?: string;
  page?: string;
  pageTitle?: string;
  type: string;
  message: string;
  tags: string[];
  sentiment?: string;
  severity?: string;
  status: string;
  adminNotes?: string;
  adminResponse?: string;
  adminResponseAt?: string;
  ticketNumber?: number;
  screenshotUrl?: string;
  createdAt: string;
}

interface FeedbackStats {
  total: number;
  newCount: number;
  comments: number;
  featureRequests: number;
  issues: number;
}

interface BehaviorAggregate {
  id: string;
  day: string;
  feature: string;
  step?: string;
  starts: number;
  completions: number;
  abandons: number;
  avgDurationMs?: number;
}

interface FeedbackInsights {
  themes: Array<{ theme: string; count: number; description: string }>;
  topRequests: Array<{ title: string; mentions: number; summary: string }>;
  emergingIssues: Array<{ issue: string; severity: string; description: string }>;
  usagePatterns: Array<{ pattern: string; description: string }>;
  recommendations: Array<{ action: string; priority: string; rationale: string }>;
  generatedAt: string;
}

const typeIcons: Record<string, any> = {
  comment: MessageCircle,
  feature_request: Lightbulb,
  issue: Bug,
};

const typeLabels: Record<string, string> = {
  comment: "Comment",
  feature_request: "Feature Request",
  issue: "Issue",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-500",
  reviewed: "bg-yellow-500",
  planned: "bg-purple-500",
  fixed_pending_uat: "bg-orange-500",
  resolved: "bg-green-500",
  dismissed: "bg-gray-500",
};

const statusLabels: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed (see notes)",
  planned: "Planned",
  fixed_pending_uat: "Fixed — Pending UAT",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const severityColors: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const FEATURE_COLORS: Record<string, string> = {
  badge_designer: "#0B2958",
  check_in: "#2FB36D",
  kiosk: "#6366f1",
  workflow_editor: "#f59e0b",
  sync: "#ec4899",
  print: "#14b8a6",
};

const FEATURE_LABELS: Record<string, string> = {
  badge_designer: "Badge Designer",
  check_in: "Check-In",
  kiosk: "Kiosk Mode",
  workflow_editor: "Workflow Editor",
  sync: "Data Sync",
  print: "Print",
};

function UsageAnalyticsTab() {
  const { data: aggregates, isLoading } = useQuery<BehaviorAggregate[]>({
    queryKey: ["/api/admin/behavior-aggregates?limit=500"],
  });

  const { dailyData, featureTotals, completionRates } = useMemo(() => {
    if (!aggregates || aggregates.length === 0) {
      return { dailyData: [], featureTotals: [], completionRates: [] };
    }

    const byDay = new Map<string, Record<string, number>>();
    const totals = new Map<string, { starts: number; completions: number; abandons: number }>();

    aggregates.forEach((a) => {
      if (!byDay.has(a.day)) byDay.set(a.day, {});
      const dayEntry = byDay.get(a.day)!;
      dayEntry[a.feature] = (dayEntry[a.feature] || 0) + a.starts + a.completions;

      if (!totals.has(a.feature)) totals.set(a.feature, { starts: 0, completions: 0, abandons: 0 });
      const t = totals.get(a.feature)!;
      t.starts += a.starts;
      t.completions += a.completions;
      t.abandons += a.abandons;
    });

    const features = Array.from(totals.keys());

    const daily = Array.from(byDay.entries())
      .map(([day, features]) => ({ day: day.substring(5), ...features }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);

    const featureTotalsArr = features
      .map((f) => ({
        feature: FEATURE_LABELS[f] || f,
        key: f,
        total: totals.get(f)!.starts + totals.get(f)!.completions,
        starts: totals.get(f)!.starts,
        completions: totals.get(f)!.completions,
        abandons: totals.get(f)!.abandons,
      }))
      .sort((a, b) => b.total - a.total);

    const rates = features
      .filter((f) => totals.get(f)!.starts > 0)
      .map((f) => {
        const t = totals.get(f)!;
        return {
          feature: FEATURE_LABELS[f] || f,
          key: f,
          rate: Math.round((t.completions / Math.max(t.starts, 1)) * 100),
          abandonRate: Math.round((t.abandons / Math.max(t.starts, 1)) * 100),
        };
      })
      .sort((a, b) => b.rate - a.rate);

    return { dailyData: daily, featureTotals: featureTotalsArr, completionRates: rates };
  }, [aggregates]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!aggregates || aggregates.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No usage data yet</p>
        <p className="text-sm mt-1">Behavior data will appear here as super admins use the platform</p>
      </div>
    );
  }

  const features = Object.keys(FEATURE_COLORS).filter((f) =>
    featureTotals.some((t) => t.key === f)
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Feature Activity (Last 14 Days)
            </CardTitle>
            <CardDescription className="text-xs">Total interactions per feature over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {features.map((f) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      name={FEATURE_LABELS[f] || f}
                      stroke={FEATURE_COLORS[f] || "#888"}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Most Active Features
            </CardTitle>
            <CardDescription className="text-xs">Total interactions by feature</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureTotals} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="feature" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} itemStyle={{ color: 'hsl(var(--popover-foreground))' }} labelStyle={{ color: 'hsl(var(--popover-foreground))' }} />
                  <Bar dataKey="total" name="Interactions" radius={[0, 4, 4, 0]}>
                    {featureTotals.map((entry) => (
                      <Cell key={entry.key} fill={FEATURE_COLORS[entry.key] || "#888"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Completion Rates
          </CardTitle>
          <CardDescription className="text-xs">Percentage of started workflows that complete successfully</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionRates}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="feature" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  formatter={(value: number) => [`${value}%`]}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="rate" name="Completion %" fill="#2FB36D" radius={[4, 4, 0, 0]} />
                <Bar dataKey="abandonRate" name="Abandon %" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AIInsightsTab() {
  const [insights, setInsights] = useState<FeedbackInsights | null>(null);
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/feedback/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate insights");
      }
      return res.json() as Promise<FeedbackInsights>;
    },
    onSuccess: (data) => {
      setInsights(data);
      toast({ title: "Insights Generated", description: "AI analysis complete." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const priorityColors: Record<string, string> = {
    high: "text-red-600 bg-red-50 border-red-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    low: "text-slate-600 bg-slate-50 border-slate-200",
  };

  const severityIcons: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-500",
    medium: "text-amber-500",
    low: "text-slate-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            AI analyzes your recent feedback and usage data to surface trends, top requests, and actionable recommendations.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="bg-[#0B2958] hover:bg-[#0B2958]/90 flex items-center gap-2"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              {insights ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {insights ? "Refresh Analysis" : "Generate Insights"}
            </>
          )}
        </Button>
      </div>

      {!insights && !generateMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No insights generated yet</p>
          <p className="text-sm mt-1">Click "Generate Insights" to run AI analysis on your feedback and usage data</p>
        </div>
      )}

      {generateMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin opacity-50" />
          <p className="font-medium">Analyzing feedback data...</p>
          <p className="text-sm mt-1">This may take a few seconds</p>
        </div>
      )}

      {insights && !generateMutation.isPending && (
        <div className="space-y-6">
          {insights.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {formatDistanceToNow(new Date(insights.generatedAt), { addSuffix: true })}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {insights.themes.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-[#0B2958]" />
                    Common Themes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {insights.themes.map((t, i) => (
                      <div key={i} className="border-l-2 border-[#0B2958] pl-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{t.theme}</span>
                          {t.count > 0 && (
                            <Badge variant="secondary" className="text-xs">{t.count} mentions</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {insights.topRequests.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Top Feature Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {insights.topRequests.map((r, i) => (
                      <div key={i} className="border-l-2 border-amber-400 pl-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.title}</span>
                          {r.mentions > 0 && (
                            <Badge variant="secondary" className="text-xs">{r.mentions}x</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.summary}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {insights.emergingIssues.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Emerging Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {insights.emergingIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${severityIcons[issue.severity] || "text-slate-400"}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{issue.issue}</span>
                          <Badge variant="outline" className="text-xs capitalize">{issue.severity}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {insights.usagePatterns.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#2FB36D]" />
                  Usage Patterns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {insights.usagePatterns.map((p, i) => (
                    <div key={i} className="border-l-2 border-[#2FB36D] pl-3">
                      <span className="font-medium text-sm">{p.pattern}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {insights.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-[#0B2958]" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {insights.recommendations.map((r, i) => (
                    <div key={i} className={`p-3 rounded-lg border ${priorityColors[r.priority] || priorityColors.low}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{r.action}</span>
                        <Badge variant="outline" className="text-xs capitalize">{r.priority} priority</Badge>
                      </div>
                      <p className="text-xs mt-1 opacity-80">{r.rationale}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function FeedbackDashboard() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<FeedbackEntry | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const { selectedCustomer } = useNavigation();
  const isSuperAdmin = authUser?.role === "super_admin";
  const filterCustomerId = isSuperAdmin && selectedCustomer ? selectedCustomer.id : undefined;

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "25");
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (filterCustomerId) queryParams.set("customerId", filterCustomerId);

  const statsParams = new URLSearchParams();
  if (filterCustomerId) statsParams.set("customerId", filterCustomerId);

  const { data: statsData } = useQuery<FeedbackStats>({
    queryKey: [`/api/admin/feedback/stats${statsParams.toString() ? `?${statsParams.toString()}` : ""}`],
  });

  const { data: feedbackData, isLoading } = useQuery<{
    entries: FeedbackEntry[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: [`/api/admin/feedback?${queryParams.toString()}`],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; adminNotes?: string; adminResponse?: string }) => {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/admin/feedback");
      }});
      toast({ title: "Updated", description: "Feedback entry updated." });
      setSelectedEntry(null);
    },
  });

  const entries = feedbackData?.entries || [];
  const total = feedbackData?.total || 0;
  const totalPages = Math.ceil(total / 25);

  const handleOpenDetail = (entry: FeedbackEntry) => {
    setSelectedEntry(entry);
    setAdminNotes(entry.adminNotes || "");
    setAdminResponse(entry.adminResponse || "");
    setNewStatus(entry.status);
  };

  const handleSaveUpdate = () => {
    if (!selectedEntry) return;
    updateMutation.mutate({
      id: selectedEntry.id,
      status: newStatus,
      adminNotes,
      ...(adminResponse !== (selectedEntry.adminResponse || "") ? { adminResponse } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-7 w-7 text-[#0B2958]" />
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Review feedback, usage analytics, and AI-powered insights
          </p>
        </div>
      </div>

      {isSuperAdmin && filterCustomerId && selectedCustomer && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0B2958]/5 border border-[#0B2958]/15 rounded-lg">
          <Building2 className="h-4 w-4 text-[#0B2958]" />
          <span className="text-sm font-medium text-[#0B2958]">
            Viewing feedback for {selectedCustomer.name}
          </span>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{statsData?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Total Submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-500">{statsData?.newCount || 0}</div>
            <p className="text-xs text-muted-foreground">New / Unread</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-slate-500">{statsData?.comments || 0}</div>
            <p className="text-xs text-muted-foreground">Comments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-500">{statsData?.featureRequests || 0}</div>
            <p className="text-xs text-muted-foreground">Feature Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-500">{statsData?.issues || 0}</div>
            <p className="text-xs text-muted-foreground">Issues</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="feedback" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage Analytics
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-4 w-4" />
                  Feedback Entries
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px] h-8">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="comment">Comments</SelectItem>
                      <SelectItem value="feature_request">Feature Requests</SelectItem>
                      <SelectItem value="issue">Issues</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="fixed_pending_uat">Fixed — Pending UAT</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No feedback entries yet</p>
                  <p className="text-sm mt-1">Feedback will appear here once beta testers start submitting</p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Type</TableHead>
                          {isSuperAdmin && <TableHead className="w-[120px]">Account</TableHead>}
                          <TableHead>Message</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead className="w-[90px]">Severity</TableHead>
                          <TableHead className="w-[100px]">Role</TableHead>
                          <TableHead className="w-[120px]">Page</TableHead>
                          <TableHead className="w-[110px]">When</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => {
                          const Icon = typeIcons[entry.type] || MessageCircle;
                          return (
                            <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleOpenDetail(entry)}>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="text-xs">{typeLabels[entry.type] || entry.type}</span>
                                </div>
                              </TableCell>
                              {isSuperAdmin && (
                                <TableCell>
                                  <span className="text-xs text-muted-foreground truncate block max-w-[120px]" title={entry.customerName || ""}>
                                    {entry.customerName || (entry.userRole === "super_admin" ? "Platform" : "-")}
                                  </span>
                                </TableCell>
                              )}
                              <TableCell>
                                <p className="text-sm line-clamp-2">{entry.message}</p>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${statusColors[entry.status] || "bg-gray-400"}`} />
                                  {statusLabels[entry.status] || entry.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {entry.severity && (
                                  <Badge variant="outline" className="text-xs">
                                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${severityColors[entry.severity] || "bg-gray-400"}`} />
                                    {entry.severity}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-xs text-muted-foreground">{entry.userRole || "-"}</span>
                                  {entry.submitterName && (
                                    <span className="text-xs font-medium text-foreground">{entry.submitterName}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground truncate block max-w-[120px]" title={entry.page || ""}>
                                  {entry.page || "-"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      {total} total entries
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {page} of {totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <UsageAnalyticsTab />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <AIInsightsTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEntry && (() => {
                const Icon = typeIcons[selectedEntry.type] || MessageCircle;
                return <Icon className="h-5 w-5" />;
              })()}
              {typeLabels[selectedEntry?.type || ""] || "Feedback"} Detail
              {selectedEntry?.ticketNumber && (
                <Badge variant="outline" className="ml-2 font-mono text-xs">
                  FB-{selectedEntry.ticketNumber}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Submitted {selectedEntry && formatDistanceToNow(new Date(selectedEntry.createdAt), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Message</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selectedEntry.message}</p>
                </div>

                {selectedEntry.screenshotUrl && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Screenshot</Label>
                    <a href={selectedEntry.screenshotUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selectedEntry.screenshotUrl}
                        alt="Feedback screenshot"
                        className="mt-1 w-full max-h-48 object-contain rounded-lg border border-border bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {isSuperAdmin && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Account</Label>
                      <p className="mt-0.5">{selectedEntry.customerName || (selectedEntry.userRole === "super_admin" ? "Platform" : "Unknown")}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Submitted By</Label>
                    <p className="mt-0.5">
                      {selectedEntry.submitterName
                        ? `${selectedEntry.submitterName} (${selectedEntry.userRole || "Unknown"})`
                        : selectedEntry.userRole || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Page</Label>
                    <p className="mt-0.5 text-xs truncate" title={selectedEntry.page || ""}>{selectedEntry.page || "N/A"}</p>
                  </div>
                  {selectedEntry.severity && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Severity</Label>
                      <p className="mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${severityColors[selectedEntry.severity]}`} />
                          {selectedEntry.severity}
                        </Badge>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-4">
                  <Label>Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="fixed_pending_uat">Fixed — Pending UAT</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Response to User
                    <Badge variant="outline" className="text-xs font-normal">Visible to submitter</Badge>
                  </Label>
                  <Textarea
                    value={adminResponse}
                    onChange={(e) => setAdminResponse(e.target.value)}
                    placeholder="Write a response that the user will see..."
                    rows={3}
                    className="resize-none border-[#2FB36D]/30 focus-visible:ring-[#2FB36D]/30"
                  />
                  {selectedEntry.adminResponseAt && (
                    <p className="text-xs text-muted-foreground">
                      Last responded {formatDistanceToNow(new Date(selectedEntry.adminResponseAt), { addSuffix: true })}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Internal Notes
                    <Badge variant="secondary" className="text-xs font-normal">Not visible to user</Badge>
                  </Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add internal notes about this feedback..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <Button
                  onClick={handleSaveUpdate}
                  disabled={updateMutation.isPending}
                  className="w-full bg-[#0B2958] hover:bg-[#0B2958]/90"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
