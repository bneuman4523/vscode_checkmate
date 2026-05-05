import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createChildLogger } from "../logger";

const logger = createChildLogger("LicenseProvisioning");

type LicenseType = "basic" | "premium";

interface FeatureDef {
  key: string;
  name: string;
  description?: string;
  category: string;
  basic: boolean;
  premium: boolean | "coming_soon";
  metadata?: Record<string, unknown>;
}

const FEATURE_DEFINITIONS: FeatureDef[] = [
  { key: "config_templates", name: "Configuration Templates", description: "Save and reuse event configurations across events", category: "administration", basic: true, premium: true },
  { key: "offline_checkin", name: "Offline Check-In", description: "Check in attendees without internet — syncs when reconnected", category: "administration", basic: true, premium: true },
  { key: "offline_badge_print", name: "Offline Badge Printing", description: "Queue badge prints while offline for later processing", category: "administration", basic: true, premium: true },
  { key: "account_management", name: "Customer Account Management", description: "Multi-tenant account administration and user management", category: "administration", basic: false, premium: true },
  { key: "audit_trail", name: "Full Audit Trail", description: "Track all configuration changes with user, timestamp, and details", category: "administration", basic: false, premium: true },
  { key: "security_compliance", name: "OWASP Security Compliance", description: "Rate limiting, input sanitization, timing-safe auth, and encrypted credentials", category: "administration", basic: false, premium: true },
  { key: "multi_account_access", name: "Multi-Account Access", description: "Partner role with access to multiple customer accounts", category: "administration", basic: false, premium: "coming_soon" },
  { key: "data_privacy_controls", name: "GDPR/CCPA Data Privacy", description: "Automated data retention policies and right-to-deletion support", category: "administration", basic: false, premium: "coming_soon" },
  { key: "sso_authentication", name: "SSO Authentication", description: "SAML/OIDC single sign-on for admin users via corporate identity providers (Okta, Azure AD, Google Workspace)", category: "administration", basic: false, premium: "coming_soon" },

  { key: "event_dashboard", name: "Event Dashboard", description: "Real-time event overview with check-in stats and progress", category: "analytics", basic: true, premium: true },
  { key: "exportable_reports", name: "Exportable Reports", description: "Export attendee data and check-in reports as CSV or Excel", category: "analytics", basic: true, premium: true },
  { key: "cross_account_analytics", name: "Cross-Account Analytics", description: "Platform-wide stats across all customer accounts", category: "analytics", basic: false, premium: true },
  { key: "account_dashboard", name: "Account Dashboard", description: "Account-level overview of events, attendees, and activity", category: "analytics", basic: false, premium: true },
  { key: "activity_monitor", name: "Real-Time Activity Monitor", description: "Live feed of check-ins, prints, and staff activity across events", category: "analytics", basic: false, premium: true },

  { key: "attendee_list", name: "Attendee List", description: "View and manage event attendees with search and filtering", category: "attendee_management", basic: true, premium: true },
  { key: "qr_checkin", name: "QR Code Check-In", description: "Scan QR codes from badges or confirmation emails to check in", category: "attendee_management", basic: true, premium: true },
  { key: "manual_checkin", name: "Manual Check-In", description: "Search by name or email and check in manually", category: "attendee_management", basic: true, premium: true },
  { key: "walkin_registration", name: "Walk-In Registration", description: "Register new attendees on-site from kiosk or staff dashboard", category: "attendee_management", basic: true, premium: true },
  { key: "offline_sync", name: "Offline Check-In + Sync", description: "Check-ins queue locally and sync when back online", category: "attendee_management", basic: true, premium: true },
  { key: "realtime_search", name: "Real-Time Search", description: "Instant attendee search with typeahead matching", category: "attendee_management", basic: true, premium: true },
  { key: "status_filtering", name: "Status Filtering", description: "Filter attendees by registration status", category: "attendee_management", basic: true, premium: true },
  { key: "checkin_reversal", name: "Check-In Reversal", description: "Undo a check-in and clear all workflow data", category: "attendee_management", basic: true, premium: true },
  { key: "realtime_stats", name: "Real-Time Stats", description: "Live check-in counts and progress on the event dashboard", category: "attendee_management", basic: true, premium: true },
  { key: "duplicate_detection", name: "Duplicate Detection", description: "Warn when scanning a badge that was already checked in", category: "attendee_management", basic: true, premium: true },
  { key: "custom_data_fields", name: "Custom Data Fields", description: "Store and display custom attendee fields from integrations", category: "attendee_management", basic: true, premium: true },
  { key: "duplicate_prevention", name: "Duplicate Prevention", description: "Prevent duplicate attendee records during import", category: "attendee_management", basic: true, premium: true },
  { key: "session_tracking", name: "Session Tracking", description: "Track breakout session attendance with check-in/check-out", category: "attendee_management", basic: false, premium: true },
  { key: "session_checkin", name: "Session Check-In/Out", description: "Dedicated session check-in with timestamps and duration tracking", category: "attendee_management", basic: false, premium: true },
  { key: "waitlist_management", name: "Waitlist Management", description: "Auto-waitlist when sessions hit capacity, promote on cancellation", category: "attendee_management", basic: false, premium: true },
  { key: "session_kiosk", name: "Session Kiosk", description: "Self-service kiosk for session-level check-in on tablets", category: "attendee_management", basic: false, premium: true },
  { key: "group_checkin", name: "Group Check-In", description: "Scan one order code to check in an entire group at once", category: "attendee_management", basic: false, premium: true },
  { key: "custom_workflow", name: "Custom Workflow", description: "Multi-step check-in with questions, disclaimers, and badge printing", category: "attendee_management", basic: false, premium: true },
  { key: "digital_signature", name: "Digital Signature", description: "Capture signatures on disclaimers during check-in workflow", category: "attendee_management", basic: false, premium: true },
  { key: "canceled_blocking", name: "Canceled Blocking", description: "Block check-in for attendees with canceled registration status", category: "attendee_management", basic: false, premium: true },
  { key: "session_capacity", name: "Session Capacity", description: "Enforce max capacity per session with real-time count", category: "attendee_management", basic: false, premium: true },
  { key: "balance_due_block", name: "Balance Due Block", description: "Block badge printing for attendees with outstanding balance", category: "attendee_management", basic: false, premium: "coming_soon" },

  { key: "badge_merge_fields", name: "Dynamic Merge Fields", description: "Place attendee data fields anywhere on the badge", category: "badge_design", basic: true, premium: true },
  { key: "badge_images", name: "Image Elements", description: "Add logos, banners, and background images to badges", category: "badge_design", basic: true, premium: true },
  { key: "badge_predesigned", name: "Pre-Designed Templates", description: "Start from built-in badge templates", category: "badge_design", basic: true, premium: true },
  { key: "badge_designer", name: "Drag-and-Drop Designer", description: "Visual badge editor with positioning and styling controls", category: "badge_design", basic: true, premium: true },
  { key: "badge_type_mapping", name: "Template by Type", description: "Assign different badge templates per attendee type", category: "badge_design", basic: true, premium: true },
  { key: "wireless_printing", name: "Wireless Printing", description: "Print via WiFi to network printers", category: "badge_design", basic: true, premium: true },
  { key: "zebra_usb", name: "Zebra USB", description: "Direct USB printing to Zebra label printers", category: "badge_design", basic: true, premium: true },
  { key: "two_sided_printing", name: "Two-Sided Printing", description: "Print front and back badge panels", category: "badge_design", basic: true, premium: true },
  { key: "duplicate_print_prevention", name: "Duplicate Print Prevention", description: "Warn before reprinting a badge that was already printed", category: "badge_design", basic: true, premium: true },
  { key: "offline_print_queue", name: "Offline Print Queue", description: "Queue print jobs when printer is offline, process when reconnected", category: "badge_design", basic: true, premium: true },
  { key: "custom_fonts", name: "Custom Font Upload", description: "Upload TTF/WOFF fonts for branded badge typography", category: "badge_design", basic: false, premium: true },
  { key: "auto_size_text", name: "Auto-Sizing Text", description: "Automatically shrink text to fit within badge boundaries", category: "badge_design", basic: false, premium: true },
  { key: "foldable_badges", name: "Foldable Badge Support", description: "Design foldable badges with separate front and back layouts", category: "badge_design", basic: false, premium: true },
  { key: "back_panel_printing", name: "Back Panel Printing", description: "Print agenda, maps, or info on the badge back panel", category: "badge_design", basic: false, premium: true },
  { key: "badge_flip_preview", name: "3D Badge Preview", description: "Interactive 3D preview of front and back badge panels", category: "badge_design", basic: false, premium: true },
  { key: "ai_badge_design", name: "AI Badge Design", description: "AI-assisted badge layout suggestions and optimization", category: "badge_design", basic: false, premium: true },
  { key: "cloud_printing", name: "Remote Cloud Printing", description: "Print badges via PrintNode to printers anywhere", category: "badge_design", basic: false, premium: true },
  { key: "high_res_rendering", name: "High-Res Rendering", description: "Render badges at 300 or 600 DPI for professional output", category: "badge_design", basic: false, premium: true },
  { key: "pdf_badge_export", name: "PDF Badge Export", description: "Download badges as PDF for external printing", category: "badge_design", basic: false, premium: true },
  { key: "bulk_badge_print", name: "Bulk Badge Printing", description: "Select multiple attendees and print all badges at once", category: "badge_design", basic: false, premium: true },
  { key: "custom_templates_unlimited", name: "Unlimited Custom Templates", description: "Create unlimited badge templates (basic: 3 max)", category: "badge_design", basic: false, premium: true, metadata: { basicLimit: 3 } },

  { key: "event_crud", name: "Create & Edit Events", description: "Create, edit, and manage event details and dates", category: "event_management", basic: true, premium: true },
  { key: "location_timezone", name: "Location & Timezone", description: "Assign venue locations and timezone for accurate timestamps", category: "event_management", basic: true, premium: true },
  { key: "multi_event", name: "Multi-Event per Account", description: "Manage multiple events under one customer account", category: "event_management", basic: true, premium: true },
  { key: "event_status", name: "Event Status Tracking", description: "Track event lifecycle from setup through completion", category: "event_management", basic: true, premium: true },
  { key: "reusable_config", name: "Reusable Config Templates", description: "Save event configurations as templates for quick setup", category: "event_management", basic: true, premium: true },
  { key: "attendee_types", name: "Attendee Type Categorization", description: "Categorize attendees (VIP, Speaker, General) for badge mapping", category: "event_management", basic: true, premium: true },

  { key: "ai_sentiment", name: "AI Sentiment Analysis", description: "Analyze feedback sentiment with AI-powered categorization", category: "feedback", basic: false, premium: true },
  { key: "ai_feedback_slack", name: "AI Feedback + Slack Alerts", description: "Route AI-analyzed feedback to Slack channels", category: "feedback", basic: false, premium: true },
  { key: "staff_messaging", name: "Staff Internal Messaging", description: "In-app messaging between event staff members", category: "feedback", basic: false, premium: "coming_soon" },

  { key: "prize_management", name: "Prize & Raffle Management", description: "Manage prizes and run drawings at events", category: "giveaways", basic: false, premium: true },
  { key: "winner_tracking", name: "Winner Lifecycle Tracking", description: "Track prize winners from drawing through collection", category: "giveaways", basic: false, premium: true },
  { key: "per_event_giveaways", name: "Per-Event Giveaways", description: "Configure separate prize pools per event", category: "giveaways", basic: false, premium: "coming_soon" },

  { key: "event_sync", name: "Event Sync & Integration", description: "Connect to external platforms to sync events, attendees, and sessions", category: "integrations", basic: true, premium: true },
  { key: "inbound_api", name: "Inbound API", description: "Allow external systems to push attendee, event, and session data to Greet via API", category: "integrations", basic: false, premium: true },
  { key: "csv_import_export", name: "CSV Import/Export", description: "Import attendees from CSV and export check-in data", category: "integrations", basic: true, premium: true },
  { key: "auto_event_discovery", name: "Auto Event Discovery", description: "Browse and select events from connected platforms", category: "integrations", basic: true, premium: true },
  { key: "two_way_sync", name: "Two-Way Sync", description: "Push check-in status back to the source platform in real-time", category: "integrations", basic: true, premium: true },
  { key: "walkin_sync", name: "Walk-In Sync", description: "Sync walk-in registrations back to the source platform", category: "integrations", basic: true, premium: true },
  { key: "field_mapping", name: "Field Mapping", description: "Map custom fields between platforms for badge merge fields", category: "integrations", basic: false, premium: true },
  { key: "standalone_mode", name: "Standalone Check-In Mode", description: "Run events without an integration — manual attendee management only", category: "integrations", basic: false, premium: true },
  { key: "sync_pause", name: "Per-Event Sync Pause", description: "Pause automatic sync for individual events without disconnecting", category: "integrations", basic: false, premium: true },
  { key: "third_party_integration", name: "Third-Party Integration", description: "Connect to Eventbrite, Cvent, RegFox, and other platforms", category: "integrations", basic: false, premium: true },
  { key: "status_push_external", name: "Status Push to External", description: "Push check-in and badge status to external systems via webhook", category: "integrations", basic: false, premium: "coming_soon" },
  { key: "printer_isolation", name: "Per-Account Printer Isolation", description: "Restrict printer visibility to specific customer accounts", category: "integrations", basic: false, premium: "coming_soon" },
  { key: "advanced_sync", name: "Advanced Sync Engine", description: "Adaptive scheduling, circuit breakers, and conflict resolution", category: "integrations", basic: false, premium: "coming_soon" },

  { key: "kiosk_event", name: "Self-Service Kiosk (Event)", description: "Unattended check-in kiosk for event-level registration", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_launcher", name: "Kiosk Launcher", description: "Launch kiosk mode from the staff dashboard", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_pin_exit", name: "PIN-Protected Exit", description: "Require a PIN to exit kiosk mode on tablets", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_duplicate_handling", name: "Duplicate Handling", description: "Handle already-checked-in attendees in kiosk mode", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_session", name: "Session Kiosk", description: "Dedicated kiosk for breakout session check-in", category: "kiosk", basic: false, premium: true },

  { key: "sms_notifications", name: "SMS Notifications", description: "Send SMS alerts via Twilio on check-in or badge print", category: "notifications", basic: true, premium: true },
  { key: "email_notifications", name: "Email Notifications", description: "Send email alerts via SendGrid on event triggers", category: "notifications", basic: true, premium: true },
  { key: "custom_notification_rules", name: "Custom Notification Rules", description: "Create rules to trigger notifications by attendee type or name", category: "notifications", basic: false, premium: true },
  { key: "slack_alerts", name: "Slack Alerts", description: "Post real-time event activity to Slack channels", category: "notifications", basic: false, premium: true },
  { key: "configurable_triggers", name: "Configurable Triggers", description: "Fire notifications on check-in, badge print, or walk-in events", category: "notifications", basic: false, premium: true },
  { key: "custom_notification_content", name: "Custom Content w/ Data", description: "Include attendee data in notification messages and webhooks", category: "notifications", basic: false, premium: true },
  { key: "inbound_webhooks", name: "Inbound Webhooks", description: "Receive real-time registration updates from external platforms", category: "notifications", basic: false, premium: "coming_soon" },
  { key: "notification_audit_log", name: "Notification Audit Log", description: "Track all sent notifications with delivery status", category: "notifications", basic: false, premium: "coming_soon" },
];

export function getFeatureDefinitions(): FeatureDef[] {
  return FEATURE_DEFINITIONS;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function provisionFeatureFlags(customerId: string, licenseType: LicenseType): Promise<number> {
  const existing = await db.select()
    .from(schema.accountFeatureConfigs)
    .where(eq(schema.accountFeatureConfigs.customerId, customerId));

  if (existing.length > 0) {
    logger.info({ customerId }, "Feature configs already exist, skipping provisioning");
    return existing.length;
  }

  const rows = FEATURE_DEFINITIONS.map((def) => {
    let enabled: boolean;
    if (licenseType === "basic") {
      enabled = def.basic;
    } else {
      enabled = def.premium === true;
    }

    return {
      id: generateId("afc"),
      customerId,
      featureKey: def.key,
      enabled,
      metadata: def.metadata || null,
    };
  });

  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    await db.insert(schema.accountFeatureConfigs).values(rows.slice(i, i + batchSize));
  }

  logger.info({ customerId, licenseType, count: rows.length }, "Feature flags provisioned");
  return rows.length;
}

export async function updateLicenseFeatures(customerId: string, newLicenseType: LicenseType): Promise<number> {
  let updated = 0;

  for (const def of FEATURE_DEFINITIONS) {
    let enabled: boolean;
    if (newLicenseType === "basic") {
      enabled = def.basic;
    } else {
      enabled = def.premium === true;
    }

    const result = await db.update(schema.accountFeatureConfigs)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(schema.accountFeatureConfigs.customerId, customerId),
          eq(schema.accountFeatureConfigs.featureKey, def.key)
        )
      );
    if ((result.rowCount ?? 0) > 0) updated++;
  }

  logger.info({ customerId, newLicenseType, updated }, "License features updated");
  return updated;
}

export async function getAccountFeatureConfigs(customerId: string): Promise<schema.AccountFeatureConfig[]> {
  const configs = await db.select()
    .from(schema.accountFeatureConfigs)
    .where(eq(schema.accountFeatureConfigs.customerId, customerId));

  if (configs.length === 0) {
    const customer = await db.select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);

    if (customer.length > 0) {
      const licenseType: LicenseType = (customer[0].licenseType as LicenseType) || "basic";
      logger.info({ customerId, licenseType }, "Auto-provisioning missing feature flags");
      await provisionFeatureFlags(customerId, licenseType);
      return db.select()
        .from(schema.accountFeatureConfigs)
        .where(eq(schema.accountFeatureConfigs.customerId, customerId));
    }
  }

  return configs;
}

export async function toggleAccountFeature(customerId: string, featureKey: string, enabled: boolean): Promise<boolean> {
  const result = await db.update(schema.accountFeatureConfigs)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(schema.accountFeatureConfigs.customerId, customerId),
        eq(schema.accountFeatureConfigs.featureKey, featureKey)
      )
    );
  return (result.rowCount ?? 0) > 0;
}

export const LICENSE_PLANS = {
  starter: { name: "Starter", prepaidAttendees: 1000 },
  professional: { name: "Professional", prepaidAttendees: 5000 },
  enterprise: { name: "Enterprise", prepaidAttendees: 20000 },
  strategic: { name: "Strategic", prepaidAttendees: 45000 },
} as const;

export type LicensePlan = keyof typeof LICENSE_PLANS;
