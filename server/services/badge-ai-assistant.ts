import { createChildLogger } from '../logger';
import Anthropic from "@anthropic-ai/sdk";
import type { BadgeTemplate, Event, Attendee } from "@shared/schema";

const logger = createChildLogger('BadgeAI');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";

export interface BadgeContext {
  template?: BadgeTemplate | null;
  event?: Event | null;
  attendee?: Attendee | null;
  printerStatus?: string;
  lastPrintError?: string | null;
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
  action?: {
    type: "update_template" | "check_printer" | "retry_print" | "none";
    data?: Record<string, unknown>;
  };
}

const SYSTEM_PROMPT = `You are a helpful AI assistant specialized in badge design and printing for event check-in systems. Your role is to:

1. Help users configure badge templates (fonts, sizes, colors, field placement, QR codes)
2. Troubleshoot printing issues and determine if problems are software/configuration or hardware/printer related
3. Suggest improvements to badge designs for readability and professionalism
4. Guide users through the check-in process

When troubleshooting printing issues:
- If the badge data looks correct but printing fails, suggest checking the printer connection, paper, and ink
- If the badge template has issues (missing fields, wrong sizes), suggest specific configuration changes
- Always provide clear, actionable suggestions

For badge configuration:
- Standard badge sizes: 4x3 inches (landscape), 3x4 inches (portrait), 2x3.5 inches (smaller events)
- Recommended font sizes: Name 18-24pt, Company 12-16pt, Title 10-14pt
- QR code placement: typically bottom-right or bottom-center
- Always ensure text contrast is readable

Respond in JSON format with the following structure:
{
  "message": "Your helpful response to the user",
  "suggestions": ["Optional array of actionable suggestions"],
  "action": {
    "type": "update_template | check_printer | retry_print | none",
    "data": { "optional configuration changes" }
  }
}`;

export async function getBadgeAssistance(
  userMessage: string,
  context: BadgeContext
): Promise<AIResponse> {
  try {
    const contextDescription = buildContextDescription(context);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Current context:\n${contextDescription}\n\nUser question: ${userMessage}`,
      }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    let content = textBlock?.type === "text" ? textBlock.text.trim() : "{}";

    // Strip markdown code fences if present
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(content) as AIResponse;

    return {
      message: parsed.message || "I'm sorry, I couldn't process that request.",
      suggestions: parsed.suggestions || [],
      action: parsed.action || { type: "none" }
    };
  } catch (error) {
    logger.error({ err: error }, "Error getting AI assistance");
    return {
      message: "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
      suggestions: [],
      action: { type: "none" }
    };
  }
}

function buildContextDescription(context: BadgeContext): string {
  const parts: string[] = [];

  if (context.event) {
    parts.push(`Event: "${context.event.name}" (Status: ${context.event.status})`);
  }

  if (context.template) {
    parts.push(`Badge Template: "${context.template.name}"`);
    parts.push(`  - Size: ${context.template.width}" x ${context.template.height}"`);
    parts.push(`  - Font: ${context.template.fontFamily || "Default"}`);
    parts.push(`  - Background: ${context.template.backgroundColor}`);
    parts.push(`  - Text Color: ${context.template.textColor}`);
    parts.push(`  - QR Code: ${context.template.includeQR ? `Yes (${context.template.qrPosition})` : "No"}`);
    if (context.template.mergeFields && Array.isArray(context.template.mergeFields)) {
      const fields = context.template.mergeFields.map((f: any) =>
        `${f.field} (${f.fontSize || "default"}pt at ${f.position?.x || 0},${f.position?.y || 0})`
      ).join(", ");
      parts.push(`  - Fields: ${fields}`);
    }
  } else {
    parts.push("No badge template selected for this event.");
  }

  if (context.attendee) {
    parts.push(`Current Attendee: ${context.attendee.firstName} ${context.attendee.lastName}`);
    parts.push(`  - Type: ${context.attendee.participantType || "General"}`);
    parts.push(`  - Checked In: ${context.attendee.checkedIn ? "Yes" : "No"}`);
    parts.push(`  - Badge Printed: ${context.attendee.badgePrinted ? "Yes" : "No"}`);
  }

  if (context.printerStatus) {
    parts.push(`Printer Status: ${context.printerStatus}`);
  }

  if (context.lastPrintError) {
    parts.push(`Last Print Error: ${context.lastPrintError}`);
  }

  return parts.join("\n") || "No context available.";
}

export async function analyzeAndSuggestTemplateChanges(
  template: BadgeTemplate,
  issue: string
): Promise<AIResponse> {
  const prompt = `The user is having this issue with their badge template: "${issue}"

Please analyze the template configuration and suggest specific changes to fix the issue.`;

  return getBadgeAssistance(prompt, { template });
}

export async function troubleshootPrinting(
  template: BadgeTemplate | null,
  attendee: Attendee | null,
  errorMessage: string
): Promise<AIResponse> {
  const prompt = `A badge failed to print with this error: "${errorMessage}"

Please help determine if this is:
1. A configuration issue (wrong template settings, missing data)
2. A printer issue (connection, paper, ink)
3. A software issue (application error)

And provide specific steps to resolve it.`;

  return getBadgeAssistance(prompt, {
    template,
    attendee,
    lastPrintError: errorMessage
  });
}
