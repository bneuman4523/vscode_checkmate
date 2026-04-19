import { useMemo } from "react";
import type { Attendee, SessionRegistration } from "../types";

/**
 * Provides filtered and sorted attendee lists for the dashboard.
 *
 * Why: Search and sort logic is pure transformation that benefits from
 * memoization. Extracting into a hook allows reuse and keeps render
 * functions focused on presentation.
 */
export function useAttendeeFilters(
  attendees: Attendee[],
  searchTerm: string,
  statusFilter: string[] = []
) {
  const filteredAttendees = useMemo(() => {
    return attendees
      .filter(a => {
        if (statusFilter.length > 0) {
          const attendeeStatus = a.registrationStatusLabel || a.registrationStatus || '';
          if (!statusFilter.includes(attendeeStatus)) {
            return false;
          }
        }
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          a.firstName.toLowerCase().includes(term) ||
          a.lastName.toLowerCase().includes(term) ||
          a.email.toLowerCase().includes(term) ||
          (a.company && a.company.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        const lastNameCompare = a.lastName.localeCompare(b.lastName);
        if (lastNameCompare !== 0) return lastNameCompare;
        return a.firstName.localeCompare(b.firstName);
      });
  }, [attendees, searchTerm, statusFilter]);

  const checkedInCount = useMemo(() => 
    attendees.filter(a => a.checkedIn).length, 
    [attendees]
  );

  const badgePrintedCount = useMemo(() => 
    attendees.filter(a => a.badgePrinted).length, 
    [attendees]
  );

  return {
    filteredAttendees,
    checkedInCount,
    badgePrintedCount,
  };
}

/**
 * Filters session registrations by search term.
 */
export function useSessionRegistrationFilters(
  registrations: SessionRegistration[],
  searchTerm: string
) {
  const filteredRegistrations = useMemo(() => {
    if (!searchTerm) return registrations;
    const term = searchTerm.toLowerCase();
    return registrations.filter(r => {
      const a = r.attendee;
      return (
        a.firstName.toLowerCase().includes(term) ||
        a.lastName.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        (a.company && a.company.toLowerCase().includes(term))
      );
    });
  }, [registrations, searchTerm]);

  return { filteredRegistrations };
}
