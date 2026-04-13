import { SessionList } from "./SessionList";
import { SessionDetail } from "./SessionDetail";
import type { Attendee, Session, SessionRegistration } from "../../types";

interface SessionTabProps {
  sessions: Session[];
  selectedSession: Session | null;
  attendees: Attendee[];
  registrations: SessionRegistration[];
  filteredRegistrations: SessionRegistration[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  scanMode: boolean;
  onToggleScanMode: () => void;
  sessionsLoading: boolean;
  registrationsLoading: boolean;
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  onSelectSession: (session: Session) => void;
  onBack: () => void;
  onSessionCheckin: (sessionId: string, attendeeId: string) => void;
  onSessionCheckout: (sessionId: string, attendeeId: string) => void;
  onQRScanFound: (attendee: Attendee) => void;
}

/**
 * Main session tab content with list/detail view switching.
 * 
 * Why: The session tab manages navigation between list and detail views,
 * keeping the parent component focused on tab switching only.
 */
export function SessionTab({
  sessions,
  selectedSession,
  attendees,
  registrations,
  filteredRegistrations,
  searchTerm,
  onSearchChange,
  scanMode,
  onToggleScanMode,
  sessionsLoading,
  registrationsLoading,
  isCheckingIn,
  isCheckingOut,
  onSelectSession,
  onBack,
  onSessionCheckin,
  onSessionCheckout,
  onQRScanFound,
}: SessionTabProps) {
  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        attendees={attendees}
        registrations={registrations}
        filteredRegistrations={filteredRegistrations}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        scanMode={scanMode}
        onToggleScanMode={onToggleScanMode}
        isLoading={registrationsLoading}
        isCheckingIn={isCheckingIn}
        isCheckingOut={isCheckingOut}
        onBack={onBack}
        onSessionCheckin={onSessionCheckin}
        onSessionCheckout={onSessionCheckout}
        onQRScanFound={onQRScanFound}
      />
    );
  }

  return (
    <SessionList
      sessions={sessions}
      isLoading={sessionsLoading}
      onSelectSession={onSelectSession}
    />
  );
}
