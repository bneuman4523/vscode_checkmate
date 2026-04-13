import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import type { StaffSession } from "../types";
import { getStoredSession, clearSession } from "../utils";

/**
 * Manages staff session state and authentication.
 * 
 * Why: Staff authentication requires session validation on mount and
 * redirect to login if session is invalid or for wrong event.
 * Centralizing this logic prevents duplication across components.
 */
export function useStaffSession(eventId: string | undefined) {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    if (!eventId) return;
    
    const stored = getStoredSession();
    if (!stored || stored.eventId !== eventId) {
      setLocation(`/staff/${eventId}`);
      return;
    }
    setSession(stored);
  }, [eventId, setLocation]);

  const logout = () => {
    clearSession();
    window.location.replace(`/staff/${eventId}`);
  };

  return {
    session,
    isAuthenticated: !!session,
    logout,
  };
}
