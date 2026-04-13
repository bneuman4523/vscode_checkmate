import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { apiFramework } from "@/lib/api-framework";
import { offlineDB } from "@/lib/offline-db";

export default function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkSyncQueue = useCallback(async () => {
    const queue = await offlineDB.getSyncQueue();
    setSyncQueueCount(queue.length);
  }, []);

  const syncPendingCheckIns = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    
    try {
      const queue = await offlineDB.getSyncQueue();
      
      for (const item of queue) {
        try {
          if (item.action === 'checkin' && item.entity === 'attendee') {
            const isStaffCheckin = item.data?.source === 'staff-offline';
            
            let response: Response;
            if (isStaffCheckin) {
              const staffSession = localStorage.getItem('staffSession');
              const session = staffSession ? JSON.parse(staffSession) : null;
              if (!session?.token) {
                continue;
              }
              
              response = await fetch('/api/staff/checkin', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.token}`,
                },
                body: JSON.stringify({ attendeeId: item.entityId }),
              });
            } else {
              response = await fetch(`/api/attendees/${item.entityId}/checkin`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
              });
            }

            if (response.ok || response.status === 400 || response.status === 409) {
              if (item.id !== undefined) {
                await offlineDB.removeFromSyncQueue(item.id);
              }
            } else if (response.status === 401) {
            } else if (response.status >= 500) {
            }
          }
        } catch (err) {
          console.error('[OfflineStatus] Failed to sync item:', item.id, err);
        }
      }

      await checkSyncQueue();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, checkSyncQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingCheckIns();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkSyncQueue();
    const interval = setInterval(checkSyncQueue, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkSyncQueue, syncPendingCheckIns]);

  const handleSync = async () => {
    await syncPendingCheckIns();
    await apiFramework.processSyncQueue();
    await checkSyncQueue();
  };

  return (
    <div className="flex items-center gap-2">
      {isOnline ? (
        isSyncing ? (
          <Badge variant="secondary" className="gap-1 cursor-default">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">Syncing</span>
          </Badge>
        ) : (
          <Badge variant="default" className="gap-1 cursor-default bg-green-600 hover:bg-green-600">
            <Wifi className="h-3 w-3" />
            <span className="hidden sm:inline">Online</span>
          </Badge>
        )
      ) : (
        <Badge variant="destructive" className="gap-1 cursor-default bg-orange-500 hover:bg-orange-500">
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">Offline</span>
        </Badge>
      )}
      {syncQueueCount > 0 && (
        <Badge 
          variant="secondary" 
          className="gap-1 cursor-pointer" 
          onClick={isOnline && !isSyncing ? handleSync : undefined}
        >
          {syncQueueCount} pending
          {isOnline && !isSyncing && <RefreshCw className="h-3 w-3 ml-1" />}
        </Badge>
      )}
    </div>
  );
}
