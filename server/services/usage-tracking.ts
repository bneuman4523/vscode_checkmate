import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { createChildLogger } from "../logger";

const logger = createChildLogger("UsageTracking");

const SLACK_USAGE_WEBHOOK_URL = process.env.SLACK_USAGE_WEBHOOK_URL;

interface UsageSummary {
  customerId: string;
  customerName: string;
  licenseType: string;
  licensePlan: string | null;
  prepaidAttendees: number | null;
  totalAttendees: number;
  activeAttendees: number;
  eventCount: number;
  usagePercent: number | null;
  recentSnapshots: schema.AttendeeUsageSnapshot[];
  recentAlerts: schema.UsageAlert[];
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function getUsageSummary(customerId: string): Promise<UsageSummary | null> {
  const [customer] = await db.select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);

  if (!customer) return null;

  const attendeeCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.attendees)
    .innerJoin(schema.events, eq(schema.attendees.eventId, schema.events.id))
    .where(eq(schema.events.customerId, customerId));

  const eventCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.events)
    .where(eq(schema.events.customerId, customerId));

  const activeEventCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.events)
    .where(and(
      eq(schema.events.customerId, customerId),
      eq(schema.events.status, "active")
    ));

  const activeEventIds = await db.select({ id: schema.events.id })
    .from(schema.events)
    .where(and(
      eq(schema.events.customerId, customerId),
      eq(schema.events.status, "active")
    ));

  let activeAttendees = 0;
  if (activeEventIds.length > 0) {
    const ids = activeEventIds.map(e => e.id);
    for (const eid of ids) {
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(schema.attendees)
        .where(eq(schema.attendees.eventId, eid));
      activeAttendees += result.count;
    }
  }

  const totalAttendees = attendeeCount[0]?.count ?? 0;

  const recentSnapshots = await db.select()
    .from(schema.attendeeUsageSnapshots)
    .where(eq(schema.attendeeUsageSnapshots.customerId, customerId))
    .orderBy(desc(schema.attendeeUsageSnapshots.snapshotDate))
    .limit(30);

  const recentAlerts = await db.select()
    .from(schema.usageAlerts)
    .where(eq(schema.usageAlerts.customerId, customerId))
    .orderBy(desc(schema.usageAlerts.sentAt))
    .limit(10);

  const usagePercent = customer.prepaidAttendees
    ? Math.round((totalAttendees / customer.prepaidAttendees) * 100)
    : null;

  return {
    customerId,
    customerName: customer.name,
    licenseType: customer.licenseType || "basic",
    licensePlan: customer.licensePlan || null,
    prepaidAttendees: customer.prepaidAttendees ?? null,
    totalAttendees,
    activeAttendees,
    eventCount: eventCount[0]?.count ?? 0,
    usagePercent,
    recentSnapshots,
    recentAlerts,
  };
}

export async function getAllPremiumUsageSummaries(): Promise<UsageSummary[]> {
  const premiumCustomers = await db.select()
    .from(schema.customers)
    .where(eq(schema.customers.licenseType, "premium"));

  const summaries: UsageSummary[] = [];
  for (const customer of premiumCustomers) {
    const summary = await getUsageSummary(customer.id);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

export async function takeUsageSnapshot(customerId: string): Promise<schema.AttendeeUsageSnapshot> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.select()
    .from(schema.attendeeUsageSnapshots)
    .where(and(
      eq(schema.attendeeUsageSnapshots.customerId, customerId),
      eq(schema.attendeeUsageSnapshots.snapshotDate, today)
    ))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const summary = await getUsageSummary(customerId);
  if (!summary) throw new Error(`Customer ${customerId} not found`);

  const [snapshot] = await db.insert(schema.attendeeUsageSnapshots).values({
    id: generateId("aus"),
    customerId,
    snapshotDate: today,
    totalAttendees: summary.totalAttendees,
    activeAttendees: summary.activeAttendees,
    eventCount: summary.eventCount,
  }).returning();

  return snapshot;
}

const ALERT_THRESHOLDS = [
  { percent: 110, type: "exceeded_limit" as const, message: (name: string, count: number, limit: number, pct: number) =>
    `${name} is significantly over limit: ${count.toLocaleString()} of ${limit.toLocaleString()} attendees (${pct}%). Priority follow-up required.` },
  { percent: 100, type: "exceeded_limit" as const, message: (name: string, count: number, limit: number, pct: number) =>
    `${name} has exceeded their prepaid limit: ${count.toLocaleString()} of ${limit.toLocaleString()} attendees. Immediate outreach needed.` },
  { percent: 90, type: "approaching_limit" as const, message: (name: string, count: number, limit: number, pct: number) =>
    `${name} is at ${count.toLocaleString()} of ${limit.toLocaleString()} prepaid attendees (90%). Upsell is urgent.` },
  { percent: 75, type: "approaching_limit" as const, message: (name: string, count: number, limit: number, pct: number) =>
    `${name} has used ${count.toLocaleString()} of ${limit.toLocaleString()} prepaid attendees (75%). Time to start the upsell conversation.` },
];

async function sendSlackUsageAlert(message: string, alertType: string): Promise<boolean> {
  if (!SLACK_USAGE_WEBHOOK_URL) {
    logger.warn("No SLACK_USAGE_WEBHOOK_URL configured, skipping usage alert");
    return false;
  }

  const emoji = alertType === "exceeded_limit" ? ":rotating_light:" : ":chart_with_upwards_trend:";

  try {
    const response = await fetch(SLACK_USAGE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${emoji} *Greet Usage Alert*\n${message}`,
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Failed to send Slack usage alert");
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "Error sending Slack usage alert");
    return false;
  }
}

export async function checkAndSendAlerts(customerId: string): Promise<void> {
  const summary = await getUsageSummary(customerId);
  if (!summary || !summary.prepaidAttendees) return;

  const usagePercent = Math.round((summary.totalAttendees / summary.prepaidAttendees) * 100);

  for (const threshold of ALERT_THRESHOLDS) {
    if (usagePercent >= threshold.percent) {
      const existingAlert = await db.select()
        .from(schema.usageAlerts)
        .where(and(
          eq(schema.usageAlerts.customerId, customerId),
          eq(schema.usageAlerts.threshold, threshold.percent)
        ))
        .limit(1);

      if (existingAlert.length > 0) continue;

      const message = threshold.message(
        summary.customerName,
        summary.totalAttendees,
        summary.prepaidAttendees,
        usagePercent
      );

      await sendSlackUsageAlert(message, threshold.type);

      await db.insert(schema.usageAlerts).values({
        id: generateId("ua"),
        customerId,
        alertType: threshold.type,
        threshold: threshold.percent,
        attendeeCount: summary.totalAttendees,
        prepaidLimit: summary.prepaidAttendees,
        message,
      });

      logger.info({ customerId, threshold: threshold.percent, usagePercent }, "Usage alert sent");
      break;
    }
  }
}

export async function runDailyUsageCheck(): Promise<void> {
  logger.info("Starting daily usage check");

  const premiumCustomers = await db.select()
    .from(schema.customers)
    .where(eq(schema.customers.licenseType, "premium"));

  for (const customer of premiumCustomers) {
    try {
      await takeUsageSnapshot(customer.id);
      await checkAndSendAlerts(customer.id);
    } catch (error) {
      logger.error({ err: error, customerId: customer.id }, "Error processing usage for customer");
    }
  }

  logger.info({ customerCount: premiumCustomers.length }, "Daily usage check complete");
}
