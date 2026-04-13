import type { StaffSession } from "../types";

/**
 * Retrieves the staff session from localStorage.
 * Returns null if session doesn't exist, is expired, or is invalid.
 * 
 * Why: Staff sessions are persisted to survive page refreshes, but must be
 * validated on each access to prevent using expired credentials.
 */
export function getStoredSession(): StaffSession | null {
  const stored = localStorage.getItem('staffSession');
  if (!stored) return null;
  
  try {
    const session = JSON.parse(stored) as StaffSession;
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem('staffSession');
      localStorage.removeItem('staffToken');
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Constructs authorization headers for staff API requests.
 * Uses the JWT token stored in localStorage.
 * 
 * Why: All staff endpoints require Bearer token authentication,
 * centralizing header construction ensures consistency.
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('staffToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Clears staff session data from localStorage.
 * Called on logout or session expiration.
 */
export function clearSession(): void {
  localStorage.removeItem('staffSession');
  localStorage.removeItem('staffToken');
}
