import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { assistantToolDeclarations } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { executeTool } from "./tool-executor";
import { checkEventSetup } from "./setup-checker";
import type { IStorage } from "../storage";
import { isSuperAdmin } from "../auth";
import { logger } from "../logger";

const MODEL = "gemini-2.5-flash";
const MAX_HISTORY_TURNS = 20;
const MAX_TOOL_ITERATIONS = 5;

const WRITING_TOOLS = new Set([
  "set_event_printer",
  "set_badge_template",
  "set_kiosk_pin",
  "set_kiosk_mode",
  "set_temp_staff_access",
  "trigger_attendee_sync",
]);

const SELECTABLE_TOOLS: Record<string, { labelKey: string; idKey: string; action: string }> = {
  get_available_printers: { labelKey: "name", idKey: "id", action: "set_event_printer" },
  get_badge_templates: { labelKey: "name", idKey: "id", action: "set_badge_template" },
};

export function createAssistantRouter(storage: IStorage) {
  const router = Router();

  const ai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });

  router.post("/chat", async (req: Request, res: Response) => {
    const dbUser = (req as any).dbUser;
    if (!dbUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const staffName: string = dbUser.firstName || dbUser.email || "Staff";
    const staffRole: string = dbUser.role || "staff";

    const { messages, eventId, currentRoute } = req.body as {
      messages: Array<{ role: string; content: string }>;
      eventId: string;
      currentRoute?: string;
    };

    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const event = await storage.getEvent(eventId);
    if (!event || (!isSuperAdmin(dbUser) && event.customerId !== dbUser.customerId)) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const customerId: string = event.customerId;

    const setupStatus = await checkEventSetup(storage, eventId, customerId);
    const customer = await storage.getCustomer(customerId);
    const customerName = customer?.name ?? "Your organisation";

    const systemPrompt = buildSystemPrompt({
      customerName,
      eventName: event.name,
      eventId,
      staffName,
      staffRole,
      setupStatus,
      currentRoute,
    });

    const trimmedMessages = messages.slice(-MAX_HISTORY_TURNS * 2);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (type: string, data: Record<string, unknown> = {}) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const geminiHistory = trimmedMessages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

      let currentSystemPrompt = systemPrompt;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: [
            ...geminiHistory,
          ],
          config: {
            systemInstruction: currentSystemPrompt,
            temperature: 0.3,
            maxOutputTokens: 600,
            tools: assistantToolDeclarations,
          },
        });

        const candidate = response.candidates?.[0];
        if (!candidate) {
          sendEvent("error", { message: "No response generated. Please try again." });
          break;
        }

        const parts = candidate.content?.parts ?? [];
        let hasToolCalls = false;
        let textContent = "";

        for (const part of parts) {
          if (part.text) {
            textContent += part.text;
            sendEvent("text", { content: part.text });
          }

          if (part.functionCall) {
            hasToolCalls = true;
            const toolName = part.functionCall.name!;
            const toolArgs = (part.functionCall.args as Record<string, unknown>) ?? {};

            sendEvent("tool_start", { tool: toolName });

            const result = await executeTool(toolName, toolArgs, {
              storage,
              customerId,
              eventId,
            });

            if (
              toolName === "navigate_to" &&
              result.success &&
              (result.data as any)?.navigate
            ) {
              sendEvent("navigate", {
                route: (result.data as any).route,
                reason: (result.data as any).reason,
              });
            }

            if (result.success && toolName in SELECTABLE_TOOLS) {
              const spec = SELECTABLE_TOOLS[toolName];
              const items = Array.isArray(result.data) ? result.data : [];
              if (items.length > 0) {
                const options = items.map((item: Record<string, unknown>) => ({
                  id: String(item[spec.idKey] ?? ""),
                  label: String(item[spec.labelKey] ?? ""),
                  action: spec.action,
                }));
                sendEvent("options", { options });
              }
            }

            let toolResultPayload = JSON.stringify(result);

            if (WRITING_TOOLS.has(toolName) && result.success) {
              sendEvent("data_changed", { eventId });

              const refreshedStatus = await checkEventSetup(storage, eventId, customerId);
              currentSystemPrompt = buildSystemPrompt({
                customerName,
                eventName: event.name,
                eventId,
                staffName,
                staffRole,
                setupStatus: refreshedStatus,
                currentRoute,
              });

              const remaining = refreshedStatus.items
                .filter((i) => !i.complete && i.severity === "required")
                .map((i) => i.label);

              toolResultPayload = JSON.stringify({
                ...result,
                updatedSetupStatus: {
                  overallReady: refreshedStatus.overallReady,
                  requiredComplete: refreshedStatus.requiredComplete,
                  requiredTotal: refreshedStatus.requiredTotal,
                  remainingRequired: remaining,
                },
              });
            }

            geminiHistory.push({
              role: "model" as const,
              parts: [{ text: textContent || " " }],
            });

            geminiHistory.push({
              role: "user" as const,
              parts: [{
                text: `[Tool result for ${toolName}]: ${toolResultPayload}`,
              }],
            });

            textContent = "";
          }
        }

        if (!hasToolCalls) {
          break;
        }
      }

      sendEvent("done", {});
    } catch (err) {
      logger.error({ err }, "[assistant:route] Error during chat");
      sendEvent("error", { message: "Something went wrong. Please try again." });
    } finally {
      res.end();
    }
  });

  router.get("/setup-status/:eventId", async (req: Request, res: Response) => {
    const dbUser = (req as any).dbUser;
    if (!dbUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { eventId } = req.params;

    const event = await storage.getEvent(eventId);
    if (!event || (!isSuperAdmin(dbUser) && event.customerId !== dbUser.customerId)) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const customerId: string = event.customerId;
    const status = await checkEventSetup(storage, eventId, customerId);
    res.json(status);
  });

  return router;
}
