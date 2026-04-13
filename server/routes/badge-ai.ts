import { createChildLogger } from '../logger';
import { Router } from "express";
import { getBadgeAssistance, troubleshootPrinting, type BadgeContext } from "../services/badge-ai-assistant";
import { storage } from "../storage";
import { requireAuth, isSuperAdmin } from "../auth";

const logger = createChildLogger('BadgeAI');

const router = Router();

router.use(requireAuth);

async function verifyEventOwnership(req: any, eventId: string): Promise<boolean> {
  if (isSuperAdmin(req.dbUser)) return true;
  const event = await storage.getEvent(eventId);
  return !!event && event.customerId === req.dbUser?.customerId;
}

// POST /api/badge-ai/chat - Main AI chat endpoint for badge assistance
router.post("/chat", async (req, res) => {
  try {
    const { message, eventId, templateId, attendeeId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const context: BadgeContext = {};

    if (eventId) {
      const event = await storage.getEvent(eventId);
      if (event) {
        if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
        context.event = event;
      }
    }

    if (templateId) {
      const template = await storage.getBadgeTemplate(templateId);
      if (template && template.customerId) {
        if (!isSuperAdmin(req.dbUser) && template.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      context.template = template;
    }

    if (attendeeId) {
      const attendee = await storage.getAttendee(attendeeId);
      if (attendee) {
        if (!(await verifyEventOwnership(req, attendee.eventId))) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      context.attendee = attendee;
    }

    const response = await getBadgeAssistance(message, context);
    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "Error");
    res.status(500).json({ 
      error: "Failed to get AI assistance",
      message: "I'm having trouble processing your request. Please try again."
    });
  }
});

// POST /api/badge-ai/troubleshoot - Troubleshoot printing issues
router.post("/troubleshoot", async (req, res) => {
  try {
    const { templateId, attendeeId, errorMessage } = req.body;

    if (!errorMessage) {
      return res.status(400).json({ error: "Error message is required" });
    }

    let template = null;
    let attendee = null;

    if (templateId) {
      template = await storage.getBadgeTemplate(templateId) ?? null;
      if (template && template.customerId) {
        if (!isSuperAdmin(req.dbUser) && template.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    if (attendeeId) {
      attendee = await storage.getAttendee(attendeeId) ?? null;
      if (attendee) {
        if (!(await verifyEventOwnership(req, attendee.eventId))) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    const response = await troubleshootPrinting(template, attendee, errorMessage);
    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "Troubleshoot error");
    res.status(500).json({ 
      error: "Failed to troubleshoot",
      message: "Unable to analyze the printing issue. Please check your printer connection."
    });
  }
});

// GET /api/badge-ai/suggestions/:eventId - Get proactive suggestions for an event
router.get("/suggestions/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await storage.getEvent(eventId);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
      return res.status(403).json({ error: "Access denied" });
    }

    let template = null;
    if (event.defaultBadgeTemplateId) {
      template = await storage.getBadgeTemplate(event.defaultBadgeTemplateId) ?? null;
    }

    const context: BadgeContext = { event, template };
    
    const response = await getBadgeAssistance(
      "Review the current badge configuration and provide any suggestions for improvement or potential issues to watch for.",
      context
    );

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "Suggestions error");
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

export default router;
