import { useMemo } from "react";
import type { Attendee, SessionRegistration } from "../types";
import type { RegistrationStatus } from "@shared/schema";

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
  statusFilter: RegistrationStatus[] = []
) {
  const filteredAttendees = useMemo(() => {
    return attendees
      .filter(a => {
        if (statusFilter.length > 0 && !statusFilter.includes(a.registrationStatus as RegistrationStatus)) {
          return false;
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
