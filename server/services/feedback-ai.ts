import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const MODEL = "gemini-2.5-flash";

export interface FeedbackInsights {
  themes: Array<{ theme: string; count: number; description: string }>;
  topRequests: Array<{ title: string; mentions: number; summary: string }>;
  emergingIssues: Array<{ issue: string; severity: string; description: string }>;
  usagePatterns: Array<{ pattern: string; description: string }>;
  recommendations: Array<{ action: string; priority: string; rationale: string }>;
  generatedAt: string;
}

interface FeedbackEntry {
  type: string;
  message: string;
  severity?: string;
  page?: string;
  userRole?: string;
  createdAt: string;
}

interface BehaviorAggregate {
  day: string;
  feature: string;
  step?: string;
  starts: number;
  completions: number;
  abandons: number;
  avgDurationMs?: number;
}

export function redactPII(text: string): string {
  let redacted = text;
  redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  redacted = redacted.replace(/(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, "[PHONE]");
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
  redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD]");
  return redacted;
}

export async function analyzeFeedback(
  feedbackEntries: FeedbackEntry[],
  behaviorAggregates: BehaviorAggregate[]
): Promise<FeedbackInsights> {
  const feedbackSummary = feedbackEntries.map((e) => ({
    type: e.type,
    message: redactPII(e.message),
    severity: e.severity || "unset",
    page: e.page || "unknown",
    role: e.userRole || "unknown",
    date: e.createdAt?.substring(0, 10),
  }));

  const usageSummary = behaviorAggregates.map((a) => ({
    day: a.day,
    feature: a.feature,
    step: a.step || "overall",
    starts: a.starts,
    completions: a.completions,
    abandons: a.abandons,
    avgMs: a.avgDurationMs,
  }));

  const prompt = `You are a product analytics expert analyzing beta feedback and usage data for an event check-in and badge printing application called "Checkmate".

Analyze the following data and return a JSON object with these fields:
- themes: Array of {theme, count, description} - Common themes across feedback (max 5)
- topRequests: Array of {title, mentions, summary} - Most requested features (max 5)
- emergingIssues: Array of {issue, severity, description} - Issues needing attention, severity is "low"|"medium"|"high"|"critical" (max 5)
- usagePatterns: Array of {pattern, description} - Notable usage patterns from behavior data (max 5)
- recommendations: Array of {action, priority, rationale} - Recommended next steps, priority is "low"|"medium"|"high" (max 5)

FEEDBACK ENTRIES (${feedbackSummary.length} total):
${JSON.stringify(feedbackSummary, null, 2)}

BEHAVIOR AGGREGATES (${usageSummary.length} records):
${JSON.stringify(usageSummary, null, 2)}

${feedbackSummary.length === 0 && usageSummary.length === 0 ? "NOTE: No data is available yet. Return empty arrays for all fields." : ""}

Return ONLY valid JSON matching the schema described above. No markdown formatting, no code blocks.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error("No response from AI model");
  }

  const parsed = JSON.parse(content);

  return {
    themes: parsed.themes || [],
    topRequests: parsed.topRequests || [],
    emergingIssues: parsed.emergingIssues || [],
    usagePatterns: parsed.usagePatterns || [],
    recommendations: parsed.recommendations || [],
    generatedAt: new Date().toISOString(),
  };
}

export interface ConversationTurn {
  role: "assistant" | "user";
  content: string;
}

export interface ConversationResponse {
  message: string;
  category: "comment" | "feature_request" | "issue" | null;
  severity: string | null;
  isFinal: boolean;
  summary: string | null;
}

export async function converseFeedback(
  transcript: ConversationTurn[],
  page: string,
  userName?: string
): Promise<ConversationResponse> {
  const hour = new Date().getHours();
  let timeGreeting = "Hello";
  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 17) timeGreeting = "Good afternoon";
  else timeGreeting = "Good evening";

  const isFirstTurn = transcript.length === 0;
  const userMessages = transcript.filter(t => t.role === "user");
  const forceFinalize = userMessages.length >= 3;

  const prompt = `You are a friendly feedback assistant for "Checkmate", an enterprise event check-in and badge printing application currently in beta testing. Your goal is to help users share feedback naturally in a conversational way.

RULES:
- Be warm, concise, and professional. Keep responses to 1-3 sentences max.
- Guide the conversation to understand what the user wants to share.
- Auto-detect the feedback category from their message: "comment" (general thoughts), "feature_request" (they want something new), or "issue" (something is broken/wrong).
- If category is "issue", assess severity: "critical", "high", "medium", or "low".
- Ask ONE follow-up question to get useful detail (e.g., what they were doing, what they expected, how important it is).
- After the user answers the follow-up (or if their initial message is already very detailed), mark isFinal=true and provide a summary.
- Maximum 2 follow-up questions total. If this is the 2nd follow-up, always mark isFinal=true.
- The summary should combine all user messages into a clear, well-written feedback description.

${isFirstTurn ? `This is the start of the conversation. Greet the user with "${timeGreeting}${userName ? ", " + userName : ""}" and ask what's on their mind about Checkmate. Set isFinal=false, category=null, severity=null, summary=null.` : ""}
${forceFinalize ? "IMPORTANT: This is the final turn. You MUST set isFinal=true and provide a complete summary of all user feedback. Thank the user and let them know their feedback is ready to submit." : ""}

USER CONTEXT:
- Current page: ${page}
- User name: ${userName || "unknown"}

CONVERSATION SO FAR:
${transcript.map(t => `${t.role}: ${t.content}`).join("\n")}

Return ONLY valid JSON with these fields:
- message: string (your response to show the user)
- category: "comment" | "feature_request" | "issue" | null (null if not yet determined)
- severity: "critical" | "high" | "medium" | "low" | null (only for issues)
- isFinal: boolean (true when ready to submit)
- summary: string | null (combined user feedback text, only when isFinal=true)`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error("No response from AI model");
  }

  const parsed = JSON.parse(content);

  return {
    message: parsed.message || "Could you tell me more?",
    category: parsed.category || null,
    severity: parsed.severity || null,
    isFinal: forceFinalize ? true : !!parsed.isFinal,
    summary: parsed.summary || (forceFinalize ? userMessages.map(m => m.content).join(" ") : null),
  };
}

export interface UrgentFeedbackAnalysis {
  isValid: boolean;
  summary: string;
  impact: string;
  suggestedFix: string;
  priority: string;
}

export async function analyzeUrgentFeedback(entry: {
  type: string;
  message: string;
  severity: string;
  page?: string;
  userRole?: string;
  customerName?: string;
}): Promise<UrgentFeedbackAnalysis> {
  const prompt = `You are a senior product engineer reviewing urgent feedback for "Checkmate", an enterprise event check-in and badge printing application currently in alpha/beta testing.

A user has submitted urgent feedback that needs immediate attention. Analyze it and provide:

1. isValid: boolean - Is this a legitimate actionable issue (not spam, test data, or unreasonable)?
2. summary: string - One-sentence summary of the issue
3. impact: string - What's the business/user impact? (1-2 sentences)
4. suggestedFix: string - Concrete technical suggestion to address this (2-3 sentences)
5. priority: string - "critical" | "high" | "medium" | "low" based on actual severity

FEEDBACK:
- Type: ${entry.type}
- Severity reported: ${entry.severity}
- Message: ${redactPII(entry.message)}
- Page: ${entry.page || "unknown"}
- User Role: ${entry.userRole || "unknown"}
- Customer: ${entry.customerName || "unknown"}

Context about Checkmate: It's an event registration and check-in system with badge printing, QR scanning, multi-tenant accounts, staff/admin roles, offline support, and external ticketing platform integrations.

Return ONLY valid JSON matching the schema. No markdown, no code blocks.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error("No response from AI model");
  }

  return JSON.parse(content);
}
