import { createChildLogger } from '../logger';
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, isSuperAdmin } from "../auth";
import { badgeTemplateResolver } from "../services/badge-template-resolver";
import { checkinSyncService } from "../services/checkin-sync-service";
import {
  sanitizeAttendeeData,
  validateKioskPin,
} from "./shared";

const logger = createChildLogger('KioskRoutes');

export function registerKioskRoutes(app: Express): void {

  app.get("/api/kiosk/:eventId/launch-info", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const customer = await storage.getCustomer(event.customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      const hasPin = !!(event.tempStaffSettings)?.kioskPin;
      // Resolve branding: event override if enabled, otherwise account default
      const eventBranding = (event.kioskBrandingOverride as any)?.enabled ? event.kioskBrandingOverride : null;
      const branding = eventBranding || customer.kioskBranding || null;
      res.json({
        event: {
          id: event.id,
          name: event.name,
          customerId: event.customerId,
          startDate: event.startDate,
          endDate: event.endDate,
          status: event.status,
        },
        customer: {
          id: customer.id,
          name: customer.name,
        },
        hasPin,
        branding,
        badgeSettings: event.badgeSettings || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to load kiosk launch info" });
    }
  });

  app.get("/api/kiosk/:customerId/events", async (req, res) => {
    try {
      const events = await storage.getEvents(req.params.customerId);
      const minimalEvents = events.map(e => ({
        id: e.id,
        name: e.name,
        customerId: e.customerId,
        startDate: e.startDate,
        endDate: e.endDate,
        status: e.status,
      }));
      res.json(minimalEvents);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to load events" });
    }
  });

  app.post("/api/kiosk/:eventId/search", async (req, res) => {
    try {
      const { pin, query } = req.body;
      if (!pin || !query || typeof query !== 'string') {
        return res.status(400).json({ error: "PIN and search query are required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const attendees = await storage.getAttendees(event.id);
      const searchLower = query.toLowerCase().trim();

      const exactMatches = attendees.filter(a =>
        a.id === query ||
        a.externalId === query ||
        a.email?.toLowerCase() === searchLower
      );

      const matches = exactMatches.length > 0 ? exactMatches : attendees.filter(a =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) ||
        a.firstName?.toLowerCase() === searchLower ||
        a.lastName?.toLowerCase() === searchLower
      );

      if (matches.length === 0) {
        return res.json({ found: false, attendee: null, multipleMatches: false });
      }

      if (matches.length === 1) {
        const a = matches[0];
        return res.json({
          found: true,
          attendee: {
            id: a.id, firstName: a.firstName, lastName: a.lastName,
            email: a.email, company: a.company, title: a.title,
            participantType: a.participantType, checkedIn: a.checkedIn,
            checkedInAt: a.checkedInAt, badgePrinted: a.badgePrinted,
            externalId: a.externalId,
          },
          multipleMatches: false,
        });
      }

      return res.json({
        found: false,
        attendee: null,
        multipleMatches: true,
        matchCount: matches.length,
        requiresVerification: true,
      });
    } catch (error) {
      logger.error({ err: error }, "Error in kiosk search");
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/kiosk/:eventId/verify", async (req, res) => {
    try {
      const { pin, query, email } = req.body;
      if (!pin || !query || !email) {
        return res.status(400).json({ error: "PIN, search query, and email are required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const attendees = await storage.getAttendees(event.id);
      const searchLower = query.toLowerCase().trim();
      const emailLower = email.toLowerCase().trim();

      const nameMatches = attendees.filter(a =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchLower) ||
        a.firstName?.toLowerCase() === searchLower ||
        a.lastName?.toLowerCase() === searchLower
      );

      const verified = nameMatches.filter(a =>
        a.email?.toLowerCase() === emailLower
      );

      if (verified.length === 1) {
        const a = verified[0];
        return res.json({
          found: true,
          attendee: {
            id: a.id, firstName: a.firstName, lastName: a.lastName,
            email: a.email, company: a.company, title: a.title,
            participantType: a.participantType, checkedIn: a.checkedIn,
            checkedInAt: a.checkedInAt, badgePrinted: a.badgePrinted,
            externalId: a.externalId,
          },
        });
      }

      return res.json({
        found: false,
        attendee: null,
        message: "Could not verify your identity. Please see a staff member for assistance.",
      });
    } catch (error) {
      logger.error({ err: error }, "Error in kiosk verify");
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/kiosk/:eventId/checkin", async (req, res) => {
    try {
      const { pin, attendeeId } = req.body;
      if (!pin || !attendeeId) {
        return res.status(400).json({ error: "PIN and attendeeId are required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const attendeeData = {
        id: attendee.id, firstName: attendee.firstName, lastName: attendee.lastName,
        email: attendee.email, company: attendee.company, title: attendee.title,
        participantType: attendee.participantType, checkedIn: attendee.checkedIn,
        checkedInAt: attendee.checkedInAt, badgePrinted: attendee.badgePrinted,
        externalId: attendee.externalId,
      };

      if (attendee.checkedIn) {
        return res.json({
          success: true,
          alreadyCheckedIn: true,
          attendee: attendeeData,
        });
      }

      // Check if workflow is active for kiosk — if so, don't auto-check-in
      const skipWorkflow = req.body.skipWorkflow === true;
      if (!skipWorkflow) {
        const workflow = await storage.getEventWorkflowWithSteps(event.id);
        const hasKioskWorkflow = workflow?.enabled && workflow?.enabledForKiosk &&
          (workflow.steps?.filter(s => s.enabled).length ?? 0) > 0;
        if (hasKioskWorkflow) {
          return res.json({
            success: true,
            requiresWorkflow: true,
            alreadyCheckedIn: false,
            attendee: { ...attendeeData, checkedIn: false },
          });
        }
      }

      const updated = await storage.updateAttendee(attendeeId, {
        checkedIn: true,
        checkedInAt: new Date(),
      });

      res.json({
        success: true,
        alreadyCheckedIn: false,
        attendee: {
          id: updated.id, firstName: updated.firstName, lastName: updated.lastName,
          email: updated.email, company: updated.company, title: updated.title,
          participantType: updated.participantType, checkedIn: updated.checkedIn,
          checkedInAt: updated.checkedInAt, badgePrinted: updated.badgePrinted,
          externalId: updated.externalId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error in kiosk check-in");
      res.status(500).json({ error: "Check-in failed" });
    }
  });

  // Group check-in: lookup group by order code (kiosk - PIN required)
  app.post("/api/kiosk/:eventId/group-lookup", async (req, res) => {
    try {
      const { pin, orderCode } = req.body;
      if (!pin || !orderCode) {
        return res.status(400).json({ error: "PIN and orderCode are required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const allAttendees = await storage.getAttendees(event.id);
      const members = allAttendees.filter((a: any) => a.orderCode === orderCode);

      if (members.length === 0) {
        return res.json({ found: false, members: [], primaryId: null });
      }

      const primary = members.find((a: any) => a.externalId === orderCode);
      const primaryId = primary?.id || members[0].id;

      res.json({
        found: true,
        members: members.map((a: any) => ({
          id: a.id, firstName: a.firstName, lastName: a.lastName,
          email: a.email, company: a.company, title: a.title,
          participantType: a.participantType, checkedIn: a.checkedIn,
          checkedInAt: a.checkedInAt, badgePrinted: a.badgePrinted,
          externalId: a.externalId, orderCode: a.orderCode,
        })),
        primaryId,
        checkedInCount: members.filter((a: any) => a.checkedIn).length,
        totalCount: members.length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error in group lookup");
      res.status(500).json({ error: "Group lookup failed" });
    }
  });

  // Group check-in: lookup group by order code (staff - auth required)
  app.get("/api/events/:eventId/group/:orderCode", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const allAttendees = await storage.getAttendees(event.id);
      const members = allAttendees.filter((a: any) => a.orderCode === req.params.orderCode);

      if (members.length === 0) {
        return res.json({ found: false, members: [], primaryId: null });
      }

      const primary = members.find((a: any) => a.externalId === req.params.orderCode);
      const primaryId = primary?.id || members[0].id;

      res.json({
        found: true,
        members,
        primaryId,
        checkedInCount: members.filter((a: any) => a.checkedIn).length,
        totalCount: members.length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error in group lookup");
      res.status(500).json({ error: "Group lookup failed" });
    }
  });

  // Group check-in: batch check-in multiple attendees at once
  app.post("/api/events/:eventId/group-checkin", requireAuth, async (req, res) => {
    try {
      const { attendeeIds, orderCode, checkedInBy } = req.body;
      if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
        return res.status(400).json({ error: "attendeeIds must be a non-empty array" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const results = [];
      const now = new Date();

      for (const attendeeId of attendeeIds) {
        try {
          const attendee = await storage.getAttendee(attendeeId);
          if (!attendee || attendee.eventId !== event.id) {
            results.push({ attendeeId, success: false, error: "Attendee not found" });
            continue;
          }
          if (attendee.checkedIn) {
            results.push({ attendeeId, success: true, alreadyCheckedIn: true });
            continue;
          }
          const updated = await storage.updateAttendee(attendeeId, {
            checkedIn: true,
            checkedInAt: now,
          });
          results.push({ attendeeId, success: true, alreadyCheckedIn: false });

          // Trigger real-time sync if configured
          try {
            const integration = await checkinSyncService.getIntegrationForEvent(event);
            if (integration) {
              void checkinSyncService.sendCheckinSync(updated, event, integration, checkedInBy || "Group");
            }
          } catch (syncErr) {
            logger.warn({ err: syncErr }, `Sync failed for attendee ${attendeeId} in group check-in`);
          }
        } catch (err) {
          results.push({ attendeeId, success: false, error: "Check-in failed" });
        }
      }

      res.json({
        success: true,
        results,
        checkedIn: results.filter(r => r.success && !r.alreadyCheckedIn).length,
        alreadyCheckedIn: results.filter(r => r.alreadyCheckedIn).length,
        failed: results.filter(r => !r.success).length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error in group check-in");
      res.status(500).json({ error: "Group check-in failed" });
    }
  });

  // Kiosk batch check-in (PIN auth)
  app.post("/api/kiosk/:eventId/group-checkin", async (req, res) => {
    try {
      const { pin, attendeeIds, checkedInBy } = req.body;
      if (!pin || !Array.isArray(attendeeIds) || attendeeIds.length === 0) {
        return res.status(400).json({ error: "PIN and attendeeIds are required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const results = [];
      const now = new Date();

      for (const attendeeId of attendeeIds) {
        try {
          const attendee = await storage.getAttendee(attendeeId);
          if (!attendee || attendee.eventId !== event.id) {
            results.push({ attendeeId, success: false, error: "Attendee not found" });
            continue;
          }
          if (attendee.checkedIn) {
            results.push({ attendeeId, success: true, alreadyCheckedIn: true });
            continue;
          }
          const updated = await storage.updateAttendee(attendeeId, {
            checkedIn: true,
            checkedInAt: now,
          });
          results.push({ attendeeId, success: true, alreadyCheckedIn: false });

          try {
            const integration = await checkinSyncService.getIntegrationForEvent(event);
            if (integration) {
              void checkinSyncService.sendCheckinSync(updated, event, integration, checkedInBy || "Kiosk Group");
            }
          } catch (syncErr) {
            logger.warn({ err: syncErr }, `Sync failed for attendee ${attendeeId} in kiosk group check-in`);
          }
        } catch (err) {
          results.push({ attendeeId, success: false, error: "Check-in failed" });
        }
      }

      res.json({
        success: true,
        results,
        checkedIn: results.filter(r => r.success && !r.alreadyCheckedIn).length,
        alreadyCheckedIn: results.filter(r => r.alreadyCheckedIn).length,
        failed: results.filter(r => !r.success).length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error in kiosk group check-in");
      res.status(500).json({ error: "Group check-in failed" });
    }
  });

  app.post("/api/kiosk/:eventId/walkin", async (req, res) => {
    try {
      const { pin, firstName, lastName, email, participantType, company, title } = req.body;
      if (!pin) {
        return res.status(400).json({ error: "PIN is required" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      if (!event.tempStaffSettings?.allowKioskWalkins) {
        return res.status(403).json({ error: "Kiosk walk-in registration is not enabled for this event" });
      }

      const kioskWalkinFlag = await storage.getFeatureFlagByKey('kiosk_walkin_registration');
      if (!kioskWalkinFlag?.enabled) {
        return res.status(403).json({ error: "Kiosk walk-in feature is not available" });
      }

      const config = event.tempStaffSettings.kioskWalkinConfig;
      const requiredFields = config?.requiredFields || ['firstName', 'lastName', 'email'];

      for (const field of requiredFields) {
        const value = req.body[field];
        if (!value || (typeof value === 'string' && !value.trim())) {
          return res.status(400).json({ error: `${field} is required` });
        }
      }

      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({ error: "First name and last name are always required" });
      }

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({ error: "Invalid email address" });
        }
      }

      const effectiveType = participantType?.trim() || config?.defaultType || 'Walk-in';

      const sanitizedData = sanitizeAttendeeData({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email ? email.trim().toLowerCase() : null,
        company: (typeof company === 'string' ? company.trim() : null) || null,
        title: (typeof title === 'string' ? title.trim() : null) || null,
        participantType: effectiveType,
      });

      const attendee = await storage.createAttendee({
        eventId: event.id,
        firstName: sanitizedData.firstName,
        lastName: sanitizedData.lastName,
        email: sanitizedData.email,
        company: sanitizedData.company,
        title: sanitizedData.title,
        participantType: sanitizedData.participantType,
        registrationStatus: "Registered",
      });

      const updated = await storage.updateAttendee(attendee.id, {
        checkedIn: true,
        checkedInAt: new Date(),
      });

      if (updated) {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
        if (integration) {
          void checkinSyncService.sendCheckinSync(updated, event, integration, "Kiosk")
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Kiosk walk-in sync failed');
              }
            })
            .catch(err => logger.error({ err }, 'Kiosk walk-in sync error'));
        }
      }

      res.status(201).json({
        success: true,
        attendee: {
          id: updated.id, firstName: updated.firstName, lastName: updated.lastName,
          email: updated.email, company: updated.company, title: updated.title,
          participantType: updated.participantType, checkedIn: updated.checkedIn,
          checkedInAt: updated.checkedInAt, badgePrinted: updated.badgePrinted,
          externalId: updated.externalId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error in kiosk walk-in registration");
      res.status(500).json({ error: "Walk-in registration failed" });
    }
  });

  // Get workflow config for kiosk (PIN-protected)
  app.post("/api/kiosk/:eventId/workflow", async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN is required" });

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const workflow = await storage.getEventWorkflowWithSteps(event.id);
      if (!workflow || !workflow.enabled || !workflow.enabledForKiosk) {
        return res.json(null);
      }

      const enabledSteps = workflow.steps.filter(s => s.enabled);
      res.json({ ...workflow, steps: enabledSteps });
    } catch (error) {
      logger.error({ err: error }, "Error fetching kiosk workflow");
      res.status(500).json({ error: "Failed to fetch workflow" });
    }
  });

  // Save workflow responses (kiosk, PIN-protected)
  app.post("/api/kiosk/:eventId/attendees/:attendeeId/workflow-responses", async (req, res) => {
    try {
      const { pin, responses } = z.object({
        pin: z.string(),
        responses: z.array(z.object({
          questionId: z.string(),
          responseValue: z.string().nullable().optional(),
          responseValues: z.array(z.string()).nullable().optional(),
        })),
      }).parse(req.body);

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      await storage.deleteAttendeeWorkflowResponses(req.params.attendeeId, event.id);
      const saved = await Promise.all(
        responses.map(r => storage.createAttendeeWorkflowResponse({
          attendeeId: req.params.attendeeId,
          eventId: event.id,
          ...r,
        }))
      );
      res.json(saved);
    } catch (error) {
      logger.error({ err: error }, "Error saving kiosk workflow responses");
      res.status(500).json({ error: "Failed to save workflow responses" });
    }
  });

  // Get signatures (kiosk, PIN-protected)
  app.post("/api/kiosk/:eventId/attendees/:attendeeId/signatures/get", async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN is required" });

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const signatures = await storage.getAttendeeSignatures(req.params.attendeeId);
      res.json(signatures);
    } catch (error) {
      logger.error({ err: error }, "Error fetching kiosk signatures");
      res.status(500).json({ error: "Failed to fetch signatures" });
    }
  });

  // Save signature (kiosk, PIN-protected)
  app.post("/api/kiosk/:eventId/attendees/:attendeeId/signatures", async (req, res) => {
    try {
      const data = z.object({
        pin: z.string(),
        disclaimerId: z.string(),
        signatureData: z.string(),
      }).parse(req.body);

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, data.pin, req.params.eventId, clientIp, res)) return;

      const attendee = await storage.getAttendee(req.params.attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const signature = await storage.createAttendeeSignature({
        attendeeId: req.params.attendeeId,
        disclaimerId: data.disclaimerId,
        signatureData: data.signatureData,
      });
      res.json(signature);
    } catch (error) {
      logger.error({ err: error }, "Error saving kiosk signature");
      res.status(500).json({ error: "Failed to save signature" });
    }
  });

  app.get("/api/kiosk/:eventId/badge-templates", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const templates = await storage.getBadgeTemplates(event.customerId);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch badge templates" });
    }
  });

  app.get("/api/kiosk/:eventId/template-mappings", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const overrides = await storage.getEventBadgeTemplateOverrides(req.params.eventId);
      const overrideMap = new Map(overrides.map(o => [o.participantType, o]));
      const templates = await storage.getBadgeTemplates(event.customerId);
      const templateMap = new Map(templates.map(t => [t.id, t]));
      const actualTypes = await storage.getDistinctParticipantTypes(req.params.eventId);
      const standardTypes = ['General', 'VIP', 'Speaker', 'Sponsor', 'Staff', 'Press', 'Media', 'Exhibitor'];
      const participantTypes = [...new Set([...actualTypes, ...standardTypes])];
      const mappingsObject: Record<string, { templateId: string | null; templateName: string | null; resolutionPath: string; }> = {};
      for (const type of participantTypes) {
        const result = await badgeTemplateResolver.resolveTemplateForParticipantType(req.params.eventId, type);
        mappingsObject[type] = {
          templateId: result.template?.id || null,
          templateName: result.template?.name || null,
          resolutionPath: result.resolutionPath,
        };
      }
      res.json(mappingsObject);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch template mappings" });
    }
  });

  app.get("/api/kiosk/:eventId/sessions", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const sessions = await storage.getSessions(req.params.eventId);
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/kiosk/:eventId/sessions/:sessionId", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.get("/api/kiosk/:eventId/sessions/:sessionId/checkins", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      const checkins = await storage.getSessionCheckins(req.params.sessionId);
      res.json(checkins);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch check-ins" });
    }
  });

  app.get("/api/kiosk/:eventId/sessions/:sessionId/registrations", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      const registrations = await storage.getSessionRegistrations(req.params.sessionId);
      res.json(registrations);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch registrations" });
    }
  });

  app.post("/api/kiosk/:eventId/sessions/:sessionId/checkin", async (req, res) => {
    try {
      const { pin, attendeeId, source } = req.body;
      if (!pin || !attendeeId) {
        return res.status(400).json({ error: "PIN and attendeeId are required" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      if (session.restrictToRegistered) {
        const registration = await storage.getSessionRegistrationByAttendee(req.params.sessionId, attendeeId);
        if (!registration || registration.status !== "registered") {
          return res.status(403).json({
            error: "This session is restricted to pre-registered attendees only",
            isRegistered: !!registration,
            registrationStatus: registration?.status,
          });
        }
      }
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(req.params.sessionId, attendeeId);
      if (isCheckedIn) {
        return res.status(409).json({ error: "Attendee is already checked in", alreadyCheckedIn: true });
      }

      // Hard capacity enforcement for kiosk (no override)
      if (session.capacity) {
        const checkins = await storage.getSessionCheckins(req.params.sessionId);
        const checkinIds = new Set(checkins.filter(c => c.action === 'checkin').map(c => c.attendeeId));
        const checkoutIds = new Set(checkins.filter(c => c.action === 'checkout').map(c => c.attendeeId));
        const activeCount = [...checkinIds].filter(id => !checkoutIds.has(id)).length;
        if (activeCount >= session.capacity) {
          return res.status(409).json({
            error: `This session is full (${activeCount}/${session.capacity})`,
            atCapacity: true,
          });
        }
      }

      const checkin = await storage.createSessionCheckin({
        sessionId: req.params.sessionId,
        attendeeId,
        action: "checkin",
        source: source || "kiosk",
      });
      const integration = await checkinSyncService.getIntegrationForEvent(event);
      if (integration) {
        void checkinSyncService.sendSessionCheckinSync(attendee, session, event, integration)
          .catch(err => logger.error({ err }, 'Error'));
      }
      res.status(201).json({
        ...checkin,
        attendee: { id: attendee.id, firstName: attendee.firstName, lastName: attendee.lastName, company: attendee.company },
        session: { id: session.id, name: session.name, location: session.location },
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error in kiosk session check-in");
      res.status(400).json({ error: "Failed to check in" });
    }
  });

  app.post("/api/kiosk/:eventId/sessions/:sessionId/checkout", async (req, res) => {
    try {
      const { pin, attendeeId, source } = req.body;
      if (!pin || !attendeeId) {
        return res.status(400).json({ error: "PIN and attendeeId are required" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!validateKioskPin(event.kioskPin, pin, req.params.eventId, clientIp, res)) return;

      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== req.params.eventId) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(req.params.sessionId, attendeeId);
      if (!isCheckedIn) {
        return res.status(409).json({ error: "Attendee is not checked in" });
      }
      const checkout = await storage.createSessionCheckin({
        sessionId: req.params.sessionId,
        attendeeId,
        action: "checkout",
        source: source || "kiosk",
      });
      res.status(201).json(checkout);
    } catch (error: any) {
      logger.error({ err: error }, "Error in kiosk session checkout");
      res.status(400).json({ error: "Failed to check out" });
    }
  });
}
