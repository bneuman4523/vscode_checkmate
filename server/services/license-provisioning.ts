import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createChildLogger } from "../logger";

const logger = createChildLogger("LicenseProvisioning");

type LicenseType = "basic" | "premium";

interface FeatureDef {
  key: string;
  name: string;
  category: string;
  basic: boolean;
  premium: boolean | "coming_soon";
  metadata?: Record<string, unknown>;
}

const FEATURE_DEFINITIONS: FeatureDef[] = [
  { key: "config_templates", name: "Configuration Templates", category: "administration", basic: true, premium: true },
  { key: "offline_checkin", name: "Offline Check-In", category: "administration", basic: true, premium: true },
  { key: "offline_badge_print", name: "Offline Badge Printing", category: "administration", basic: true, premium: true },
  { key: "account_management", name: "Customer Account Management", category: "administration", basic: false, premium: true },
  { key: "audit_trail", name: "Full Audit Trail", category: "administration", basic: false, premium: true },
  { key: "security_compliance", name: "OWASP Security Compliance", category: "administration", basic: false, premium: true },
  { key: "multi_account_access", name: "Multi-Account Access", category: "administration", basic: false, premium: "coming_soon" },
  { key: "data_privacy_controls", name: "GDPR/CCPA Data Privacy", category: "administration", basic: false, premium: "coming_soon" },

  { key: "event_dashboard", name: "Event Dashboard", category: "analytics", basic: true, premium: true },
  { key: "exportable_reports", name: "Exportable Reports", category: "analytics", basic: true, premium: true },
  { key: "cross_account_analytics", name: "Cross-Account Analytics", category: "analytics", basic: false, premium: true },
  { key: "account_dashboard", name: "Account Dashboard", category: "analytics", basic: false, premium: true },
  { key: "activity_monitor", name: "Real-Time Activity Monitor", category: "analytics", basic: false, premium: true },

  { key: "attendee_list", name: "Attendee List", category: "attendee_management", basic: true, premium: true },
  { key: "qr_checkin", name: "QR Code Check-In", category: "attendee_management", basic: true, premium: true },
  { key: "manual_checkin", name: "Manual Check-In", category: "attendee_management", basic: true, premium: true },
  { key: "walkin_registration", name: "Walk-In Registration", category: "attendee_management", basic: true, premium: true },
  { key: "offline_sync", name: "Offline Check-In + Sync", category: "attendee_management", basic: true, premium: true },
  { key: "realtime_search", name: "Real-Time Search", category: "attendee_management", basic: true, premium: true },
  { key: "status_filtering", name: "Status Filtering", category: "attendee_management", basic: true, premium: true },
  { key: "checkin_reversal", name: "Check-In Reversal", category: "attendee_management", basic: true, premium: true },
  { key: "realtime_stats", name: "Real-Time Stats", category: "attendee_management", basic: true, premium: true },
  { key: "duplicate_detection", name: "Duplicate Detection", category: "attendee_management", basic: true, premium: true },
  { key: "custom_data_fields", name: "Custom Data Fields", category: "attendee_management", basic: true, premium: true },
  { key: "duplicate_prevention", name: "Duplicate Prevention", category: "attendee_management", basic: true, premium: true },
  { key: "session_tracking", name: "Session Tracking", category: "attendee_management", basic: false, premium: true },
  { key: "session_checkin", name: "Session Check-In/Out", category: "attendee_management", basic: false, premium: true },
  { key: "waitlist_management", name: "Waitlist Management", category: "attendee_management", basic: false, premium: true },
  { key: "session_kiosk", name: "Session Kiosk", category: "attendee_management", basic: false, premium: true },
  { key: "group_checkin", name: "Group Check-In", category: "attendee_management", basic: false, premium: true },
  { key: "custom_workflow", name: "Custom Workflow", category: "attendee_management", basic: false, premium: true },
  { key: "digital_signature", name: "Digital Signature", category: "attendee_management", basic: false, premium: true },
  { key: "canceled_blocking", name: "Canceled Blocking", category: "attendee_management", basic: false, premium: true },
  { key: "session_capacity", name: "Session Capacity", category: "attendee_management", basic: false, premium: true },
  { key: "balance_due_block", name: "Balance Due Block", category: "attendee_management", basic: false, premium: "coming_soon" },

  { key: "badge_merge_fields", name: "Dynamic Merge Fields", category: "badge_design", basic: true, premium: true },
  { key: "badge_images", name: "Image Elements", category: "badge_design", basic: true, premium: true },
  { key: "badge_predesigned", name: "Pre-Designed Templates", category: "badge_design", basic: true, premium: true },
  { key: "badge_designer", name: "Drag-and-Drop Designer", category: "badge_design", basic: true, premium: true },
  { key: "badge_type_mapping", name: "Template by Type", category: "badge_design", basic: true, premium: true },
  { key: "wireless_printing", name: "Wireless Printing", category: "badge_design", basic: true, premium: true },
  { key: "zebra_usb", name: "Zebra USB", category: "badge_design", basic: true, premium: true },
  { key: "two_sided_printing", name: "Two-Sided Printing", category: "badge_design", basic: true, premium: true },
  { key: "duplicate_print_prevention", name: "Duplicate Print Prevention", category: "badge_design", basic: true, premium: true },
  { key: "offline_print_queue", name: "Offline Print Queue", category: "badge_design", basic: true, premium: true },
  { key: "custom_fonts", name: "Custom Font Upload", category: "badge_design", basic: false, premium: true },
  { key: "auto_size_text", name: "Auto-Sizing Text", category: "badge_design", basic: false, premium: true },
  { key: "foldable_badges", name: "Foldable Badge Support", category: "badge_design", basic: false, premium: true },
  { key: "back_panel_printing", name: "Back Panel Printing", category: "badge_design", basic: false, premium: true },
  { key: "badge_flip_preview", name: "3D Badge Preview", category: "badge_design", basic: false, premium: true },
  { key: "ai_badge_design", name: "AI Badge Design", category: "badge_design", basic: false, premium: true },
  { key: "cloud_printing", name: "Remote Cloud Printing", category: "badge_design", basic: false, premium: true },
  { key: "high_res_rendering", name: "High-Res Rendering", category: "badge_design", basic: false, premium: true },
  { key: "pdf_badge_export", name: "PDF Badge Export", category: "badge_design", basic: false, premium: true },
  { key: "bulk_badge_print", name: "Bulk Badge Printing", category: "badge_design", basic: false, premium: true },
  { key: "custom_templates_unlimited", name: "Unlimited Custom Templates", category: "badge_design", basic: false, premium: true, metadata: { basicLimit: 3 } },

  { key: "event_crud", name: "Create & Edit Events", category: "event_management", basic: true, premium: true },
  { key: "location_timezone", name: "Location & Timezone", category: "event_management", basic: true, premium: true },
  { key: "multi_event", name: "Multi-Event per Account", category: "event_management", basic: true, premium: true },
  { key: "event_status", name: "Event Status Tracking", category: "event_management", basic: true, premium: true },
  { key: "reusable_config", name: "Reusable Config Templates", category: "event_management", basic: true, premium: true },
  { key: "attendee_types", name: "Attendee Type Categorization", category: "event_management", basic: true, premium: true },

  { key: "ai_sentiment", name: "AI Sentiment Analysis", category: "feedback", basic: false, premium: true },
  { key: "ai_feedback_slack", name: "AI Feedback + Slack Alerts", category: "feedback", basic: false, premium: true },
  { key: "staff_messaging", name: "Staff Internal Messaging", category: "feedback", basic: false, premium: "coming_soon" },

  { key: "prize_management", name: "Prize & Raffle Management", category: "giveaways", basic: false, premium: true },
  { key: "winner_tracking", name: "Winner Lifecycle Tracking", category: "giveaways", basic: false, premium: true },
  { key: "per_event_giveaways", name: "Per-Event Giveaways", category: "giveaways", basic: false, premium: "coming_soon" },

  { key: "event_sync", name: "Event Sync & Integration", category: "integrations", basic: true, premium: true },
  { key: "csv_import_export", name: "CSV Import/Export", category: "integrations", basic: true, premium: true },
  { key: "auto_event_discovery", name: "Auto Event Discovery", category: "integrations", basic: true, premium: true },
  { key: "two_way_sync", name: "Two-Way Sync", category: "integrations", basic: true, premium: true },
  { key: "walkin_sync", name: "Walk-In Sync", category: "integrations", basic: true, premium: true },
  { key: "field_mapping", name: "Field Mapping", category: "integrations", basic: false, premium: true },
  { key: "standalone_mode", name: "Standalone Check-In Mode", category: "integrations", basic: false, premium: true },
  { key: "sync_pause", name: "Per-Event Sync Pause", category: "integrations", basic: false, premium: true },
  { key: "third_party_integration", name: "Third-Party Integration", category: "integrations", basic: false, premium: true },
  { key: "status_push_external", name: "Status Push to External", category: "integrations", basic: false, premium: "coming_soon" },
  { key: "printer_isolation", name: "Per-Account Printer Isolation", category: "integrations", basic: false, premium: "coming_soon" },
  { key: "advanced_sync", name: "Advanced Sync Engine", category: "integrations", basic: false, premium: "coming_soon" },

  { key: "kiosk_event", name: "Self-Service Kiosk (Event)", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_launcher", name: "Kiosk Launcher", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_pin_exit", name: "PIN-Protected Exit", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_duplicate_handling", name: "Duplicate Handling", category: "kiosk", basic: true, premium: true },
  { key: "kiosk_session", name: "Session Kiosk", category: "kiosk", basic: false, premium: true },

  { key: "sms_notifications", name: "SMS Notifications", category: "notifications", basic: true, premium: true },
  { key: "email_notifications", name: "Email Notifications", category: "notifications", basic: true, premium: true },
  { key: "custom_notification_rules", name: "Custom Notification Rules", category: "notifications", basic: false, premium: true },
  { key: "slack_alerts", name: "Slack Alerts", category: "notifications", basic: false, premium: true },
  { key: "configurable_triggers", name: "Configurable Triggers", category: "notifications", basic: false, premium: true },
  { key: "custom_notification_content", name: "Custom Content w/ Data", category: "notifications", basic: false, premium: true },
  { key: "inbound_webhooks", name: "Inbound Webhooks", category: "notifications", basic: false, premium: "coming_soon" },
  { key: "notification_audit_log", name: "Notification Audit Log", category: "notifications", basic: false, premium: "coming_soon" },
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
