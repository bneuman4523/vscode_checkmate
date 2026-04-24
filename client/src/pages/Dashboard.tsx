import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ActiveUsersWidget } from "@/components/ActiveUsersWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  Printer,
  ChevronRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

interface CustomerStat {
  customerId: string;
  customerName: string;
  totalEvents: number;
  activeEvents: number;
  upcomingEvents: number;
  totalRegistered: number;
  checkedIn: number;
  badgePrinted: number;
}

interface PlatformStats {
  totals: {
    totalCustomers: number;
    activeCustomers: number;
    totalEvents: number;
    activeEvents: number;
    upcomingEvents: number;
    totalRegistered: number;
    checkedIn: number;
    badgePrinted: number;
  };
  customerStats: CustomerStat[];
}

const CHART_COLORS = {
  checked: "#16a34a",
  remaining: "#f97316",
  printed: "#3b82f6",
  notPrinted: "#d1d5db",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const isMultiAccount = user?.role === "super_admin" || user?.role === "partner";

  const { data: platformStats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform-stats"],
    enabled: user?.role === "super_admin",
  });

  useEffect(() => {
    if (user && !isMultiAccount && user.customerId) {
      setLocation(`/customers/${user.customerId}`);
    }
  }, [user, isMultiAccount, setLocation]);

  if (user && !isMultiAccount && user.customerId) {
    return null;
  }

  const totals = platformStats?.totals;
  const customerStats = platformStats?.customerStats || [];

  const overallCheckinRate = totals && totals.totalRegistered > 0
    ? Math.round((totals.checkedIn / totals.totalRegistered) * 100)
    : 0;

  const checkinChartData = useMemo(() => {
    if (!totals) return [];
    return [
      { name: "Checked In", value: totals.checkedIn, color: CHART_COLORS.checked },
      { name: "Not Checked In", value: totals.totalRegistered - totals.checkedIn, color: CHART_COLORS.remaining },
    ].filter(d => d.value > 0);
  }, [totals]);

  const badgeChartData = useMemo(() => {
    if (!totals) return [];
    return [
      { name: "Printed", value: totals.badgePrinted, color: CHART_COLORS.printed },
      { name: "Not Printed", value: totals.totalRegistered - totals.badgePrinted, color: CHART_COLORS.notPrinted },
    ].filter(d => d.value > 0);
  }, [totals]);

  const customersWithActivity = customerStats.filter(c => c.totalRegistered > 0 || c.activeEvents > 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Dashboard</h1>
        <p className="text-muted-foreground">
          Overview across all accounts and events.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals?.totalCustomers ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals?.activeCustomers ?? 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals?.totalEvents ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals?.activeEvents ?? 0} active, {totals?.upcomingEvents ?? 0} upcoming
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totals?.checkedIn ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overallCheckinRate}% of {totals?.totalRegistered ?? 0} registered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yet to Check In</CardTitle>
            <UserX className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {(totals?.totalRegistered ?? 0) - (totals?.checkedIn ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals && totals.totalRegistered > 0
                ? `${100 - overallCheckinRate}% remaining`
                : "No active registrations"}
            </p>
          </CardContent>
        </Card>
      </div>

      {totals && totals.totalRegistered > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Check-in Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[180px] flex items-center justify-center">
                {checkinChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={checkinChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        strokeWidth={2}
                      >
                        {checkinChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => [value, ""]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "hsl(var(--popover-foreground))"
                        }}
                        itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                        labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
              <div className="flex justify-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.checked }} />
                  <span>Checked In ({totals.checkedIn})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.remaining }} />
                  <span>Remaining ({totals.totalRegistered - totals.checkedIn})</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Badge Printing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[180px] flex items-center justify-center">
                {badgeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={badgeChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        strokeWidth={2}
                      >
                        {badgeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => [value, ""]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "hsl(var(--popover-foreground))"
                        }}
                        itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                        labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
              <div className="flex justify-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.printed }} />
                  <span>Printed ({totals.badgePrinted})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.notPrinted }} />
                  <span>Not Printed ({totals.totalRegistered - totals.badgePrinted})</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Platform Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Registered</span>
                  <span className="text-lg font-semibold">{totals.totalRegistered.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Check-in Rate</span>
                  <span className="text-lg font-semibold text-green-600">{overallCheckinRate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Badge Print Rate</span>
                  <span className="text-lg font-semibold text-blue-600">
                    {totals.totalRegistered > 0
                      ? Math.round((totals.badgePrinted / totals.totalRegistered) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Accounts</span>
                  <span className="text-lg font-semibold">{customersWithActivity.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {customersWithActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Check-in Progress by Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {customersWithActivity
                .sort((a, b) => b.totalRegistered - a.totalRegistered)
                .map((cs) => {
                  const pct = cs.totalRegistered > 0
                    ? Math.round((cs.checkedIn / cs.totalRegistered) * 100)
                    : 0;
                  return (
                    <div
                      key={cs.customerId}
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
                      onClick={() => setLocation(`/customers/${cs.customerId}`)}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium truncate" title={cs.customerName}>{cs.customerName}</p>
                          <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                            {cs.activeEvents} event{cs.activeEvents !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {cs.checkedIn}/{cs.totalRegistered}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{pct}%</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === "super_admin" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Alpha Testing Activity</h2>
          <ActiveUsersWidget />
        </div>
      )}
    </div>
  );
}
