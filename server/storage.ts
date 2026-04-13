import { 
  type User, type InsertUser, 
  type Printer, type InsertPrinter,
  type Customer, type InsertCustomer,
  type Location, type InsertLocation,
  type Event, type InsertEvent,
  type BadgeTemplate, type InsertBadgeTemplate,
  type CustomerIntegration, type InsertCustomerIntegration,
  type EventIntegration, type InsertEventIntegration,
  type Attendee, type InsertAttendee,
  type IntegrationConnection, type InsertIntegrationConnection,
  type StoredCredential, type InsertStoredCredential,
  type IntegrationProvider, type InsertIntegrationProvider,
  type IntegrationEndpointConfig, type InsertIntegrationEndpointConfig,
  type EventCodeMapping, type InsertEventCodeMapping,
  type SessionCodeMapping, type InsertSessionCodeMapping,
  type Session, type InsertSession,
  type SessionRegistration, type InsertSessionRegistration,
  type SessionCheckin, type InsertSessionCheckin,
  type CustomFont, type InsertCustomFont,
  type StaffSession, type InsertStaffSession,
  type StaffActivityLog, type InsertStaffActivityLog,
  type EventBadgeTemplateOverride, type InsertEventBadgeTemplateOverride,
  type SyncJob, type InsertSyncJob,
  type EventWorkflowConfig, type InsertEventWorkflowConfig,
  type EventWorkflowStep, type InsertEventWorkflowStep,
  type EventBuyerQuestion, type InsertEventBuyerQuestion,
  type EventDisclaimer, type InsertEventDisclaimer,
  type AttendeeWorkflowResponse, type InsertAttendeeWorkflowResponse,
  type AttendeeSignature, type InsertAttendeeSignature,
  type EventWorkflowWithSteps, type WorkflowStepWithData,
  type EventSyncState, type InsertEventSyncState,
  type SyncLog, type InsertSyncLog,
  type SystemSetting, type InsertSystemSetting,
  type EventConfigurationTemplate, type InsertEventConfigurationTemplate,
  type EventNotificationRule, type InsertEventNotificationRule,
  type ApplicationError, type InsertApplicationError,
  type AdminAuditLog, type InsertAdminAuditLog,
  type FeatureFlag, type InsertFeatureFlag,
  type DataRetentionPolicy, type DataRetentionLog, type InsertDataRetentionLog,
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined>;
  getUsersByCustomer(customerId: string): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  updateLastLogin(id: string): Promise<void>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;
  upsertUser(userData: { id: string; email?: string; firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User>;
  
  // Password reset token management
  createPasswordResetToken(userId: string, expiresInHours?: number, resetCodeHash?: string): Promise<{ token: string; expiresAt: Date }>;
  getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number; codeHash?: string | null } | undefined>;
  getPasswordResetTokenByUserId(userId: string): Promise<{ token: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number } | undefined>;
  getPasswordResetTokensForUser(userId: string): Promise<{ token: string; expiresAt: Date; codeHash: string | null }[]>;
  deletePasswordResetToken(token: string): Promise<void>;
  incrementPasswordResetAttempts(token: string): Promise<number>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<number>;
  
  // Customer management
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<boolean>;
  
  // Location management
  getLocations(customerId: string): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;
  matchLocationByName(customerId: string, locationName: string): Promise<Location | undefined>;
  
  // Event management
  getAllEvents(): Promise<Event[]>;
  getEvents(customerId: string): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventByExternalId(customerId: string, externalEventId: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  upsertEventFromSync(customerId: string, integrationId: string, eventData: { externalEventId: string; name: string; eventDate: Date; startDate?: Date | null; endDate?: Date | null; accountCode?: string | null; eventCode?: string | null; timezone?: string | null; status?: string; location?: string | null; venue?: string | null }): Promise<{ event: Event; created: boolean }>;
  
  // Badge template management
  getBadgeTemplates(customerId: string): Promise<BadgeTemplate[]>;
  getBadgeTemplate(id: string): Promise<BadgeTemplate | undefined>;
  createBadgeTemplate(template: InsertBadgeTemplate): Promise<BadgeTemplate>;
  updateBadgeTemplate(id: string, template: Partial<InsertBadgeTemplate>): Promise<BadgeTemplate | undefined>;
  deleteBadgeTemplate(id: string): Promise<boolean>;
  
  // Event configuration template management
  getEventConfigurationTemplates(customerId: string): Promise<EventConfigurationTemplate[]>;
  getEventConfigurationTemplate(id: string): Promise<EventConfigurationTemplate | undefined>;
  getDefaultEventConfigurationTemplate(customerId: string): Promise<EventConfigurationTemplate | undefined>;
  createEventConfigurationTemplate(template: InsertEventConfigurationTemplate): Promise<EventConfigurationTemplate>;
  updateEventConfigurationTemplate(id: string, template: Partial<InsertEventConfigurationTemplate>): Promise<EventConfigurationTemplate | undefined>;
  deleteEventConfigurationTemplate(id: string): Promise<boolean>;
  
  // Customer integration management
  getCustomerIntegrations(customerId: string): Promise<CustomerIntegration[]>;
  getCustomerIntegration(id: string): Promise<CustomerIntegration | undefined>;
  createCustomerIntegration(integration: InsertCustomerIntegration): Promise<CustomerIntegration>;
  updateCustomerIntegration(id: string, integration: Partial<InsertCustomerIntegration>): Promise<CustomerIntegration | undefined>;
  deleteCustomerIntegration(id: string): Promise<boolean>;
  
  // Sync logs management
  getSyncLogs(integrationId: string, limit?: number): Promise<SyncLog[]>;
  getSyncLogsByCustomer(customerId: string, limit?: number): Promise<SyncLog[]>;
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: string, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined>;
  
  // Event integration management (links events to account integrations)
  getEventIntegrations(eventId: string): Promise<EventIntegration[]>;
  getEventIntegration(id: string): Promise<EventIntegration | undefined>;
  createEventIntegration(integration: InsertEventIntegration): Promise<EventIntegration>;
  updateEventIntegration(id: string, integration: Partial<InsertEventIntegration>): Promise<EventIntegration | undefined>;
  deleteEventIntegration(id: string): Promise<boolean>;
  
  // Attendee management
  getAttendees(eventId: string): Promise<Attendee[]>;
  getAttendeesByCustomer(customerId: string): Promise<Attendee[]>;
  getAttendee(id: string): Promise<Attendee | undefined>;
  getDistinctParticipantTypes(eventId: string): Promise<string[]>;
  createAttendee(attendee: InsertAttendee): Promise<Attendee>;
  updateAttendee(id: string, attendee: Partial<InsertAttendee>): Promise<Attendee | undefined>;
  deleteAttendee(id: string): Promise<boolean>;
  
  // Printer management
  getPrinters(customerId: string): Promise<Printer[]>;
  getPrinter(id: string): Promise<Printer | undefined>;
  createPrinter(printer: InsertPrinter): Promise<Printer>;
  updatePrinter(id: string, printer: Partial<InsertPrinter>): Promise<Printer | undefined>;
  deletePrinter(id: string): Promise<boolean>;
  
  // Integration connection management
  getIntegrationConnections(integrationId: string): Promise<IntegrationConnection[]>;
  getIntegrationConnection(id: string): Promise<IntegrationConnection | undefined>;
  getIntegrationConnectionByIntegration(integrationId: string): Promise<IntegrationConnection | undefined>;
  createIntegrationConnection(connection: InsertIntegrationConnection): Promise<IntegrationConnection>;
  updateIntegrationConnection(id: string, connection: Partial<InsertIntegrationConnection>): Promise<IntegrationConnection | undefined>;
  deleteIntegrationConnection(id: string): Promise<boolean>;
  
  // Stored credentials management (internal use only - never expose to frontend)
  getStoredCredentials(connectionId: string): Promise<StoredCredential[]>;
  getStoredCredential(id: string): Promise<StoredCredential | undefined>;
  getStoredCredentialByType(connectionId: string, credentialType: string): Promise<StoredCredential | undefined>;
  createStoredCredential(credential: InsertStoredCredential): Promise<StoredCredential>;
  updateStoredCredential(id: string, credential: Partial<InsertStoredCredential>): Promise<StoredCredential | undefined>;
  deleteStoredCredential(id: string): Promise<boolean>;
  deleteStoredCredentialsByConnection(connectionId: string): Promise<boolean>;
  
  // Integration providers catalog
  getIntegrationProviders(): Promise<IntegrationProvider[]>;
  getIntegrationProvider(id: string): Promise<IntegrationProvider | undefined>;
  
  // Integration endpoint configurations
  getIntegrationEndpointConfigs(integrationId: string): Promise<IntegrationEndpointConfig[]>;
  getIntegrationEndpointConfig(integrationId: string, dataType: string): Promise<IntegrationEndpointConfig | undefined>;
  getIntegrationEndpointConfigById(id: string): Promise<IntegrationEndpointConfig | undefined>;
  createIntegrationEndpointConfig(config: InsertIntegrationEndpointConfig): Promise<IntegrationEndpointConfig>;
  updateIntegrationEndpointConfig(id: string, config: Partial<InsertIntegrationEndpointConfig>): Promise<IntegrationEndpointConfig | undefined>;
  deleteIntegrationEndpointConfig(id: string): Promise<boolean>;
  
  // Event code mappings
  getEventCodeMappings(integrationId: string): Promise<EventCodeMapping[]>;
  getEventCodeMapping(id: string): Promise<EventCodeMapping | undefined>;
  getEventCodeMappingByExternalId(integrationId: string, externalEventId: string): Promise<EventCodeMapping | undefined>;
  createEventCodeMapping(mapping: InsertEventCodeMapping): Promise<EventCodeMapping>;
  updateEventCodeMapping(id: string, mapping: Partial<InsertEventCodeMapping>): Promise<EventCodeMapping | undefined>;
  deleteEventCodeMapping(id: string): Promise<boolean>;
  
  // Session code mappings
  getSessionCodeMappings(eventCodeMappingId: string): Promise<SessionCodeMapping[]>;
  getSessionCodeMapping(id: string): Promise<SessionCodeMapping | undefined>;
  createSessionCodeMapping(mapping: InsertSessionCodeMapping): Promise<SessionCodeMapping>;
  updateSessionCodeMapping(id: string, mapping: Partial<InsertSessionCodeMapping>): Promise<SessionCodeMapping | undefined>;
  deleteSessionCodeMapping(id: string): Promise<boolean>;
  
  // Session management
  getSessions(eventId: string): Promise<Session[]>;
  getSession(id: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, session: Partial<InsertSession>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  
  // Session registration management
  getSessionRegistrations(sessionId: string): Promise<SessionRegistration[]>;
  getSessionRegistration(id: string): Promise<SessionRegistration | undefined>;
  getSessionRegistrationByAttendee(sessionId: string, attendeeId: string): Promise<SessionRegistration | undefined>;
  getSessionRegistrationsByAttendee(attendeeId: string): Promise<SessionRegistration[]>;
  createSessionRegistration(registration: InsertSessionRegistration): Promise<SessionRegistration>;
  updateSessionRegistration(id: string, registration: Partial<InsertSessionRegistration>): Promise<SessionRegistration | undefined>;
  deleteSessionRegistration(id: string): Promise<boolean>;
  getSessionRegistrationCount(sessionId: string, status: string): Promise<number>;
  getNextWaitlistPosition(sessionId: string): Promise<number>;
  promoteFromWaitlist(sessionId: string): Promise<SessionRegistration | undefined>;
  
  // Session check-in management
  getSessionCheckins(sessionId: string): Promise<SessionCheckin[]>;
  getSessionCheckinsByAttendee(attendeeId: string): Promise<SessionCheckin[]>;
  getSessionCheckinsByEvent(eventId: string): Promise<SessionCheckin[]>;
  getLatestSessionCheckin(sessionId: string, attendeeId: string): Promise<SessionCheckin | undefined>;
  createSessionCheckin(checkin: InsertSessionCheckin): Promise<SessionCheckin>;
  isAttendeeCheckedIntoSession(sessionId: string, attendeeId: string): Promise<boolean>;
  
  // Custom fonts management
  getCustomFonts(customerId: string): Promise<CustomFont[]>;
  getCustomFont(id: string): Promise<CustomFont | undefined>;
  createCustomFont(font: InsertCustomFont): Promise<CustomFont>;
  updateCustomFont(id: string, font: Partial<InsertCustomFont>): Promise<CustomFont | undefined>;
  deleteCustomFont(id: string): Promise<boolean>;
  
  // Temp staff session management
  getStaffSessions(eventId: string): Promise<StaffSession[]>;
  getStaffSession(id: string): Promise<StaffSession | undefined>;
  getStaffSessionByToken(token: string): Promise<StaffSession | undefined>;
  createStaffSession(session: InsertStaffSession): Promise<StaffSession>;
  updateStaffSession(id: string, updates: Partial<InsertStaffSession>): Promise<StaffSession | undefined>;
  deleteStaffSession(id: string): Promise<boolean>;
  invalidateStaffSession(id: string): Promise<boolean>;
  cleanupExpiredStaffSessions(): Promise<number>;
  
  // Temp staff activity log
  getStaffActivityLogs(eventId: string): Promise<StaffActivityLog[]>;
  getStaffActivityLogsBySession(sessionId: string): Promise<StaffActivityLog[]>;
  createStaffActivityLog(log: InsertStaffActivityLog): Promise<StaffActivityLog>;
  
  // Event badge template overrides (maps participant types to templates per event)
  getEventBadgeTemplateOverrides(eventId: string): Promise<EventBadgeTemplateOverride[]>;
  getEventBadgeTemplateOverride(id: string): Promise<EventBadgeTemplateOverride | undefined>;
  getEventBadgeTemplateOverrideByType(eventId: string, participantType: string): Promise<EventBadgeTemplateOverride | undefined>;
  createEventBadgeTemplateOverride(override: InsertEventBadgeTemplateOverride): Promise<EventBadgeTemplateOverride>;
  updateEventBadgeTemplateOverride(id: string, override: Partial<InsertEventBadgeTemplateOverride>): Promise<EventBadgeTemplateOverride | undefined>;
  deleteEventBadgeTemplateOverride(id: string): Promise<boolean>;
  
  // Sync jobs management
  getSyncJobs(integrationId: string): Promise<SyncJob[]>;
  getSyncJob(id: string): Promise<SyncJob | undefined>;
  getPendingSyncJobs(): Promise<SyncJob[]>;
  getPendingSyncJobsByConfig(configId: string): Promise<SyncJob[]>;
  getDueSyncJobs(): Promise<SyncJob[]>;
  getStaleRunningSyncJobs(): Promise<SyncJob[]>;
  createSyncJob(job: InsertSyncJob): Promise<SyncJob>;
  updateSyncJob(id: string, job: Partial<InsertSyncJob>): Promise<SyncJob | undefined>;
  deleteSyncJob(id: string): Promise<boolean>;
  
  // Endpoint config sync schedule management
  getEndpointConfigsDueForSync(): Promise<IntegrationEndpointConfig[]>;
  updateEndpointConfigSyncStatus(id: string, status: string, error?: string, count?: number): Promise<void>;
  
  // Event workflow configuration
  getEventWorkflowConfig(eventId: string): Promise<EventWorkflowConfig | undefined>;
  getEventWorkflowWithSteps(eventId: string): Promise<EventWorkflowWithSteps | undefined>;
  createEventWorkflowConfig(config: InsertEventWorkflowConfig): Promise<EventWorkflowConfig>;
  updateEventWorkflowConfig(eventId: string, config: Partial<InsertEventWorkflowConfig>): Promise<EventWorkflowConfig | undefined>;
  deleteEventWorkflowConfig(eventId: string): Promise<boolean>;
  
  // Event workflow steps
  getEventWorkflowSteps(eventId: string): Promise<EventWorkflowStep[]>;
  getEventWorkflowStep(id: string): Promise<EventWorkflowStep | undefined>;
  createEventWorkflowStep(step: InsertEventWorkflowStep): Promise<EventWorkflowStep>;
  updateEventWorkflowStep(id: string, step: Partial<InsertEventWorkflowStep>): Promise<EventWorkflowStep | undefined>;
  deleteEventWorkflowStep(id: string): Promise<boolean>;
  reorderEventWorkflowSteps(eventId: string, stepIds: string[]): Promise<EventWorkflowStep[]>;
  
  // Event buyer questions
  getEventBuyerQuestions(stepId: string): Promise<EventBuyerQuestion[]>;
  getEventBuyerQuestionsByEvent(eventId: string): Promise<EventBuyerQuestion[]>;
  getEventBuyerQuestion(id: string): Promise<EventBuyerQuestion | undefined>;
  createEventBuyerQuestion(question: InsertEventBuyerQuestion): Promise<EventBuyerQuestion>;
  updateEventBuyerQuestion(id: string, question: Partial<InsertEventBuyerQuestion>): Promise<EventBuyerQuestion | undefined>;
  deleteEventBuyerQuestion(id: string): Promise<boolean>;
  
  // Event disclaimers
  getEventDisclaimer(stepId: string): Promise<EventDisclaimer | undefined>;
  getEventDisclaimersByEvent(eventId: string): Promise<EventDisclaimer[]>;
  createEventDisclaimer(disclaimer: InsertEventDisclaimer): Promise<EventDisclaimer>;
  updateEventDisclaimer(id: string, disclaimer: Partial<InsertEventDisclaimer>): Promise<EventDisclaimer | undefined>;
  deleteEventDisclaimer(id: string): Promise<boolean>;
  
  // Attendee workflow responses
  getAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<AttendeeWorkflowResponse[]>;
  getAttendeeWorkflowResponsesByEvent(eventId: string): Promise<AttendeeWorkflowResponse[]>;
  createAttendeeWorkflowResponse(response: InsertAttendeeWorkflowResponse): Promise<AttendeeWorkflowResponse>;
  deleteAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<boolean>;
  
  // Attendee signatures
  getAttendeeSignature(attendeeId: string, disclaimerId: string): Promise<AttendeeSignature | undefined>;
  getAttendeeSignatures(attendeeId: string): Promise<AttendeeSignature[]>;
  getAttendeeSignaturesByEvent(eventId: string): Promise<AttendeeSignature[]>;
  createAttendeeSignature(signature: InsertAttendeeSignature): Promise<AttendeeSignature>;
  updateAttendeeSignature(id: string, data: Partial<Pick<AttendeeSignature, 'signatureData' | 'ipAddress' | 'userAgent'>>): Promise<AttendeeSignature | undefined>;
  deleteAttendeeSignature(id: string): Promise<boolean>;
  deleteAttendeeSignaturesByAttendee(attendeeId: string, eventId: string): Promise<boolean>;
  
  // Event Sync States
  getEventSyncStates(eventId: string): Promise<EventSyncState[]>;
  getEventSyncState(eventId: string, dataType: string): Promise<EventSyncState | undefined>;
  getEventSyncStateById(id: string): Promise<EventSyncState | undefined>;
  createEventSyncState(state: InsertEventSyncState): Promise<EventSyncState>;
  updateEventSyncState(id: string, state: Partial<InsertEventSyncState>): Promise<EventSyncState | undefined>;
  upsertEventSyncState(eventId: string, dataType: string, state: Partial<InsertEventSyncState>): Promise<EventSyncState>;
  deleteEventSyncState(id: string): Promise<boolean>;
  getSyncStatesDueForSync(): Promise<EventSyncState[]>;
  
  // System Settings
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  upsertSystemSetting(key: string, value: string | null, jsonValue?: object | null, description?: string, updatedBy?: string): Promise<SystemSetting>;
  deleteSystemSetting(key: string): Promise<boolean>;
  
  // Event Notification Rules
  getEventNotificationRules(eventId: string): Promise<EventNotificationRule[]>;
  getEventNotificationRule(id: string): Promise<EventNotificationRule | undefined>;
  getActiveNotificationRulesForAttendee(eventId: string, attendee: { participantType: string; company?: string | null; firstName: string; lastName: string }): Promise<EventNotificationRule[]>;
  createEventNotificationRule(rule: InsertEventNotificationRule): Promise<EventNotificationRule>;
  updateEventNotificationRule(id: string, rule: Partial<InsertEventNotificationRule>): Promise<EventNotificationRule | undefined>;
  deleteEventNotificationRule(id: string): Promise<boolean>;
  
  // Application Error Logging (for alpha testing)
  logError(error: InsertApplicationError): Promise<ApplicationError>;
  getErrors(options?: { errorType?: string; isResolved?: boolean; customerId?: string; limit?: number; offset?: number }): Promise<ApplicationError[]>;
  getError(id: string): Promise<ApplicationError | undefined>;
  resolveError(id: string, resolvedBy: string, notes?: string): Promise<ApplicationError | undefined>;
  getErrorStats(): Promise<{ total: number; unresolved: number; byType: { type: string; count: number }[]; last24h: number; last7d: number }>;
  deleteOldErrors(olderThan: Date): Promise<number>;
  
  // Admin Audit Log (tracks changes to integration/webhook settings)
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAuditLogs(options?: { userId?: string; customerId?: string; action?: string; resourceType?: string; limit?: number; offset?: number }): Promise<AdminAuditLog[]>;
  getAuditLogStats(): Promise<{ total: number; last24h: number; last7d: number; byAction: { action: string; count: number }[]; byUser: { userId: string; userEmail: string; count: number }[] }>;

  // Feature Flags (Mission Control)
  getFeatureFlags(): Promise<FeatureFlag[]>;
  getFeatureFlag(id: string): Promise<FeatureFlag | undefined>;
  getFeatureFlagByKey(key: string): Promise<FeatureFlag | undefined>;
  createFeatureFlag(flag: InsertFeatureFlag): Promise<FeatureFlag>;
  updateFeatureFlag(id: string, flag: Partial<InsertFeatureFlag>): Promise<FeatureFlag | undefined>;
  deleteFeatureFlag(id: string): Promise<boolean>;

  getCustomerRetentionPolicy(customerId: string): Promise<DataRetentionPolicy | null>;
  updateCustomerRetentionPolicy(customerId: string, policy: DataRetentionPolicy): Promise<Customer | undefined>;
  getEventRetentionOverride(eventId: string): Promise<Partial<DataRetentionPolicy> | null>;
  updateEventRetentionOverride(eventId: string, override: Partial<DataRetentionPolicy> | null): Promise<Event | undefined>;
  getEventsEligibleForRetention(): Promise<Array<{ event: Event; customer: Customer; policy: DataRetentionPolicy; policySource: 'account' | 'event_override'; eligibleDate: Date; attendeeCount: number; }>>;
  getEventsPendingRetentionNotification(): Promise<Array<{ event: Event; customer: Customer; policy: DataRetentionPolicy; eligibleDate: Date; attendeeCount: number; }>>;
  anonymizeEventAttendees(eventId: string): Promise<number>;
  markEventRetentionProcessed(eventId: string): Promise<void>;
  markEventRetentionNotified(eventId: string): Promise<void>;
  logRetentionAction(entry: InsertDataRetentionLog): Promise<DataRetentionLog>;
  getRetentionLogs(customerId: string, limit?: number): Promise<DataRetentionLog[]>;
  getRetentionPreview(customerId: string): Promise<Array<{ eventId: string; eventName: string; eventDate: Date; endDate: Date | null; attendeeCount: number; eligibleDate: Date; action: string; daysUntilAction: number; }>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private printers: Map<string, Printer>;
  private customers: Map<string, Customer>;
  private events: Map<string, Event>;
  private badgeTemplates: Map<string, BadgeTemplate>;
  private customerIntegrations: Map<string, CustomerIntegration>;
  private eventIntegrations: Map<string, EventIntegration>;
  private attendees: Map<string, Attendee>;
  private integrationConnections: Map<string, IntegrationConnection>;
  private storedCredentials: Map<string, StoredCredential>;
  private integrationProviders: Map<string, IntegrationProvider>;
  private sessions: Map<string, Session>;
  private sessionRegistrations: Map<string, SessionRegistration>;
  private sessionCheckins: Map<string, SessionCheckin>;
  private integrationEndpointConfigs: Map<string, IntegrationEndpointConfig>;
  private eventCodeMappings: Map<string, EventCodeMapping>;
  private sessionCodeMappings: Map<string, SessionCodeMapping>;
  private customFonts: Map<string, CustomFont>;
  private staffSessions: Map<string, StaffSession>;
  private staffActivityLogs: Map<string, StaffActivityLog>;
  private eventBadgeTemplateOverrides: Map<string, EventBadgeTemplateOverride>;
  private syncJobs: Map<string, SyncJob>;
  private eventWorkflowConfigs: Map<string, EventWorkflowConfig>;
  private eventWorkflowSteps: Map<string, EventWorkflowStep>;
  private eventBuyerQuestions: Map<string, EventBuyerQuestion>;
  private eventDisclaimers: Map<string, EventDisclaimer>;
  private attendeeWorkflowResponses: Map<string, AttendeeWorkflowResponse>;
  private attendeeSignatures: Map<string, AttendeeSignature>;
  private eventSyncStates: Map<string, EventSyncState>;
  private syncLogs: Map<string, SyncLog>;
  private systemSettings: Map<string, SystemSetting>;

  constructor() {
    this.users = new Map();
    this.printers = new Map();
    this.customers = new Map();
    this.events = new Map();
    this.badgeTemplates = new Map();
    this.customerIntegrations = new Map();
    this.eventIntegrations = new Map();
    this.attendees = new Map();
    this.integrationConnections = new Map();
    this.storedCredentials = new Map();
    this.integrationProviders = new Map();
    this.sessions = new Map();
    this.sessionRegistrations = new Map();
    this.sessionCheckins = new Map();
    this.integrationEndpointConfigs = new Map();
    this.eventCodeMappings = new Map();
    this.sessionCodeMappings = new Map();
    this.customFonts = new Map();
    this.staffSessions = new Map();
    this.staffActivityLogs = new Map();
    this.eventBadgeTemplateOverrides = new Map();
    this.syncJobs = new Map();
    this.eventWorkflowConfigs = new Map();
    this.eventWorkflowSteps = new Map();
    this.eventBuyerQuestions = new Map();
    this.eventDisclaimers = new Map();
    this.attendeeWorkflowResponses = new Map();
    this.attendeeSignatures = new Map();
    this.eventSyncStates = new Map();
    this.syncLogs = new Map();
    this.systemSettings = new Map();
    
    // Initialize with demo data
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Demo customers
    const customers: Customer[] = [
      {
        id: "1",
        name: "Tech Conference Inc",
        contactEmail: "admin@techconf.com",
        apiBaseUrl: "https://api.techconf.com/v1",
        status: "active",
        createdAt: new Date(),
      },
      {
        id: "2",
        name: "Global Events Corp",
        contactEmail: "contact@globalevents.com",
        apiBaseUrl: "https://events.globalcorp.io/api",
        status: "active",
        createdAt: new Date(),
      },
      {
        id: "3",
        name: "StartUp Summit",
        contactEmail: "hello@startupsummit.io",
        apiBaseUrl: null,
        status: "active",
        createdAt: new Date(),
      },
    ];
    customers.forEach(c => this.customers.set(c.id, c));

    // Demo events for customer 1
    const events: Event[] = [
      {
        id: "evt-1",
        customerId: "1",
        name: "Annual Developer Conference 2025",
        eventDate: new Date("2025-06-15"),
        selectedTemplates: ["vip", "general"],
        selectedPrinterId: null,
        integrationId: "int-1",
        externalEventId: null,
        defaultBadgeTemplateId: null,
        printerSettings: null,
        staffSettings: {
          enabled: true,
          passcodeHash: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3", // SHA256 of "123"
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
          endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
          printPreviewOnCheckin: true, // Enable print preview after check-in
        },
        status: "upcoming",
        createdAt: new Date(),
      },
      {
        id: "evt-2",
        customerId: "1",
        name: "Product Launch Event",
        eventDate: new Date("2025-03-20"),
        selectedTemplates: ["general", "press"],
        selectedPrinterId: null,
        integrationId: null,
        externalEventId: null,
        defaultBadgeTemplateId: null,
        printerSettings: null,
        staffSettings: null,
        status: "active",
        createdAt: new Date(),
      },
    ];
    events.forEach(e => this.events.set(e.id, e));

    // Demo integrations for customer 1
    // Updated to use only the active provider IDs: certain_oauth, certain, bearer_token
    const integrations: CustomerIntegration[] = [
      {
        id: "int-1",
        customerId: "1",
        providerId: "certain_oauth",
        name: "Tech Conf Certain (OAuth)",
        baseUrl: "https://api.certain.com",
        authType: "oauth2",
        credentialsRef: null,
        oauth2ProfileId: null,
        rateLimitPolicy: { requestsPerMinute: 50 },
        endpoints: [],
        status: "active",
        lastSync: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "int-2",
        customerId: "1",
        providerId: "certain",
        name: "Tech Conf Certain (Basic)",
        baseUrl: "https://api.certain.com",
        authType: "basic",
        credentialsRef: null,
        oauth2ProfileId: null,
        rateLimitPolicy: { requestsPerMinute: 30 },
        endpoints: [],
        status: "active",
        lastSync: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "int-3",
        customerId: "1",
        providerId: "bearer_token",
        name: "Custom API Integration",
        baseUrl: "https://api.example.com",
        authType: "bearer",
        credentialsRef: null,
        oauth2ProfileId: null,
        rateLimitPolicy: { requestsPerMinute: 40 },
        endpoints: [],
        status: "active",
        lastSync: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    integrations.forEach(i => this.customerIntegrations.set(i.id, i));

    // Demo event integrations (linking events to customer integrations)
    const eventIntegrations: EventIntegration[] = [
      {
        id: "evtint-1",
        eventId: "evt-1",
        integrationId: "int-3", // Certain integration
        variables: { accountCode: "TECHCONF", eventCode: "ADC2025" },
        isPrimary: true,
        enabled: true,
        lastSyncedAt: null,
        syncStatus: "pending",
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    eventIntegrations.forEach(ei => this.eventIntegrations.set(ei.id, ei));

    // Demo badge templates for customer 1
    const defaultQrConfig = {
      embedType: 'externalId' as const,
      fields: ['externalId'],
      separator: '|',
      includeLabel: false,
    };
    const templates: BadgeTemplate[] = [
      {
        id: "tpl-1",
        customerId: "1",
        name: "VIP Badge",
        participantType: "VIP",
        participantTypes: ["VIP"],
        backgroundColor: "#1a1a2e",
        textColor: "#ffffff",
        accentColor: "#ffd700",
        width: 4,
        height: 3,
        includeQR: true,
        qrPosition: "bottom-right",
        qrCodeConfig: defaultQrConfig,
        fontFamily: "Arial",
        mergeFields: [
          { field: "firstName", label: "First Name", fontSize: 24, position: { x: 100, y: 100 }, align: "center" },
          { field: "lastName", label: "Last Name", fontSize: 24, position: { x: 100, y: 130 }, align: "center" },
        ],
        imageElements: [],
        createdAt: new Date(),
      },
      {
        id: "tpl-2",
        customerId: "1",
        name: "General Admission",
        participantType: "General",
        participantTypes: ["General"],
        backgroundColor: "#ffffff",
        textColor: "#333333",
        accentColor: "#0066cc",
        width: 4,
        height: 3,
        includeQR: true,
        qrPosition: "bottom-right",
        qrCodeConfig: { ...defaultQrConfig, embedType: 'simple' as const, fields: ['externalId', 'firstName', 'lastName'] },
        fontFamily: "Arial",
        mergeFields: [
          { field: "firstName", label: "First Name", fontSize: 20, position: { x: 100, y: 100 }, align: "center" },
          { field: "lastName", label: "Last Name", fontSize: 20, position: { x: 100, y: 125 }, align: "center" },
          { field: "company", label: "Company", fontSize: 14, position: { x: 100, y: 155 }, align: "center" },
        ],
        imageElements: [],
        createdAt: new Date(),
      },
    ];
    templates.forEach(t => this.badgeTemplates.set(t.id, t));

    // Demo attendees with external IDs for QR code testing
    const attendees: Attendee[] = [
      {
        id: "att-1",
        eventId: "evt-1",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        company: "TechCorp",
        title: "Senior Developer",
        participantType: "VIP",
        customFields: { department: "Engineering", badge_number: "VIP-001" },
        registrationStatus: "Registered",
        checkedIn: false,
        checkedInAt: null,
        badgePrinted: false,
        badgePrintedAt: null,
        externalId: "EXT-VIP-2025-001",
        createdAt: new Date(),
      },
      {
        id: "att-2",
        eventId: "evt-1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        company: "StartupXYZ",
        title: "Product Manager",
        participantType: "General",
        customFields: { department: "Product", badge_number: "GEN-002" },
        registrationStatus: "Attended",
        checkedIn: true,
        checkedInAt: new Date(),
        badgePrinted: true,
        badgePrintedAt: new Date(),
        externalId: "EXT-GEN-2025-002",
        createdAt: new Date(),
      },
      {
        id: "att-3",
        eventId: "evt-1",
        firstName: "Michael",
        lastName: "Johnson",
        email: "michael@speaker.com",
        company: "AI Research Labs",
        title: "Chief Scientist",
        participantType: "Speaker",
        customFields: { session: "Keynote", speaker_tier: "Platinum" },
        registrationStatus: "Registered",
        checkedIn: false,
        checkedInAt: null,
        badgePrinted: false,
        badgePrintedAt: null,
        externalId: "EXT-SPK-2025-003",
        createdAt: new Date(),
      },
      {
        id: "att-4",
        eventId: "evt-1",
        firstName: "Sarah",
        lastName: "Williams",
        email: "sarah@media.com",
        company: "Tech Media Group",
        title: "Senior Reporter",
        participantType: "Press",
        customFields: { outlet: "TechCrunch", press_pass: "PRESS-044" },
        registrationStatus: "Invited",
        checkedIn: false,
        checkedInAt: null,
        badgePrinted: false,
        badgePrintedAt: null,
        externalId: "EXT-PRS-2025-004",
        createdAt: new Date(),
      },
      {
        id: "att-5",
        eventId: "evt-1",
        firstName: "Robert",
        lastName: "Chen",
        email: "robert@sponsor.com",
        company: "CloudTech Solutions",
        title: "VP of Partnerships",
        participantType: "Sponsor",
        customFields: { sponsor_level: "Gold", booth_number: "A-15" },
        registrationStatus: "Registered",
        checkedIn: false,
        checkedInAt: null,
        badgePrinted: false,
        badgePrintedAt: null,
        externalId: "EXT-SPN-2025-005",
        createdAt: new Date(),
      },
    ];
    attendees.forEach(a => this.attendees.set(a.id, a));

    // Demo sessions for event 1
    const demoSessions: Session[] = [
      {
        id: "sess-1",
        eventId: "evt-1",
        name: "Keynote: Future of AI",
        description: "Opening keynote about artificial intelligence trends",
        location: "Main Hall A",
        startTime: new Date("2025-06-15T09:00:00"),
        endTime: new Date("2025-06-15T10:30:00"),
        capacity: 500,
        restrictToRegistered: false,
        allowWaitlist: true,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "sess-2",
        eventId: "evt-1",
        name: "Workshop: Building Modern Web Apps",
        description: "Hands-on workshop for web development",
        location: "Room 201",
        startTime: new Date("2025-06-15T11:00:00"),
        endTime: new Date("2025-06-15T12:30:00"),
        capacity: 50,
        restrictToRegistered: true,
        allowWaitlist: true,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "sess-3",
        eventId: "evt-1",
        name: "Networking Lunch",
        description: "Connect with fellow attendees",
        location: "Dining Hall",
        startTime: new Date("2025-06-15T12:30:00"),
        endTime: new Date("2025-06-15T14:00:00"),
        capacity: null,
        restrictToRegistered: false,
        allowWaitlist: false,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    demoSessions.forEach(s => this.sessions.set(s.id, s));

    // Demo session registrations
    const demoSessionRegs: SessionRegistration[] = [
      {
        id: "sreg-1",
        sessionId: "sess-1",
        attendeeId: "att-1",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-2",
        sessionId: "sess-1",
        attendeeId: "att-2",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-3",
        sessionId: "sess-1",
        attendeeId: "att-3",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-4",
        sessionId: "sess-2",
        attendeeId: "att-1",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-5",
        sessionId: "sess-2",
        attendeeId: "att-4",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-6",
        sessionId: "sess-3",
        attendeeId: "att-2",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
      {
        id: "sreg-7",
        sessionId: "sess-3",
        attendeeId: "att-5",
        status: "registered",
        waitlistPosition: null,
        registeredAt: new Date(),
        promotedAt: null,
        cancelledAt: null,
      },
    ];
    demoSessionRegs.forEach(r => this.sessionRegistrations.set(r.id, r));

    // Demo event badge template overrides - all participant types mapped to General Admission template (tpl-2)
    const demoOverrides: EventBadgeTemplateOverride[] = [
      {
        id: "override-1",
        eventId: "evt-1",
        participantType: "General",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-2",
        eventId: "evt-1",
        participantType: "VIP",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-3",
        eventId: "evt-1",
        participantType: "Speaker",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-4",
        eventId: "evt-1",
        participantType: "Sponsor",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-5",
        eventId: "evt-1",
        participantType: "Staff",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-6",
        eventId: "evt-1",
        participantType: "Press",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-7",
        eventId: "evt-1",
        participantType: "Media",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "override-8",
        eventId: "evt-1",
        participantType: "Exhibitor",
        badgeTemplateId: "tpl-2",
        priority: 0,
        effectiveFrom: null,
        effectiveUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    demoOverrides.forEach(o => this.eventBadgeTemplateOverrides.set(o.id, o));

    // Demo integration providers (catalog)
    // NOTE: Only showing Certain OAuth, Certain Basic, and Bearer Token for now
    // Other providers (Eventbrite, Cvent, RegFox, etc.) are commented out in shared/integration-providers.ts
    const providers: IntegrationProvider[] = [
      {
        id: "certain_oauth",
        name: "Certain (OAuth)",
        type: "event_registration",
        logoUrl: null,
        authType: "oauth2",
        oauth2Config: {
          authorizationUrl: "https://auth.certain.com/oauth/authorize",
          tokenUrl: "https://auth.certain.com/oauth/token",
          scope: "events:read registrations:read sessions:read",
          grantType: "authorization_code"
        },
        defaultBaseUrl: "",
        endpointTemplates: [
          { name: "Get Events", path: "/certainExternal/service/v1/Events", method: "GET", description: "Get all events" },
          { name: "Get Registrations", path: "/certainExternal/service/v1/Registration/{eventCode}", method: "GET", description: "Get event registrations" },
          { name: "Get Sessions", path: "/certainExternal/service/v1/Sessions/{eventCode}", method: "GET", description: "Get event sessions" }
        ],
        status: "active",
        createdAt: new Date(),
      },
      {
        id: "certain",
        name: "Certain (Basic)",
        type: "event_registration",
        logoUrl: null,
        authType: "basic",
        oauth2Config: null,
        defaultBaseUrl: "",
        endpointTemplates: [
          { name: "Get Events", path: "/certainExternal/service/v1/Events", method: "GET", description: "Get all events" },
          { name: "Get Registrations", path: "/certainExternal/service/v1/Registration/{eventCode}", method: "GET", description: "Get event registrations" },
          { name: "Get Sessions", path: "/certainExternal/service/v1/Sessions/{eventCode}", method: "GET", description: "Get event sessions" }
        ],
        status: "active",
        createdAt: new Date(),
      },
      {
        id: "bearer_token",
        name: "Bearer Token",
        type: "custom",
        logoUrl: null,
        authType: "bearer",
        oauth2Config: null,
        defaultBaseUrl: "",
        endpointTemplates: [
          { name: "List Events", path: "/events", method: "GET", description: "Get all events" },
          { name: "Get Attendees", path: "/events/{eventId}/attendees", method: "GET", description: "Get event attendees" },
          { name: "Get Sessions", path: "/events/{eventId}/sessions", method: "GET", description: "Get event sessions" }
        ],
        status: "active",
        createdAt: new Date(),
      },
    ];
    providers.forEach(p => this.integrationProviders.set(p.id, p));

    // Demo integration connections for existing integrations
    const connections: IntegrationConnection[] = [
      {
        id: "conn-1",
        integrationId: "int-1",
        authMethod: "oauth2",
        connectionStatus: "disconnected",
        oauth2State: null,
        pkceCodeVerifier: null,
        grantedScopes: null,
        lastValidatedAt: null,
        lastSuccessfulCallAt: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        lastErrorAt: null,
        connectedBy: null,
        connectedAt: null,
        disconnectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "conn-2",
        integrationId: "int-2",
        authMethod: "api_key",
        connectionStatus: "disconnected",
        oauth2State: null,
        pkceCodeVerifier: null,
        grantedScopes: null,
        lastValidatedAt: null,
        lastSuccessfulCallAt: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        lastErrorAt: null,
        connectedBy: null,
        connectedAt: null,
        disconnectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "conn-3",
        integrationId: "int-3",
        authMethod: "oauth2",
        connectionStatus: "disconnected",
        oauth2State: null,
        pkceCodeVerifier: null,
        grantedScopes: null,
        lastValidatedAt: null,
        lastSuccessfulCallAt: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        lastErrorAt: null,
        connectedBy: null,
        connectedAt: null,
        disconnectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    connections.forEach(c => this.integrationConnections.set(c.id, c));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.phoneNumber === phoneNumber,
    );
  }

  async getUsersByCustomer(customerId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (user) => user.customerId === customerId,
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      customerId: insertUser.customerId ?? null,
      email: insertUser.email,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      role: insertUser.role ?? "staff",
      isActive: insertUser.isActive ?? true,
      lastLoginAt: null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated: User = { 
      ...existing, 
      ...updates,
      customerId: updates.customerId !== undefined ? (updates.customerId ?? null) : existing.customerId,
    };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async updateLastLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLoginAt = new Date();
      this.users.set(id, user);
    }
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.passwordHash = passwordHash;
      this.users.set(id, user);
    }
  }

  private passwordResetTokens: Map<string, { userId: string; token: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number }> = new Map();

  async createPasswordResetToken(userId: string, expiresInHours: number = 48, resetCodeHash?: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    this.passwordResetTokens.set(token, { userId, token, expiresAt, usedAt: null, resetCodeHash: resetCodeHash || null, attempts: 0 });
    return { token, expiresAt };
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number } | undefined> {
    const data = this.passwordResetTokens.get(token);
    if (!data) return undefined;
    return { userId: data.userId, expiresAt: data.expiresAt, usedAt: data.usedAt, resetCodeHash: data.resetCodeHash, attempts: data.attempts };
  }

  async getPasswordResetTokenByUserId(userId: string): Promise<{ token: string; expiresAt: Date; usedAt: Date | null; resetCodeHash: string | null; attempts: number } | undefined> {
    for (const data of this.passwordResetTokens.values()) {
      if (data.userId === userId && !data.usedAt && data.expiresAt > new Date()) {
        return { token: data.token, expiresAt: data.expiresAt, usedAt: data.usedAt, resetCodeHash: data.resetCodeHash, attempts: data.attempts };
      }
    }
    return undefined;
  }

  async getPasswordResetTokensForUser(userId: string): Promise<{ token: string; expiresAt: Date; codeHash: string | null }[]> {
    const tokens: { token: string; expiresAt: Date; codeHash: string | null }[] = [];
    const now = new Date();
    for (const data of this.passwordResetTokens.values()) {
      if (data.userId === userId && !data.usedAt && data.expiresAt > now) {
        tokens.push({ token: data.token, expiresAt: data.expiresAt, codeHash: data.resetCodeHash });
      }
    }
    return tokens;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    this.passwordResetTokens.delete(token);
  }

  async incrementPasswordResetAttempts(token: string): Promise<number> {
    const data = this.passwordResetTokens.get(token);
    if (data) {
      data.attempts++;
      this.passwordResetTokens.set(token, data);
      return data.attempts;
    }
    return 0;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const data = this.passwordResetTokens.get(token);
    if (data) {
      data.usedAt = new Date();
      this.passwordResetTokens.set(token, data);
    }
  }

  async deleteExpiredPasswordResetTokens(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [token, data] of this.passwordResetTokens) {
      if (data.expiresAt < now || data.usedAt !== null) {
        this.passwordResetTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  async upsertUser(userData: { id: string; email?: string; firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }): Promise<User> {
    const existingUser = this.users.get(userData.id);
    if (existingUser) {
      const updatedUser: User = {
        ...existingUser,
        email: userData.email ?? existingUser.email,
        firstName: userData.firstName !== undefined ? userData.firstName : existingUser.firstName,
        lastName: userData.lastName !== undefined ? userData.lastName : existingUser.lastName,
        lastLoginAt: new Date(),
      };
      this.users.set(userData.id, updatedUser);
      return updatedUser;
    } else {
      // First user becomes super_admin, subsequent users are staff
      const isFirstUser = this.users.size === 0;
      const newUser: User = {
        id: userData.id,
        customerId: null,
        email: userData.email || `user-${userData.id}@replit.user`,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        role: isFirstUser ? "super_admin" : "staff",
        isActive: true,
        lastLoginAt: new Date(),
        createdAt: new Date(),
      };
      this.users.set(userData.id, newUser);
      return newUser;
    }
  }

  // Customer methods
  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const customer: Customer = {
      id,
      name: insertCustomer.name,
      contactEmail: insertCustomer.contactEmail,
      apiBaseUrl: insertCustomer.apiBaseUrl ?? null,
      status: insertCustomer.status ?? "active",
      createdAt: new Date(),
    };
    this.customers.set(id, customer);
    return customer;
  }

  async updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existing = this.customers.get(id);
    if (!existing) return undefined;
    const updated: Customer = { ...existing, ...updates };
    this.customers.set(id, updated);
    return updated;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    return this.customers.delete(id);
  }

  // Location methods (in-memory stub - real implementation in DatabaseStorage)
  async getLocations(customerId: string): Promise<Location[]> {
    return [];
  }

  async getLocation(id: string): Promise<Location | undefined> {
    return undefined;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    throw new Error("Not implemented in memory storage");
  }

  async updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined> {
    return undefined;
  }

  async deleteLocation(id: string): Promise<boolean> {
    return false;
  }

  async matchLocationByName(customerId: string, locationName: string): Promise<Location | undefined> {
    return undefined;
  }

  // Event methods
  async getAllEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  async getEvents(customerId: string): Promise<Event[]> {
    return Array.from(this.events.values()).filter(e => e.customerId === customerId);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getEventByExternalId(customerId: string, externalEventId: string): Promise<Event | undefined> {
    return Array.from(this.events.values()).find(
      e => e.customerId === customerId && e.externalEventId === externalEventId
    );
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = `evt-${randomUUID().substring(0, 8)}`;
    const event: Event = {
      id,
      customerId: insertEvent.customerId,
      name: insertEvent.name,
      eventDate: insertEvent.eventDate,
      selectedTemplates: insertEvent.selectedTemplates ?? [],
      selectedPrinterId: insertEvent.selectedPrinterId ?? null,
      integrationId: insertEvent.integrationId ?? null,
      externalEventId: insertEvent.externalEventId ?? null,
      defaultBadgeTemplateId: insertEvent.defaultBadgeTemplateId ?? null,
      printerSettings: (insertEvent.printerSettings ?? null) as Event['printerSettings'],
      staffSettings: (insertEvent.tempStaffSettings ?? null) as Event['staffSettings'],
      status: insertEvent.status ?? "upcoming",
      createdAt: new Date(),
    };
    this.events.set(id, event);
    return event;
  }

  async updateEvent(id: string, updates: Partial<InsertEvent>): Promise<Event | undefined> {
    const existing = this.events.get(id);
    if (!existing) return undefined;
    const updated: Event = { 
      ...existing, 
      ...updates,
      printerSettings: (updates.printerSettings !== undefined ? updates.printerSettings : existing.printerSettings) as Event['printerSettings'],
      staffSettings: (updates.tempStaffSettings !== undefined ? updates.tempStaffSettings : existing.tempStaffSettings) as Event['staffSettings'],
    };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    return this.events.delete(id);
  }

  async upsertEventFromSync(
    customerId: string, 
    integrationId: string, 
    eventData: { externalEventId: string; name: string; eventDate: Date; startDate?: Date | null; endDate?: Date | null; accountCode?: string | null; eventCode?: string | null; timezone?: string | null; status?: string }
  ): Promise<{ event: Event; created: boolean }> {
    const existing = await this.getEventByExternalId(customerId, eventData.externalEventId);
    
    if (existing) {
      const updated = await this.updateEvent(existing.id, {
        name: eventData.name,
        eventDate: eventData.eventDate,
        startDate: eventData.startDate ?? existing.startDate,
        endDate: eventData.endDate ?? existing.endDate,
        accountCode: eventData.accountCode ?? existing.accountCode,
        eventCode: eventData.eventCode ?? existing.eventCode,
        timezone: eventData.timezone ?? existing.timezone,
        status: eventData.status || existing.status,
      });
      return { event: updated!, created: false };
    }
    
    const created = await this.createEvent({
      customerId,
      name: eventData.name,
      eventDate: eventData.eventDate,
      startDate: eventData.startDate ?? null,
      endDate: eventData.endDate ?? null,
      accountCode: eventData.accountCode ?? null,
      eventCode: eventData.eventCode ?? null,
      timezone: eventData.timezone ?? null,
      integrationId,
      externalEventId: eventData.externalEventId,
      status: eventData.status || 'upcoming',
    });
    return { event: created, created: true };
  }

  // Badge template methods
  async getBadgeTemplates(customerId: string): Promise<BadgeTemplate[]> {
    return Array.from(this.badgeTemplates.values()).filter(t => t.customerId === customerId);
  }

  async getBadgeTemplate(id: string): Promise<BadgeTemplate | undefined> {
    return this.badgeTemplates.get(id);
  }

  async createBadgeTemplate(insertTemplate: InsertBadgeTemplate): Promise<BadgeTemplate> {
    const id = `tpl-${randomUUID().substring(0, 8)}`;
    const defaultQrConfig: BadgeTemplate['qrCodeConfig'] = {
      embedType: 'externalId',
      fields: ['externalId'],
      separator: '|',
      includeLabel: false,
    };
    const template: BadgeTemplate = {
      id,
      customerId: insertTemplate.customerId,
      name: insertTemplate.name,
      participantType: insertTemplate.participantType,
      participantTypes: (insertTemplate.participantTypes ?? [insertTemplate.participantType]) as string[],
      backgroundColor: insertTemplate.backgroundColor,
      textColor: insertTemplate.textColor,
      accentColor: insertTemplate.accentColor,
      width: insertTemplate.width ?? 4,
      height: insertTemplate.height ?? 3,
      includeQR: insertTemplate.includeQR ?? true,
      qrPosition: insertTemplate.qrPosition ?? "bottom-right",
      qrCodeConfig: (insertTemplate.qrCodeConfig ?? defaultQrConfig) as BadgeTemplate['qrCodeConfig'],
      fontFamily: insertTemplate.fontFamily ?? "Arial",
      mergeFields: (insertTemplate.mergeFields ?? []) as BadgeTemplate['mergeFields'],
      imageElements: (insertTemplate.imageElements ?? []) as BadgeTemplate['imageElements'],
      createdAt: new Date(),
    };
    this.badgeTemplates.set(id, template);
    return template;
  }

  async updateBadgeTemplate(id: string, updates: Partial<InsertBadgeTemplate>): Promise<BadgeTemplate | undefined> {
    const existing = this.badgeTemplates.get(id);
    if (!existing) return undefined;
    const updated: BadgeTemplate = { 
      ...existing, 
      ...updates,
      participantTypes: (updates.participantTypes !== undefined ? updates.participantTypes : existing.participantTypes) as string[] | null,
      qrCodeConfig: (updates.qrCodeConfig !== undefined ? updates.qrCodeConfig : existing.qrCodeConfig) as BadgeTemplate['qrCodeConfig'],
      mergeFields: (updates.mergeFields !== undefined ? updates.mergeFields : existing.mergeFields) as BadgeTemplate['mergeFields'],
      imageElements: (updates.imageElements !== undefined ? updates.imageElements : existing.imageElements) as BadgeTemplate['imageElements'],
    };
    this.badgeTemplates.set(id, updated);
    return updated;
  }

  async deleteBadgeTemplate(id: string): Promise<boolean> {
    return this.badgeTemplates.delete(id);
  }

  // Event configuration template methods
  private eventConfigurationTemplates = new Map<string, EventConfigurationTemplate>();

  async getEventConfigurationTemplates(customerId: string): Promise<EventConfigurationTemplate[]> {
    return Array.from(this.eventConfigurationTemplates.values()).filter(t => t.customerId === customerId);
  }

  async getEventConfigurationTemplate(id: string): Promise<EventConfigurationTemplate | undefined> {
    return this.eventConfigurationTemplates.get(id);
  }

  async getDefaultEventConfigurationTemplate(customerId: string): Promise<EventConfigurationTemplate | undefined> {
    return Array.from(this.eventConfigurationTemplates.values()).find(t => t.customerId === customerId && t.isDefault);
  }

  async createEventConfigurationTemplate(insertTemplate: InsertEventConfigurationTemplate): Promise<EventConfigurationTemplate> {
    const id = `ect-${randomUUID().substring(0, 8)}`;
    const template: EventConfigurationTemplate = {
      ...insertTemplate,
      id,
      description: insertTemplate.description ?? null,
      defaultBadgeTemplateId: insertTemplate.defaultBadgeTemplateId ?? null,
      badgeTemplateOverrides: insertTemplate.badgeTemplateOverrides ?? null,
      defaultPrinterId: insertTemplate.defaultPrinterId ?? null,
      staffSettings: insertTemplate.staffSettings ?? null,
      workflowSnapshot: insertTemplate.workflowSnapshot ?? null,
      isDefault: insertTemplate.isDefault ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventConfigurationTemplates.set(id, template);
    return template;
  }

  async updateEventConfigurationTemplate(id: string, updates: Partial<InsertEventConfigurationTemplate>): Promise<EventConfigurationTemplate | undefined> {
    const existing = this.eventConfigurationTemplates.get(id);
    if (!existing) return undefined;
    const updated: EventConfigurationTemplate = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.eventConfigurationTemplates.set(id, updated);
    return updated;
  }

  async deleteEventConfigurationTemplate(id: string): Promise<boolean> {
    return this.eventConfigurationTemplates.delete(id);
  }

  // Customer integration methods
  async getCustomerIntegrations(customerId: string): Promise<CustomerIntegration[]> {
    return Array.from(this.customerIntegrations.values()).filter(i => i.customerId === customerId);
  }

  async getCustomerIntegration(id: string): Promise<CustomerIntegration | undefined> {
    return this.customerIntegrations.get(id);
  }

  async createCustomerIntegration(insertIntegration: InsertCustomerIntegration): Promise<CustomerIntegration> {
    const id = `int-${randomUUID().substring(0, 8)}`;
    const integration: CustomerIntegration = {
      id,
      customerId: insertIntegration.customerId,
      providerId: insertIntegration.providerId,
      name: insertIntegration.name,
      baseUrl: insertIntegration.baseUrl,
      authType: insertIntegration.authType,
      credentialsRef: insertIntegration.credentialsRef ?? null,
      oauth2ProfileId: insertIntegration.oauth2ProfileId ?? null,
      rateLimitPolicy: (insertIntegration.rateLimitPolicy ?? null) as CustomerIntegration['rateLimitPolicy'],
      endpoints: (insertIntegration.endpoints ?? []) as CustomerIntegration['endpoints'],
      status: insertIntegration.status ?? "active",
      lastSync: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.customerIntegrations.set(id, integration);
    return integration;
  }

  async updateCustomerIntegration(id: string, updates: Partial<InsertCustomerIntegration>): Promise<CustomerIntegration | undefined> {
    const existing = this.customerIntegrations.get(id);
    if (!existing) return undefined;
    const updated: CustomerIntegration = { 
      ...existing, 
      ...updates, 
      rateLimitPolicy: (updates.rateLimitPolicy !== undefined ? updates.rateLimitPolicy : existing.rateLimitPolicy) as CustomerIntegration['rateLimitPolicy'],
      endpoints: (updates.endpoints !== undefined ? updates.endpoints : existing.endpoints) as CustomerIntegration['endpoints'],
      updatedAt: new Date() 
    };
    this.customerIntegrations.set(id, updated);
    return updated;
  }

  async deleteCustomerIntegration(id: string): Promise<boolean> {
    return this.customerIntegrations.delete(id);
  }

  // Sync logs methods
  async getSyncLogs(integrationId: string, limit: number = 50): Promise<SyncLog[]> {
    return Array.from(this.syncLogs.values())
      .filter(log => log.integrationId === integrationId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  async getSyncLogsByCustomer(customerId: string, limit: number = 50): Promise<SyncLog[]> {
    return Array.from(this.syncLogs.values())
      .filter(log => log.customerId === customerId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const id = `synclog-${randomUUID().substring(0, 8)}`;
    const syncLog: SyncLog = {
      id,
      integrationId: log.integrationId,
      customerId: log.customerId,
      syncType: log.syncType,
      status: log.status,
      processedCount: log.processedCount ?? 0,
      createdCount: log.createdCount ?? 0,
      updatedCount: log.updatedCount ?? 0,
      skippedCount: log.skippedCount ?? 0,
      errorCount: log.errorCount ?? 0,
      errors: log.errors ?? null,
      apiResponseSummary: log.apiResponseSummary ?? null,
      durationMs: log.durationMs ?? null,
      startedAt: log.startedAt ?? new Date(),
      completedAt: log.completedAt ?? null,
    };
    this.syncLogs.set(id, syncLog);
    return syncLog;
  }

  async updateSyncLog(id: string, updates: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const existing = this.syncLogs.get(id);
    if (!existing) return undefined;
    const updated: SyncLog = { ...existing, ...updates };
    this.syncLogs.set(id, updated);
    return updated;
  }

  // Event integration methods (links events to account integrations)
  async getEventIntegrations(eventId: string): Promise<EventIntegration[]> {
    return Array.from(this.eventIntegrations.values()).filter(ei => ei.eventId === eventId);
  }

  async getEventIntegration(id: string): Promise<EventIntegration | undefined> {
    return this.eventIntegrations.get(id);
  }

  async createEventIntegration(insertEventIntegration: InsertEventIntegration): Promise<EventIntegration> {
    const id = `evtint-${randomUUID().substring(0, 8)}`;
    const eventIntegration: EventIntegration = {
      id,
      eventId: insertEventIntegration.eventId,
      integrationId: insertEventIntegration.integrationId,
      variables: (insertEventIntegration.variables ?? {}) as Record<string, string>,
      isPrimary: insertEventIntegration.isPrimary ?? false,
      enabled: insertEventIntegration.enabled ?? true,
      lastSyncedAt: null,
      syncStatus: insertEventIntegration.syncStatus ?? "pending",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventIntegrations.set(id, eventIntegration);
    return eventIntegration;
  }

  async updateEventIntegration(id: string, updates: Partial<InsertEventIntegration>): Promise<EventIntegration | undefined> {
    const existing = this.eventIntegrations.get(id);
    if (!existing) return undefined;
    const updated: EventIntegration = { 
      ...existing, 
      ...updates,
      variables: (updates.variables !== undefined ? updates.variables : existing.variables) as Record<string, string>,
      updatedAt: new Date() 
    };
    this.eventIntegrations.set(id, updated);
    return updated;
  }

  async deleteEventIntegration(id: string): Promise<boolean> {
    return this.eventIntegrations.delete(id);
  }

  // Attendee methods
  async getAttendees(eventId: string): Promise<Attendee[]> {
    return Array.from(this.attendees.values()).filter(a => a.eventId === eventId);
  }

  async getAttendeesByCustomer(customerId: string): Promise<Attendee[]> {
    const customerEvents = Array.from(this.events.values())
      .filter(e => e.customerId === customerId)
      .map(e => e.id);
    return Array.from(this.attendees.values())
      .filter(a => customerEvents.includes(a.eventId));
  }

  async getAttendee(id: string): Promise<Attendee | undefined> {
    return this.attendees.get(id);
  }

  async getDistinctParticipantTypes(eventId: string): Promise<string[]> {
    const attendees = Array.from(this.attendees.values()).filter(a => a.eventId === eventId);
    const types = new Set(attendees.map(a => a.participantType).filter(Boolean));
    return Array.from(types).sort();
  }

  async createAttendee(insertAttendee: InsertAttendee): Promise<Attendee> {
    const id = `att-${randomUUID().substring(0, 8)}`;
    const attendee: Attendee = {
      id,
      eventId: insertAttendee.eventId,
      firstName: insertAttendee.firstName,
      lastName: insertAttendee.lastName,
      email: insertAttendee.email,
      company: insertAttendee.company ?? null,
      title: insertAttendee.title ?? null,
      participantType: insertAttendee.participantType,
      customFields: insertAttendee.customFields ?? null,
      registrationStatus: (insertAttendee.registrationStatus as "Invited" | "Registered" | "Attended") ?? "Registered",
      checkedIn: false,
      checkedInAt: null,
      badgePrinted: false,
      badgePrintedAt: null,
      externalId: insertAttendee.externalId ?? null,
      createdAt: new Date(),
    };
    this.attendees.set(id, attendee);
    return attendee;
  }

  async updateAttendee(id: string, updates: Partial<InsertAttendee>): Promise<Attendee | undefined> {
    const existing = this.attendees.get(id);
    if (!existing) return undefined;
    const updated: Attendee = { ...existing, ...updates };
    this.attendees.set(id, updated);
    return updated;
  }

  async deleteAttendee(id: string): Promise<boolean> {
    return this.attendees.delete(id);
  }

  // Printer methods
  async getPrinters(customerId: string): Promise<Printer[]> {
    return Array.from(this.printers.values()).filter(
      (printer) => printer.customerId === customerId
    );
  }

  async getPrinter(id: string): Promise<Printer | undefined> {
    return this.printers.get(id);
  }

  async createPrinter(insertPrinter: InsertPrinter): Promise<Printer> {
    const id = randomUUID();
    const printer: Printer = {
      id,
      customerId: insertPrinter.customerId,
      name: insertPrinter.name,
      connectionType: insertPrinter.connectionType,
      ipAddress: insertPrinter.ipAddress ?? null,
      port: insertPrinter.port ?? null,
      bluetoothDeviceId: insertPrinter.bluetoothDeviceId ?? null,
      bluetoothName: insertPrinter.bluetoothName ?? null,
      supportedSizes: (insertPrinter.supportedSizes ?? null) as { width: number; height: number; }[] | null,
      maxWidth: insertPrinter.maxWidth ?? null,
      maxHeight: insertPrinter.maxHeight ?? null,
      dpi: insertPrinter.dpi ?? null,
      isDefault: insertPrinter.isDefault ?? false,
      isActive: insertPrinter.isActive ?? true,
      lastUsed: null,
      createdAt: new Date(),
    };
    this.printers.set(id, printer);
    return printer;
  }

  async updatePrinter(id: string, updates: Partial<InsertPrinter>): Promise<Printer | undefined> {
    const existing = this.printers.get(id);
    if (!existing) return undefined;

    const updated: Printer = {
      ...existing,
      ...updates,
      supportedSizes: (updates.supportedSizes !== undefined ? updates.supportedSizes : existing.supportedSizes) as { width: number; height: number; }[] | null,
    };
    this.printers.set(id, updated);
    return updated;
  }

  async deletePrinter(id: string): Promise<boolean> {
    return this.printers.delete(id);
  }

  // Integration connection methods
  async getIntegrationConnections(integrationId: string): Promise<IntegrationConnection[]> {
    return Array.from(this.integrationConnections.values()).filter(c => c.integrationId === integrationId);
  }

  async getIntegrationConnection(id: string): Promise<IntegrationConnection | undefined> {
    return this.integrationConnections.get(id);
  }

  async getIntegrationConnectionByIntegration(integrationId: string): Promise<IntegrationConnection | undefined> {
    return Array.from(this.integrationConnections.values()).find(c => c.integrationId === integrationId);
  }

  async createIntegrationConnection(insertConnection: InsertIntegrationConnection): Promise<IntegrationConnection> {
    const id = `conn-${randomUUID().substring(0, 8)}`;
    const connection: IntegrationConnection = {
      id,
      integrationId: insertConnection.integrationId,
      authMethod: insertConnection.authMethod,
      connectionStatus: insertConnection.connectionStatus ?? "disconnected",
      oauth2State: insertConnection.oauth2State ?? null,
      pkceCodeVerifier: insertConnection.pkceCodeVerifier ?? null,
      grantedScopes: insertConnection.grantedScopes ?? null,
      lastValidatedAt: insertConnection.lastValidatedAt ?? null,
      lastSuccessfulCallAt: insertConnection.lastSuccessfulCallAt ?? null,
      consecutiveFailures: insertConnection.consecutiveFailures ?? 0,
      lastErrorMessage: insertConnection.lastErrorMessage ?? null,
      lastErrorAt: insertConnection.lastErrorAt ?? null,
      connectedBy: insertConnection.connectedBy ?? null,
      connectedAt: insertConnection.connectedAt ?? null,
      disconnectedAt: insertConnection.disconnectedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.integrationConnections.set(id, connection);
    return connection;
  }

  async updateIntegrationConnection(id: string, updates: Partial<InsertIntegrationConnection>): Promise<IntegrationConnection | undefined> {
    const existing = this.integrationConnections.get(id);
    if (!existing) return undefined;
    const updated: IntegrationConnection = { 
      ...existing, 
      ...updates,
      updatedAt: new Date() 
    };
    this.integrationConnections.set(id, updated);
    return updated;
  }

  async deleteIntegrationConnection(id: string): Promise<boolean> {
    return this.integrationConnections.delete(id);
  }

  // Stored credentials methods (internal use only)
  async getStoredCredentials(connectionId: string): Promise<StoredCredential[]> {
    return Array.from(this.storedCredentials.values()).filter(c => c.connectionId === connectionId);
  }

  async getStoredCredential(id: string): Promise<StoredCredential | undefined> {
    return this.storedCredentials.get(id);
  }

  async getStoredCredentialByType(connectionId: string, credentialType: string): Promise<StoredCredential | undefined> {
    return Array.from(this.storedCredentials.values()).find(
      c => c.connectionId === connectionId && c.credentialType === credentialType && c.isValid
    );
  }

  async createStoredCredential(insertCredential: InsertStoredCredential): Promise<StoredCredential> {
    const id = `cred-${randomUUID().substring(0, 8)}`;
    const credential: StoredCredential = {
      id,
      connectionId: insertCredential.connectionId,
      credentialType: insertCredential.credentialType,
      encryptedValue: insertCredential.encryptedValue,
      encryptionKeyId: insertCredential.encryptionKeyId,
      iv: insertCredential.iv,
      authTag: insertCredential.authTag,
      maskedValue: insertCredential.maskedValue ?? null,
      tokenType: insertCredential.tokenType ?? null,
      scope: insertCredential.scope ?? null,
      issuedAt: insertCredential.issuedAt ?? null,
      expiresAt: insertCredential.expiresAt ?? null,
      isValid: insertCredential.isValid ?? true,
      invalidatedAt: insertCredential.invalidatedAt ?? null,
      invalidationReason: insertCredential.invalidationReason ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.storedCredentials.set(id, credential);
    return credential;
  }

  async updateStoredCredential(id: string, updates: Partial<InsertStoredCredential>): Promise<StoredCredential | undefined> {
    const existing = this.storedCredentials.get(id);
    if (!existing) return undefined;
    const updated: StoredCredential = { 
      ...existing, 
      ...updates,
      updatedAt: new Date() 
    };
    this.storedCredentials.set(id, updated);
    return updated;
  }

  async deleteStoredCredential(id: string): Promise<boolean> {
    return this.storedCredentials.delete(id);
  }

  async deleteStoredCredentialsByConnection(connectionId: string): Promise<boolean> {
    const toDelete = Array.from(this.storedCredentials.values())
      .filter(c => c.connectionId === connectionId)
      .map(c => c.id);
    toDelete.forEach(id => this.storedCredentials.delete(id));
    return true;
  }

  // Integration providers catalog methods
  async getIntegrationProviders(): Promise<IntegrationProvider[]> {
    return Array.from(this.integrationProviders.values());
  }

  async getIntegrationProvider(id: string): Promise<IntegrationProvider | undefined> {
    return this.integrationProviders.get(id);
  }

  // Session methods
  async getSessions(eventId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(s => s.eventId === eventId);
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = `sess-${randomUUID().substring(0, 8)}`;
    const session: Session = {
      id,
      eventId: insertSession.eventId,
      name: insertSession.name,
      description: insertSession.description ?? null,
      location: insertSession.location ?? null,
      startTime: insertSession.startTime ?? null,
      endTime: insertSession.endTime ?? null,
      capacity: insertSession.capacity ?? null,
      restrictToRegistered: insertSession.restrictToRegistered ?? false,
      allowWaitlist: insertSession.allowWaitlist ?? true,
      status: insertSession.status ?? "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined> {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;
    const updated: Session = { 
      ...existing, 
      ...updates,
      updatedAt: new Date() 
    };
    this.sessions.set(id, updated);
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  // Session registration methods
  async getSessionRegistrations(sessionId: string): Promise<SessionRegistration[]> {
    return Array.from(this.sessionRegistrations.values()).filter(r => r.sessionId === sessionId);
  }

  async getSessionRegistration(id: string): Promise<SessionRegistration | undefined> {
    return this.sessionRegistrations.get(id);
  }

  async getSessionRegistrationByAttendee(sessionId: string, attendeeId: string): Promise<SessionRegistration | undefined> {
    return Array.from(this.sessionRegistrations.values()).find(
      r => r.sessionId === sessionId && r.attendeeId === attendeeId
    );
  }

  async getSessionRegistrationsByAttendee(attendeeId: string): Promise<SessionRegistration[]> {
    return Array.from(this.sessionRegistrations.values()).filter(r => r.attendeeId === attendeeId);
  }

  async createSessionRegistration(insertRegistration: InsertSessionRegistration): Promise<SessionRegistration> {
    const id = `sreg-${randomUUID().substring(0, 8)}`;
    const registration: SessionRegistration = {
      id,
      sessionId: insertRegistration.sessionId,
      attendeeId: insertRegistration.attendeeId,
      status: insertRegistration.status ?? "registered",
      waitlistPosition: insertRegistration.waitlistPosition ?? null,
      registeredAt: new Date(),
      promotedAt: null,
      cancelledAt: null,
    };
    this.sessionRegistrations.set(id, registration);
    return registration;
  }

  async updateSessionRegistration(id: string, updates: Partial<InsertSessionRegistration>): Promise<SessionRegistration | undefined> {
    const existing = this.sessionRegistrations.get(id);
    if (!existing) return undefined;
    const updated: SessionRegistration = { ...existing, ...updates };
    this.sessionRegistrations.set(id, updated);
    return updated;
  }

  async deleteSessionRegistration(id: string): Promise<boolean> {
    return this.sessionRegistrations.delete(id);
  }

  async getSessionRegistrationCount(sessionId: string, status: string): Promise<number> {
    return Array.from(this.sessionRegistrations.values()).filter(
      r => r.sessionId === sessionId && r.status === status
    ).length;
  }

  async getNextWaitlistPosition(sessionId: string): Promise<number> {
    const waitlisted = Array.from(this.sessionRegistrations.values())
      .filter(r => r.sessionId === sessionId && r.status === "waitlisted")
      .map(r => r.waitlistPosition ?? 0);
    return waitlisted.length > 0 ? Math.max(...waitlisted) + 1 : 1;
  }

  async promoteFromWaitlist(sessionId: string): Promise<SessionRegistration | undefined> {
    const waitlisted = Array.from(this.sessionRegistrations.values())
      .filter(r => r.sessionId === sessionId && r.status === "waitlisted")
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
    
    if (waitlisted.length === 0) return undefined;
    
    const toPromote = waitlisted[0];
    const updated: SessionRegistration = {
      ...toPromote,
      status: "registered",
      waitlistPosition: null,
      promotedAt: new Date(),
    };
    this.sessionRegistrations.set(toPromote.id, updated);
    return updated;
  }

  // Session check-in methods
  async getSessionCheckins(sessionId: string): Promise<SessionCheckin[]> {
    return Array.from(this.sessionCheckins.values()).filter(c => c.sessionId === sessionId);
  }

  async getSessionCheckinsByAttendee(attendeeId: string): Promise<SessionCheckin[]> {
    return Array.from(this.sessionCheckins.values()).filter(c => c.attendeeId === attendeeId);
  }

  async getSessionCheckinsByEvent(eventId: string): Promise<SessionCheckin[]> {
    // Get all sessions for the event
    const eventSessions = await this.getSessions(eventId);
    const sessionIds = new Set(eventSessions.map(s => s.id));
    return Array.from(this.sessionCheckins.values()).filter(c => sessionIds.has(c.sessionId));
  }

  async getLatestSessionCheckin(sessionId: string, attendeeId: string): Promise<SessionCheckin | undefined> {
    const checkins = Array.from(this.sessionCheckins.values())
      .filter(c => c.sessionId === sessionId && c.attendeeId === attendeeId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return checkins[0];
  }

  async createSessionCheckin(insertCheckin: InsertSessionCheckin): Promise<SessionCheckin> {
    const id = `schk-${randomUUID().substring(0, 8)}`;
    const checkin: SessionCheckin = {
      id,
      sessionId: insertCheckin.sessionId,
      attendeeId: insertCheckin.attendeeId,
      action: insertCheckin.action,
      timestamp: new Date(),
      source: insertCheckin.source ?? "kiosk",
      checkedInBy: insertCheckin.checkedInBy ?? null,
    };
    this.sessionCheckins.set(id, checkin);
    return checkin;
  }

  async isAttendeeCheckedIntoSession(sessionId: string, attendeeId: string): Promise<boolean> {
    const latest = await this.getLatestSessionCheckin(sessionId, attendeeId);
    return latest?.action === "checkin";
  }

  // Integration Endpoint Configurations
  async getIntegrationEndpointConfigs(integrationId: string): Promise<IntegrationEndpointConfig[]> {
    return Array.from(this.integrationEndpointConfigs.values()).filter(c => c.integrationId === integrationId);
  }

  async getIntegrationEndpointConfig(integrationId: string, dataType: string): Promise<IntegrationEndpointConfig | undefined> {
    return Array.from(this.integrationEndpointConfigs.values()).find(c => c.integrationId === integrationId && c.dataType === dataType);
  }

  async getIntegrationEndpointConfigById(id: string): Promise<IntegrationEndpointConfig | undefined> {
    return this.integrationEndpointConfigs.get(id);
  }

  async createIntegrationEndpointConfig(insertConfig: InsertIntegrationEndpointConfig): Promise<IntegrationEndpointConfig> {
    const id = `epc-${randomUUID().substring(0, 8)}`;
    const config: IntegrationEndpointConfig = {
      id,
      integrationId: insertConfig.integrationId,
      dataType: insertConfig.dataType,
      enabled: insertConfig.enabled ?? true,
      pathOverride: insertConfig.pathOverride ?? null,
      variableOverrides: (insertConfig.variableOverrides ?? null) as IntegrationEndpointConfig['variableOverrides'],
      filterDefaults: (insertConfig.filterDefaults ?? null) as IntegrationEndpointConfig['filterDefaults'],
      headerOverrides: (insertConfig.headerOverrides ?? null) as IntegrationEndpointConfig['headerOverrides'],
      fieldMappingOverrides: (insertConfig.fieldMappingOverrides ?? null) as IntegrationEndpointConfig['fieldMappingOverrides'],
      paginationOverrides: (insertConfig.paginationOverrides ?? null) as IntegrationEndpointConfig['paginationOverrides'],
      syncIntervalSeconds: insertConfig.syncIntervalSeconds ?? 3600,
      syncMinIntervalSeconds: insertConfig.syncMinIntervalSeconds ?? 60,
      syncMaxIntervalSeconds: insertConfig.syncMaxIntervalSeconds ?? 86400,
      syncWindowStart: insertConfig.syncWindowStart ?? null,
      syncWindowEnd: insertConfig.syncWindowEnd ?? null,
      syncEnabled: insertConfig.syncEnabled ?? true,
      lastSyncAt: null,
      nextSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncCount: null,
      runOnCheckInRequest: insertConfig.runOnCheckInRequest ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.integrationEndpointConfigs.set(id, config);
    return config;
  }

  async updateIntegrationEndpointConfig(id: string, updates: Partial<InsertIntegrationEndpointConfig>): Promise<IntegrationEndpointConfig | undefined> {
    const existing = this.integrationEndpointConfigs.get(id);
    if (!existing) return undefined;
    const updated: IntegrationEndpointConfig = {
      ...existing,
      ...updates,
      variableOverrides: (updates.variableOverrides !== undefined ? updates.variableOverrides : existing.variableOverrides) as IntegrationEndpointConfig['variableOverrides'],
      filterDefaults: (updates.filterDefaults !== undefined ? updates.filterDefaults : existing.filterDefaults) as IntegrationEndpointConfig['filterDefaults'],
      headerOverrides: (updates.headerOverrides !== undefined ? updates.headerOverrides : existing.headerOverrides) as IntegrationEndpointConfig['headerOverrides'],
      fieldMappingOverrides: (updates.fieldMappingOverrides !== undefined ? updates.fieldMappingOverrides : existing.fieldMappingOverrides) as IntegrationEndpointConfig['fieldMappingOverrides'],
      paginationOverrides: (updates.paginationOverrides !== undefined ? updates.paginationOverrides : existing.paginationOverrides) as IntegrationEndpointConfig['paginationOverrides'],
      updatedAt: new Date(),
    };
    this.integrationEndpointConfigs.set(id, updated);
    return updated;
  }

  async deleteIntegrationEndpointConfig(id: string): Promise<boolean> {
    return this.integrationEndpointConfigs.delete(id);
  }

  // Event Code Mappings
  async getEventCodeMappings(integrationId: string): Promise<EventCodeMapping[]> {
    return Array.from(this.eventCodeMappings.values()).filter(m => m.integrationId === integrationId);
  }

  async getEventCodeMapping(id: string): Promise<EventCodeMapping | undefined> {
    return this.eventCodeMappings.get(id);
  }

  async getEventCodeMappingByExternalId(integrationId: string, externalEventId: string): Promise<EventCodeMapping | undefined> {
    return Array.from(this.eventCodeMappings.values()).find(m => m.integrationId === integrationId && m.externalEventId === externalEventId);
  }

  async createEventCodeMapping(insertMapping: InsertEventCodeMapping): Promise<EventCodeMapping> {
    const id = `ecm-${randomUUID().substring(0, 8)}`;
    const mapping: EventCodeMapping = {
      id,
      eventId: insertMapping.eventId,
      integrationId: insertMapping.integrationId,
      externalEventId: insertMapping.externalEventId,
      externalEventCode: insertMapping.externalEventCode ?? null,
      externalEventName: insertMapping.externalEventName ?? null,
      syncCursor: insertMapping.syncCursor ?? null,
      lastSyncedAt: null,
      totalAttendeesCount: insertMapping.totalAttendeesCount ?? null,
      syncedAttendeesCount: insertMapping.syncedAttendeesCount ?? 0,
      fieldMapping: (insertMapping.fieldMapping ?? null) as EventCodeMapping['fieldMapping'],
      status: insertMapping.status ?? "pending",
      lastError: insertMapping.lastError ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventCodeMappings.set(id, mapping);
    return mapping;
  }

  async updateEventCodeMapping(id: string, updates: Partial<InsertEventCodeMapping>): Promise<EventCodeMapping | undefined> {
    const existing = this.eventCodeMappings.get(id);
    if (!existing) return undefined;
    const updated: EventCodeMapping = {
      ...existing,
      ...updates,
      fieldMapping: (updates.fieldMapping !== undefined ? updates.fieldMapping : existing.fieldMapping) as EventCodeMapping['fieldMapping'],
      updatedAt: new Date(),
    };
    this.eventCodeMappings.set(id, updated);
    return updated;
  }

  async deleteEventCodeMapping(id: string): Promise<boolean> {
    return this.eventCodeMappings.delete(id);
  }

  // Session Code Mappings
  async getSessionCodeMappings(eventCodeMappingId: string): Promise<SessionCodeMapping[]> {
    return Array.from(this.sessionCodeMappings.values()).filter(m => m.eventCodeMappingId === eventCodeMappingId);
  }

  async getSessionCodeMapping(id: string): Promise<SessionCodeMapping | undefined> {
    return this.sessionCodeMappings.get(id);
  }

  async createSessionCodeMapping(insertMapping: InsertSessionCodeMapping): Promise<SessionCodeMapping> {
    const id = `scm-${randomUUID().substring(0, 8)}`;
    const mapping: SessionCodeMapping = {
      id,
      sessionId: insertMapping.sessionId,
      eventCodeMappingId: insertMapping.eventCodeMappingId,
      integrationId: insertMapping.integrationId,
      externalSessionId: insertMapping.externalSessionId,
      externalSessionCode: insertMapping.externalSessionCode ?? null,
      externalSessionName: insertMapping.externalSessionName ?? null,
      fieldMapping: (insertMapping.fieldMapping ?? null) as SessionCodeMapping['fieldMapping'],
      lastSyncedAt: null,
      status: insertMapping.status ?? "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessionCodeMappings.set(id, mapping);
    return mapping;
  }

  async updateSessionCodeMapping(id: string, updates: Partial<InsertSessionCodeMapping>): Promise<SessionCodeMapping | undefined> {
    const existing = this.sessionCodeMappings.get(id);
    if (!existing) return undefined;
    const updated: SessionCodeMapping = {
      ...existing,
      ...updates,
      fieldMapping: (updates.fieldMapping !== undefined ? updates.fieldMapping : existing.fieldMapping) as SessionCodeMapping['fieldMapping'],
      updatedAt: new Date(),
    };
    this.sessionCodeMappings.set(id, updated);
    return updated;
  }

  async deleteSessionCodeMapping(id: string): Promise<boolean> {
    return this.sessionCodeMappings.delete(id);
  }

  // Custom fonts management
  async getCustomFonts(customerId: string): Promise<CustomFont[]> {
    return Array.from(this.customFonts.values())
      .filter(f => f.customerId === customerId && f.isActive);
  }

  async getCustomFont(id: string): Promise<CustomFont | undefined> {
    return this.customFonts.get(id);
  }

  async createCustomFont(insertFont: InsertCustomFont): Promise<CustomFont> {
    const id = `font-${randomUUID().substring(0, 8)}`;
    const font: CustomFont = {
      id,
      customerId: insertFont.customerId,
      displayName: insertFont.displayName,
      fontFamily: insertFont.fontFamily,
      fontWeight: insertFont.fontWeight ?? "400",
      fontStyle: insertFont.fontStyle ?? "normal",
      mimeType: insertFont.mimeType,
      fileSize: insertFont.fileSize,
      fontData: insertFont.fontData,
      isActive: insertFont.isActive ?? true,
      uploadedBy: insertFont.uploadedBy ?? null,
      createdAt: new Date(),
    };
    this.customFonts.set(id, font);
    return font;
  }

  async updateCustomFont(id: string, updates: Partial<InsertCustomFont>): Promise<CustomFont | undefined> {
    const existing = this.customFonts.get(id);
    if (!existing) return undefined;
    const updated: CustomFont = {
      ...existing,
      ...updates,
    };
    this.customFonts.set(id, updated);
    return updated;
  }

  async deleteCustomFont(id: string): Promise<boolean> {
    return this.customFonts.delete(id);
  }

  // Temp staff session management
  async getStaffSessions(eventId: string): Promise<StaffSession[]> {
    return Array.from(this.staffSessions.values()).filter(s => s.eventId === eventId);
  }

  async getStaffSession(id: string): Promise<StaffSession | undefined> {
    return this.staffSessions.get(id);
  }

  async getStaffSessionByToken(token: string): Promise<StaffSession | undefined> {
    return Array.from(this.staffSessions.values()).find(
      s => s.token === token && s.isActive && new Date(s.expiresAt) > new Date()
    );
  }

  async createStaffSession(insertSession: InsertStaffSession): Promise<StaffSession> {
    const id = `tss-${randomUUID().substring(0, 8)}`;
    const session: StaffSession = {
      id,
      eventId: insertSession.eventId,
      staffName: insertSession.staffName,
      token: insertSession.token,
      expiresAt: insertSession.expiresAt,
      isActive: insertSession.isActive ?? true,
      createdAt: new Date(),
    };
    this.staffSessions.set(id, session);
    return session;
  }

  async updateStaffSession(id: string, updates: Partial<InsertStaffSession>): Promise<StaffSession | undefined> {
    const existing = this.staffSessions.get(id);
    if (!existing) return undefined;
    const updated: StaffSession = {
      ...existing,
      ...updates,
    };
    this.staffSessions.set(id, updated);
    return updated;
  }

  async deleteStaffSession(id: string): Promise<boolean> {
    return this.staffSessions.delete(id);
  }

  async invalidateStaffSession(id: string): Promise<boolean> {
    const session = this.staffSessions.get(id);
    if (!session) return false;
    session.isActive = false;
    this.staffSessions.set(id, session);
    return true;
  }

  async cleanupExpiredStaffSessions(): Promise<number> {
    const now = new Date();
    const toDelete: string[] = [];
    Array.from(this.staffSessions.entries()).forEach(([id, session]) => {
      if (new Date(session.expiresAt) < now || !session.isActive) {
        toDelete.push(id);
      }
    });
    toDelete.forEach(id => this.staffSessions.delete(id));
    return toDelete.length;
  }

  // Temp staff activity log
  async getStaffActivityLogs(eventId: string): Promise<StaffActivityLog[]> {
    return Array.from(this.staffActivityLogs.values())
      .filter(l => l.eventId === eventId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getStaffActivityLogsBySession(sessionId: string): Promise<StaffActivityLog[]> {
    return Array.from(this.staffActivityLogs.values())
      .filter(l => l.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createStaffActivityLog(insertLog: InsertStaffActivityLog): Promise<StaffActivityLog> {
    const id = `tsal-${randomUUID().substring(0, 8)}`;
    const log: StaffActivityLog = {
      id,
      sessionId: insertLog.sessionId,
      eventId: insertLog.eventId,
      action: insertLog.action,
      targetId: insertLog.targetId ?? null,
      metadata: (insertLog.metadata ?? null) as StaffActivityLog['metadata'],
      createdAt: new Date(),
    };
    this.staffActivityLogs.set(id, log);
    return log;
  }

  // Event badge template overrides
  async getEventBadgeTemplateOverrides(eventId: string): Promise<EventBadgeTemplateOverride[]> {
    return Array.from(this.eventBadgeTemplateOverrides.values())
      .filter(o => o.eventId === eventId)
      .sort((a, b) => b.priority - a.priority);
  }

  async getEventBadgeTemplateOverride(id: string): Promise<EventBadgeTemplateOverride | undefined> {
    return this.eventBadgeTemplateOverrides.get(id);
  }

  async getEventBadgeTemplateOverrideByType(eventId: string, participantType: string): Promise<EventBadgeTemplateOverride | undefined> {
    const now = new Date();
    return Array.from(this.eventBadgeTemplateOverrides.values())
      .filter(o => {
        if (o.eventId !== eventId || o.participantType !== participantType) return false;
        // Check effective dates if specified
        if (o.effectiveFrom && new Date(o.effectiveFrom) > now) return false;
        if (o.effectiveUntil && new Date(o.effectiveUntil) < now) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority)[0];
  }

  async createEventBadgeTemplateOverride(insertOverride: InsertEventBadgeTemplateOverride): Promise<EventBadgeTemplateOverride> {
    const id = `ebto-${randomUUID().substring(0, 8)}`;
    const override: EventBadgeTemplateOverride = {
      id,
      eventId: insertOverride.eventId,
      participantType: insertOverride.participantType,
      badgeTemplateId: insertOverride.badgeTemplateId,
      priority: insertOverride.priority ?? 0,
      effectiveFrom: insertOverride.effectiveFrom ?? null,
      effectiveUntil: insertOverride.effectiveUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventBadgeTemplateOverrides.set(id, override);
    return override;
  }

  async updateEventBadgeTemplateOverride(id: string, updates: Partial<InsertEventBadgeTemplateOverride>): Promise<EventBadgeTemplateOverride | undefined> {
    const existing = this.eventBadgeTemplateOverrides.get(id);
    if (!existing) return undefined;
    const updated: EventBadgeTemplateOverride = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.eventBadgeTemplateOverrides.set(id, updated);
    return updated;
  }

  async deleteEventBadgeTemplateOverride(id: string): Promise<boolean> {
    return this.eventBadgeTemplateOverrides.delete(id);
  }

  // Sync jobs management
  async getSyncJobs(integrationId: string): Promise<SyncJob[]> {
    return Array.from(this.syncJobs.values())
      .filter(j => j.integrationId === integrationId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getSyncJob(id: string): Promise<SyncJob | undefined> {
    return this.syncJobs.get(id);
  }

  async getPendingSyncJobs(): Promise<SyncJob[]> {
    return Array.from(this.syncJobs.values())
      .filter(j => j.status === 'pending')
      .sort((a, b) => a.priority - b.priority);
  }

  async getPendingSyncJobsByConfig(configId: string): Promise<SyncJob[]> {
    return Array.from(this.syncJobs.values())
      .filter(j => j.status === 'pending' && j.endpointConfigId === configId);
  }

  async getStaleRunningSyncJobs(): Promise<SyncJob[]> {
    return Array.from(this.syncJobs.values())
      .filter(j => j.status === 'running');
  }

  async getDueSyncJobs(): Promise<SyncJob[]> {
    const now = new Date();
    return Array.from(this.syncJobs.values())
      .filter(j => j.status === 'pending' && (!j.nextRetryAt || new Date(j.nextRetryAt) <= now))
      .sort((a, b) => a.priority - b.priority);
  }

  async createSyncJob(insertJob: InsertSyncJob): Promise<SyncJob> {
    const id = `sj-${randomUUID().substring(0, 8)}`;
    const job: SyncJob = {
      id,
      integrationId: insertJob.integrationId,
      eventCodeMappingId: insertJob.eventCodeMappingId ?? null,
      endpointConfigId: insertJob.endpointConfigId ?? null,
      eventId: insertJob.eventId ?? null,
      jobType: insertJob.jobType,
      triggerType: insertJob.triggerType ?? 'manual',
      priority: insertJob.priority ?? 5,
      status: insertJob.status ?? 'pending',
      startedAt: insertJob.startedAt ?? null,
      completedAt: insertJob.completedAt ?? null,
      attempts: insertJob.attempts ?? 0,
      maxAttempts: insertJob.maxAttempts ?? 3,
      nextRetryAt: insertJob.nextRetryAt ?? null,
      payload: insertJob.payload ?? null,
      result: insertJob.result ?? null,
      errorMessage: insertJob.errorMessage ?? null,
      errorStack: insertJob.errorStack ?? null,
      processedRecords: insertJob.processedRecords ?? 0,
      createdRecords: insertJob.createdRecords ?? 0,
      updatedRecords: insertJob.updatedRecords ?? 0,
      skippedRecords: insertJob.skippedRecords ?? 0,
      failedRecords: insertJob.failedRecords ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.syncJobs.set(id, job);
    return job;
  }

  async updateSyncJob(id: string, updates: Partial<InsertSyncJob>): Promise<SyncJob | undefined> {
    const existing = this.syncJobs.get(id);
    if (!existing) return undefined;
    const updated: SyncJob = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.syncJobs.set(id, updated);
    return updated;
  }

  async deleteSyncJob(id: string): Promise<boolean> {
    return this.syncJobs.delete(id);
  }

  // Endpoint config sync schedule management
  async getEndpointConfigsDueForSync(): Promise<IntegrationEndpointConfig[]> {
    const now = new Date();
    return Array.from(this.integrationEndpointConfigs.values())
      .filter(c => {
        if (!c.syncEnabled) return false;
        if (!c.nextSyncAt) return true; // Never synced, due now
        return new Date(c.nextSyncAt) <= now;
      });
  }

  async updateEndpointConfigSyncStatus(id: string, status: string, error?: string, count?: number): Promise<void> {
    const config = this.integrationEndpointConfigs.get(id);
    if (!config) return;
    
    const now = new Date();
    
    // Get the configured interval, respecting min/max constraints
    let intervalSeconds = config.syncIntervalSeconds || 3600;
    const minInterval = config.syncMinIntervalSeconds || 60;
    const maxInterval = config.syncMaxIntervalSeconds || 86400;
    
    // Clamp the interval to min/max bounds
    intervalSeconds = Math.max(minInterval, Math.min(maxInterval, intervalSeconds));
    
    const nextSync = new Date(now.getTime() + intervalSeconds * 1000);
    
    const updated: IntegrationEndpointConfig = {
      ...config,
      lastSyncAt: now,
      lastSyncStatus: status,
      lastSyncError: error ?? null,
      lastSyncCount: count ?? null,
      nextSyncAt: nextSync,
      updatedAt: now,
    };
    this.integrationEndpointConfigs.set(id, updated);
  }

  // Event workflow configuration methods
  async getEventWorkflowConfig(eventId: string): Promise<EventWorkflowConfig | undefined> {
    return Array.from(this.eventWorkflowConfigs.values()).find(c => c.eventId === eventId);
  }

  async getEventWorkflowWithSteps(eventId: string): Promise<EventWorkflowWithSteps | undefined> {
    const config = await this.getEventWorkflowConfig(eventId);
    if (!config) return undefined;
    
    const steps = await this.getEventWorkflowSteps(eventId);
    const stepsWithData: WorkflowStepWithData[] = await Promise.all(
      steps.map(async (step) => {
        const stepWithData: WorkflowStepWithData = { ...step };
        if (step.stepType === 'buyer_questions') {
          stepWithData.questions = await this.getEventBuyerQuestions(step.id);
        } else if (step.stepType === 'disclaimer') {
          stepWithData.disclaimer = await this.getEventDisclaimer(step.id);
        }
        return stepWithData;
      })
    );
    
    return { ...config, steps: stepsWithData };
  }

  async createEventWorkflowConfig(insertConfig: InsertEventWorkflowConfig): Promise<EventWorkflowConfig> {
    const id = `wfc-${randomUUID().substring(0, 8)}`;
    const config: EventWorkflowConfig = {
      id,
      eventId: insertConfig.eventId,
      enabled: insertConfig.enabled ?? false,
      enabledForStaff: insertConfig.enabledForStaff ?? true,
      enabledForKiosk: insertConfig.enabledForKiosk ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventWorkflowConfigs.set(id, config);
    return config;
  }

  async updateEventWorkflowConfig(eventId: string, updates: Partial<InsertEventWorkflowConfig>): Promise<EventWorkflowConfig | undefined> {
    const existing = Array.from(this.eventWorkflowConfigs.values()).find(c => c.eventId === eventId);
    if (!existing) return undefined;
    const updated: EventWorkflowConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.eventWorkflowConfigs.set(existing.id, updated);
    return updated;
  }

  async deleteEventWorkflowConfig(eventId: string): Promise<boolean> {
    const config = Array.from(this.eventWorkflowConfigs.values()).find(c => c.eventId === eventId);
    if (!config) return false;
    return this.eventWorkflowConfigs.delete(config.id);
  }

  // Event workflow steps methods
  async getEventWorkflowSteps(eventId: string): Promise<EventWorkflowStep[]> {
    return Array.from(this.eventWorkflowSteps.values())
      .filter(s => s.eventId === eventId)
      .sort((a, b) => a.position - b.position);
  }

  async getEventWorkflowStep(id: string): Promise<EventWorkflowStep | undefined> {
    return this.eventWorkflowSteps.get(id);
  }

  async createEventWorkflowStep(insertStep: InsertEventWorkflowStep): Promise<EventWorkflowStep> {
    const id = `wfs-${randomUUID().substring(0, 8)}`;
    const step: EventWorkflowStep = {
      id,
      eventId: insertStep.eventId,
      stepType: insertStep.stepType,
      position: insertStep.position,
      enabled: insertStep.enabled ?? true,
      config: insertStep.config ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventWorkflowSteps.set(id, step);
    return step;
  }

  async updateEventWorkflowStep(id: string, updates: Partial<InsertEventWorkflowStep>): Promise<EventWorkflowStep | undefined> {
    const existing = this.eventWorkflowSteps.get(id);
    if (!existing) return undefined;
    const updated: EventWorkflowStep = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.eventWorkflowSteps.set(id, updated);
    return updated;
  }

  async deleteEventWorkflowStep(id: string): Promise<boolean> {
    return this.eventWorkflowSteps.delete(id);
  }

  async reorderEventWorkflowSteps(eventId: string, stepIds: string[]): Promise<EventWorkflowStep[]> {
    const steps = await this.getEventWorkflowSteps(eventId);
    const updatedSteps: EventWorkflowStep[] = [];
    
    for (let i = 0; i < stepIds.length; i++) {
      const step = steps.find(s => s.id === stepIds[i]);
      if (step) {
        const updated: EventWorkflowStep = { ...step, position: i, updatedAt: new Date() };
        this.eventWorkflowSteps.set(step.id, updated);
        updatedSteps.push(updated);
      }
    }
    
    return updatedSteps.sort((a, b) => a.position - b.position);
  }

  // Event buyer questions methods
  async getEventBuyerQuestions(stepId: string): Promise<EventBuyerQuestion[]> {
    return Array.from(this.eventBuyerQuestions.values())
      .filter(q => q.stepId === stepId)
      .sort((a, b) => a.position - b.position);
  }

  async getEventBuyerQuestionsByEvent(eventId: string): Promise<EventBuyerQuestion[]> {
    return Array.from(this.eventBuyerQuestions.values())
      .filter(q => q.eventId === eventId)
      .sort((a, b) => a.position - b.position);
  }

  async getEventBuyerQuestion(id: string): Promise<EventBuyerQuestion | undefined> {
    return this.eventBuyerQuestions.get(id);
  }

  async createEventBuyerQuestion(insertQuestion: InsertEventBuyerQuestion): Promise<EventBuyerQuestion> {
    const id = `bq-${randomUUID().substring(0, 8)}`;
    const question: EventBuyerQuestion = {
      id,
      eventId: insertQuestion.eventId,
      stepId: insertQuestion.stepId,
      questionText: insertQuestion.questionText,
      questionType: insertQuestion.questionType,
      required: insertQuestion.required ?? false,
      position: insertQuestion.position,
      options: insertQuestion.options ?? [],
      placeholder: insertQuestion.placeholder ?? null,
      createdAt: new Date(),
    };
    this.eventBuyerQuestions.set(id, question);
    return question;
  }

  async updateEventBuyerQuestion(id: string, updates: Partial<InsertEventBuyerQuestion>): Promise<EventBuyerQuestion | undefined> {
    const existing = this.eventBuyerQuestions.get(id);
    if (!existing) return undefined;
    const updated: EventBuyerQuestion = { ...existing, ...updates };
    this.eventBuyerQuestions.set(id, updated);
    return updated;
  }

  async deleteEventBuyerQuestion(id: string): Promise<boolean> {
    return this.eventBuyerQuestions.delete(id);
  }

  // Event disclaimer methods
  async getEventDisclaimer(stepId: string): Promise<EventDisclaimer | undefined> {
    return Array.from(this.eventDisclaimers.values()).find(d => d.stepId === stepId);
  }

  async getEventDisclaimersByEvent(eventId: string): Promise<EventDisclaimer[]> {
    return Array.from(this.eventDisclaimers.values()).filter(d => d.eventId === eventId);
  }

  async createEventDisclaimer(insertDisclaimer: InsertEventDisclaimer): Promise<EventDisclaimer> {
    const id = `dis-${randomUUID().substring(0, 8)}`;
    const disclaimer: EventDisclaimer = {
      id,
      eventId: insertDisclaimer.eventId,
      stepId: insertDisclaimer.stepId,
      title: insertDisclaimer.title ?? "Terms and Conditions",
      disclaimerText: insertDisclaimer.disclaimerText,
      requireSignature: insertDisclaimer.requireSignature ?? true,
      confirmationText: insertDisclaimer.confirmationText ?? "I have read and agree to the terms above",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.eventDisclaimers.set(id, disclaimer);
    return disclaimer;
  }

  async updateEventDisclaimer(id: string, updates: Partial<InsertEventDisclaimer>): Promise<EventDisclaimer | undefined> {
    const existing = this.eventDisclaimers.get(id);
    if (!existing) return undefined;
    const updated: EventDisclaimer = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.eventDisclaimers.set(id, updated);
    return updated;
  }

  async deleteEventDisclaimer(id: string): Promise<boolean> {
    return this.eventDisclaimers.delete(id);
  }

  // Attendee workflow responses methods
  async getAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<AttendeeWorkflowResponse[]> {
    return Array.from(this.attendeeWorkflowResponses.values())
      .filter(r => r.attendeeId === attendeeId && r.eventId === eventId);
  }

  async getAttendeeWorkflowResponsesByEvent(eventId: string): Promise<AttendeeWorkflowResponse[]> {
    return Array.from(this.attendeeWorkflowResponses.values())
      .filter(r => r.eventId === eventId);
  }

  async createAttendeeWorkflowResponse(insertResponse: InsertAttendeeWorkflowResponse): Promise<AttendeeWorkflowResponse> {
    const id = `awr-${randomUUID().substring(0, 8)}`;
    const response: AttendeeWorkflowResponse = {
      id,
      attendeeId: insertResponse.attendeeId,
      eventId: insertResponse.eventId,
      questionId: insertResponse.questionId,
      responseValue: insertResponse.responseValue ?? null,
      responseValues: insertResponse.responseValues ?? null,
      createdAt: new Date(),
    };
    this.attendeeWorkflowResponses.set(id, response);
    return response;
  }

  async deleteAttendeeWorkflowResponses(attendeeId: string, eventId: string): Promise<boolean> {
    const toDelete = Array.from(this.attendeeWorkflowResponses.entries())
      .filter(([_, r]) => r.attendeeId === attendeeId && r.eventId === eventId);
    toDelete.forEach(([id]) => this.attendeeWorkflowResponses.delete(id));
    return toDelete.length > 0;
  }

  // Attendee signature methods
  async getAttendeeSignature(attendeeId: string, disclaimerId: string): Promise<AttendeeSignature | undefined> {
    return Array.from(this.attendeeSignatures.values())
      .find(s => s.attendeeId === attendeeId && s.disclaimerId === disclaimerId);
  }

  async getAttendeeSignatures(attendeeId: string): Promise<AttendeeSignature[]> {
    return Array.from(this.attendeeSignatures.values())
      .filter(s => s.attendeeId === attendeeId);
  }

  async getAttendeeSignaturesByEvent(eventId: string): Promise<AttendeeSignature[]> {
    return Array.from(this.attendeeSignatures.values())
      .filter(s => s.eventId === eventId);
  }

  async createAttendeeSignature(insertSignature: InsertAttendeeSignature): Promise<AttendeeSignature> {
    const id = `sig-${randomUUID().substring(0, 8)}`;
    const signature: AttendeeSignature = {
      id,
      attendeeId: insertSignature.attendeeId,
      eventId: insertSignature.eventId,
      disclaimerId: insertSignature.disclaimerId,
      signatureData: insertSignature.signatureData,
      signedAt: insertSignature.signedAt ?? new Date(),
      ipAddress: insertSignature.ipAddress ?? null,
      userAgent: insertSignature.userAgent ?? null,
      createdAt: new Date(),
    };
    this.attendeeSignatures.set(id, signature);
    return signature;
  }

  async updateAttendeeSignature(id: string, data: Partial<Pick<AttendeeSignature, 'signatureData' | 'ipAddress' | 'userAgent'>>): Promise<AttendeeSignature | undefined> {
    const existing = this.attendeeSignatures.get(id);
    if (!existing) return undefined;
    
    const updated: AttendeeSignature = {
      ...existing,
      ...data,
      signedAt: new Date(), // Update signed time when signature is updated
    };
    this.attendeeSignatures.set(id, updated);
    return updated;
  }

  async deleteAttendeeSignature(id: string): Promise<boolean> {
    return this.attendeeSignatures.delete(id);
  }

  async deleteAttendeeSignaturesByAttendee(attendeeId: string, eventId: string): Promise<boolean> {
    const toDelete = Array.from(this.attendeeSignatures.entries())
      .filter(([_, s]) => s.attendeeId === attendeeId && s.eventId === eventId);
    toDelete.forEach(([id]) => this.attendeeSignatures.delete(id));
    return toDelete.length > 0;
  }

  // Event Sync States
  async getEventSyncStates(eventId: string): Promise<EventSyncState[]> {
    return Array.from(this.eventSyncStates.values()).filter(s => s.eventId === eventId);
  }

  async getEventSyncState(eventId: string, dataType: string): Promise<EventSyncState | undefined> {
    return Array.from(this.eventSyncStates.values()).find(
      s => s.eventId === eventId && s.dataType === dataType
    );
  }

  async getEventSyncStateById(id: string): Promise<EventSyncState | undefined> {
    return this.eventSyncStates.get(id);
  }

  async createEventSyncState(state: InsertEventSyncState): Promise<EventSyncState> {
    const id = `ess-${randomUUID().substring(0, 8)}`;
    const now = new Date();
    const newState: EventSyncState = {
      id,
      eventId: state.eventId,
      integrationId: state.integrationId,
      dataType: state.dataType,
      syncEnabled: state.syncEnabled ?? true,
      syncStatus: state.syncStatus ?? 'pending',
      syncIntervalMinutes: state.syncIntervalMinutes ?? null,
      resolvedEndpoint: state.resolvedEndpoint ?? null,
      lastSyncAt: null,
      lastSyncTimestamp: null,
      lastSyncResult: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      nextSyncAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.eventSyncStates.set(id, newState);
    return newState;
  }

  async updateEventSyncState(id: string, state: Partial<InsertEventSyncState>): Promise<EventSyncState | undefined> {
    const existing = this.eventSyncStates.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...state, updatedAt: new Date() } as EventSyncState;
    this.eventSyncStates.set(id, updated);
    return updated;
  }

  async upsertEventSyncState(
    eventId: string, 
    dataType: string, 
    state: Partial<InsertEventSyncState>
  ): Promise<EventSyncState> {
    const existing = await this.getEventSyncState(eventId, dataType);
    if (existing) {
      return (await this.updateEventSyncState(existing.id, state))!;
    }
    return this.createEventSyncState({ 
      eventId, 
      dataType, 
      integrationId: state.integrationId!, 
      ...state 
    } as InsertEventSyncState);
  }

  async deleteEventSyncState(id: string): Promise<boolean> {
    return this.eventSyncStates.delete(id);
  }

  async getSyncStatesDueForSync(): Promise<EventSyncState[]> {
    const now = new Date();
    return Array.from(this.eventSyncStates.values()).filter(s => 
      s.syncEnabled && (s.nextSyncAt === null || s.nextSyncAt < now)
    );
  }

  // System Settings methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    return Array.from(this.systemSettings.values()).find(s => s.key === key);
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return Array.from(this.systemSettings.values());
  }

  async upsertSystemSetting(
    key: string, 
    value: string | null, 
    jsonValue?: object | null, 
    description?: string, 
    updatedBy?: string
  ): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const updated: SystemSetting = {
        ...existing,
        value,
        jsonValue: jsonValue ?? null,
        description: description ?? existing.description,
        updatedBy: updatedBy ?? existing.updatedBy,
        updatedAt: new Date(),
      };
      this.systemSettings.set(existing.id, updated);
      return updated;
    }
    
    const id = `setting-${randomUUID().substring(0, 8)}`;
    const setting: SystemSetting = {
      id,
      key,
      value,
      jsonValue: jsonValue ?? null,
      description: description ?? null,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    };
    this.systemSettings.set(id, setting);
    return setting;
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const setting = await this.getSystemSetting(key);
    if (!setting) return false;
    return this.systemSettings.delete(setting.id);
  }

  // Event Notification Rules (stub implementation for MemStorage)
  private eventNotificationRules: Map<string, EventNotificationRule> = new Map();

  async getEventNotificationRules(eventId: string): Promise<EventNotificationRule[]> {
    return Array.from(this.eventNotificationRules.values()).filter(r => r.eventId === eventId);
  }

  async getEventNotificationRule(id: string): Promise<EventNotificationRule | undefined> {
    return this.eventNotificationRules.get(id);
  }

  async getActiveNotificationRulesForAttendee(
    eventId: string,
    attendee: { participantType: string; company?: string | null; firstName: string; lastName: string }
  ): Promise<EventNotificationRule[]> {
    const rules = await this.getEventNotificationRules(eventId);
    return rules.filter(rule => {
      if (!rule.isActive) return false;
      const participantTypes = (rule.participantTypes as string[]) || [];
      const companyNames = (rule.companyNames as string[]) || [];
      const attendeeNames = (rule.attendeeNames as string[]) || [];
      if (participantTypes.length === 0 && companyNames.length === 0 && attendeeNames.length === 0) {
        return true;
      }
      if (participantTypes.length > 0 && !participantTypes.includes(attendee.participantType)) {
        return false;
      }
      if (companyNames.length > 0 && attendee.company) {
        const lowerCompany = attendee.company.toLowerCase();
        if (!companyNames.some(c => lowerCompany.includes(c.toLowerCase()))) {
          return false;
        }
      }
      if (attendeeNames.length > 0) {
        const fullName = `${attendee.firstName} ${attendee.lastName}`.toLowerCase();
        if (!attendeeNames.some(n => fullName.includes(n.toLowerCase()))) {
          return false;
        }
      }
      return true;
    });
  }

  async createEventNotificationRule(rule: InsertEventNotificationRule): Promise<EventNotificationRule> {
    const id = `notif-${randomUUID().substring(0, 8)}`;
    const now = new Date();
    const newRule: EventNotificationRule = {
      id,
      ...rule,
      participantTypes: rule.participantTypes ?? [],
      companyNames: rule.companyNames ?? [],
      attendeeNames: rule.attendeeNames ?? [],
      smsRecipients: rule.smsRecipients ?? [],
      includeAttendeeName: rule.includeAttendeeName ?? true,
      includeCompany: rule.includeCompany ?? true,
      includeCheckinTime: rule.includeCheckinTime ?? true,
      customMessage: rule.customMessage ?? null,
      isActive: rule.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.eventNotificationRules.set(id, newRule);
    return newRule;
  }

  async updateEventNotificationRule(id: string, rule: Partial<InsertEventNotificationRule>): Promise<EventNotificationRule | undefined> {
    const existing = this.eventNotificationRules.get(id);
    if (!existing) return undefined;
    const updated: EventNotificationRule = {
      ...existing,
      ...rule,
      updatedAt: new Date(),
    };
    this.eventNotificationRules.set(id, updated);
    return updated;
  }

  async deleteEventNotificationRule(id: string): Promise<boolean> {
    return this.eventNotificationRules.delete(id);
  }

  // Application Error Logging stubs (MemStorage not used in production)
  async logError(_error: InsertApplicationError): Promise<ApplicationError> {
    throw new Error("MemStorage error logging not implemented - use DbStorage");
  }

  async getErrors(_options?: { errorType?: string; isResolved?: boolean; customerId?: string; limit?: number; offset?: number }): Promise<ApplicationError[]> {
    return [];
  }

  async getError(_id: string): Promise<ApplicationError | undefined> {
    return undefined;
  }

  async resolveError(_id: string, _resolvedBy: string, _notes?: string): Promise<ApplicationError | undefined> {
    return undefined;
  }

  async getErrorStats(): Promise<{ total: number; unresolved: number; byType: { type: string; count: number }[]; last24h: number; last7d: number }> {
    return { total: 0, unresolved: 0, byType: [], last24h: 0, last7d: 0 };
  }

  async deleteOldErrors(_olderThan: Date): Promise<number> {
    return 0;
  }

  private auditLogs: Map<string, AdminAuditLog> = new Map();

  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const id = `audit-${randomUUID().substring(0, 8)}`;
    const auditLog: AdminAuditLog = {
      id,
      userId: log.userId,
      userEmail: log.userEmail,
      userRole: log.userRole,
      customerId: log.customerId ?? null,
      customerName: log.customerName ?? null,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      resourceName: log.resourceName ?? null,
      changedFields: log.changedFields ?? null,
      metadata: log.metadata ?? null,
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
      createdAt: new Date(),
    };
    this.auditLogs.set(id, auditLog);
    return auditLog;
  }

  async getAuditLogs(_options?: { userId?: string; customerId?: string; action?: string; resourceType?: string; limit?: number; offset?: number }): Promise<AdminAuditLog[]> {
    return Array.from(this.auditLogs.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAuditLogStats(): Promise<{ total: number; last24h: number; last7d: number; byAction: { action: string; count: number }[]; byUser: { userId: string; userEmail: string; count: number }[] }> {
    return { total: 0, last24h: 0, last7d: 0, byAction: [], byUser: [] };
  }

  async getFeatureFlags(): Promise<FeatureFlag[]> { return []; }
  async getFeatureFlag(_id: string): Promise<FeatureFlag | undefined> { return undefined; }
  async getFeatureFlagByKey(_key: string): Promise<FeatureFlag | undefined> { return undefined; }
  async createFeatureFlag(_flag: InsertFeatureFlag): Promise<FeatureFlag> { throw new Error("Not implemented"); }
  async updateFeatureFlag(_id: string, _flag: Partial<InsertFeatureFlag>): Promise<FeatureFlag | undefined> { return undefined; }
  async deleteFeatureFlag(_id: string): Promise<boolean> { return false; }

  async getCustomerRetentionPolicy(_customerId: string): Promise<DataRetentionPolicy | null> { return null; }
  async updateCustomerRetentionPolicy(_customerId: string, _policy: DataRetentionPolicy): Promise<Customer | undefined> { return undefined; }
  async getEventRetentionOverride(_eventId: string): Promise<Partial<DataRetentionPolicy> | null> { return null; }
  async updateEventRetentionOverride(_eventId: string, _override: Partial<DataRetentionPolicy> | null): Promise<Event | undefined> { return undefined; }
  async getEventsEligibleForRetention(): Promise<Array<{ event: Event; customer: Customer; policy: DataRetentionPolicy; policySource: 'account' | 'event_override'; eligibleDate: Date; attendeeCount: number; }>> { return []; }
  async getEventsPendingRetentionNotification(): Promise<Array<{ event: Event; customer: Customer; policy: DataRetentionPolicy; eligibleDate: Date; attendeeCount: number; }>> { return []; }
  async anonymizeEventAttendees(_eventId: string): Promise<number> { return 0; }
  async markEventRetentionProcessed(_eventId: string): Promise<void> {}
  async markEventRetentionNotified(_eventId: string): Promise<void> {}
  async logRetentionAction(_entry: InsertDataRetentionLog): Promise<DataRetentionLog> { throw new Error("Not implemented"); }
  async getRetentionLogs(_customerId: string, _limit?: number): Promise<DataRetentionLog[]> { return []; }
  async getRetentionPreview(_customerId: string): Promise<Array<{ eventId: string; eventName: string; eventDate: Date; endDate: Date | null; attendeeCount: number; eligibleDate: Date; action: string; daysUntilAction: number; }>> { return []; }
}

// Import and use DbStorage for PostgreSQL persistence
// MemStorage is kept above for reference/fallback but not exported
import { DbStorage } from "./db-storage";
export const storage = new DbStorage();
