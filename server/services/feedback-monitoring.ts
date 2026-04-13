import { createChildLogger } from '../logger';
import { db } from "../db";
import { feedbackEntries, customers, users } from "@shared/schema";
import { eq, isNull, and, or, inArray, gte } from "drizzle-orm";
import { analyzeUrgentFeedback } from "./feedback-ai";

const logger = createChildLogger('FeedbackMonitor');

const SLACK_WEBHOOK_URL = process.env.SLACK_FEEDBACK_WEBHOOK_URL;

const TYPE_EMOJI: Record<string, string> = {
  comment: ":speech_balloon:",
  feature_request: ":bulb:",
  issue: ":warning:",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Normal",
  high: "High",
  critical: "Urgent",
};

function isWorkflowWebhook(url: string): boolean {
  return url.startsWith("https://hooks.slack.com/triggers/");
}

async function sendSlackMessage(payload: Record<string, unknown>): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn("No SLACK_FEEDBACK_WEBHOOK_URL configured");
    return false;
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`Slack returned ${response.status}: ${text.substring(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "Failed to send Slack message");
    return false;
  }
}

export async function checkAndNotifyUrgentFeedback(): Promise<void> {
  try {
    const urgentEntries = await db
      .select()
      .from(feedbackEntries)
      .where(
        and(
          isNull(feedbackEntries.urgentNotifiedAt),
          or(
            eq(feedbackEntries.severity, "critical"),
            eq(feedbackEntries.severity, "high")
          )
        )
      );

    if (urgentEntries.length === 0) return;

    logger.info(`Found ${urgentEntries.length} unnotified urgent feedback entries`);

    for (const entry of urgentEntries) {
      let customerName = "";
      if (entry.customerId) {
        try {
          const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, entry.customerId)).limit(1);
          if (cust?.name) customerName = cust.name;
        } catch {}
      }

      let userName = "Unknown";
      if (entry.userId) {
        try {
          const [user] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, entry.userId)).limit(1);
          if (user) userName = user.email || `${user.firstName} ${user.lastName}`;
        } catch {}
      }

      let aiAnalysis = null;
      try {
        aiAnalysis = await analyzeUrgentFeedback({
          type: entry.type,
          message: entry.message,
          severity: entry.severity || "high",
          page: entry.page || undefined,
          userRole: entry.userRole || undefined,
          customerName: customerName || undefined,
        });
        logger.info(`AI analysis complete for ${entry.id}`);
      } catch (error) {
        logger.error({ err: error }, `AI analysis failed for ${entry.id}`);
      }

      const emoji = entry.severity === "critical" ? ":rotating_light:" : ":exclamation:";
      const severityLabel = SEVERITY_LABEL[entry.severity || "high"] || "High";
      const typeLabel = (entry.type || "issue").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

      if (SLACK_WEBHOOK_URL && isWorkflowWebhook(SLACK_WEBHOOK_URL)) {
        const details: string[] = [];
        details.push(`From: ${userName}`);
        if (customerName) details.push(`Account: ${customerName}`);
        if (entry.userRole) details.push(`Role: ${entry.userRole.replace(/_/g, " ")}`);
        if (entry.page) details.push(`Page: ${entry.page}`);
        details.push(`Severity: ${severityLabel}`);

        let aiSummary = "";
        if (aiAnalysis) {
          aiSummary = `\n\nAI Review:\n- Valid: ${aiAnalysis.isValid ? "Yes" : "No"}\n- Summary: ${aiAnalysis.summary}\n- Impact: ${aiAnalysis.impact}\n- Suggested Fix: ${aiAnalysis.suggestedFix}\n- AI Priority: ${aiAnalysis.priority}`;
        }

        await sendSlackMessage({
          title: `${emoji} URGENT ${typeLabel} - Immediate Attention Required`,
          type: typeLabel,
          message: entry.message + aiSummary,
          details: details.join(" | "),
          severity: severityLabel,
          from: userName,
          customer: customerName || "Unknown",
          page: entry.page || "Unknown",
        });
      } else if (SLACK_WEBHOOK_URL) {
        const blocks: Array<Record<string, unknown>> = [
          {
            type: "header",
            text: { type: "plain_text", text: `${emoji} URGENT: ${typeLabel}`, emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${severityLabel} priority* from *${userName}*${customerName ? ` (${customerName})` : ""}` },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: entry.message },
          },
        ];

        const meta: string[] = [];
        if (entry.page) meta.push(`*Page:* ${entry.page}`);
        if (entry.userRole) meta.push(`*Role:* ${entry.userRole.replace(/_/g, " ")}`);
        if (meta.length > 0) {
          blocks.push({ type: "section", text: { type: "mrkdwn", text: meta.join("  |  ") } });
        }

        if (aiAnalysis) {
          blocks.push({ type: "divider" });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:robot_face: *AI Review*\n` +
                `> *Valid:* ${aiAnalysis.isValid ? "Yes" : "No"}\n` +
                `> *Summary:* ${aiAnalysis.summary}\n` +
                `> *Impact:* ${aiAnalysis.impact}\n` +
                `> *Suggested Fix:* ${aiAnalysis.suggestedFix}\n` +
                `> *AI Priority:* ${aiAnalysis.priority}`,
            },
          });
        }

        await sendSlackMessage({ blocks });
      }

      await db.update(feedbackEntries)
        .set({ urgentNotifiedAt: new Date() })
        .where(eq(feedbackEntries.id, entry.id));

      logger.info(`Sent urgent alert for ${entry.id}`);
    }
  } catch (error) {
    logger.error({ err: error }, "Error in urgent feedback check");
  }
}

export async function sendDailyDigest(): Promise<void> {
  try {
    const pendingEntries = await db
      .select()
      .from(feedbackEntries)
      .where(
        and(
          isNull(feedbackEntries.digestNotifiedAt),
          or(
            isNull(feedbackEntries.severity),
            eq(feedbackEntries.severity, "low"),
            eq(feedbackEntries.severity, "medium")
          )
        )
      );

    if (pendingEntries.length === 0) {
      logger.info("No new non-urgent feedback for daily digest");
      return;
    }

    logger.info(`Compiling daily digest with ${pendingEntries.length} entries`);

    const byType: Record<string, number> = {};
    for (const entry of pendingEntries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    if (SLACK_WEBHOOK_URL && isWorkflowWebhook(SLACK_WEBHOOK_URL)) {
      const itemList = pendingEntries.map((e, i) => {
        const emoji = TYPE_EMOJI[e.type] || ":memo:";
        const severity = e.severity ? ` [${SEVERITY_LABEL[e.severity] || e.severity}]` : "";
        return `${i + 1}. ${emoji}${severity} ${e.message.substring(0, 120)}${e.message.length > 120 ? "..." : ""}`;
      }).join("\n");

      const typeSummary = Object.entries(byType)
        .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}${count !== 1 ? "s" : ""}`)
        .join(", ");

      await sendSlackMessage({
        title: `:clipboard: Daily Feedback Digest - ${pendingEntries.length} New Items`,
        type: "Daily Digest",
        message: itemList,
        details: `Summary: ${typeSummary}`,
        severity: "digest",
        from: "Feedback Monitor",
        customer: "All",
        page: "N/A",
      });
    } else if (SLACK_WEBHOOK_URL) {
      const blocks: Array<Record<string, unknown>> = [
        {
          type: "header",
          text: { type: "plain_text", text: `:clipboard: Daily Feedback Digest`, emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${pendingEntries.length} new feedback items* received today`,
          },
        },
      ];

      const typeSummary = Object.entries(byType)
        .map(([type, count]) => `${TYPE_EMOJI[type] || ":memo:"} ${count} ${type.replace(/_/g, " ")}${count !== 1 ? "s" : ""}`)
        .join("  |  ");
      blocks.push({ type: "section", text: { type: "mrkdwn", text: typeSummary } });

      blocks.push({ type: "divider" });

      for (const entry of pendingEntries.slice(0, 10)) {
        const emoji = TYPE_EMOJI[entry.type] || ":memo:";
        const severity = entry.severity ? ` [${SEVERITY_LABEL[entry.severity] || entry.severity}]` : "";
        const truncated = entry.message.length > 150 ? entry.message.substring(0, 150) + "..." : entry.message;
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `${emoji}${severity} ${truncated}\n_Page: ${entry.page || "N/A"}_` },
        });
      }

      if (pendingEntries.length > 10) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `_...and ${pendingEntries.length - 10} more. View all in the Feedback Dashboard._` },
        });
      }

      await sendSlackMessage({ blocks });
    }

    const ids = pendingEntries.map(e => e.id);
    await db.update(feedbackEntries)
      .set({ digestNotifiedAt: new Date() })
      .where(inArray(feedbackEntries.id, ids));

    logger.info(`Daily digest sent with ${pendingEntries.length} items`);
  } catch (error) {
    logger.error({ err: error }, "Error sending daily digest");
  }
}

export function startFeedbackMonitoring(): void {
  logger.info("Starting feedback monitoring agent");

  setInterval(checkAndNotifyUrgentFeedback, 2 * 60 * 1000);
  setTimeout(checkAndNotifyUrgentFeedback, 15000);

  scheduleDailyDigest();
}

function scheduleDailyDigest(): void {
  const now = new Date();
  const targetHourUTC = 2;

  const nextRun = new Date(now);
  nextRun.setUTCHours(targetHourUTC, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  const msUntilNextRun = nextRun.getTime() - now.getTime();
  const hoursUntil = (msUntilNextRun / (1000 * 60 * 60)).toFixed(1);
  logger.info(`Daily digest scheduled in ${hoursUntil} hours (6 PM PT / ${nextRun.toISOString()})`);

  setTimeout(() => {
    sendDailyDigest();
    setInterval(sendDailyDigest, 24 * 60 * 60 * 1000);
  }, msUntilNextRun);
}
