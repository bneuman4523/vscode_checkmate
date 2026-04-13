import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from './useAuth';

const SESSION_ID_KEY = 'activity_session_id';
const HEARTBEAT_INTERVAL = 60000; // 1 minute
const DEBOUNCE_MS = 1000; // Debounce page tracking

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/settings': 'System Settings',
  '/login': 'Login',
};

function getPageTitle(path: string): string {
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  
  // Customer-level routes
  if (path.match(/^\/customers\/[^/]+$/)) return 'Customer Dashboard';
  if (path.match(/^\/customers\/[^/]+\/integrations$/)) return 'Integrations';
  if (path.match(/^\/customers\/[^/]+\/badge-templates$/)) return 'Badge Templates';
  if (path.match(/^\/customers\/[^/]+\/printer-settings$/)) return 'Printer Settings';
  if (path.match(/^\/customers\/[^/]+\/locations$/)) return 'Locations';
  if (path.match(/^\/customers\/[^/]+\/users$/)) return 'User Management';
  if (path.match(/^\/customers\/[^/]+\/configurations$/)) return 'Configuration Templates';
  if (path.match(/^\/customers\/[^/]+\/fonts$/)) return 'Custom Fonts';
  
  // Event-level routes
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/reports$/)) return 'Reports';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/badges$/)) return 'Badge Designer';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/attendees$/)) return 'Attendees';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/settings$/)) return 'Event Settings';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/workflow$/)) return 'Check-in Workflow';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+\/sync$/)) return 'Sync Status';
  if (path.match(/^\/customers\/[^/]+\/events\/[^/]+$/)) return 'Event Dashboard';
  
  // Staff routes
  if (path.match(/^\/staff\/[^/]+\/dashboard$/)) return 'Staff Check-in Dashboard';
  if (path.match(/^\/staff\/[^/]+$/)) return 'Staff Login';
  
  // Kiosk routes
  if (path.match(/^\/kiosk/)) return 'Self-Service Kiosk';
  
  // Fallback to customers list
  if (path === '/customers') return 'Customers List';
  
  return path;
}

export function useActivityTracking() {
  const [location] = useLocation();
  const { user } = useAuth();
  const lastTrackedPath = useRef<string>('');
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const trackDebounce = useRef<NodeJS.Timeout | null>(null);

  const trackPageView = useCallback(async (path: string) => {
    if (!user) return;
    
    const pageTitle = getPageTitle(path);
    const sessionId = getSessionId();
    
    try {
      await fetch('/api/activity/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page: path,
          pageTitle,
          action: 'view',
          sessionId,
        }),
      });
    } catch (error) {
      // Silently fail - activity tracking shouldn't break the app
    }
  }, [user]);

  const sendHeartbeat = useCallback(async () => {
    if (!user) return;
    
    const pageTitle = getPageTitle(location);
    const sessionId = getSessionId();
    
    try {
      await fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page: location,
          pageTitle,
          sessionId,
        }),
      });
    } catch (error) {
    }
  }, [user, location]);

  // Track page changes with debounce
  useEffect(() => {
    if (!user || location === lastTrackedPath.current) return;
    
    // Clear any pending debounce
    if (trackDebounce.current) {
      clearTimeout(trackDebounce.current);
    }
    
    // Debounce to avoid tracking rapid navigation
    trackDebounce.current = setTimeout(() => {
      trackPageView(location);
      lastTrackedPath.current = location;
    }, DEBOUNCE_MS);
    
    return () => {
      if (trackDebounce.current) {
        clearTimeout(trackDebounce.current);
      }
    };
  }, [location, user, trackPageView]);

  // Heartbeat to keep presence alive
  useEffect(() => {
    if (!user) return;
    
    // Clear existing timer
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
    }
    
    // Start heartbeat
    heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    
    // Send initial heartbeat
    sendHeartbeat();
    
    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
    };
  }, [user, sendHeartbeat]);

  // Track visibility changes (tab focus/blur)
  useEffect(() => {
    if (!user) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, sendHeartbeat]);

  return { trackPageView };
}
