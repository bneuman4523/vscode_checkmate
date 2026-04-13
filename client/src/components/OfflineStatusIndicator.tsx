import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface OfflineStatusIndicatorProps {
  className?: string;
  showPendingCount?: boolean;
}

export function OfflineStatusIndicator({ 
  className = '', 
  showPendingCount = true 
}: OfflineStatusIndicatorProps) {
  const { isOnline, pendingSyncs, lastSyncTime } = useOnlineStatus();

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (isOnline && pendingSyncs === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800 ${className}`}
          >
            <Wifi className="h-3 w-3 mr-1" />
            Online
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Connected and synced</p>
          <p className="text-xs text-muted-foreground">Last sync: {formatLastSync(lastSyncTime)}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isOnline && pendingSyncs > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800 ${className}`}
          >
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Syncing {showPendingCount && `(${pendingSyncs})`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{pendingSyncs} pending action{pendingSyncs !== 1 ? 's' : ''} to sync</p>
          <p className="text-xs text-muted-foreground">Syncing in background...</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 ${className}`}
        >
          <WifiOff className="h-3 w-3 mr-1" />
          Offline
          {showPendingCount && pendingSyncs > 0 && ` (${pendingSyncs})`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Working offline</p>
        {pendingSyncs > 0 && (
          <p className="text-xs text-muted-foreground">
            {pendingSyncs} action{pendingSyncs !== 1 ? 's' : ''} will sync when online
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
