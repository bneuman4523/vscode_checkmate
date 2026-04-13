import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  QrCode, 
  Settings, 
  RefreshCw, 
  LogOut,
  Monitor, 
} from "lucide-react";
import StaffHelpPanel from "@/components/StaffHelpPanel";
import ModeToggle from "@/components/ModeToggle";
import OfflineStatus from "@/components/OfflineStatus";
import { useToast } from "@/hooks/use-toast";
import type { StaffSession } from "../types";

interface DashboardHeaderProps {
  session: StaffSession;
  onPreviewBadge: () => void;
  onOpenPrinterSettings: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  allowKiosk?: boolean;
  onLaunchKiosk?: () => void;
}

/**
 * Header component for the staff dashboard.
 * Displays event info, staff name, and action buttons.
 * 
 * Why: The header has distinct responsibilities (branding, navigation, actions)
 * that benefit from isolation for testing and potential reuse.
 */
export function DashboardHeader({
  session,
  onPreviewBadge,
  onOpenPrinterSettings,
  onRefresh,
  onLogout,
  allowKiosk,
  onLaunchKiosk,
}: DashboardHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    onRefresh();
    toast({ title: "Refreshed", description: "Data has been updated" });
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [onRefresh, toast]);

  return (
    <header className="sticky top-0 z-10 bg-background border-b p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="text-event-name">
            <Users className="h-5 w-5" />
            {session.eventName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.customerName} | Staff: {session.staffName}
          </p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <OfflineStatus />
          <Button 
            variant="outline" 
            size="sm"
            onClick={onPreviewBadge}
            data-testid="button-preview-badge"
            className="px-2 sm:px-3"
          >
            <QrCode className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Preview Badge</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={onOpenPrinterSettings}
            data-testid="button-printer-settings"
            className="px-2 sm:px-3"
          >
            <Settings className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Printer</span>
          </Button>
          {allowKiosk && onLaunchKiosk && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onLaunchKiosk}
              data-testid="button-launch-kiosk"
              className="px-2 sm:px-3"
            >
              <Monitor className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Kiosk</span>
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh"
            className="px-2 sm:px-3"
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>
          <StaffHelpPanel />
          <ModeToggle />
          <Button 
            variant="outline" 
            size="sm"
            onClick={onLogout}
            data-testid="button-logout"
            className="px-2 sm:px-3"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
