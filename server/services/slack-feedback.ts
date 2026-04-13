import { createChildLogger } from '../logger';

const logger = createChildLogger('SlackFeedback');

const SLACK_WEBHOOK_URL = process.env.SLACK_FEEDBACK_WEBHOOK_URL;

interface FeedbackPayload {
  type: string;
  message: string;
  severity?: string;
  page?: string;
  pageTitle?: string;
  userName?: string;
  userRole?: string;
  customerName?: string;
  eventId?: string;
  tags?: string[];
  screenshotUrl?: string;
  ticketRef?: string;
}

const TYPE_EMOJI: Record<string, string> = {
  comment: ":speech_balloon:",
  feature_request: ":bulb:",
  issue: ":warning:",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low - Nice to have",
  medium: "Normal - Can work around it",
  high: "High - Significantly impacts work",
  critical: ":rotating_light: Urgent - Can't use app without this",
};

function isWorkflowWebhook(url: string): boolean {
  return url.startsWith("https://hooks.slack.com/triggers/");
}

function isIncomingWebhook(url: string): boolean {
  return url.startsWith("https://hooks.slack.com/services/");
}

function buildWorkflowPayload(payload: FeedbackPayload): Record<string, string> {
  const emoji = TYPE_EMOJI[payload.type] || ":memo:";
  const typeLabel = payload.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const details: string[] = [];
  if (payload.userName) details.push(`From: ${payload.userName}`);
  if (payload.customerName) details.push(`Account: ${payload.customerName}`);
  if (payload.userRole) details.push(`Role: ${payload.userRole.replace(/_/g, " ")}`);
  if (payload.pageTitle || payload.page) details.push(`Page: ${payload.pageTitle || payload.page}`);
  if (payload.severity) details.push(`Severity: ${SEVERITY_LABEL[payload.severity] || payload.severity}`);
  if (payload.tags && payload.tags.length > 0) details.push(`Tags: ${payload.tags.join(", ")}`);
  if (payload.eventId) details.push(`Event ID: ${payload.eventId}`);
  if (payload.screenshotUrl) details.push(`Screenshot: ${payload.screenshotUrl}`);

  return {
    title: payload.ticketRef ? `${emoji} ${payload.ticketRef} — New ${typeLabel}` : `${emoji} New ${typeLabel}`,
    type: typeLabel,
    message: payload.message,
    details: details.join(" | "),
    severity: payload.severity || "none",
    from: payload.userName || "Unknown",
    customer: payload.customerName || "Unknown",
    page: payload.pageTitle || payload.page || "Unknown",
    screenshot: payload.screenshotUrl || "",
    ticket_ref: payload.ticketRef || "",
  };
}

function buildIncomingWebhookPayload(payload: FeedbackPayload): object {
  const emoji = TYPE_EMOJI[payload.type] || ":memo:";
  const typeLabel = payload.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const fields: string[] = [];
  if (payload.userName) fields.push(`*From:* ${payload.userName}`);
  if (payload.userRole) fields.push(`*Role:* ${payload.userRole.replace(/_/g, " ")}`);
  if (payload.pageTitle || payload.page) fields.push(`*Page:* ${payload.pageTitle || payload.page}`);
  if (payload.severity) fields.push(`*Severity:* ${SEVERITY_LABEL[payload.severity] || payload.severity}`);
  if (payload.tags && payload.tags.length > 0) fields.push(`*Tags:* ${payload.tags.join(", ")}`);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: payload.ticketRef ? `${emoji} ${payload.ticketRef} — New ${typeLabel}` : `${emoji} New ${typeLabel}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: payload.message,
      },
    },
  ];

  if (fields.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: fields.join("  |  "),
      },
    });
  }

  if (payload.screenshotUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:camera: <${payload.screenshotUrl}|View Screenshot>`,
      },
    });
  }

  return { blocks };
}

export async function sendFeedbackToSlack(payload: FeedbackPayload): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn("No SLACK_FEEDBACK_WEBHOOK_URL configured, skipping notification");
    return false;
  }

  const isWorkflow = isWorkflowWebhook(SLACK_WEBHOOK_URL);
  const isIncoming = isIncomingWebhook(SLACK_WEBHOOK_URL);

  if (!isWorkflow && !isIncoming) {
    logger.error(`SLACK_FEEDBACK_WEBHOOK_URL is not a recognized Slack webhook URL. Expected https://hooks.slack.com/services/... or https://hooks.slack.com/triggers/... Current value starts with: ${SLACK_WEBHOOK_URL.substring(0, 35)}...`);
    return false;
  }

  const body = isWorkflow
    ? buildWorkflowPayload(payload)
    : buildIncomingWebhookPayload(payload);

  const mode = isWorkflow ? "Workflow" : "Incoming Webhook";
  logger.info(`Sending via ${mode}...`);

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(`Slack ${mode} returned ${response.status}: ${responseText.substring(0, 200)}`);
      return false;
    }

    logger.info(`Successfully sent feedback via Slack ${mode}`);
    return true;
  } catch (error) {
    logger.error({ err: error }, "Failed to send Slack notification");
    return false;
  }
}
