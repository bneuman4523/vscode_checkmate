import { createChildLogger } from '../logger';
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, isSuperAdmin } from "../auth";
import { insertEventWorkflowConfigSchema, insertEventWorkflowStepSchema, insertEventBuyerQuestionSchema, insertEventDisclaimerSchema, insertAttendeeWorkflowResponseSchema } from "@shared/schema";
import { staffAuth, type StaffRequest } from "./shared";

const logger = createChildLogger('WorkflowRoutes');

export function registerWorkflowRoutes(app: Express): void {

  // Get workflow config with all steps and associated data for an event
  app.get("/api/events/:eventId/workflow", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const workflow = await storage.getEventWorkflowWithSteps(req.params.eventId);
      res.json(workflow || null);
    } catch (error) {
      logger.error({ err: error }, "Error fetching workflow");
      res.status(500).json({ error: "Failed to fetch workflow" });
    }
  });

  // Update workflow (enable/disable)
  app.patch("/api/events/:eventId/workflow", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Check if workflow config exists
      let config = await storage.getEventWorkflowConfig(req.params.eventId);
      
      if (!config) {
        // Create a new workflow config if it doesn't exist
        config = await storage.createEventWorkflowConfig({
          eventId: req.params.eventId,
          enabled: req.body.enabled ?? false,
        });
      } else {
        // Update existing config
        config = await storage.updateEventWorkflowConfig(req.params.eventId, {
          enabled: req.body.enabled,
        });
      }

      // Return the full workflow with steps
      const workflow = await storage.getEventWorkflowWithSteps(req.params.eventId);
      res.json(workflow);
    } catch (error) {
      logger.error({ err: error }, "Error updating workflow");
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });

  // Create or update workflow config
  app.put("/api/events/:eventId/workflow/config", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = insertEventWorkflowConfigSchema.omit({ eventId: true }).parse(req.body);
      
      // Check if config exists
      const existing = await storage.getEventWorkflowConfig(req.params.eventId);
      
      let config;
      if (existing) {
        config = await storage.updateEventWorkflowConfig(req.params.eventId, data);
      } else {
        config = await storage.createEventWorkflowConfig({
          eventId: req.params.eventId,
          ...data,
        });
      }

      res.json(config);
    } catch (error) {
      logger.error({ err: error }, "Error saving workflow config");
      res.status(500).json({ error: "Failed to save workflow config" });
    }
  });

  // Delete workflow config
  app.delete("/api/events/:eventId/workflow/config", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteEventWorkflowConfig(req.params.eventId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting workflow config");
      res.status(500).json({ error: "Failed to delete workflow config" });
    }
  });

  // =====================
  // Workflow Steps Routes
  // =====================

  // Get workflow steps for an event
  app.get("/api/events/:eventId/workflow/steps", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const steps = await storage.getEventWorkflowSteps(req.params.eventId);
      res.json(steps);
    } catch (error) {
      logger.error({ err: error }, "Error fetching workflow steps");
      res.status(500).json({ error: "Failed to fetch workflow steps" });
    }
  });

  // Create a workflow step
  app.post("/api/events/:eventId/workflow/steps", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = insertEventWorkflowStepSchema.omit({ eventId: true }).parse(req.body);
      
      // Ensure workflow config exists
      let config = await storage.getEventWorkflowConfig(req.params.eventId);
      if (!config) {
        config = await storage.createEventWorkflowConfig({
          eventId: req.params.eventId,
          enabled: true,
        });
      }

      const step = await storage.createEventWorkflowStep({
        eventId: req.params.eventId,
        ...data,
      });

      res.json(step);
    } catch (error) {
      logger.error({ err: error }, "Error creating workflow step");
      res.status(500).json({ error: "Failed to create workflow step" });
    }
  });

  // Update a workflow step
  app.patch("/api/events/:eventId/workflow/steps/:stepId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const step = await storage.getEventWorkflowStep(req.params.stepId);
      if (!step || step.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Step not found" });
      }

      const data = insertEventWorkflowStepSchema.partial().parse(req.body);
      const updated = await storage.updateEventWorkflowStep(req.params.stepId, data);

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating workflow step");
      res.status(500).json({ error: "Failed to update workflow step" });
    }
  });

  // Delete a workflow step
  app.delete("/api/events/:eventId/workflow/steps/:stepId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const step = await storage.getEventWorkflowStep(req.params.stepId);
      if (!step || step.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Step not found" });
      }

      await storage.deleteEventWorkflowStep(req.params.stepId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting workflow step");
      res.status(500).json({ error: "Failed to delete workflow step" });
    }
  });

  // Reorder workflow steps
  app.put("/api/events/:eventId/workflow/steps/reorder", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { stepIds } = z.object({ stepIds: z.array(z.string()) }).parse(req.body);
      const steps = await storage.reorderEventWorkflowSteps(req.params.eventId, stepIds);

      res.json(steps);
    } catch (error) {
      logger.error({ err: error }, "Error reordering workflow steps");
      res.status(500).json({ error: "Failed to reorder workflow steps" });
    }
  });

  // =====================
  // Buyer Questions Routes
  // =====================

  // Get questions for a step
  app.get("/api/events/:eventId/workflow/steps/:stepId/questions", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const questions = await storage.getEventBuyerQuestions(req.params.stepId);
      res.json(questions);
    } catch (error) {
      logger.error({ err: error }, "Error fetching questions");
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  // Create a buyer question (max 3 per step)
  app.post("/api/events/:eventId/workflow/steps/:stepId/questions", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const step = await storage.getEventWorkflowStep(req.params.stepId);
      if (!step || step.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Step not found" });
      }

      // Check max 3 questions limit
      const existingQuestions = await storage.getEventBuyerQuestions(req.params.stepId);
      if (existingQuestions.length >= 3) {
        return res.status(400).json({ error: "Maximum 3 questions per step allowed" });
      }

      const data = insertEventBuyerQuestionSchema.omit({ eventId: true, stepId: true }).parse(req.body);
      
      const question = await storage.createEventBuyerQuestion({
        eventId: req.params.eventId,
        stepId: req.params.stepId,
        ...data,
      });

      res.json(question);
    } catch (error) {
      logger.error({ err: error }, "Error creating question");
      res.status(500).json({ error: "Failed to create question" });
    }
  });

  // Update a buyer question
  app.patch("/api/events/:eventId/workflow/questions/:questionId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const question = await storage.getEventBuyerQuestion(req.params.questionId);
      if (!question || question.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Question not found" });
      }

      const data = insertEventBuyerQuestionSchema.partial().parse(req.body);
      const updated = await storage.updateEventBuyerQuestion(req.params.questionId, data);

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating question");
      res.status(500).json({ error: "Failed to update question" });
    }
  });

  // Delete a buyer question
  app.delete("/api/events/:eventId/workflow/questions/:questionId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const question = await storage.getEventBuyerQuestion(req.params.questionId);
      if (!question || question.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Question not found" });
      }

      await storage.deleteEventBuyerQuestion(req.params.questionId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting question");
      res.status(500).json({ error: "Failed to delete question" });
    }
  });

  // =====================
  // Disclaimer Routes
  // =====================

  // Get disclaimer for a step
  app.get("/api/events/:eventId/workflow/steps/:stepId/disclaimer", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const disclaimer = await storage.getEventDisclaimer(req.params.stepId);
      res.json(disclaimer || null);
    } catch (error) {
      logger.error({ err: error }, "Error fetching disclaimer");
      res.status(500).json({ error: "Failed to fetch disclaimer" });
    }
  });

  // Create or update disclaimer for a step
  app.put("/api/events/:eventId/workflow/steps/:stepId/disclaimer", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const step = await storage.getEventWorkflowStep(req.params.stepId);
      if (!step || step.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Step not found" });
      }

      const data = insertEventDisclaimerSchema.omit({ eventId: true, stepId: true }).parse(req.body);
      
      // Check if disclaimer exists
      const existing = await storage.getEventDisclaimer(req.params.stepId);
      
      let disclaimer;
      if (existing) {
        disclaimer = await storage.updateEventDisclaimer(existing.id, data);
      } else {
        disclaimer = await storage.createEventDisclaimer({
          eventId: req.params.eventId,
          stepId: req.params.stepId,
          ...data,
        });
      }

      res.json(disclaimer);
    } catch (error) {
      logger.error({ err: error }, "Error saving disclaimer");
      res.status(500).json({ error: "Failed to save disclaimer" });
    }
  });

  // Delete disclaimer
  app.delete("/api/events/:eventId/workflow/disclaimers/:disclaimerId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteEventDisclaimer(req.params.disclaimerId);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting disclaimer");
      res.status(500).json({ error: "Failed to delete disclaimer" });
    }
  });

  // =====================
  // Attendee Workflow Response Routes (for check-in flow)
  // =====================

  // Get workflow responses for an attendee
  app.get("/api/events/:eventId/attendees/:attendeeId/workflow-responses", requireAuth, async (req, res) => {
    try {
      const responses = await storage.getAttendeeWorkflowResponses(
        req.params.attendeeId,
        req.params.eventId
      );
      res.json(responses);
    } catch (error) {
      logger.error({ err: error }, "Error fetching workflow responses");
      res.status(500).json({ error: "Failed to fetch workflow responses" });
    }
  });

  // Save workflow responses for an attendee (batch save)
  app.post("/api/events/:eventId/attendees/:attendeeId/workflow-responses", requireAuth, async (req, res) => {
    try {
      const { responses } = z.object({
        responses: z.array(insertAttendeeWorkflowResponseSchema.omit({ attendeeId: true, eventId: true }))
      }).parse(req.body);

      // Clear existing responses first
      await storage.deleteAttendeeWorkflowResponses(req.params.attendeeId, req.params.eventId);

      // Save new responses
      const saved = await Promise.all(
        responses.map(r => storage.createAttendeeWorkflowResponse({
          attendeeId: req.params.attendeeId,
          eventId: req.params.eventId,
          ...r,
        }))
      );

      res.json(saved);
    } catch (error) {
      logger.error({ err: error }, "Error saving workflow responses");
      res.status(500).json({ error: "Failed to save workflow responses" });
    }
  });

  // =====================
  // Attendee Signature Routes
  // =====================

  // Get signatures for an attendee
  app.get("/api/events/:eventId/attendees/:attendeeId/signatures", requireAuth, async (req, res) => {
    try {
      const signatures = await storage.getAttendeeSignatures(req.params.attendeeId);
      res.json(signatures);
    } catch (error) {
      logger.error({ err: error }, "Error fetching signatures");
      res.status(500).json({ error: "Failed to fetch signatures" });
    }
  });

  // Save a signature
  app.post("/api/events/:eventId/attendees/:attendeeId/signatures", requireAuth, async (req, res) => {
    try {
      const data = z.object({
        disclaimerId: z.string(),
        signatureData: z.string(),
      }).parse(req.body);

      // Verify attendee belongs to this event
      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      // Check if signature already exists for this disclaimer - update it if so
      const existing = await storage.getAttendeeSignature(req.params.attendeeId, data.disclaimerId);
      if (existing) {
        // Update existing signature (e.g., after undo and re-check-in)
        const updated = await storage.updateAttendeeSignature(existing.id, {
          signatureData: data.signatureData,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });
        return res.json(updated);
      }

      const signature = await storage.createAttendeeSignature({
        attendeeId: req.params.attendeeId,
        eventId: req.params.eventId,
        disclaimerId: data.disclaimerId,
        signatureData: data.signatureData,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });

      res.json(signature);
    } catch (error: any) {
      logger.error({ err: error }, "Error saving signature");
      if (error?.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid signature data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save signature" });
    }
  });

  // =====================
  // Temp Staff Workflow Routes (authenticated via temp staff token)
  // =====================

  // Get workflow for temp staff (read-only)
  app.get("/api/staff/workflow", staffAuth as any, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      
      const workflow = await storage.getEventWorkflowWithSteps(event.id);
      
      if (!workflow || !workflow.enabled || !workflow.enabledForStaff) {
        return res.json(null);
      }

      // Filter to only enabled steps
      const enabledSteps = workflow.steps.filter(s => s.enabled);
      
      res.json({
        ...workflow,
        steps: enabledSteps,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching workflow for temp staff");
      res.status(500).json({ error: "Failed to fetch workflow" });
    }
  });

  // Save workflow responses (temp staff)
  app.post("/api/staff/attendees/:attendeeId/workflow-responses", staffAuth as any, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const session = req.staffSession!;
      
      // Verify attendee belongs to this event
      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const { responses } = z.object({
        responses: z.array(z.object({
          questionId: z.string(),
          responseValue: z.string().nullable().optional(),
          responseValues: z.array(z.string()).nullable().optional(),
        }))
      }).parse(req.body);

      // Clear existing responses first
      await storage.deleteAttendeeWorkflowResponses(req.params.attendeeId, event.id);

      // Save new responses
      const saved = await Promise.all(
        responses.map(r => storage.createAttendeeWorkflowResponse({
          attendeeId: req.params.attendeeId,
          eventId: event.id,
          ...r,
        }))
      );

      // Log activity
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'workflow_responses',
        targetId: req.params.attendeeId,
        metadata: { responseCount: saved.length },
      });

      res.json(saved);
    } catch (error) {
      logger.error({ err: error }, "Error saving workflow responses (temp staff)");
      res.status(500).json({ error: "Failed to save workflow responses" });
    }
  });

  // Save signature (temp staff)
  app.get("/api/staff/attendees/:attendeeId/signatures", staffAuth as any, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;

      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const signatures = await storage.getAttendeeSignatures(req.params.attendeeId);
      res.json(signatures);
    } catch (error) {
      logger.error({ err: error }, "Error fetching signatures (temp staff)");
      res.status(500).json({ error: "Failed to fetch signatures" });
    }
  });

  app.post("/api/staff/attendees/:attendeeId/signatures", staffAuth as any, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const session = req.staffSession!;
      
      // Verify attendee belongs to this event
      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const data = z.object({
        disclaimerId: z.string(),
        signatureData: z.string(),
      }).parse(req.body);

      // Check if signature already exists - update it if so (e.g., after undo and re-check-in)
      const existing = await storage.getAttendeeSignature(req.params.attendeeId, data.disclaimerId);
      if (existing) {
        const updated = await storage.updateAttendeeSignature(existing.id, {
          signatureData: data.signatureData,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });
        
        // Log activity
        await storage.createStaffActivityLog({
          sessionId: session.id,
          eventId: event.id,
          action: 'signature_updated',
          targetId: req.params.attendeeId,
          metadata: { disclaimerId: data.disclaimerId },
        });
        
        return res.json(updated);
      }

      const signature = await storage.createAttendeeSignature({
        attendeeId: req.params.attendeeId,
        eventId: event.id,
        disclaimerId: data.disclaimerId,
        signatureData: data.signatureData,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });

      // Log activity
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'signature_captured',
        targetId: req.params.attendeeId,
        metadata: { disclaimerId: data.disclaimerId },
      });

      res.json(signature);
    } catch (error) {
      logger.error({ err: error }, "Error saving signature (temp staff)");
      res.status(500).json({ error: "Failed to save signature" });
    }
  });

  // Badge AI assistant routes
  app.use("/api/badge-ai", badgeAiRoutes);

  // Setup assistant routes
  app.use("/api/assistant", requireAuth, createAssistantRouter(storage));

  // PDF guide downloads
  app.get("/api/docs/event-setup.pdf", requireAuth, async (_req, res) => {
    try {
      const { generateEventSetupPdf } = await import("./pdf/event-setup-guide");
      generateEventSetupPdf(res);
    } catch (err) {
      console.error("Failed to generate event setup PDF:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  app.get("/api/docs/account-setup.pdf", requireAuth, async (req, res) => {
    try {
      if ((req as any).user?.role !== "super_admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { generateAccountSetupPdf } = await import("./pdf/account-setup-guide");
      generateAccountSetupPdf(res);
    } catch (err) {
      console.error("Failed to generate account setup PDF:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });
}
