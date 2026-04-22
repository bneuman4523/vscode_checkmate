import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  QrCode,
  Printer,
  Settings,
  Settings2,
  UserCircle,
  Monitor,
  Building2,
  Palette,
  CalendarDays,
  ArrowLeft,
  ChevronRight,
  Link2,
  LogIn,
  LogOut,
  BarChart3,
  MapPin,
  RefreshCw,
  Bug,
  Star,
  ClipboardList,
  MessageSquare,
  Rocket,
  Layers,
  BookOpen,
  Shield,
  Crown,
  Activity,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLocation, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigation } from "@/contexts/NavigationContext";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { selectedCustomer, selectedEvent, clearAllContext, clearEventContext, isInCustomerScope } = useNavigation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const queryClient = useQueryClient();
  const [contextMenuEventId, setContextMenuEventId] = useState<string | null>(null);
  
  const isSuperAdmin = user?.role === "super_admin";

  const isInEventContext = selectedEvent !== null && isInCustomerScope && location.includes("/events/");

  const { data: syncStatesData } = useQuery<Array<{ syncStatus: string }>>({
    queryKey: [`/api/events/${selectedEvent?.id}/sync-states`],
    enabled: isInEventContext && !!selectedEvent?.id,
    refetchInterval: 60000,
  });

  const getSyncDotColor = (): string | null => {
    if (!syncStatesData || syncStatesData.length === 0) return "bg-gray-400";
    const hasErrors = syncStatesData.some(s => s.syncStatus === "error");
    if (hasErrors) return "bg-red-500";
    const allSynced = syncStatesData.every(s => s.syncStatus === "success");
    if (allSynced) return "bg-green-500";
    const hasPending = syncStatesData.some(s => s.syncStatus === "pending" || s.syncStatus === "idle" || s.syncStatus === "syncing");
    if (hasPending) return "bg-amber-500";
    return "bg-gray-400";
  };

  const { data: pinnedEventsData } = useQuery<{ value: Array<{ eventId: string; eventName: string; customerId: string; customerName: string }> | null }>({
    queryKey: ["/api/user/preferences/pinned_events"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/preferences/pinned_events");
      return res.json();
    },
    enabled: isInCustomerScope && !isInEventContext && !!selectedCustomer,
  });

  const pinnedEvents = pinnedEventsData?.value ?? [];

  const unpinMutation = useMutation({
    mutationFn: async (eventIdToRemove: string) => {
      const updated = pinnedEvents.filter((e) => e.eventId !== eventIdToRemove);
      await apiRequest("PUT", "/api/user/preferences/pinned_events", { value: updated });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences/pinned_events"] });
    },
  });

  const getEventMenuItems = () => {
    if (!selectedCustomer || !selectedEvent) return [];
    const basePath = `/customers/${selectedCustomer.id}/events/${selectedEvent.id}`;
    return [
      { title: "Overview", url: basePath, icon: LayoutDashboard },
      { title: "Attendees", url: `${basePath}/attendees`, icon: Users },
      { title: "Sessions", url: `${basePath}/sessions`, icon: Layers },
      { title: "Check-in", url: `${basePath}/scanner`, icon: QrCode },
      { title: "Badges", url: `${basePath}/badges`, icon: Printer },
      { title: "Reports", url: `${basePath}/reports`, icon: BarChart3 },
      { title: "Data Sync", url: `${basePath}/data-sync`, icon: RefreshCw },
      { title: "Kiosk Mode", url: `/kiosk/${selectedCustomer.id}/${selectedEvent.id}`, icon: Monitor },
      { title: "Settings", url: `${basePath}/settings`, icon: Settings },
    ];
  };

  const getCustomerMenuItems = () => {
    if (!selectedCustomer) return [];
    const items = [
      { title: "Dashboard & Events", url: `/customers/${selectedCustomer.id}`, icon: LayoutDashboard },
    ];
    if (user?.role !== "staff") {
      items.push({ title: "Integrations", url: `/customers/${selectedCustomer.id}/integrations`, icon: Link2 });
    }
    items.push(
      { title: "Custom Fonts", url: `/customers/${selectedCustomer.id}/fonts`, icon: Palette },
      { title: "Kiosk Branding", url: `/customers/${selectedCustomer.id}/branding`, icon: Palette },
      { title: "Event Configurations", url: `/customers/${selectedCustomer.id}/configurations`, icon: Settings2 },
    );
    return items;
  };

  const globalMenuItems = isSuperAdmin ? [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
  ] : [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "QR Scanner", url: "/scanner", icon: QrCode },
    { title: "Badge Printing", url: "/badges", icon: Printer },
  ];

  const getAdminItems = () => {
    if (selectedCustomer) {
      const items = [
        { title: "Feedback", url: "/feedback", icon: MessageSquare },
        { title: "License & Features", url: `/customers/${selectedCustomer.id}/license`, icon: Crown },
        { title: "Sync Insights", url: `/customers/${selectedCustomer.id}/sync-insights`, icon: Activity },
        { title: "Badge Templates", url: `/customers/${selectedCustomer.id}/badge-templates`, icon: Palette },
        { title: "Locations", url: `/customers/${selectedCustomer.id}/locations`, icon: MapPin },
        { title: "Printer Settings", url: `/customers/${selectedCustomer.id}/printer-settings`, icon: Settings },
        { title: "User Management", url: `/customers/${selectedCustomer.id}/users`, icon: UserCircle },
        { title: "Data Retention", url: `/customers/${selectedCustomer.id}/data-retention`, icon: Shield },
      ];
      return items;
    }
    if (user?.role === "admin") {
      return [
        { title: "Feedback", url: "/feedback", icon: MessageSquare },
      ];
    }
    return [];
  };

  const superAdminItems = [
    { title: "Accounts", url: "/customers", icon: Building2 },
    { title: "User Management", url: "/users", icon: UserCircle },
    { title: "Mission Control", url: "/mission-control", icon: Rocket },
    { title: "System Settings", url: "/settings", icon: Settings },
    { title: "Error Report", url: "/errors", icon: Bug },
    { title: "Settings Audit Log", url: "/audit-log", icon: ClipboardList },
    { title: "Feedback", url: "/feedback", icon: MessageSquare },
  ];

  const handleBackToCustomers = () => {
    clearAllContext();
    setLocation("/customers");
  };

  const handleBackToCustomer = () => {
    clearEventContext();
    if (selectedCustomer) {
      setLocation(`/customers/${selectedCustomer.id}`);
    }
  };

  return (
    <Sidebar collapsible="icon" data-testid="sidebar-main">
      <SidebarHeader className="p-4">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
          <img src="/certain-icon.svg" alt="Certain" className="h-9 w-9 flex-shrink-0" />
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-semibold text-[#0B2958] dark:text-white">Greet</h2>
              <p className="text-xs text-muted-foreground">
                {user?.role === "super_admin" ? "Super Admin" 
                  : user?.role === "admin" ? "Admin Mode"
                  : user?.role === "manager" ? "Manager Mode"
                  : "Staff Mode"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isInEventContext && isInCustomerScope && selectedCustomer && selectedEvent ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {isSuperAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => { localStorage.removeItem("checkmate_last_path"); clearAllContext(); setLocation('/'); }} 
                        tooltip="Back to Dashboard" 
                        data-testid="button-back-to-dashboard-from-event"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Back to Dashboard</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleBackToCustomer} tooltip={`Back to ${selectedCustomer.name}`} data-testid="button-back-to-customer">
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back to {selectedCustomer.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-2">
                <CalendarDays className="h-3 w-3" />
                {selectedEvent.name}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {getEventMenuItems().map((item) => {
                    const isOverview = item.title === "Overview";
                    const active = isOverview
                      ? location === item.url
                      : location === item.url || location.startsWith(item.url + "/");
                    return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        data-testid={`link-event-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.title === "Data Sync" && (
                            <span className={`ml-auto h-2 w-2 rounded-full ${getSyncDotColor()}`} />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : isInCustomerScope && selectedCustomer ? (
          <>
            {/* Only show Back to Accounts for super admins */}
            {isSuperAdmin && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={handleBackToCustomers} tooltip="Back to Accounts" data-testid="button-back-to-customers">
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back to Accounts</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-2">
                <Building2 className="h-3 w-3" />
                {selectedCustomer.name}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {getCustomerMenuItems().map((item, index) => {
                    const isDashboard = item.title === "Dashboard & Events";
                    const active = isDashboard
                      ? location === item.url
                      : location === item.url || location.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={index}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          data-testid={`link-customer-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => { 
                        localStorage.removeItem("checkmate_last_path");
                        clearAllContext(); 
                        setLocation('/'); 
                      }} 
                      tooltip="Dashboard" 
                      data-testid="link-back-to-dashboard"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Back to Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {pinnedEvents.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="flex items-center gap-2">
                  <Star className="h-3 w-3" />
                  Favorites
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pinnedEvents.map((pin) => (
                      <SidebarMenuItem key={pin.eventId}>
                        <DropdownMenu
                          open={contextMenuEventId === pin.eventId}
                          onOpenChange={(open) => {
                            if (!open) setContextMenuEventId(null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <div
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenuEventId(pin.eventId);
                              }}
                            >
                              <SidebarMenuButton
                                asChild
                                tooltip={pin.eventName}
                                data-testid={`link-favorite-${pin.eventId}`}
                              >
                                <Link href={`/customers/${pin.customerId}/events/${pin.eventId}`}>
                                  <CalendarDays className="h-4 w-4" />
                                  <span>{pin.eventName}</span>
                                </Link>
                              </SidebarMenuButton>
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setContextMenuEventId(null);
                                unpinMutation.mutate(pin.eventId);
                              }}
                            >
                              <Star className="h-4 w-4 mr-2" />
                              Remove from Favorites
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            {(isSuperAdmin || user?.role === "admin") && (
              <SidebarGroup>
                <SidebarGroupLabel>Administration</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {getAdminItems().map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url}
                          tooltip={item.title}
                          data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        ) : (
          <>
            {isSuperAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {superAdminItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url || location.startsWith(item.url + "/")}
                          tooltip={item.title}
                          data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            <SidebarGroup>
              <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {globalMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild={item.url !== "/"}
                        isActive={location === item.url}
                        tooltip={item.title}
                        data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        {...(item.url === "/" ? {
                          onClick: () => { localStorage.removeItem("checkmate_last_path"); clearAllContext(); setLocation('/'); }
                        } : {})}
                      >
                        {item.url === "/" ? (
                          <>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </>
                        ) : (
                          <Link href={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {getAdminItems().map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        tooltip={item.title}
                        data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className={`p-4 ${isCollapsed ? 'space-y-2' : 'space-y-3'}`}>
        {/* Setup guide links hidden for production — uncomment to re-enable
        {isAuthenticated && user && (
          <div className={`flex flex-col ${isCollapsed ? 'items-center' : ''} gap-0.5`}>
            <Link
              href="/docs/event-setup"
              className={`flex items-center ${isCollapsed ? 'justify-center w-8 h-8' : 'gap-2 w-full px-2 py-1.5'} rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline`}
              title="Event Setup Guide"
            >
              <BookOpen className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span>Event Setup Guide</span>}
            </Link>
            {isSuperAdmin && (
              <Link
                href="/docs/account-setup"
                className={`flex items-center ${isCollapsed ? 'justify-center w-8 h-8' : 'gap-2 w-full px-2 py-1.5'} rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline`}
                title="Account & Integration Setup"
              >
                <BookOpen className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>Account Setup Guide</span>}
              </Link>
            )}
          </div>
        )}
        */}
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full rounded-md p-2 hover:bg-accent transition-colors text-left`}
                data-testid="button-user-menu"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium flex-shrink-0" title={user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || "User"}>
                  {user.firstName && user.lastName 
                    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                    : user.email?.[0]?.toUpperCase() || "U"}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}` 
                        : user.email || "User"}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {user.role === "super_admin" ? "Super Admin" 
                        : user.role === "admin" ? "Admin" 
                        : user.role === "manager" ? "Manager" 
                        : "Staff"}
                    </Badge>
                  </div>
                )}
                {!isCollapsed && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <div className="px-3 py-2 border-b">
                <p className="text-sm font-medium">
                  {user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.email || "User"}
                </p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                  window.location.replace("/login");
                }}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            size={isCollapsed ? "icon" : "sm"}
            className={isCollapsed ? "w-8 h-8" : "w-full justify-start"}
            onClick={() => window.location.href = "/login"}
            title="Sign In"
            data-testid="button-login"
          >
            <LogIn className={isCollapsed ? "h-4 w-4" : "h-4 w-4 mr-2"} />
            {!isCollapsed && "Sign In"}
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
