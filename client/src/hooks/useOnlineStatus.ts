import { useState, useEffect, useCallback } from 'react';
import { offlineDB } from '@/lib/offline-db';

export interface OnlineStatus {
  isOnline: boolean;
  pendingSyncs: number;
  lastSyncTime: string | null;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const queue = await offlineDB.getSyncQueue();
      setPendingSyncs(queue.length);
    } catch (err) {
      console.error('[OnlineStatus] Failed to get sync queue:', err);
    }
  }, []);

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 10000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  useEffect(() => {
    if (isOnline && pendingSyncs > 0) {
      syncPendingActions();
    }
  }, [isOnline, pendingSyncs]);

  const syncPendingActions = async () => {
    try {
      const queue = await offlineDB.getSyncQueue();
      
      for (const item of queue) {
        try {
          if (item.action === 'checkin' && item.entity === 'attendee') {
            const response = await fetch(`/api/attendees/${item.entityId}/checkin`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.data),
            });

            if (response.ok || response.status === 400) {
              if (item.id !== undefined) {
                await offlineDB.removeFromSyncQueue(item.id);
              }
            }
          }
        } catch (err) {
          console.error('[OnlineStatus] Failed to sync item:', item, err);
        }
      }

      await updatePendingCount();
      setLastSyncTime(new Date().toISOString());
    } catch (err) {
      console.error('[OnlineStatus] Failed to sync pending actions:', err);
    }
  };

  return {
    isOnline,
    pendingSyncs,
    lastSyncTime,
    updatePendingCount,
    syncPendingActions,
  };
}
