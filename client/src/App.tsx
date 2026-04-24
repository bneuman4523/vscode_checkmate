import * as React from "react";
import { Suspense, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useIsTablet } from "@/hooks/use-tablet";
import ModeToggle from "@/components/ModeToggle";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AssistantDrawerWrapper } from "@/components/AssistantDrawerWrapper";

// Static imports — auth-critical pages that must load immediately
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import SetPassword from "@/pages/SetPassword";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import StaffLogin from "@/pages/StaffLogin";
import Kiosk from "@/pages/Kiosk";

// Lazy-loaded pages — split into separate chunks, loaded on demand
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const Scanner = React.lazy(() => import("@/pages/Scanner"));
const Badges = React.lazy(() => import("@/pages/Badges"));
const Users = React.lazy(() => import("@/pages/Users"));
const Customers = React.lazy(() => import("@/pages/Customers"));
const Templates = React.lazy(() => import("@/pages/Templates"));
const PrinterSettings = React.lazy(() => import("@/pages/PrinterSettings"));
const Locations = React.lazy(() => import("@/pages/Locations"));
const CustomerDashboard = React.lazy(() => import("@/pages/CustomerDashboard"));
const CustomerIntegrations = React.lazy(() => import("@/pages/CustomerIntegrations"));
const CustomerFonts = React.lazy(() => import("@/pages/CustomerFonts"));
const EventDashboard = React.lazy(() => import("@/pages/EventDashboard"));
const EventReports = React.lazy(() => import("@/pages/EventReports"));
const StaffDashboard = React.lazy(() => import("@/pages/StaffDashboard"));
const SystemSettings = React.lazy(() => import("@/pages/SystemSettings"));
const ConfigurationTemplates = React.lazy(() => import("@/pages/ConfigurationTemplates"));
const ErrorReport = React.lazy(() => import("@/pages/ErrorReport"));
const AuditLog = React.lazy(() => import("@/pages/AuditLog"));
const FeedbackDashboard = React.lazy(() => import("@/pages/FeedbackDashboard"));
const MissionControl = React.lazy(() => import("@/pages/MissionControl"));
const MyFeedback = React.lazy(() => import("@/pages/MyFeedback"));
const EventSetupGuide = React.lazy(() => import("@/pages/EventSetupGuide"));
const AccountSetupGuide = React.lazy(() => import("@/pages/AccountSetupGuide"));
const LicenseManagement = React.lazy(() => import("@/pages/LicenseManagement"));
const DataRetention = React.lazy(() => import("@/pages/DataRetention"));
const AccountBranding = React.lazy(() => import("@/pages/AccountBranding"));
const SyncInsights = React.lazy(() => import("@/pages/SyncInsights"));
const PrinterDiagnostics = React.lazy(() => import("@/pages/PrinterDiagnostics"));

function LoadingFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { Building2, LogIn, LogOut, User, Menu, MoreVertical } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import OfflineStatus from "@/components/OfflineStatus";
import { NavigationProvider, useNavigation } from "@/contexts/NavigationContext";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scanner" component={Scanner} />
      <Route path="/badges" component={Badges} />
      <Route path="/users" component={Users} />
      <Route path="/settings" component={SystemSettings} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/:customerId" component={CustomerDashboard} />
      <Route path="/customers/:customerId/integrations" component={CustomerIntegrations} />
      <Route path="/customers/:customerId/fonts" component={CustomerFonts} />
      <Route path="/customers/:customerId/badge-templates" component={Templates} />
      <Route path="/customers/:customerId/printer-settings" component={PrinterSettings} />
      <Route path="/customers/:customerId/locations" component={Locations} />
      <Route path="/customers/:customerId/users" component={Users} />
      <Route path="/customers/:customerId/configurations" component={ConfigurationTemplates} />
      <Route path="/customers/:customerId/license" component={LicenseManagement} />
      <Route path="/customers/:customerId/data-retention" component={DataRetention} />
      <Route path="/customers/:customerId/branding" component={AccountBranding} />
      <Route path="/customers/:customerId/sync-insights" component={SyncInsights} />
      <Route path="/customers/:customerId/events/:eventId/reports" component={EventReports} />
      <Route path="/customers/:customerId/events/:eventId/:tab?" component={EventDashboard} />
      <Route path="/templates" component={Templates} />
      <Route path="/printer-settings" component={PrinterSettings} />
      <Route path="/kiosk" component={Kiosk} />
      <Route path="/kiosk/:customerId" component={Kiosk} />
      <Route path="/kiosk/:customerId/:eventId" component={Kiosk} />
      <Route path="/staff/:eventId" component={StaffLogin} />
      <Route path="/staff/:eventId/dashboard" component={StaffDashboard} />
      <Route path="/login" component={Login} />
      <Route path="/set-password" component={SetPassword} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/errors" component={ErrorReport} />
      <Route path="/audit-log" component={AuditLog} />
      <Route path="/mission-control" component={MissionControl} />
      <Route path="/printer-diagnostics" component={PrinterDiagnostics} />
      <Route path="/feedback" component={FeedbackDashboard} />
      <Route path="/my-feedback" component={MyFeedback} />
      <Route path="/docs/event-setup" component={EventSetupGuide} />
      <Route path="/docs/account-setup" component={AccountSetupGuide} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function HeaderWithCustomerContext() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { selectedCustomer, selectedEvent } = useNavigation();
  const { user, isLoading, isAuthenticated } = useAuth();

  const handleLogin = () => {
    setLocation("/login");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      qc.clear();
      localStorage.removeItem("checkmate_last_path");
      window.location.replace("/login");
    } catch (error) {
      localStorage.removeItem("checkmate_last_path");
      window.location.replace("/login");
    }
  };

  return (
    <header className="flex items-center justify-between p-2 sm:p-3 md:p-4 border-b gap-2 sm:gap-4">
      <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="flex-shrink-0" />
        <Breadcrumbs />
        {selectedCustomer && (
          <Badge 
            variant="secondary" 
            className="hidden lg:flex ml-2 max-w-[200px]" 
            data-testid="badge-current-customer"
          >
            <Building2 className="h-3 w-3 mr-1.5 flex-shrink-0" />
            <span className="truncate">{selectedCustomer.name}</span>
          </Badge>
        )}
      </div>
      
      <div className="hidden sm:flex items-center gap-2">
        <OfflineStatus />
        <ModeToggle />
        {isLoading ? (
          <Button variant="ghost" size="sm" disabled data-testid="button-auth-loading" aria-label="Loading authentication">
            <User className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Loading authentication</span>
          </Button>
        ) : isAuthenticated ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            data-testid="button-logout"
            className="hidden md:flex"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {user?.firstName || "Logout"}
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleLogin}
            data-testid="button-login"
          >
            <LogIn className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Login</span>
          </Button>
        )}
        {isAuthenticated && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout-mobile"
            className="flex md:hidden h-8 w-8"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Logout</span>
          </Button>
        )}
      </div>

      <div className="flex sm:hidden items-center gap-1">
        <OfflineStatus />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-mobile-menu" aria-label="Open menu">
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {selectedCustomer && (
              <>
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 mr-2" />
                  {selectedCustomer.name}
                </DropdownMenuItem>
                {selectedEvent && (
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground pl-6">
                    {selectedEvent.name}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {isAuthenticated ? (
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                <LogOut className="h-4 w-4 mr-2" />
                Logout ({user?.firstName})
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleLogin} data-testid="menu-login">
                <LogIn className="h-4 w-4 mr-2" />
                Login
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ModeToggle />
      </div>
    </header>
  );
}

function SidebarAutoCollapse() {
  const isTablet = useIsTablet();
  const { setOpen } = useSidebar();
  const hasInitialized = React.useRef(false);
  
  React.useEffect(() => {
    // Only auto-collapse on first mount if no cookie exists
    // This prevents overriding user's saved preference
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const hasCookie = document.cookie.includes('sidebar_state=');
      if (!hasCookie && isTablet) {
        // First visit on tablet: auto-collapse
        setOpen(false);
      }
    }
  }, [isTablet, setOpen]);
  
  return null;
}

function ActivityTracker() {
  useActivityTracking();
  return null;
}

const ADMIN_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const ADMIN_IDLE_WARNING_MS = 2 * 60 * 1000;

function IdleTimeoutGuard() {
  const qc = useQueryClient();
  const { penTestMode } = useFeatureFlags();

  const handleTimeout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    qc.clear();
    localStorage.removeItem("checkmate_last_path");
    window.location.replace("/login?reason=timeout");
  }, [qc]);

  const { showWarning, remainingSeconds, stayActive } = useIdleTimeout({
    timeoutMs: ADMIN_IDLE_TIMEOUT_MS,
    warningMs: ADMIN_IDLE_WARNING_MS,
    onTimeout: handleTimeout,
    enabled: !penTestMode,
  });

  return (
    <IdleTimeoutDialog
      open={showWarning}
      remainingSeconds={remainingSeconds}
      onStayActive={stayActive}
    />
  );
}

function AppLayout() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const isKioskMode = location === "/kiosk" || location.startsWith("/kiosk/");
  const isStaffMode = location.startsWith("/staff/");
  const isLoginPage = location === "/login";
  const isSetPasswordPage = location.startsWith("/set-password");
  const isForgotPasswordPage = location === "/forgot-password";
  const isResetPasswordPage = location.startsWith("/reset-password");

  const isPublicPage = isKioskMode || isStaffMode || isLoginPage || isSetPasswordPage || isForgotPasswordPage || isResetPasswordPage;

  useEffect(() => {
    if (!isPublicPage && isAuthenticated && location !== "/") {
      localStorage.setItem("checkmate_last_path", location);
    }
  }, [location, isPublicPage, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && location === "/") {
      const savedPath = localStorage.getItem("checkmate_last_path");
      if (savedPath && savedPath !== "/") {
        setLocation(savedPath);
      }
    }
  }, [isAuthenticated, location, setLocation]);

  if (isPublicPage) {
    return <Router />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.replace("/login");
    return null;
  }

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <NavigationProvider>
      <ActivityTracker />
      <IdleTimeoutGuard />
      <SidebarProvider style={style as React.CSSProperties}>
        <SidebarAutoCollapse />
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <HeaderWithCustomerContext />
            <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
      <FeedbackWidget />
      <AssistantDrawerWrapper />
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppLayout />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
