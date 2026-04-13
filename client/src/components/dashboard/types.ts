import type { EventWorkflowStep, EventBuyerQuestion, EventDisclaimer } from "@shared/schema";

/**
 * Staff session data stored in localStorage after successful authentication.
 * Contains the JWT token and session metadata for the current staff member.
 */
export interface StaffSession {
  token: string;
  expiresAt: string;
  staffName: string;
  eventId: string;
  eventName: string;
  customerId?: string;
  customerName: string;
  printPreviewOnCheckin?: boolean;
}

/**
 * Image element positioned on a badge template.
 * Supports logos, backgrounds, and decorative images.
 */
export interface BadgeImageElement {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  url?: string;
  objectKey?: string;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
}

/**
 * Badge template configuration for rendering and printing badges.
 * Includes layout, styling, and merge field positions.
 */
export interface BadgeTemplateConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  includeQR: boolean;
  qrPosition: string;
  qrCodeConfig?: {
    embedType: 'externalId' | 'simple' | 'json' | 'custom';
    fields: string[];
    separator: string;
    includeLabel: boolean;
  };
  mergeFields: Array<{
    field: string;
    label: string;
    fontSize: number;
    position: { x: number; y: number };
    align: 'left' | 'center' | 'right';
    fontWeight?: string;
    fontStyle?: 'normal' | 'italic';
  }>;
  imageElements?: BadgeImageElement[];
}

/**
 * Data required to display the print preview dialog.
 * Combines attendee data with the resolved template configuration.
 */
export interface PrintPreviewData {
  attendee: Attendee;
  template: BadgeTemplateConfig;
}

/**
 * Attendee record from the event registration system.
 * Core entity for check-in and badge printing operations.
 */
export interface Attendee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  participantType: string;
  registrationStatus?: string;
  registrationStatusLabel?: string;
  checkedIn: boolean;
  checkedInAt?: string;
  badgePrinted: boolean;
  badgePrintedAt?: string;
  externalId?: string;
}

/**
 * Session/breakout within an event that attendees can register for.
 * Supports capacity limits and check-in tracking.
 */
export interface Session {
  id: string;
  name: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  checkedInCount: number;
  restrictToRegistered: boolean;
}

/**
 * Registration linking an attendee to a specific session.
 * Tracks session-level check-in status.
 */
export interface SessionRegistration {
  registrationId: string;
  attendee: Attendee;
  sessionCheckedIn: boolean;
  registeredAt: string;
}

/**
 * Event workflow configuration with enabled steps.
 * Defines the check-in workflow for the event.
 */
export interface WorkflowConfig {
  id: string;
  enabled: boolean;
  steps: (EventWorkflowStep & {
    questions?: EventBuyerQuestion[];
    disclaimers?: EventDisclaimer[];
  })[];
}

/**
 * Form data for editing attendee badge information.
 */
export interface EditFormData {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
}

/**
 * Dashboard UI state for managing dialogs and modes.
 */
export interface DashboardUIState {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedAttendee: Attendee | null;
  setSelectedAttendee: (attendee: Attendee | null) => void;
  showCheckinDialog: boolean;
  setShowCheckinDialog: (show: boolean) => void;
  showEditDialog: boolean;
  setShowEditDialog: (show: boolean) => void;
  editFormData: EditFormData;
  setEditFormData: (data: EditFormData | ((prev: EditFormData) => EditFormData)) => void;
  selectedSession: Session | null;
  setSelectedSession: (session: Session | null) => void;
  sessionSearchTerm: string;
  setSessionSearchTerm: (term: string) => void;
  attendeeScanMode: boolean;
  setAttendeeScanMode: (mode: boolean) => void;
  sessionScanMode: boolean;
  setSessionScanMode: (mode: boolean) => void;
  showPrintPreview: boolean;
  setShowPrintPreview: (show: boolean) => void;
  printPreviewData: PrintPreviewData | null;
  setPrintPreviewData: (data: PrintPreviewData | null) => void;
  showWorkflowRunner: boolean;
  setShowWorkflowRunner: (show: boolean) => void;
  workflowAttendee: Attendee | null;
  setWorkflowAttendee: (attendee: Attendee | null) => void;
  showPrinterSettings: boolean;
  setShowPrinterSettings: (show: boolean) => void;
  showBadgePreview: boolean;
  setShowBadgePreview: (show: boolean) => void;
}
