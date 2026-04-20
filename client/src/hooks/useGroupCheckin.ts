import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

interface UseGroupCheckinOptions {
  eventId: string;
  mode: 'kiosk' | 'staff' | 'admin';
  pin?: string; // required for kiosk mode
  getStaffAuthHeaders?: () => Record<string, string>; // for staff mode auth
}

export interface GroupMember {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  company?: string;
  title?: string;
  participantType: string;
  checkedIn: boolean;
  checkedInAt?: string;
  badgePrinted: boolean;
  externalId?: string;
  orderCode?: string;
}

interface UseGroupCheckinReturn {
  // Lookup
  lookupGroup: (orderCode: string) => Promise<boolean>;
  isLookingUp: boolean;

  // State
  members: GroupMember[];
  primaryId: string | null;
  selectedIds: Set<string>;
  isGroupFound: boolean;

  // Selection
  toggleMember: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // Check-in
  checkInSelected: () => Promise<{ checkedIn: number; failed: number }>;
  isProcessing: boolean;
  checkInResults: Map<string, 'pending' | 'success' | 'error'>;

  // Reset
  reset: () => void;
}

export function useGroupCheckin(options: UseGroupCheckinOptions): UseGroupCheckinReturn {
  const { eventId, mode, pin, getStaffAuthHeaders } = options;

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGroupFound, setIsGroupFound] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkInResults, setCheckInResults] = useState<Map<string, 'pending' | 'success' | 'error'>>(new Map());

  const reset = useCallback(() => {
    setMembers([]);
    setPrimaryId(null);
    setSelectedIds(new Set());
    setIsGroupFound(false);
    setIsLookingUp(false);
    setIsProcessing(false);
    setCheckInResults(new Map());
  }, []);

  const lookupGroup = useCallback(async (orderCode: string): Promise<boolean> => {
    setIsLookingUp(true);
    setCheckInResults(new Map());

    try {
      let data: { found: boolean; members: GroupMember[]; primaryId: string; checkedInCount: number; totalCount: number };

      if (mode === 'kiosk') {
        const res = await fetch(`/api/kiosk/${eventId}/group-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, orderCode }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Lookup failed (${res.status})`);
        }
        data = await res.json();
      } else if (mode === 'admin') {
        const res = await apiRequest('GET', `/api/events/${eventId}/group/${encodeURIComponent(orderCode)}`);
        data = await res.json();
      } else {
        const headers = getStaffAuthHeaders ? getStaffAuthHeaders() : {};
        const res = await fetch(`/api/staff/group/${encodeURIComponent(orderCode)}`, { headers });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Lookup failed (${res.status})`);
        }
        data = await res.json();
      }

      if (!data.found) {
        reset();
        return false;
      }

      setMembers(data.members);
      setPrimaryId(data.primaryId);
      setIsGroupFound(true);

      // Pre-select all members who are NOT already checked in, plus always include primary
      const preSelected = new Set<string>();
      for (const member of data.members) {
        if (!member.checkedIn) {
          preSelected.add(member.id);
        }
      }
      // Primary is always selected
      if (data.primaryId) {
        preSelected.add(data.primaryId);
      }
      setSelectedIds(preSelected);

      return true;
    } catch (err) {
      reset();
      throw err;
    } finally {
      setIsLookingUp(false);
    }
  }, [eventId, mode, pin, reset]);

  const toggleMember = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting the primary
        if (id === primaryId) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [primaryId]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(members.map(m => m.id)));
  }, [members]);

  const deselectAll = useCallback(() => {
    // Primary always stays selected
    setSelectedIds(primaryId ? new Set([primaryId]) : new Set());
  }, [primaryId]);

  const checkInSelected = useCallback(async (): Promise<{ checkedIn: number; failed: number }> => {
    const attendeeIds = Array.from(selectedIds);
    if (attendeeIds.length === 0) {
      return { checkedIn: 0, failed: 0 };
    }

    setIsProcessing(true);

    // Mark all selected as pending
    const pendingResults = new Map<string, 'pending' | 'success' | 'error'>();
    for (const id of attendeeIds) {
      pendingResults.set(id, 'pending');
    }
    setCheckInResults(new Map(pendingResults));

    try {
      let data: { success: boolean; results: Array<{ attendeeId: string; status: string }>; checkedIn: number; alreadyCheckedIn: number; failed: number };

      if (mode === 'kiosk') {
        const res = await fetch(`/api/kiosk/${eventId}/group-checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, attendeeIds, checkedInBy: 'kiosk' }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Check-in failed (${res.status})`);
        }
        data = await res.json();
      } else if (mode === 'admin') {
        const res = await apiRequest('POST', `/api/events/${eventId}/group-checkin`, {
          attendeeIds,
          orderCode: members[0]?.orderCode,
          checkedInBy: 'admin',
        });
        data = await res.json();
      } else {
        const headers = { 'Content-Type': 'application/json', ...(getStaffAuthHeaders ? getStaffAuthHeaders() : {}) };
        const res = await fetch('/api/staff/group-checkin', {
          method: 'POST',
          headers,
          body: JSON.stringify({ attendeeIds, checkedInBy: 'staff' }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Check-in failed (${res.status})`);
        }
        data = await res.json();
      }

      // Update results map from server response
      const finalResults = new Map<string, 'pending' | 'success' | 'error'>();
      for (const result of data.results) {
        finalResults.set(
          result.attendeeId,
          result.status === 'checked_in' || result.status === 'already_checked_in' ? 'success' : 'error'
        );
      }
      setCheckInResults(finalResults);

      // Update member state to reflect check-ins
      setMembers(prev =>
        prev.map(m => {
          if (finalResults.get(m.id) === 'success') {
            return { ...m, checkedIn: true, checkedInAt: new Date().toISOString() };
          }
          return m;
        })
      );

      return { checkedIn: data.checkedIn + (data.alreadyCheckedIn || 0), failed: data.failed };
    } catch (err) {
      // Mark all as error on network failure
      const errorResults = new Map<string, 'pending' | 'success' | 'error'>();
      for (const id of attendeeIds) {
        errorResults.set(id, 'error');
      }
      setCheckInResults(errorResults);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, mode, eventId, pin, members]);

  return {
    lookupGroup,
    isLookingUp,
    members,
    primaryId,
    selectedIds,
    isGroupFound,
    toggleMember,
    selectAll,
    deselectAll,
    checkInSelected,
    isProcessing,
    checkInResults,
    reset,
  };
}
