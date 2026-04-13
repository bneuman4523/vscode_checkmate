import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Clock, Eye, TrendingUp, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OnlineUser {
  id: string;
  userId: string;
  currentPage: string | null;
  currentPageTitle: string | null;
  lastActivityAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    customerId: string | null;
  };
}

interface ActivityStats {
  totalPageViews: number;
  uniqueUsers: number;
  topPages: { page: string; pageTitle: string | null; count: number }[];
  activeUsersByHour: { hour: number; count: number }[];
}

interface RecentActivity {
  id: string;
  userId: string;
  page: string;
  pageTitle: string | null;
  action: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function getUserDisplayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  return user.email;
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'super_admin': return 'default';
    case 'admin': return 'secondary';
    default: return 'outline';
  }
}

export function ActiveUsersWidget() {
  const { data: onlineUsers = [], refetch: refetchOnline, isLoading: isLoadingOnline } = useQuery<OnlineUser[]>({
    queryKey: ['online-users'],
    queryFn: async () => {
      const res = await fetch('/api/activity/online-users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch online users');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: stats, isLoading: isLoadingStats } = useQuery<ActivityStats>({
    queryKey: ['activity-stats'],
    queryFn: async () => {
      const res = await fetch('/api/activity/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch activity stats');
      return res.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: recentActivity = [], refetch: refetchActivity, isLoading: isLoadingActivity } = useQuery<RecentActivity[]>({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const res = await fetch('/api/activity/recent?limit=10', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch recent activity');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    refetchOnline();
    refetchActivity();
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Now</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onlineUsers.length}</div>
            <p className="text-xs text-muted-foreground">Active in last 5 min</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views (24h)</CardTitle>
            <Eye className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPageViews ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total page views</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users (24h)</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.uniqueUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground">Distinct users</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Page</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {stats?.topPages?.[0]?.pageTitle || stats?.topPages?.[0]?.page || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.topPages?.[0]?.count ?? 0} views
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Online Users and Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Online Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                Active Users
              </CardTitle>
              <CardDescription>Users online right now</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoadingOnline}>
              <RefreshCw className={`h-4 w-4 ${isLoadingOnline ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {onlineUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active users at the moment
              </p>
            ) : (
              <div className="space-y-3">
                {onlineUsers.map((presence) => (
                  <div
                    key={presence.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(presence.user.firstName, presence.user.lastName, presence.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background"></span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {getUserDisplayName(presence.user)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {presence.currentPageTitle || presence.currentPage || 'Unknown page'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(presence.user.role)} className="text-xs">
                        {presence.user.role.replace('_', ' ')}
                      </Badge>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimeAgo(presence.lastActivityAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Last activity: {new Date(presence.lastActivityAt).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest page views across all users</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">
                          {activity.user
                            ? getInitials(activity.user.firstName, activity.user.lastName, activity.user.email)
                            : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">
                            {activity.user ? getUserDisplayName(activity.user) : 'Unknown'}
                          </span>
                          <span className="text-muted-foreground"> viewed </span>
                          <span className="font-medium">
                            {activity.pageTitle || activity.page}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(activity.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Pages */}
      {stats?.topPages && stats.topPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Most Visited Pages (24h)</CardTitle>
            <CardDescription>Pages with the most views</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topPages.slice(0, 5).map((page, index) => (
                <div
                  key={page.page}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <span className="font-medium">
                      {page.pageTitle || page.page}
                    </span>
                  </div>
                  <Badge variant="secondary">{page.count} views</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
