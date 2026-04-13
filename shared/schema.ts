import { pgTable, text, timestamp, boolean, integer, real, jsonb, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth sessions table for Replit Auth (separate from event sessions)
export const authSessions = pgTable(
  "auth_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_auth_session_expire").on(table.expire)],
);

export interface DataRetentionPolicy {
  enabled: boolean;
  retentionDays: number;
  action: 'anonymize' | 'delete';
  notifyDaysBefore: number;
  retentionBasis: 'event_end_date' | 'last_check_in';
}

// Customer Accounts (top-level tenant isolation)
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull().unique(),
  apiBaseUrl: text("api_base_url"),
  status: text("status").notNull().default("active"),
  dataRetentionPolicy: jsonb("data_retention_policy").$type<DataRetentionPolicy>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// Locations (physical venues scoped to customer accounts)
export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  timezone: text("timezone"),
  // Used for auto-matching synced event locations
  matchPatterns: jsonb("match_patterns").$type<string[]>().default(sql`'[]'`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("locations_customer_idx").on(table.customerId),
  nameIdx: index("locations_name_idx").on(table.name),
}));

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

// User roles hierarchy
export const userRoles = ['super_admin', 'admin', 'manager', 'staff'] as const;
export type UserRole = typeof userRoles[number];

// Users (scoped to customer accounts, except super_admin which is global)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }), // NULL for super_admin
  email: text("email").notNull().unique(),
  phoneNumber: text("phone_number").unique(), // E.164 format (e.g., +15551234567) - must be unique to prevent access conflicts
  passwordHash: text("password_hash"), // For email/password login (optional - NULL means Replit Auth only)
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("staff").$type<UserRole>(), // super_admin, admin, manager, staff
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("users_customer_idx").on(table.customerId),
  emailIdx: index("users_email_idx").on(table.email),
  phoneIdx: index("users_phone_idx").on(table.phoneNumber),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
}).extend({
  role: z.enum(userRoles).default('staff'),
  customerId: z.string().nullable().optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +15551234567)"),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// User Preferences (per-user settings like pinned events)
export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userKeyIdx: index("user_preferences_user_key_idx").on(table.userId, table.key),
}));

export type UserPreference = typeof userPreferences.$inferSelect;

// Badge Templates (scoped to customer accounts)
export const badgeTemplates = pgTable("badge_templates", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  participantType: text("participant_type").notNull(), // Legacy single type (kept for backward compatibility)
  participantTypes: jsonb("participant_types").$type<string[]>().default(sql`'[]'`), // Multiple participant types
  // Design
  backgroundColor: text("background_color").notNull(),
  textColor: text("text_color").notNull(),
  accentColor: text("accent_color").notNull(),
  // Sizing (in inches, supports decimals like 4.5 x 3)
  width: real("width").notNull().default(4),
  height: real("height").notNull().default(3),
  // Layout
  includeQR: boolean("include_qr").notNull().default(true),
  qrPosition: text("qr_position").notNull().default("bottom-right"), // top-left, top-right, bottom-left, bottom-right, custom
  customQrPosition: jsonb("custom_qr_position").$type<{ x: number; y: number }>(),
  // QR Code content configuration
  qrCodeConfig: jsonb("qr_code_config").$type<{
    embedType: 'externalId' | 'simple' | 'json' | 'custom'; // What to embed in QR
    fields: string[]; // Fields to include: externalId, firstName, lastName, email, company, title, participantType
    separator: string; // Separator for 'simple' format (e.g., '|', '-', ',')
    includeLabel: boolean; // Whether to include field labels in 'simple' format
  }>().default(sql`'{"embedType": "externalId", "fields": ["externalId"], "separator": "|", "includeLabel": false}'`),
  // Typography - template-level font family for all text
  fontFamily: text("font_family").notNull().default("Arial"),
  // Merge fields configuration
  mergeFields: jsonb("merge_fields").notNull().$type<Array<{
    field: string; // firstName, lastName, company, title, email, customField_X
    label: string; // Display label
    fontSize: number; // Font size in points
    position: { x: number; y: number }; // Position in pixels
    align: 'left' | 'center' | 'right';
    fontWeight?: string; // 100-900 (per-field override)
    fontStyle?: 'normal' | 'italic'; // (per-field override)
    color?: string; // Optional per-field color override
    horizontalPadding?: number; // Padding from edge in pixels (for left/right alignment)
  }>>().default(sql`'[]'`),
  // Image elements (logos, banners, etc)
  imageElements: jsonb("image_elements").notNull().$type<Array<{
    id: string; // Unique ID for the image element
    type: 'logo' | 'banner' | 'image'; // Type of image element
    url: string; // Base64 data URL or external URL
    position: { x: number; y: number }; // Position in pixels
    size: { width: number; height: number }; // Size in pixels
    zIndex: number; // Layering order
  }>>().default(sql`'[]'`),
  // Two-sided foldable badge support
  layoutMode: text("layout_mode").notNull().default("single"), // "single" | "foldable"
  backSideMode: text("back_side_mode").notNull().default("blank"), // "duplicate-rotate" | "custom" | "blank"
  backSideMergeFields: jsonb("back_side_merge_fields").$type<Array<{
    field: string;
    label: string;
    fontSize: number;
    position: { x: number; y: number };
    align: 'left' | 'center' | 'right';
    fontWeight?: string;
    fontStyle?: 'normal' | 'italic';
    color?: string;
    horizontalPadding?: number;
  }>>().default(sql`'[]'`),
  backSideImageElements: jsonb("back_side_image_elements").$type<Array<{
    id: string;
    type: 'logo' | 'banner' | 'image';
    url: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
  }>>().default(sql`'[]'`),
  backSideIncludeQR: boolean("back_side_include_qr").notNull().default(false),
  backSideQrPosition: text("back_side_qr_position").notNull().default("bottom-right"),
  backSideCustomQrPosition: jsonb("back_side_custom_qr_position").$type<{ x: number; y: number }>(),
  backSideQrCodeConfig: jsonb("back_side_qr_code_config").$type<{
    embedType: 'externalId' | 'simple' | 'json' | 'custom';
    fields: string[];
    separator: string;
    includeLabel: boolean;
  }>(),
  backSideBackgroundColor: text("back_side_background_color"),
  backSideAgenda: jsonb("back_side_agenda").$type<{
    enabled: boolean;
    title: string;
    titleFontSize: number;
    itemFontSize: number;
    textColor?: string;
    items: Array<{
      time: string;
      label: string;
    }>;
    position: { x: number; y: number };
  }>(),
  // Label rotation for printers that feed sideways (e.g., Brother QL series)
  labelRotation: integer("label_rotation").notNull().default(0),
  // Design watermark (persisted for alignment guidance)
  designWatermark: text("design_watermark"),
  watermarkOpacity: integer("watermark_opacity").default(30),
  watermarkPosition: jsonb("watermark_position").$type<{
    x: number;
    y: number;
    width: number;
    height: number;
    fit: 'cover' | 'contain' | 'stretch';
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("badge_templates_customer_idx").on(table.customerId),
}));

export const insertBadgeTemplateSchema = createInsertSchema(badgeTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertBadgeTemplate = z.infer<typeof insertBadgeTemplateSchema>;
export type BadgeTemplate = typeof badgeTemplates.$inferSelect;

// Printers (scoped to customer accounts, optionally assigned to locations)
export const printers = pgTable("printers", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  // Provider type: printnode, network, zebra_browser_print, native
  provider: text("provider").notNull().default("network"),
  // PrintNode-specific fields
  printNodePrinterId: integer("printnode_printer_id"),
  printNodeComputerId: integer("printnode_computer_id"),
  printNodeComputerName: text("printnode_computer_name"),
  printNodeState: text("printnode_state"), // online, offline, etc.
  // Connection type (for non-PrintNode printers)
  connectionType: text("connection_type").notNull(), // wifi, bluetooth, airprint, usb
  // WiFi/Network configuration
  ipAddress: text("ip_address"),
  port: integer("port"),
  // Bluetooth configuration
  bluetoothDeviceId: text("bluetooth_device_id"),
  bluetoothName: text("bluetooth_name"),
  // Printer capabilities
  supportedSizes: jsonb("supported_sizes").$type<Array<{ width: number; height: number }>>(),
  maxWidth: integer("max_width"), // in inches
  maxHeight: integer("max_height"), // in inches
  dpi: integer("dpi").default(300),
  // Status
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"), // For PrintNode printers
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("printers_customer_idx").on(table.customerId),
  locationIdx: index("printers_location_idx").on(table.locationId),
  printNodeIdx: index("printers_printnode_idx").on(table.printNodePrinterId),
}));

export const insertPrinterSchema = createInsertSchema(printers).omit({
  id: true,
  createdAt: true,
});
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type Printer = typeof printers.$inferSelect;

// Events (scoped to customer accounts)
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  eventDate: timestamp("event_date").notNull(),
  // Synced location info from external platform (used for auto-matching)
  location: text("location"), // Location name from sync (e.g., "Chicago Convention Center")
  venue: text("venue"), // Venue/room from sync (e.g., "Hall B")
  // Certain-specific: account code and event code for check-in status updates and duplicate prevention
  accountCode: text("account_code"),
  eventCode: text("event_code"),
  // Start and end dates for event filtering and display
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  selectedTemplates: text("selected_templates").array().notNull().default([]),
  // @deprecated — Printer selection is now per-device via localStorage. This column is kept for backward compatibility; do not write to it. Remove in a future migration.
  selectedPrinterId: text("selected_printer_id").references(() => printers.id, { onDelete: "set null" }),
  // Integration for attendee syncing (optional - uses customer's integration)
  integrationId: text("integration_id"),
  // External event ID for integration syncing
  externalEventId: text("external_event_id"),
  // Default badge template for this event
  defaultBadgeTemplateId: text("default_badge_template_id"),
  // Event-specific printer settings (JSON)
  printerSettings: jsonb("printer_settings").$type<{
    copies?: number;
    orientation?: 'portrait' | 'landscape';
    autoprint?: boolean;
    labelRotation?: 0 | 90 | 180 | 270;
  }>(),
  // Event-specific badge settings (JSON) - per-template font overrides, etc.
  badgeSettings: jsonb("badge_settings").$type<{
    fontOverrides?: Record<string, string>; // Map of templateId to font family
  }>(),
  // Temporary staff access settings
  tempStaffSettings: jsonb("temp_staff_settings").$type<{
    enabled: boolean;
    passcodeHash: string;
    passcode?: string;
    startTime: string;
    endTime: string;
    badgeTemplateId?: string;
    allowedSessionIds?: string[];
    printPreviewOnCheckin?: boolean;
    allowWalkins?: boolean;
    allowKioskFromStaff?: boolean;
    defaultRegistrationStatusFilter?: RegistrationStatus[];
    allowGroupCheckin?: boolean;
    allowKioskWalkins?: boolean;
    kioskWalkinConfig?: {
      enabledFields: string[];
      requiredFields: string[];
      availableTypes: string[];
      defaultType: string;
    };
  }>(),
  syncSettings: jsonb("sync_settings").$type<{
    realtimeSyncEnabled?: boolean | null;
    syncFrozen?: boolean;
    syncFrozenAt?: string;
    syncIntervalMinutes?: number | null;
  }>(),
  kioskPin: text("kiosk_pin"),
  timezone: text("timezone"),
  dataRetentionOverride: jsonb("data_retention_override").$type<Partial<DataRetentionPolicy>>(),
  retentionNotifiedAt: timestamp("retention_notified_at"),
  retentionProcessedAt: timestamp("retention_processed_at"),
  status: text("status").notNull().default("upcoming"),
  // Configuration status - tracks whether event is ready for check-in
  configStatus: text("config_status").notNull().default("unconfigured").$type<"unconfigured" | "configured">(),
  configuredAt: timestamp("configured_at"), // When the event was configured
  configTemplateId: text("config_template_id"), // Reference to template used (if any)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("events_customer_idx").on(table.customerId),
  locationIdx: index("events_location_idx").on(table.locationId),
  printerIdx: index("events_printer_idx").on(table.selectedPrinterId),
  integrationIdx: index("events_integration_idx").on(table.integrationId),
  configStatusIdx: index("events_config_status_idx").on(table.customerId, table.configStatus),
}));

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Event Badge Template Overrides (maps participant types to specific templates per event)
// All customer templates are available; this table defines which template to use for each participant type
export const eventBadgeTemplateOverrides = pgTable("event_badge_template_overrides", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  participantType: text("participant_type").notNull(), // e.g., "VIP", "Speaker", "General"
  badgeTemplateId: text("badge_template_id").notNull().references(() => badgeTemplates.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(0), // Higher priority wins if multiple matches
  // Optional time-based overrides (e.g., different badge on day 2)
  effectiveFrom: timestamp("effective_from"),
  effectiveUntil: timestamp("effective_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_badge_template_overrides_event_idx").on(table.eventId),
  eventTypeIdx: index("event_badge_template_overrides_event_type_idx").on(table.eventId, table.participantType),
  templateIdx: index("event_badge_template_overrides_template_idx").on(table.badgeTemplateId),
}));

export const insertEventBadgeTemplateOverrideSchema = createInsertSchema(eventBadgeTemplateOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventBadgeTemplateOverride = z.infer<typeof insertEventBadgeTemplateOverrideSchema>;
export type EventBadgeTemplateOverride = typeof eventBadgeTemplateOverrides.$inferSelect;

// Temp Staff Settings type for frontend use
export type StaffSettings = {
  enabled: boolean;
  passcodeHash: string;
  startTime: string;
  endTime: string;
  badgeTemplateId?: string;
  allowedSessionIds?: string[];
  printPreviewOnCheckin?: boolean;
};

// Temp Staff Sessions (tracks logged-in temporary staff)
export const staffSessions = pgTable("temp_staff_sessions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  staffName: text("staff_name").notNull(),
  token: text("token").notNull().unique(), // JWT or session token
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  eventIdx: index("temp_staff_sessions_event_idx").on(table.eventId),
  tokenIdx: index("temp_staff_sessions_token_idx").on(table.token),
}));

export const insertStaffSessionSchema = createInsertSchema(staffSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertStaffSession = z.infer<typeof insertStaffSessionSchema>;
export type StaffSession = typeof staffSessions.$inferSelect;

// Temp Staff Activity Log (tracks actions taken by temp staff)
export const staffActivityLog = pgTable("temp_staff_activity_log", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => staffSessions.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // 'login', 'logout', 'checkin', 'session_checkin', 'badge_print'
  targetId: text("target_id"), // attendeeId or sessionId depending on action
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index("temp_staff_activity_session_idx").on(table.sessionId),
  eventIdx: index("temp_staff_activity_event_idx").on(table.eventId),
}));

export const insertStaffActivityLogSchema = createInsertSchema(staffActivityLog).omit({
  id: true,
  createdAt: true,
});
export type InsertStaffActivityLog = z.infer<typeof insertStaffActivityLogSchema>;
export type StaffActivityLog = typeof staffActivityLog.$inferSelect;

// Registration status values for attendees
export const registrationStatuses = ['Invited', 'Registered', 'Attended'] as const;
export type RegistrationStatus = typeof registrationStatuses[number];

// Attendees (scoped to events, minimal data storage)
// Note: We store minimal PII - just what's needed for check-in/badges
export const attendees = pgTable("attendees", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  // Minimal PII storage
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(), // Only for deduplication
  // Badge-relevant fields (minimal)
  company: text("company"),
  title: text("title"),
  participantType: text("participant_type").notNull(),
  // Custom fields for badge merge (stored as JSON for flexibility)
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  // Registration status from external systems (Invited, Registered, Attended)
  // Automatically set to 'Attended' on check-in or badge print
  registrationStatus: text("registration_status").notNull().default("Registered").$type<RegistrationStatus>(),
  // Original status label from external API (for display purposes)
  registrationStatusLabel: text("registration_status_label"),
  // Event-specific data
  checkedIn: boolean("checked_in").notNull().default(false),
  checkedInAt: timestamp("checked_in_at"),
  badgePrinted: boolean("badge_printed").notNull().default(false),
  badgePrintedAt: timestamp("badge_printed_at"),
  // External reference (not storing full external data)
  externalId: text("external_id"), // Reference to external platform ID (registration code)
  // Order code for group registrations - matches primary attendee's externalId
  // Used for group check-in: scanning one badge prints all badges in the order
  orderCode: text("order_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("attendees_event_idx").on(table.eventId),
  emailIdx: index("attendees_email_idx").on(table.email),
  externalIdIdx: index("attendees_external_id_idx").on(table.externalId),
  orderCodeIdx: index("attendees_order_code_idx").on(table.orderCode),
  registrationStatusIdx: index("attendees_registration_status_idx").on(table.registrationStatus),
}));

export const insertAttendeeSchema = createInsertSchema(attendees).omit({
  id: true,
  createdAt: true,
  checkedIn: true,
  checkedInAt: true,
  badgePrinted: true,
  badgePrintedAt: true,
});
export const updateAttendeeSchema = createInsertSchema(attendees).omit({
  id: true,
  createdAt: true,
}).extend({
  checkedInAt: z.union([z.date(), z.string().transform(s => new Date(s))]).optional().nullable(),
  badgePrintedAt: z.union([z.date(), z.string().transform(s => new Date(s))]).optional().nullable(),
}).partial();
export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;
export type UpdateAttendee = z.infer<typeof updateAttendeeSchema>;
export type Attendee = typeof attendees.$inferSelect;

// Integration Providers (catalog of supported external platforms)
export const integrationProviders = pgTable("integration_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Eventbrite", "Cvent", "RegFox", etc.
  type: text("type").notNull(), // "event_registration", "ticketing", "crm"
  logoUrl: text("logo_url"),
  authType: text("auth_type").notNull(), // bearer, apikey, basic, oauth2
  // OAuth2 configuration (if applicable)
  oauth2Config: jsonb("oauth2_config").$type<{
    authorizationUrl?: string;
    tokenUrl?: string;
    scope?: string;
    grantType?: 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';
  }>(),
  defaultBaseUrl: text("default_base_url"),
  // Endpoint templates
  endpointTemplates: jsonb("endpoint_templates").$type<Array<{
    name: string;
    path: string;
    method: string;
    description?: string;
    rateLimit?: { requests: number; windowMs: number };
    supportsWebhook?: boolean;
  }>>(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIntegrationProviderSchema = createInsertSchema(integrationProviders).omit({
  id: true,
  createdAt: true,
});
export type InsertIntegrationProvider = z.infer<typeof insertIntegrationProviderSchema>;
export type IntegrationProvider = typeof integrationProviders.$inferSelect;

// Customer Integrations (customer-specific instances of providers)
export const customerIntegrations = pgTable("customer_integrations", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => integrationProviders.id),
  name: text("name").notNull(), // "My Eventbrite Account"
  baseUrl: text("base_url").notNull(),
  accountCode: text("account_code"), // Account identifier for variable substitution in endpoints (e.g., {{accountCode}})
  testEndpointPath: text("test_endpoint_path"), // Optional path for testing credentials (e.g., "/api/v1/me" or "/ping")
  eventListEndpointPath: text("event_list_endpoint_path"), // Optional path for discovering/syncing events (e.g., "/api/v1/events")
  authType: text("auth_type").notNull(), // bearer, apikey, basic, oauth2
  // SECURITY: Only env var references, never actual credentials
  credentialsRef: text("credentials_ref"), // e.g., "CUSTOMER_123_EVENTBRITE_API_KEY"
  // OAuth2 profile reference
  oauth2ProfileId: text("oauth2_profile_id"),
  // Rate limiting policy
  rateLimitPolicy: jsonb("rate_limit_policy").$type<{
    requestsPerMinute?: number;
    burstSize?: number;
    retryAfterMs?: number;
  }>(),
  // Endpoint configurations (extends provider templates)
  endpoints: jsonb("endpoints").notNull().$type<Array<{
    name: string;
    path: string;
    method: string;
    headers?: Record<string, string>;
    variables?: Record<string, string>;
    transformations?: {
      request?: string;
      response?: string;
    };
    pagination?: {
      type: 'offset' | 'cursor' | 'page';
      limitParam?: string;
      offsetParam?: string;
      cursorParam?: string;
    };
  }>>().default(sql`'[]'`),
  // Sync endpoint templates with variable placeholders: {{accountCode}}, {{eventCode}}, {{lastSyncTimestamp}}
  syncTemplates: jsonb("sync_templates").$type<{
    attendees?: {
      endpointPath: string;
      method?: string;
      headers?: Record<string, string>;
      responseMapping?: Record<string, string>;
    };
    sessions?: {
      endpointPath: string;
      method?: string;
      headers?: Record<string, string>;
      responseMapping?: Record<string, string>;
    };
    sessionRegistrations?: {
      endpointPath: string;
      method?: string;
      headers?: Record<string, string>;
      responseMapping?: Record<string, string>;
    };
  }>(),
  // Default sync schedule settings
  defaultSyncSettings: jsonb("default_sync_settings").$type<{
    preEventIntervalMinutes: number;
    duringEventIntervalMinutes: number;
    syncWindowStartOffset?: number;
    syncWindowEndOffset?: number;
  }>(),
  // Real-time check-in sync configuration (webhook to external system)
  realtimeSyncConfig: jsonb("realtime_sync_config").$type<{
    enabled: boolean;
    endpointUrl: string;
    walkinEndpointUrl?: string; // Endpoint for creating new registrations (POST /Registration/{accountCode}/{eventCode})
    walkinStatus?: string; // Status label when creating walk-in registration (default: "Checked In")
    walkinSource?: string; // Source label for walk-in registrations (default: "Checkmate")
    checkinStatus?: string; // Status label to send on check-in (e.g., "Checked In")
    revertStatus?: string; // Status label to send on revert (e.g., "Registered")
    maxRetries?: number; // Default 3
    retryDelayMs?: number; // Base delay, doubles with exponential backoff (default 1000ms)
    timeoutMs?: number; // Request timeout (default 30000ms)
  }>(),
  // Real-time session check-in sync configuration
  realtimeSessionSyncConfig: jsonb("realtime_session_sync_config").$type<{
    enabled: boolean;
    endpointUrl: string; // e.g. /api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/registrations/sessions
    httpMethod?: 'POST' | 'PUT' | 'PATCH';
    checkinStatus?: string; // Status label on session check-in (default: "Attended")
    maxRetries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
  }>(),
  // Initial sync tracking
  initialSyncCompletedAt: timestamp("initial_sync_completed_at"),
  status: text("status").notNull().default("active"), // active, disabled, error
  lastSync: timestamp("last_sync"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("customer_integrations_customer_idx").on(table.customerId),
  providerIdx: index("customer_integrations_provider_idx").on(table.providerId),
}));

export const insertCustomerIntegrationSchema = createInsertSchema(customerIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomerIntegration = z.infer<typeof insertCustomerIntegrationSchema>;
export type CustomerIntegration = typeof customerIntegrations.$inferSelect;

// Sync Logs (tracks sync history for each integration)
export const syncLogs = pgTable("sync_logs", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  syncType: text("sync_type").notNull(), // 'events', 'attendees', 'sessions', 'sessionRegistrations', 'full'
  status: text("status").notNull(), // 'started', 'completed', 'failed'
  processedCount: integer("processed_count").default(0),
  createdCount: integer("created_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  errorCount: integer("error_count").default(0),
  errors: jsonb("errors").$type<Array<{ record?: any; error: string }>>(),
  apiResponseSummary: text("api_response_summary"), // Brief summary of API response for debugging
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  integrationIdx: index("sync_logs_integration_idx").on(table.integrationId),
  customerIdx: index("sync_logs_customer_idx").on(table.customerId),
  startedAtIdx: index("sync_logs_started_at_idx").on(table.startedAt),
}));

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
});
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// Integration Connections (tracks connection state for each customer integration)
export const integrationConnections = pgTable("integration_connections", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  // Connection type and status
  authMethod: text("auth_method").notNull(), // oauth2, api_key, bearer_token, basic_auth
  connectionStatus: text("connection_status").notNull().default("disconnected"), // disconnected, connecting, connected, error, needs_reauth
  // OAuth2 specific fields
  oauth2State: text("oauth2_state"), // CSRF protection state token
  pkceCodeVerifier: text("pkce_code_verifier"), // PKCE code verifier (temporary, cleared after exchange)
  // Scope/permissions granted
  grantedScopes: text("granted_scopes").array(),
  // Connection health
  lastValidatedAt: timestamp("last_validated_at"),
  lastSuccessfulCallAt: timestamp("last_successful_call_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at"),
  // Audit
  connectedBy: text("connected_by"), // User ID who initiated connection
  connectedAt: timestamp("connected_at"),
  disconnectedAt: timestamp("disconnected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  integrationIdx: index("integration_connections_integration_idx").on(table.integrationId),
  statusIdx: index("integration_connections_status_idx").on(table.connectionStatus),
}));

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;

// Event Sync States (tracks sync status per event per data type)
export const eventSyncStates = pgTable("event_sync_states", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  dataType: text("data_type").notNull(), // 'attendees', 'sessions', 'session_registrations'
  // Resolved endpoint (with variables substituted)
  resolvedEndpoint: text("resolved_endpoint"),
  // Sync timing
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncTimestamp: text("last_sync_timestamp"), // Server timestamp for incremental sync
  nextSyncAt: timestamp("next_sync_at"),
  // Sync status
  syncStatus: text("sync_status").notNull().default("pending"), // pending, syncing, success, error, disabled
  lastSyncResult: jsonb("last_sync_result").$type<{
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    errorCount: number;
    errors?: Array<{ record: any; error: string }>;
    durationMs: number;
  }>(),
  // Error tracking
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  // Schedule settings (overrides integration defaults)
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  syncIntervalMinutes: integer("sync_interval_minutes"),
  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_sync_states_event_idx").on(table.eventId),
  integrationIdx: index("event_sync_states_integration_idx").on(table.integrationId),
  dataTypeIdx: index("event_sync_states_data_type_idx").on(table.dataType),
  eventDataTypeIdx: index("event_sync_states_event_data_type_idx").on(table.eventId, table.dataType),
}));

export const insertEventSyncStateSchema = createInsertSchema(eventSyncStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventSyncState = z.infer<typeof insertEventSyncStateSchema>;
export type EventSyncState = typeof eventSyncStates.$inferSelect;

// Stored Credentials (encrypted tokens and API keys - never expose to frontend)
export const storedCredentials = pgTable("stored_credentials", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull().references(() => integrationConnections.id, { onDelete: "cascade" }),
  credentialType: text("credential_type").notNull(), // access_token, refresh_token, api_key, client_secret, password
  // Encrypted storage (values encrypted with AES-256-GCM before storage)
  encryptedValue: text("encrypted_value").notNull(), // Base64 encoded encrypted credential
  encryptionKeyId: text("encryption_key_id").notNull(), // Key version for rotation
  iv: text("iv").notNull(), // Initialization vector for decryption
  authTag: text("auth_tag").notNull(), // GCM auth tag for integrity
  // Metadata (not sensitive - can be used for display)
  maskedValue: text("masked_value"), // e.g., "sk-...abc123" for display
  // Token-specific metadata
  tokenType: text("token_type"), // Bearer, Basic, etc.
  scope: text("scope"), // OAuth2 scope
  issuedAt: timestamp("issued_at"),
  expiresAt: timestamp("expires_at"),
  // Status
  isValid: boolean("is_valid").notNull().default(true),
  invalidatedAt: timestamp("invalidated_at"),
  invalidationReason: text("invalidation_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  connectionIdx: index("stored_credentials_connection_idx").on(table.connectionId),
  typeIdx: index("stored_credentials_type_idx").on(table.credentialType),
  expiresAtIdx: index("stored_credentials_expires_at_idx").on(table.expiresAt),
}));

export const insertStoredCredentialSchema = createInsertSchema(storedCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStoredCredential = z.infer<typeof insertStoredCredentialSchema>;
export type StoredCredential = typeof storedCredentials.$inferSelect;

// OAuth2 Tokens (metadata only - actual tokens in secure vault)
export const oauth2Tokens = pgTable("oauth2_tokens", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").references(() => integrationConnections.id, { onDelete: "cascade" }),
  // Token metadata (NOT the actual token)
  accessTokenRef: text("access_token_ref"), // Reference to secret store
  refreshTokenRef: text("refresh_token_ref"), // Reference to secret store
  tokenType: text("token_type").notNull().default("Bearer"),
  scope: text("scope"),
  // Lifecycle management
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  // Status tracking
  status: text("status").notNull().default("active"), // active, expired, revoked, error
  errorMessage: text("error_message"),
  refreshAttempts: integer("refresh_attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  integrationIdx: index("oauth2_tokens_integration_idx").on(table.integrationId),
  connectionIdx: index("oauth2_tokens_connection_idx").on(table.connectionId),
  expiresAtIdx: index("oauth2_tokens_expires_at_idx").on(table.expiresAt),
}));

export const insertOAuth2TokenSchema = createInsertSchema(oauth2Tokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOAuth2Token = z.infer<typeof insertOAuth2TokenSchema>;
export type OAuth2Token = typeof oauth2Tokens.$inferSelect;

// Event Integrations (links events to customer integrations with event-specific variables)
export const eventIntegrations = pgTable("event_integrations", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  // Event-specific variables for API endpoint templating
  // e.g., { accountCode: "ACC123", eventCode: "EVT456" } for Certain
  variables: jsonb("variables").$type<Record<string, string>>().default(sql`'{}'`),
  // Whether this integration is the primary one for syncing
  isPrimary: boolean("is_primary").notNull().default(false),
  // Integration status for this event
  enabled: boolean("enabled").notNull().default(true),
  // Sync metadata
  lastSyncedAt: timestamp("last_synced_at"),
  syncStatus: text("sync_status").notNull().default("pending"), // pending, syncing, synced, error
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_integrations_event_idx").on(table.eventId),
  integrationIdx: index("event_integrations_integration_idx").on(table.integrationId),
  eventIntegrationUnique: index("event_integrations_unique").on(table.eventId, table.integrationId),
}));

export const insertEventIntegrationSchema = createInsertSchema(eventIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventIntegration = z.infer<typeof insertEventIntegrationSchema>;
export type EventIntegration = typeof eventIntegrations.$inferSelect;

// Event Code Mapping (links external event IDs to local events - for sync tracking)
export const eventCodeMappings = pgTable("event_code_mappings", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  // External platform identifiers
  externalEventId: text("external_event_id").notNull(), // Event ID in external system
  externalEventCode: text("external_event_code"), // Human-readable code (if different)
  externalEventName: text("external_event_name"),
  // Sync metadata
  syncCursor: text("sync_cursor"), // For pagination/incremental sync
  lastSyncedAt: timestamp("last_synced_at"),
  totalAttendeesCount: integer("total_attendees_count"),
  syncedAttendeesCount: integer("synced_attendees_count").notNull().default(0),
  // Transformation profile
  fieldMapping: jsonb("field_mapping").$type<{
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    title?: string;
    participantType?: string;
    customFields?: Record<string, string>;
  }>(),
  status: text("status").notNull().default("pending"), // pending, syncing, synced, error
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_code_mappings_event_idx").on(table.eventId),
  integrationIdx: index("event_code_mappings_integration_idx").on(table.integrationId),
  externalEventIdx: index("event_code_mappings_external_event_idx").on(table.externalEventId),
  statusIdx: index("event_code_mappings_status_idx").on(table.status),
}));

export const insertEventCodeMappingSchema = createInsertSchema(eventCodeMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventCodeMapping = z.infer<typeof insertEventCodeMappingSchema>;
export type EventCodeMapping = typeof eventCodeMappings.$inferSelect;

// Sync Jobs (queue and telemetry for background sync operations)
export const syncJobs = pgTable("sync_jobs", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  eventCodeMappingId: text("event_code_mapping_id").references(() => eventCodeMappings.id, { onDelete: "cascade" }),
  endpointConfigId: text("endpoint_config_id").references(() => integrationEndpointConfigs.id, { onDelete: "cascade" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }), // Optional: specific event sync
  jobType: text("job_type").notNull(), // attendee_sync, webhook, manual_refresh, scheduled
  triggerType: text("trigger_type").notNull().default("manual"), // scheduled, manual, on_demand, webhook
  priority: integer("priority").notNull().default(5), // 1-10, lower = higher priority
  // Execution metadata
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, dead_letter
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRetryAt: timestamp("next_retry_at"),
  // Payload and results
  payload: jsonb("payload"),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  // Tracking - enhanced for detailed reporting
  processedRecords: integer("processed_records").notNull().default(0),
  createdRecords: integer("created_records").notNull().default(0),
  updatedRecords: integer("updated_records").notNull().default(0),
  skippedRecords: integer("skipped_records").notNull().default(0),
  failedRecords: integer("failed_records").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  integrationIdx: index("sync_jobs_integration_idx").on(table.integrationId),
  statusIdx: index("sync_jobs_status_idx").on(table.status),
  nextRetryIdx: index("sync_jobs_next_retry_idx").on(table.nextRetryAt),
  priorityIdx: index("sync_jobs_priority_idx").on(table.priority),
  endpointConfigIdx: index("sync_jobs_endpoint_config_idx").on(table.endpointConfigId),
  eventIdx: index("sync_jobs_event_idx").on(table.eventId),
}));

export const insertSyncJobSchema = createInsertSchema(syncJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;
export type SyncJob = typeof syncJobs.$inferSelect;

// Webhook Configurations (for receiving real-time updates)
export const webhookConfigurations = pgTable("webhook_configurations", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // attendee.created, attendee.updated, order.completed, etc.
  url: text("url").notNull(), // Our webhook receiver URL
  // Security
  secretRef: text("secret_ref"), // Reference to HMAC secret for verification
  signatureHeader: text("signature_header").notNull().default("X-Webhook-Signature"),
  // Configuration
  active: boolean("active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  totalReceived: integer("total_received").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  integrationIdx: index("webhook_configurations_integration_idx").on(table.integrationId),
  activeIdx: index("webhook_configurations_active_idx").on(table.active),
}));

export const insertWebhookConfigurationSchema = createInsertSchema(webhookConfigurations).omit({
  id: true,
  createdAt: true,
});
export type InsertWebhookConfiguration = z.infer<typeof insertWebhookConfigurationSchema>;
export type WebhookConfiguration = typeof webhookConfigurations.$inferSelect;

// Session Code Mappings (links external session IDs to local sessions)
export const sessionCodeMappings = pgTable("session_code_mappings", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  eventCodeMappingId: text("event_code_mapping_id").notNull().references(() => eventCodeMappings.id, { onDelete: "cascade" }),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  externalSessionId: text("external_session_id").notNull(),
  externalSessionCode: text("external_session_code"),
  externalSessionName: text("external_session_name"),
  fieldMapping: jsonb("field_mapping").$type<{
    name?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    capacity?: string;
    track?: string;
    speakers?: string;
    customFields?: Record<string, string>;
  }>(),
  lastSyncedAt: timestamp("last_synced_at"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index("session_code_mappings_session_idx").on(table.sessionId),
  eventCodeMappingIdx: index("session_code_mappings_event_code_mapping_idx").on(table.eventCodeMappingId),
  externalSessionIdx: index("session_code_mappings_external_session_idx").on(table.externalSessionId),
}));

export const insertSessionCodeMappingSchema = createInsertSchema(sessionCodeMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSessionCodeMapping = z.infer<typeof insertSessionCodeMappingSchema>;
export type SessionCodeMapping = typeof sessionCodeMappings.$inferSelect;

// Integration Endpoint Configurations (detailed per-datatype endpoint config)
export const integrationEndpointConfigs = pgTable("integration_endpoint_configs", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id").notNull().references(() => customerIntegrations.id, { onDelete: "cascade" }),
  dataType: text("data_type").notNull(), // events, attendees, sessions
  enabled: boolean("enabled").notNull().default(true),
  pathOverride: text("path_override"),
  variableOverrides: jsonb("variable_overrides").$type<Record<string, string>>(),
  filterDefaults: jsonb("filter_defaults").$type<Record<string, string>>(),
  headerOverrides: jsonb("header_overrides").$type<Record<string, string>>(),
  fieldMappingOverrides: jsonb("field_mapping_overrides").$type<Record<string, {
    sourcePath: string;
    transform?: string;
    defaultValue?: string;
  }>>(),
  paginationOverrides: jsonb("pagination_overrides").$type<{
    type?: string;
    limitParam?: string;
    limitDefault?: number;
    cursorParam?: string;
  }>(),
  // Sync schedule configuration (intervals in seconds)
  syncIntervalSeconds: integer("sync_interval_seconds").default(3600), // Default: 1 hour
  syncMinIntervalSeconds: integer("sync_min_interval_seconds").default(60), // Minimum: 1 minute (for onsite)
  syncMaxIntervalSeconds: integer("sync_max_interval_seconds").default(86400), // Maximum: 1 day
  // Sync window (optional - only sync during these hours)
  syncWindowStart: text("sync_window_start"), // e.g., "08:00" (timezone assumed from event)
  syncWindowEnd: text("sync_window_end"), // e.g., "22:00"
  // Sync status tracking
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  nextSyncAt: timestamp("next_sync_at"),
  lastSyncStatus: text("last_sync_status"), // success, failed, in_progress
  lastSyncError: text("last_sync_error"),
  lastSyncCount: integer("last_sync_count"), // Number of records synced
  // On-demand sync flag (triggers immediate sync on next check-in request)
  runOnCheckInRequest: boolean("run_on_check_in_request").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  integrationIdx: index("integration_endpoint_configs_integration_idx").on(table.integrationId),
  dataTypeIdx: index("integration_endpoint_configs_data_type_idx").on(table.dataType),
  integrationDataTypeUnique: index("integration_endpoint_configs_unique").on(table.integrationId, table.dataType),
  nextSyncIdx: index("integration_endpoint_configs_next_sync_idx").on(table.nextSyncAt),
}));

export const insertIntegrationEndpointConfigSchema = createInsertSchema(integrationEndpointConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegrationEndpointConfig = z.infer<typeof insertIntegrationEndpointConfigSchema>;
export type IntegrationEndpointConfig = typeof integrationEndpointConfigs.$inferSelect;

// Check-in log (minimal audit trail for compliance)
export const checkInLog = pgTable("check_in_log", {
  id: text("id").primaryKey(),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  checkedInBy: text("checked_in_by"), // User ID or "kiosk"
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  attendeeIdx: index("check_in_log_attendee_idx").on(table.attendeeId),
  eventIdx: index("check_in_log_event_idx").on(table.eventId),
}));

export const insertCheckInLogSchema = createInsertSchema(checkInLog).omit({
  id: true,
  timestamp: true,
});
export type InsertCheckInLog = z.infer<typeof insertCheckInLogSchema>;
export type CheckInLog = typeof checkInLog.$inferSelect;

// Notification Configurations (outbound notifications for check-in events)
export const notificationConfigurations = pgTable("notification_configurations", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }), // Null = applies to all events
  name: text("name").notNull(),
  // Trigger configuration
  triggerEvent: text("trigger_event").notNull(), // check_in, badge_printed, etc.
  // Filter conditions (optional)
  participantTypeFilter: text("participant_type_filter"), // Only notify for specific participant types
  // Notification channels
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url"),
  webhookSecretRef: text("webhook_secret_ref"), // Reference to HMAC secret
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  smsRecipients: jsonb("sms_recipients").$type<Array<string>>(), // Phone numbers
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailRecipients: jsonb("email_recipients").$type<Array<string>>(), // Email addresses
  emailSubject: text("email_subject"),
  // Payload template (for customizing notification data)
  includeAttendeeDetails: boolean("include_attendee_details").notNull().default(true),
  customPayload: jsonb("custom_payload").$type<Record<string, any>>(),
  // Status
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("notification_configurations_customer_idx").on(table.customerId),
  eventIdx: index("notification_configurations_event_idx").on(table.eventId),
  activeIdx: index("notification_configurations_active_idx").on(table.active),
}));

export const insertNotificationConfigurationSchema = createInsertSchema(notificationConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNotificationConfiguration = z.infer<typeof insertNotificationConfigurationSchema>;
export type NotificationConfiguration = typeof notificationConfigurations.$inferSelect;

// Notification Logs (track sent notifications for debugging)
export const notificationLogs = pgTable("notification_logs", {
  id: text("id").primaryKey(),
  configurationId: text("configuration_id").notNull().references(() => notificationConfigurations.id, { onDelete: "cascade" }),
  attendeeId: text("attendee_id").references(() => attendees.id, { onDelete: "set null" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
  channel: text("channel").notNull(), // webhook, sms, email
  recipient: text("recipient"), // URL, phone number, or email
  payload: jsonb("payload").$type<Record<string, any>>(),
  status: text("status").notNull(), // sent, failed, pending
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => ({
  configIdx: index("notification_logs_config_idx").on(table.configurationId),
  attendeeIdx: index("notification_logs_attendee_idx").on(table.attendeeId),
  statusIdx: index("notification_logs_status_idx").on(table.status),
  sentAtIdx: index("notification_logs_sent_at_idx").on(table.sentAt),
}));

export const insertNotificationLogSchema = createInsertSchema(notificationLogs).omit({
  id: true,
  sentAt: true,
});
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogs.$inferSelect;

// Sessions (scoped to events for session-level check-in)
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  instanceId: integer("instance_id"),
  sessionCode: text("session_code"),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  venue: text("venue"),
  trackName: text("track_name"),
  trackColor: text("track_color"),
  typeName: text("type_name"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  capacity: integer("capacity"),
  restrictToRegistered: boolean("restrict_to_registered").notNull().default(false),
  allowWaitlist: boolean("allow_waitlist").notNull().default(true),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("sessions_event_idx").on(table.eventId),
  startTimeIdx: index("sessions_start_time_idx").on(table.startTime),
  externalIdIdx: index("sessions_external_id_idx").on(table.externalId),
}));

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Session Registrations (tracks attendee registration status for sessions)
export const sessionRegistrations = pgTable("session_registrations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("registered"),
  waitlistPosition: integer("waitlist_position"),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
  promotedAt: timestamp("promoted_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => ({
  sessionIdx: index("session_registrations_session_idx").on(table.sessionId),
  attendeeIdx: index("session_registrations_attendee_idx").on(table.attendeeId),
  statusIdx: index("session_registrations_status_idx").on(table.status),
  sessionAttendeeUnique: index("session_registrations_unique").on(table.sessionId, table.attendeeId),
}));

export const insertSessionRegistrationSchema = createInsertSchema(sessionRegistrations).omit({
  id: true,
  registeredAt: true,
  promotedAt: true,
  cancelledAt: true,
});
export type InsertSessionRegistration = z.infer<typeof insertSessionRegistrationSchema>;
export type SessionRegistration = typeof sessionRegistrations.$inferSelect;

// Session Check-ins (tracks check-in and check-out actions for sessions)
export const sessionCheckins = pgTable("session_checkins", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  source: text("source").notNull().default("kiosk"),
  checkedInBy: text("checked_in_by"),
}, (table) => ({
  sessionIdx: index("session_checkins_session_idx").on(table.sessionId),
  attendeeIdx: index("session_checkins_attendee_idx").on(table.attendeeId),
  timestampIdx: index("session_checkins_timestamp_idx").on(table.timestamp),
}));

export const insertSessionCheckinSchema = createInsertSchema(sessionCheckins).omit({
  id: true,
  timestamp: true,
});
export type InsertSessionCheckin = z.infer<typeof insertSessionCheckinSchema>;
export type SessionCheckin = typeof sessionCheckins.$inferSelect;

// Custom Fonts (scoped to customer accounts for badge printing)
export const customFonts = pgTable("custom_fonts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  fontFamily: text("font_family").notNull(), // CSS font-family name
  fontWeight: text("font_weight").notNull().default("400"), // 100-900
  fontStyle: text("font_style").notNull().default("normal"), // normal, italic
  mimeType: text("mime_type").notNull(), // font/ttf, font/woff, font/woff2
  fileSize: integer("file_size").notNull(), // Size in bytes
  fontData: text("font_data").notNull(), // Base64-encoded font data
  isActive: boolean("is_active").notNull().default(true),
  uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("custom_fonts_customer_idx").on(table.customerId),
  fontFamilyIdx: index("custom_fonts_family_idx").on(table.fontFamily),
}));

export const insertCustomFontSchema = createInsertSchema(customFonts).omit({
  id: true,
  createdAt: true,
}).extend({
  fontWeight: z.enum(["100", "200", "300", "400", "500", "600", "700", "800", "900"]).default("400"),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  mimeType: z.enum(["font/ttf", "font/woff", "font/woff2", "application/x-font-ttf", "application/font-woff", "application/font-woff2"]),
});
export type InsertCustomFont = z.infer<typeof insertCustomFontSchema>;
export type CustomFont = typeof customFonts.$inferSelect;

// Check-in Workflow Configuration (per-event configurable workflow steps)
export const workflowStepTypes = ['buyer_questions', 'disclaimer', 'badge_edit', 'badge_print'] as const;
export type WorkflowStepType = typeof workflowStepTypes[number];

// Event Workflow Configuration (master toggle and settings)
export const eventWorkflowConfigs = pgTable("event_workflow_configs", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }).unique(),
  enabled: boolean("enabled").notNull().default(false),
  // Which interfaces this workflow applies to
  enabledForStaff: boolean("enabled_for_temp_staff").notNull().default(true),
  enabledForKiosk: boolean("enabled_for_kiosk").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_workflow_configs_event_idx").on(table.eventId),
}));

export const insertEventWorkflowConfigSchema = createInsertSchema(eventWorkflowConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventWorkflowConfig = z.infer<typeof insertEventWorkflowConfigSchema>;
export type EventWorkflowConfig = typeof eventWorkflowConfigs.$inferSelect;

// Event Workflow Steps (ordered list of steps in the workflow)
export const eventWorkflowSteps = pgTable("event_workflow_steps", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  stepType: text("step_type").notNull().$type<WorkflowStepType>(),
  position: integer("position").notNull(), // Order in the workflow (0-indexed)
  enabled: boolean("enabled").notNull().default(true),
  // Step-specific config stored as JSON
  config: jsonb("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_workflow_steps_event_idx").on(table.eventId),
  positionIdx: index("event_workflow_steps_position_idx").on(table.eventId, table.position),
}));

export const insertEventWorkflowStepSchema = createInsertSchema(eventWorkflowSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventWorkflowStep = z.infer<typeof insertEventWorkflowStepSchema>;
export type EventWorkflowStep = typeof eventWorkflowSteps.$inferSelect;

// Buyer Question Types
export const buyerQuestionTypes = ['text', 'single_choice', 'multiple_choice', 'rating'] as const;
export type BuyerQuestionType = typeof buyerQuestionTypes[number];

// Event Buyer Questions (up to 3 questions per event)
export const eventBuyerQuestions = pgTable("event_buyer_questions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull().references(() => eventWorkflowSteps.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull().$type<BuyerQuestionType>(),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull(), // Order within the questions (0-2)
  // Options for choice questions (stored as JSON array)
  options: jsonb("options").$type<string[]>().default(sql`'[]'`),
  // Optional placeholder or help text
  placeholder: text("placeholder"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_buyer_questions_event_idx").on(table.eventId),
  stepIdx: index("event_buyer_questions_step_idx").on(table.stepId),
}));

export const insertEventBuyerQuestionSchema = createInsertSchema(eventBuyerQuestions).omit({
  id: true,
  createdAt: true,
});
export type InsertEventBuyerQuestion = z.infer<typeof insertEventBuyerQuestionSchema>;
export type EventBuyerQuestion = typeof eventBuyerQuestions.$inferSelect;

// Event Disclaimers (disclaimer text and signature requirement)
export const eventDisclaimers = pgTable("event_disclaimers", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull().references(() => eventWorkflowSteps.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Terms and Conditions"),
  disclaimerText: text("disclaimer_text").notNull(), // Markdown or plain text
  requireSignature: boolean("require_signature").notNull().default(true),
  // Optional checkbox confirmation text
  confirmationText: text("confirmation_text").default("I have read and agree to the terms above"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_disclaimers_event_idx").on(table.eventId),
  stepIdx: index("event_disclaimers_step_idx").on(table.stepId),
}));

export const insertEventDisclaimerSchema = createInsertSchema(eventDisclaimers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventDisclaimer = z.infer<typeof insertEventDisclaimerSchema>;
export type EventDisclaimer = typeof eventDisclaimers.$inferSelect;

// Attendee Workflow Responses (stores buyer question answers)
export const attendeeWorkflowResponses = pgTable("attendee_workflow_responses", {
  id: text("id").primaryKey(),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull().references(() => eventBuyerQuestions.id, { onDelete: "cascade" }),
  // Response value (text for text questions, selected option(s) for choice questions)
  responseValue: text("response_value"),
  // For multiple choice, store as JSON array
  responseValues: jsonb("response_values").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attendeeIdx: index("attendee_workflow_responses_attendee_idx").on(table.attendeeId),
  eventIdx: index("attendee_workflow_responses_event_idx").on(table.eventId),
  questionIdx: index("attendee_workflow_responses_question_idx").on(table.questionId),
}));

export const insertAttendeeWorkflowResponseSchema = createInsertSchema(attendeeWorkflowResponses).omit({
  id: true,
  createdAt: true,
});
export type InsertAttendeeWorkflowResponse = z.infer<typeof insertAttendeeWorkflowResponseSchema>;
export type AttendeeWorkflowResponse = typeof attendeeWorkflowResponses.$inferSelect;

// Attendee Signatures (stores signature images for disclaimers)
export const attendeeSignatures = pgTable("attendee_signatures", {
  id: text("id").primaryKey(),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  disclaimerId: text("disclaimer_id").notNull().references(() => eventDisclaimers.id, { onDelete: "cascade" }),
  // Signature stored as base64 PNG image data (legacy/inline)
  signatureData: text("signature_data").notNull(),
  // Object storage reference for file-based storage (optional, for exports)
  signatureFileUrl: text("signature_file_url"),
  thumbnailFileUrl: text("thumbnail_file_url"),
  // Metadata
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attendeeIdx: index("attendee_signatures_attendee_idx").on(table.attendeeId),
  eventIdx: index("attendee_signatures_event_idx").on(table.eventId),
  disclaimerIdx: index("attendee_signatures_disclaimer_idx").on(table.disclaimerId),
}));

export const insertAttendeeSignatureSchema = createInsertSchema(attendeeSignatures).omit({
  id: true,
  createdAt: true,
});
export type InsertAttendeeSignature = z.infer<typeof insertAttendeeSignatureSchema>;
export type AttendeeSignature = typeof attendeeSignatures.$inferSelect;

// Password Reset Tokens (for email-based password setup)
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  resetCodeHash: text("reset_code_hash"), // Hashed 6-digit reset code for forgot password flow
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  attempts: integer("attempts").notNull().default(0), // Track verification attempts
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  tokenIdx: index("password_reset_tokens_token_idx").on(table.token),
}));

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// System Settings (global application settings managed by super admins)
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  jsonValue: jsonb("json_value"),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Workflow step with related data (for API responses)
export interface WorkflowStepWithData extends EventWorkflowStep {
  questions?: EventBuyerQuestion[];
  disclaimer?: EventDisclaimer;
}

// Full workflow configuration for an event
export interface EventWorkflowWithSteps extends EventWorkflowConfig {
  steps: WorkflowStepWithData[];
}

// Web-safe fonts list for badge designer
export const WEB_SAFE_FONTS = [
  { family: "Arial", displayName: "Arial", category: "sans-serif" },
  { family: "Helvetica", displayName: "Helvetica", category: "sans-serif" },
  { family: "Verdana", displayName: "Verdana", category: "sans-serif" },
  { family: "Trebuchet MS", displayName: "Trebuchet MS", category: "sans-serif" },
  { family: "Gill Sans", displayName: "Gill Sans", category: "sans-serif" },
  { family: "Tahoma", displayName: "Tahoma", category: "sans-serif" },
  { family: "Georgia", displayName: "Georgia", category: "serif" },
  { family: "Times New Roman", displayName: "Times New Roman", category: "serif" },
  { family: "Palatino Linotype", displayName: "Palatino", category: "serif" },
  { family: "Courier New", displayName: "Courier New", category: "monospace" },
  { family: "Lucida Console", displayName: "Lucida Console", category: "monospace" },
  { family: "Impact", displayName: "Impact", category: "display" },
  { family: "Comic Sans MS", displayName: "Comic Sans MS", category: "casual" },
] as const;

// Google Fonts list (commonly used, bundled with app)
export const GOOGLE_FONTS = [
  { family: "Roboto", displayName: "Roboto", category: "sans-serif", weights: ["100", "300", "400", "500", "700", "900"] },
  { family: "Open Sans", displayName: "Open Sans", category: "sans-serif", weights: ["300", "400", "600", "700", "800"] },
  { family: "Lato", displayName: "Lato", category: "sans-serif", weights: ["100", "300", "400", "700", "900"] },
  { family: "Montserrat", displayName: "Montserrat", category: "sans-serif", weights: ["100", "300", "400", "500", "600", "700", "800", "900"] },
  { family: "Oswald", displayName: "Oswald", category: "display", weights: ["200", "300", "400", "500", "600", "700"] },
  { family: "Raleway", displayName: "Raleway", category: "sans-serif", weights: ["100", "300", "400", "500", "600", "700", "800", "900"] },
  { family: "Playfair Display", displayName: "Playfair Display", category: "serif", weights: ["400", "500", "600", "700", "800", "900"] },
  { family: "Merriweather", displayName: "Merriweather", category: "serif", weights: ["300", "400", "700", "900"] },
  { family: "PT Sans", displayName: "PT Sans", category: "sans-serif", weights: ["400", "700"] },
  { family: "Source Sans Pro", displayName: "Source Sans Pro", category: "sans-serif", weights: ["200", "300", "400", "600", "700", "900"] },
  { family: "Nunito", displayName: "Nunito", category: "sans-serif", weights: ["200", "300", "400", "600", "700", "800", "900"] },
  { family: "Poppins", displayName: "Poppins", category: "sans-serif", weights: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] },
] as const;

// Enhanced merge field type with per-field font weight/style properties
// Note: fontFamily is now at the template level, not per-field
export interface MergeFieldWithStyle {
  field: string;
  label: string;
  fontSize: number;
  position: { x: number; y: number };
  align: 'left' | 'center' | 'right';
  fontWeight?: string; // 100-900 (per-field override)
  fontStyle?: 'normal' | 'italic'; // (per-field override)
  color?: string; // Optional per-field color override
  horizontalPadding?: number; // Padding from edge in pixels (for left/right alignment)
}

// ============================================================================
// Event Configuration Templates (One-Touch Setup)
// ============================================================================

// Staff availability presets for template configuration
export const staffAvailabilityPresets = [
  'day_of_event',
  '1_week_before',
  '2_weeks_before',
  '1_month_before',
  '3_months_before',
] as const;
export type StaffAvailabilityPreset = typeof staffAvailabilityPresets[number];

export const staffEndPresets = [
  'day_after_event',
  '1_week_after',
  'never',
] as const;
export type StaffEndPreset = typeof staffEndPresets[number];

// Event config status
export const eventConfigStatuses = ['unconfigured', 'configured'] as const;
export type EventConfigStatus = typeof eventConfigStatuses[number];

// Workflow step snapshot for template storage
export interface WorkflowStepSnapshot {
  stepType: WorkflowStepType;
  position: number;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// Buyer question snapshot for template storage
export interface BuyerQuestionSnapshot {
  questionText: string;
  questionType: BuyerQuestionType;
  required: boolean;
  position: number;
  options?: string[];
  placeholder?: string;
  stepIndex?: number;
}

// Disclaimer snapshot for template storage
export interface DisclaimerSnapshot {
  title: string;
  disclaimerText: string;
  requireSignature: boolean;
  confirmationText?: string;
  stepIndex?: number;
}

// Full workflow snapshot including steps, questions, and disclaimers
export interface WorkflowSnapshot {
  enabled: boolean;
  enabledForStaff: boolean;
  enabledForKiosk: boolean;
  steps: WorkflowStepSnapshot[];
  buyerQuestions: BuyerQuestionSnapshot[];
  disclaimers: DisclaimerSnapshot[];
}

// Staff settings snapshot for template storage
export interface StaffSettingsSnapshot {
  enabled: boolean;
  startPreset: StaffAvailabilityPreset;
  endPreset: StaffEndPreset;
  passcode?: string; // Plain text - will be hashed when applied
  printPreviewOnCheckin?: boolean;
  defaultRegistrationStatusFilter?: RegistrationStatus[];
}

// Event Configuration Templates table
export const eventConfigurationTemplates = pgTable("event_configuration_templates", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // Badge configuration
  defaultBadgeTemplateId: text("default_badge_template_id").references(() => badgeTemplates.id, { onDelete: "set null" }),
  // Badge template overrides snapshot (participant type -> template ID mapping)
  badgeTemplateOverrides: jsonb("badge_template_overrides").$type<Record<string, string>>(),
  // Default printer (optional)
  defaultPrinterId: text("default_printer_id").references(() => printers.id, { onDelete: "set null" }),
  // Staff site settings snapshot
  staffSettings: jsonb("staff_settings").$type<StaffSettingsSnapshot>(),
  // Workflow configuration snapshot
  workflowSnapshot: jsonb("workflow_snapshot").$type<WorkflowSnapshot>(),
  // Whether to auto-apply this template to newly synced events
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("event_config_templates_customer_idx").on(table.customerId),
  defaultIdx: index("event_config_templates_default_idx").on(table.customerId, table.isDefault),
}));

export const insertEventConfigurationTemplateSchema = createInsertSchema(eventConfigurationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventConfigurationTemplate = z.infer<typeof insertEventConfigurationTemplateSchema>;
export type EventConfigurationTemplate = typeof eventConfigurationTemplates.$inferSelect;

// Event Check-in Notification Rules
// Defines SMS notification rules for when attendees check in
export const eventNotificationRules = pgTable("event_notification_rules", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Filter criteria (all optional - if none set, applies to all check-ins)
  participantTypes: jsonb("participant_types").$type<string[]>().default(sql`'[]'`), // Filter by attendee types
  companyNames: jsonb("company_names").$type<string[]>().default(sql`'[]'`), // Filter by company names (case-insensitive contains)
  attendeeNames: jsonb("attendee_names").$type<string[]>().default(sql`'[]'`), // Filter by specific attendee names
  // SMS Recipients (E.164 format phone numbers)
  smsRecipients: jsonb("sms_recipients").$type<Array<{
    phoneNumber: string; // E.164 format
    name?: string; // Optional display name
  }>>().notNull().default(sql`'[]'`),
  // Notification preferences
  includeAttendeeName: boolean("include_attendee_name").notNull().default(true),
  includeCompany: boolean("include_company").notNull().default(true),
  includeCheckinTime: boolean("include_checkin_time").notNull().default(true),
  customMessage: text("custom_message"), // Optional custom message template
  // Status
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("event_notification_rules_event_idx").on(table.eventId),
  activeIdx: index("event_notification_rules_active_idx").on(table.eventId, table.isActive),
}));

export const insertEventNotificationRuleSchema = createInsertSchema(eventNotificationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEventNotificationRule = z.infer<typeof insertEventNotificationRuleSchema>;
export type EventNotificationRule = typeof eventNotificationRules.$inferSelect;

// User Activity Tracking (for alpha testing insights)
// Tracks page views and actions for super admin dashboard
export const userActivity = pgTable("user_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  // Activity details
  page: text("page").notNull(), // e.g., "/customers/123/events"
  pageTitle: text("page_title"), // Human-readable page name
  action: text("action"), // Optional: "view", "click", "submit", etc.
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Additional context
  // Session tracking
  sessionId: text("session_id"), // Group activities by session
  userAgent: text("user_agent"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("user_activity_user_idx").on(table.userId),
  customerIdx: index("user_activity_customer_idx").on(table.customerId),
  createdAtIdx: index("user_activity_created_at_idx").on(table.createdAt),
  sessionIdx: index("user_activity_session_idx").on(table.sessionId),
}));

export const insertUserActivitySchema = createInsertSchema(userActivity).omit({
  id: true,
  createdAt: true,
});
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type UserActivity = typeof userActivity.$inferSelect;

// User Sessions for presence tracking
export const userPresence = pgTable("user_presence", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  // Current status
  currentPage: text("current_page"),
  currentPageTitle: text("current_page_title"),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  isOnline: boolean("is_online").notNull().default(true),
  // Session info
  sessionId: text("session_id"),
  userAgent: text("user_agent"),
}, (table) => ({
  userIdx: index("user_presence_user_idx").on(table.userId),
  onlineIdx: index("user_presence_online_idx").on(table.isOnline),
  lastActivityIdx: index("user_presence_last_activity_idx").on(table.lastActivityAt),
}));

export type UserPresence = typeof userPresence.$inferSelect;

// Application Error Logs (for alpha testing error tracking)
// Captures server-side errors for debugging and monitoring
export const applicationErrors = pgTable("application_errors", {
  id: text("id").primaryKey(),
  // Error details
  errorType: text("error_type").notNull(), // e.g., "API_ERROR", "SYNC_ERROR", "AUTH_ERROR", "PRINT_ERROR"
  message: text("message").notNull(),
  stack: text("stack"), // Stack trace if available
  // Context
  endpoint: text("endpoint"), // API endpoint that triggered the error
  method: text("method"), // HTTP method (GET, POST, etc.)
  statusCode: integer("status_code"), // HTTP status code returned
  // User/tenant context
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
  // Additional metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Request body, params, etc.
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  // Tracking
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"), // Admin notes about the error
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  typeIdx: index("application_errors_type_idx").on(table.errorType),
  createdAtIdx: index("application_errors_created_at_idx").on(table.createdAt),
  userIdx: index("application_errors_user_idx").on(table.userId),
  customerIdx: index("application_errors_customer_idx").on(table.customerId),
  resolvedIdx: index("application_errors_resolved_idx").on(table.isResolved),
}));

export const insertApplicationErrorSchema = createInsertSchema(applicationErrors).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertApplicationError = z.infer<typeof insertApplicationErrorSchema>;
export type ApplicationError = typeof applicationErrors.$inferSelect;

// Admin Audit Log (tracks changes to sensitive settings like integrations and webhooks)
export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userEmail: text("user_email").notNull(),
  userRole: text("user_role").notNull(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  action: text("action").notNull(), // integration_update, realtime_sync_update, sync_templates_update, sync_settings_update, webhook_config_update
  resourceType: text("resource_type").notNull(), // customer_integration, webhook_configuration, endpoint_config
  resourceId: text("resource_id").notNull(),
  resourceName: text("resource_name"),
  changedFields: jsonb("changed_fields").$type<Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("admin_audit_log_user_idx").on(table.userId),
  customerIdx: index("admin_audit_log_customer_idx").on(table.customerId),
  actionIdx: index("admin_audit_log_action_idx").on(table.action),
  createdAtIdx: index("admin_audit_log_created_at_idx").on(table.createdAt),
  resourceIdx: index("admin_audit_log_resource_idx").on(table.resourceType, table.resourceId),
}));

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

// Giveaways (prize drawings/raffles scoped to an event)
export const giveaways = pgTable("giveaways", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  drawingType: text("drawing_type").notNull().default("random").$type<"random" | "manual" | "first_come">(),
  status: text("status").notNull().default("draft").$type<"draft" | "open" | "drawn" | "closed">(),
  eligibility: text("eligibility").notNull().default("checked_in").$type<"all_registered" | "checked_in" | "custom">(),
  eligibilityRules: jsonb("eligibility_rules").$type<{
    participantTypes?: string[];
    requireBadgePrinted?: boolean;
    requireSessionAttendance?: string[];
    customFilter?: Record<string, string>;
  }>(),
  maxEntriesPerAttendee: integer("max_entries_per_attendee").notNull().default(1),
  scheduledDrawTime: timestamp("scheduled_draw_time"),
  drawnAt: timestamp("drawn_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("giveaways_event_idx").on(table.eventId),
  statusIdx: index("giveaways_status_idx").on(table.status),
}));

export const insertGiveawaySchema = createInsertSchema(giveaways).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  drawnAt: true,
});
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type Giveaway = typeof giveaways.$inferSelect;

// Giveaway Prizes (individual prizes within a giveaway)
export const giveawayPrizes = pgTable("giveaway_prizes", {
  id: text("id").primaryKey(),
  giveawayId: text("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  quantity: integer("quantity").notNull().default(1),
  quantityAwarded: integer("quantity_awarded").notNull().default(0),
  value: text("value"),
  imageUrl: text("image_url"),
  sponsorName: text("sponsor_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  giveawayIdx: index("giveaway_prizes_giveaway_idx").on(table.giveawayId),
}));

export const insertGiveawayPrizeSchema = createInsertSchema(giveawayPrizes).omit({
  id: true,
  createdAt: true,
  quantityAwarded: true,
});
export type InsertGiveawayPrize = z.infer<typeof insertGiveawayPrizeSchema>;
export type GiveawayPrize = typeof giveawayPrizes.$inferSelect;

// Giveaway Entries (attendee entries into a giveaway)
export const giveawayEntries = pgTable("giveaway_entries", {
  id: text("id").primaryKey(),
  giveawayId: text("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  entryMethod: text("entry_method").notNull().default("auto").$type<"auto" | "scan" | "manual" | "checkin">(),
  entryCount: integer("entry_count").notNull().default(1),
  enteredAt: timestamp("entered_at").notNull().defaultNow(),
}, (table) => ({
  giveawayIdx: index("giveaway_entries_giveaway_idx").on(table.giveawayId),
  attendeeIdx: index("giveaway_entries_attendee_idx").on(table.attendeeId),
  giveawayAttendeeUnique: index("giveaway_entries_unique").on(table.giveawayId, table.attendeeId),
}));

export const insertGiveawayEntrySchema = createInsertSchema(giveawayEntries).omit({
  id: true,
  enteredAt: true,
});
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;
export type GiveawayEntry = typeof giveawayEntries.$inferSelect;

// Giveaway Winners (tracks prize awards and claim status)
export const giveawayWinners = pgTable("giveaway_winners", {
  id: text("id").primaryKey(),
  giveawayId: text("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  prizeId: text("prize_id").notNull().references(() => giveawayPrizes.id, { onDelete: "cascade" }),
  attendeeId: text("attendee_id").notNull().references(() => attendees.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending").$type<"pending" | "notified" | "claimed" | "forfeited" | "redrawn">(),
  notifiedAt: timestamp("notified_at"),
  claimedAt: timestamp("claimed_at"),
  claimMethod: text("claim_method").$type<"in_person" | "kiosk" | "remote">(),
  notes: text("notes"),
  drawnAt: timestamp("drawn_at").notNull().defaultNow(),
}, (table) => ({
  giveawayIdx: index("giveaway_winners_giveaway_idx").on(table.giveawayId),
  prizeIdx: index("giveaway_winners_prize_idx").on(table.prizeId),
  attendeeIdx: index("giveaway_winners_attendee_idx").on(table.attendeeId),
  statusIdx: index("giveaway_winners_status_idx").on(table.status),
}));

export const insertGiveawayWinnerSchema = createInsertSchema(giveawayWinners).omit({
  id: true,
  drawnAt: true,
  notifiedAt: true,
  claimedAt: true,
});
export type InsertGiveawayWinner = z.infer<typeof insertGiveawayWinnerSchema>;
export type GiveawayWinner = typeof giveawayWinners.$inferSelect;

// Beta Feedback System
export const feedbackTypes = ['comment', 'feature_request', 'issue'] as const;
export const feedbackSeverities = ['low', 'medium', 'high', 'critical'] as const;
export const feedbackStatuses = ['new', 'reviewed', 'planned', 'fixed_pending_uat', 'resolved', 'dismissed'] as const;

export const feedbackEntries = pgTable("feedback_entries", {
  id: text("id").primaryKey().$defaultFn(() => `fb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
  ticketNumber: integer("ticket_number"),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  userRole: text("user_role"),
  submitterName: text("submitter_name"),
  page: text("page"),
  pageTitle: text("page_title"),
  type: text("type").notNull().$type<typeof feedbackTypes[number]>().default("comment"),
  message: text("message").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  sentiment: text("sentiment").$type<"positive" | "neutral" | "negative">(),
  severity: text("severity").$type<typeof feedbackSeverities[number]>(),
  status: text("status").notNull().$type<typeof feedbackStatuses[number]>().default("new"),
  screenshotUrl: text("screenshot_url"),
  adminNotes: text("admin_notes"),
  adminResponse: text("admin_response"),
  adminResponseAt: timestamp("admin_response_at"),
  adminResponderId: text("admin_responder_id").references(() => users.id, { onDelete: "set null" }),
  userReadAt: timestamp("user_read_at"),
  urgentNotifiedAt: timestamp("urgent_notified_at"),
  digestNotifiedAt: timestamp("digest_notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("feedback_customer_idx").on(table.customerId),
  typeIdx: index("feedback_type_idx").on(table.type),
  statusIdx: index("feedback_status_idx").on(table.status),
  createdIdx: index("feedback_created_idx").on(table.createdAt),
  userIdx: index("feedback_user_idx").on(table.userId),
  ticketIdx: index("feedback_ticket_idx").on(table.ticketNumber),
}));

export const insertFeedbackEntrySchema = createInsertSchema(feedbackEntries).omit({
  id: true,
  createdAt: true,
});
export type InsertFeedbackEntry = z.infer<typeof insertFeedbackEntrySchema>;
export type FeedbackEntry = typeof feedbackEntries.$inferSelect;

export const behaviorActions = ['start', 'complete', 'abandon'] as const;

export const behaviorEvents = pgTable("behavior_events", {
  id: text("id").primaryKey().$defaultFn(() => `be-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
  customerId: text("customer_id"),
  eventId: text("event_id"),
  userRole: text("user_role"),
  feature: text("feature").notNull(),
  step: text("step"),
  action: text("action").notNull().$type<typeof behaviorActions[number]>(),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  featureIdx: index("behavior_feature_idx").on(table.feature),
  createdIdx: index("behavior_created_idx").on(table.createdAt),
}));

export const insertBehaviorEventSchema = createInsertSchema(behaviorEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertBehaviorEvent = z.infer<typeof insertBehaviorEventSchema>;
export type BehaviorEvent = typeof behaviorEvents.$inferSelect;

export const featureFlags = pgTable("feature_flags", {
  id: text("id").primaryKey().$defaultFn(() => `ff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  enabled: boolean("enabled").notNull().default(false),
  scope: text("scope").notNull().default("platform"),
  rolloutPercentage: integer("rollout_percentage").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  keyIdx: index("feature_flags_key_idx").on(table.key),
  categoryIdx: index("feature_flags_category_idx").on(table.category),
}));

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

export const behaviorAggregates = pgTable("behavior_aggregates", {
  id: text("id").primaryKey().$defaultFn(() => `ba-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
  day: text("day").notNull(),
  customerId: text("customer_id"),
  eventId: text("event_id"),
  feature: text("feature").notNull(),
  step: text("step"),
  starts: integer("starts").notNull().default(0),
  completions: integer("completions").notNull().default(0),
  abandons: integer("abandons").notNull().default(0),
  avgDurationMs: integer("avg_duration_ms"),
  uniqueRoles: jsonb("unique_roles").$type<string[]>().default([]),
}, (table) => ({
  dayIdx: index("behavior_agg_day_idx").on(table.day),
  featureIdx: index("behavior_agg_feature_idx").on(table.feature),
}));

export const dataRetentionLog = pgTable("data_retention_log", {
  id: text("id").primaryKey().$defaultFn(() => `drl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  eventId: text("event_id"),
  eventName: text("event_name"),
  action: text("action").notNull().$type<'anonymize' | 'delete' | 'notify'>(),
  attendeesAffected: integer("attendees_affected").notNull().default(0),
  retentionDays: integer("retention_days").notNull(),
  retentionBasis: text("retention_basis").$type<'event_end_date' | 'last_check_in'>(),
  eligibleDate: timestamp("eligible_date"),
  policySource: text("policy_source").notNull().$type<'account' | 'event_override'>(),
  details: jsonb("details").$type<Record<string, any>>(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
}, (table) => ({
  customerIdx: index("data_retention_log_customer_idx").on(table.customerId),
  eventIdx: index("data_retention_log_event_idx").on(table.eventId),
  actionIdx: index("data_retention_log_action_idx").on(table.action),
  processedAtIdx: index("data_retention_log_processed_at_idx").on(table.processedAt),
}));

export const insertDataRetentionLogSchema = createInsertSchema(dataRetentionLog).omit({
  id: true,
  processedAt: true,
});
export type InsertDataRetentionLog = z.infer<typeof insertDataRetentionLogSchema>;
export type DataRetentionLog = typeof dataRetentionLog.$inferSelect;
