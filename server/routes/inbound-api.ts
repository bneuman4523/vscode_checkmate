import { createChildLogger } from '../logger';
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import { inboundApiKeys, events, attendees, sessions, sessionRegistrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { sanitizeHtml } from "./shared";

const logger = createChildLogger('InboundAPI');

// ── Types ────────────────────────────────────────────────────────────────

interface InboundRequest extends Request {
  inboundCustomerId?: string;
  inboundApiKeyId?: string;
}

// ── API Key Utilities ────────────────────────────────────────────────────

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  const random = randomBytes(32).toString('base64url');
  return `grt_${random}`;
}

function maskApiKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.substring(0, 7)}...${key.substring(key.length - 6)}`;
}

// ── Auth Middleware ───────────────────────────────────────────────────────

async function inboundApiAuth(req: InboundRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer grt_')) {
    return res.status(401).json({ error: "Missing or invalid API key. Expected: Authorization: Bearer grt_..." });
  }

  const key = authHeader.substring(7); // Remove "Bearer "
  const keyHash = hashApiKey(key);

  const [apiKey] = await db.select()
    .from(inboundApiKeys)
    .where(eq(inboundApiKeys.keyHash, keyHash))
    .limit(1);

  if (!apiKey || !apiKey.isActive) {
    return res.status(401).json({ error: "Invalid or revoked API key" });
  }

  // IP allowlist check
  if (apiKey.allowedIps && apiKey.allowedIps.length > 0) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    if (!apiKey.allowedIps.includes(clientIp)) {
      logger.warn({ clientIp, keyId: apiKey.id }, "Inbound API request from non-allowlisted IP");
      return res.status(403).json({ error: "IP address not allowed for this API key" });
    }
  }

  // Check feature flag — is inbound_api enabled for this customer?
  const { getAccountFeatureConfigs } = await import("../services/license-provisioning");
  const configs = await getAccountFeatureConfigs(apiKey.customerId);
  const inboundEnabled = configs.find(c => c.featureKey === "inbound_api")?.enabled ?? false;
  if (!inboundEnabled) {
    return res.status(403).json({ error: "Inbound API is not enabled for this account" });
  }

  // Update last used timestamp (fire-and-forget)
  db.update(inboundApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(inboundApiKeys.id, apiKey.id))
    .catch(() => {});

  req.inboundCustomerId = apiKey.customerId;
  req.inboundApiKeyId = apiKey.id;
  next();
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function resolveEvent(customerId: string, eventCode: string, accountCode?: string): Promise<{ id: string; customerId: string } | null> {
  const conditions = [
    eq(events.customerId, customerId),
    eq(events.eventCode, eventCode),
  ];
  if (accountCode) {
    conditions.push(eq(events.accountCode, accountCode));
  }
  const [event] = await db.select({ id: events.id, customerId: events.customerId })
    .from(events)
    .where(and(...conditions))
    .limit(1);
  return event || null;
}

// ── Audit Logging ────────────────────────────────────────────────────────

async function logInboundActivity(req: InboundRequest, action: string, details: Record<string, unknown>) {
  try {
    await storage.createAuditLog({
      userId: `api-key:${req.inboundApiKeyId}`,
      userEmail: "inbound-api",
      userRole: "api",
      customerId: req.inboundCustomerId || null,
      customerName: null,
      action,
      resourceType: "inbound_api",
      resourceId: req.inboundApiKeyId || "unknown",
      resourceName: null,
      changedFields: [{ field: "summary", oldValue: null, newValue: JSON.stringify(details) }],
      metadata: details,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log inbound API activity");
  }
}

// ── Validation Schemas ───────────────────────────────────────────────────

const attendeeItemSchema = z.object({
  externalId: z.string().min(1),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  participantType: z.string().min(1).max(100).default("General"),
  registrationStatus: z.string().max(100).optional(),
  registrationStatusLabel: z.string().max(200).optional(),
  orderCode: z.string().max(100).optional().nullable(),
  externalProfileId: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  customFields: z.record(z.string()).optional(),
});

const attendeeBatchSchema = z.object({
  eventCode: z.string().min(1),
  accountCode: z.string().optional(),
  attendees: z.array(attendeeItemSchema).min(1).max(100),
});

const eventUpsertSchema = z.object({
  eventCode: z.string().min(1),
  accountCode: z.string().optional(),
  name: z.string().min(1).max(500),
  eventDate: z.string().datetime(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  timezone: z.string().max(100).optional(),
  location: z.string().max(500).optional(),
  venue: z.string().max(500).optional(),
});

const sessionItemSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1).max(500),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  location: z.string().max(500).optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});

const sessionBatchSchema = z.object({
  eventCode: z.string().min(1),
  accountCode: z.string().optional(),
  sessions: z.array(sessionItemSchema).min(1).max(100),
});

const registrationItemSchema = z.object({
  attendeeExternalId: z.string().min(1),
  sessionExternalId: z.string().min(1),
  status: z.enum(["registered", "waitlisted", "cancelled"]).default("registered"),
});

const registrationBatchSchema = z.object({
  eventCode: z.string().min(1),
  accountCode: z.string().optional(),
  registrations: z.array(registrationItemSchema).min(1).max(500),
});

// ── Route Registration ───────────────────────────────────────────────────

export function registerInboundApiRoutes(app: Express): void {
  // Body size limit for inbound API (1MB max — prevents OOM from oversized payloads)
  const inboundBodyLimit = express.json({ limit: '1mb' });

  // Rate limiter per API key
  const inboundLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req: InboundRequest) => req.inboundApiKeyId || req.ip || 'unknown',
    message: { error: "Rate limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── API Key Management (admin auth, not API key auth) ──────────────

  // List API keys for a customer
  app.get("/api/customers/:customerId/api-keys", async (req, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ error: "Authentication required" });
      const { customerId } = req.params;
      if (req.dbUser.role !== "super_admin" && req.dbUser.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const keys = await db.select()
        .from(inboundApiKeys)
        .where(eq(inboundApiKeys.customerId, customerId));
      res.json(keys);
    } catch (error) {
      logger.error({ err: error }, "Error listing API keys");
      res.status(500).json({ error: "Failed to list API keys" });
    }
  });

  // Generate new API key
  app.post("/api/customers/:customerId/api-keys", async (req, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ error: "Authentication required" });
      if (req.dbUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { customerId } = req.params;
      const { name } = z.object({ name: z.string().min(1).max(200) }).parse(req.body);

      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const masked = maskApiKey(rawKey);

      const [apiKey] = await db.insert(inboundApiKeys).values({
        customerId,
        name,
        keyHash,
        maskedKey: masked,
        createdBy: req.dbUser.id,
      }).returning();

      // Return the raw key ONCE — it's never stored in plaintext
      res.status(201).json({
        ...apiKey,
        rawKey, // Only returned on creation
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating API key");
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  // Revoke API key
  app.delete("/api/customers/:customerId/api-keys/:keyId", async (req, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ error: "Authentication required" });
      if (req.dbUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      await db.update(inboundApiKeys)
        .set({ isActive: false })
        .where(and(
          eq(inboundApiKeys.id, req.params.keyId),
          eq(inboundApiKeys.customerId, req.params.customerId),
        ));
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error revoking API key");
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  // ── Inbound Data Endpoints (API key auth) ──────────────────────────

  // POST /api/v1/inbound/attendees — Batch create/update attendees
  app.post("/api/v1/inbound/attendees", inboundBodyLimit, inboundApiAuth, inboundLimiter, async (req: InboundRequest, res) => {
    try {
      const customerId = req.inboundCustomerId!;
      const parsed = attendeeBatchSchema.parse(req.body);

      const event = await resolveEvent(customerId, parsed.eventCode, parsed.accountCode);
      if (!event) {
        return res.status(404).json({ error: `Event not found for code: ${parsed.eventCode}` });
      }

      let created = 0;
      let updated = 0;
      const errors: Array<{ index: number; externalId: string; error: string }> = [];

      for (let i = 0; i < parsed.attendees.length; i++) {
        const item = parsed.attendees[i];
        try {
          // Sanitize inputs
          const firstName = sanitizeHtml(item.firstName);
          const lastName = sanitizeHtml(item.lastName);
          const company = item.company ? sanitizeHtml(item.company) : null;
          const title = item.title ? sanitizeHtml(item.title) : null;

          // Check if attendee exists by externalId + eventId
          const [existing] = await db.select()
            .from(attendees)
            .where(and(
              eq(attendees.externalId, item.externalId),
              eq(attendees.eventId, event.id),
            ))
            .limit(1);

          if (existing) {
            // Update — never overwrite check-in or badge status
            await db.update(attendees)
              .set({
                firstName,
                lastName,
                email: item.email,
                company,
                title,
                participantType: item.participantType,
                registrationStatus: item.registrationStatus || existing.registrationStatus,
                registrationStatusLabel: item.registrationStatusLabel || existing.registrationStatusLabel,
                orderCode: item.orderCode ?? existing.orderCode,
                externalProfileId: item.externalProfileId ?? existing.externalProfileId,
                customFields: item.customFields || existing.customFields,
              })
              .where(eq(attendees.id, existing.id));
            updated++;
          } else {
            // Create
            await storage.createAttendee({
              eventId: event.id,
              firstName,
              lastName,
              email: item.email,
              company,
              title,
              participantType: item.participantType,
              registrationStatus: item.registrationStatus || "Registered",
              registrationStatusLabel: item.registrationStatusLabel,
              externalId: item.externalId,
              externalProfileId: item.externalProfileId || null,
              orderCode: item.orderCode || null,
              customFields: item.customFields || {},
            });
            created++;
          }
        } catch (err: any) {
          errors.push({ index: i, externalId: item.externalId, error: err.message || "Processing failed" });
        }
      }

      logger.info({ customerId, eventCode: parsed.eventCode, created, updated, errors: errors.length }, "Inbound attendees processed");

      await logInboundActivity(req, "inbound_attendees", { eventCode: parsed.eventCode, created, updated, errorCount: errors.length, total: parsed.attendees.length });

      res.json({
        success: true,
        processed: created + updated,
        created,
        updated,
        errors,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.flatten().fieldErrors });
      }
      logger.error({ err: error }, "Error processing inbound attendees");
      res.status(500).json({ error: "Failed to process attendees" });
    }
  });

  // POST /api/v1/inbound/events — Create or update an event
  app.post("/api/v1/inbound/events", inboundBodyLimit, inboundApiAuth, inboundLimiter, async (req: InboundRequest, res) => {
    try {
      const customerId = req.inboundCustomerId!;
      const parsed = eventUpsertSchema.parse(req.body);

      const existing = await resolveEvent(customerId, parsed.eventCode, parsed.accountCode);

      if (existing) {
        // Update metadata only — never overwrite local config
        await db.update(events)
          .set({
            name: sanitizeHtml(parsed.name),
            eventDate: new Date(parsed.eventDate),
            startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
            endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
            timezone: parsed.timezone,
            location: parsed.location ? sanitizeHtml(parsed.location) : undefined,
            venue: parsed.venue ? sanitizeHtml(parsed.venue) : undefined,
          })
          .where(eq(events.id, existing.id));

        const updated = await storage.getEvent(existing.id);
        logger.info({ customerId, eventCode: parsed.eventCode }, "Inbound event updated");
        await logInboundActivity(req, "inbound_event_update", { eventCode: parsed.eventCode, eventId: existing.id });
        res.json({ success: true, action: "updated", event: updated });
      } else {
        // Create new event
        const newEvent = await storage.createEvent({
          customerId,
          name: sanitizeHtml(parsed.name),
          eventDate: new Date(parsed.eventDate),
          startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
          endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
          timezone: parsed.timezone,
          location: parsed.location ? sanitizeHtml(parsed.location) : undefined,
          venue: parsed.venue ? sanitizeHtml(parsed.venue) : undefined,
          eventCode: parsed.eventCode,
          accountCode: parsed.accountCode,
        });
        logger.info({ customerId, eventCode: parsed.eventCode, eventId: newEvent.id }, "Inbound event created");
        await logInboundActivity(req, "inbound_event_create", { eventCode: parsed.eventCode, eventId: newEvent.id });
        res.status(201).json({ success: true, action: "created", event: newEvent });
      }
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.flatten().fieldErrors });
      }
      logger.error({ err: error }, "Error processing inbound event");
      res.status(500).json({ error: "Failed to process event" });
    }
  });

  // POST /api/v1/inbound/sessions — Batch create/update sessions
  app.post("/api/v1/inbound/sessions", inboundBodyLimit, inboundApiAuth, inboundLimiter, async (req: InboundRequest, res) => {
    try {
      const customerId = req.inboundCustomerId!;
      const parsed = sessionBatchSchema.parse(req.body);

      const event = await resolveEvent(customerId, parsed.eventCode, parsed.accountCode);
      if (!event) {
        return res.status(404).json({ error: `Event not found for code: ${parsed.eventCode}` });
      }

      let created = 0;
      let updated = 0;
      const errors: Array<{ index: number; externalId: string; error: string }> = [];

      const existingSessions = await storage.getSessions(event.id);

      for (let i = 0; i < parsed.sessions.length; i++) {
        const item = parsed.sessions[i];
        try {
          const existing = existingSessions.find(s => s.externalId === item.externalId);

          if (existing) {
            await storage.updateSession(existing.id, {
              name: sanitizeHtml(item.name),
              startTime: item.startTime ? new Date(item.startTime) : undefined,
              endTime: item.endTime ? new Date(item.endTime) : undefined,
              location: item.location ? sanitizeHtml(item.location) : undefined,
              capacity: item.capacity,
              description: item.description ? sanitizeHtml(item.description) : undefined,
            });
            updated++;
          } else {
            await storage.createSession({
              eventId: event.id,
              externalId: item.externalId,
              name: sanitizeHtml(item.name),
              startTime: item.startTime ? new Date(item.startTime) : undefined,
              endTime: item.endTime ? new Date(item.endTime) : undefined,
              location: item.location ? sanitizeHtml(item.location) : null,
              capacity: item.capacity || null,
              description: item.description ? sanitizeHtml(item.description) : null,
            });
            created++;
          }
        } catch (err: any) {
          errors.push({ index: i, externalId: item.externalId, error: err.message || "Processing failed" });
        }
      }

      logger.info({ customerId, eventCode: parsed.eventCode, created, updated, errors: errors.length }, "Inbound sessions processed");
      await logInboundActivity(req, "inbound_sessions", { eventCode: parsed.eventCode, created, updated, errorCount: errors.length, total: parsed.sessions.length });
      res.json({ success: true, processed: created + updated, created, updated, errors });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.flatten().fieldErrors });
      }
      logger.error({ err: error }, "Error processing inbound sessions");
      res.status(500).json({ error: "Failed to process sessions" });
    }
  });

  // POST /api/v1/inbound/session-registrations — Batch register attendees for sessions
  app.post("/api/v1/inbound/session-registrations", inboundBodyLimit, inboundApiAuth, inboundLimiter, async (req: InboundRequest, res) => {
    try {
      const customerId = req.inboundCustomerId!;
      const parsed = registrationBatchSchema.parse(req.body);

      const event = await resolveEvent(customerId, parsed.eventCode, parsed.accountCode);
      if (!event) {
        return res.status(404).json({ error: `Event not found for code: ${parsed.eventCode}` });
      }

      let created = 0;
      let updated = 0;
      const errors: Array<{ index: number; error: string }> = [];

      const eventSessions = await storage.getSessions(event.id);
      const eventAttendees = await storage.getAttendees(event.id);

      for (let i = 0; i < parsed.registrations.length; i++) {
        const item = parsed.registrations[i];
        try {
          const session = eventSessions.find(s => s.externalId === item.sessionExternalId);
          if (!session) {
            errors.push({ index: i, error: `Session not found: ${item.sessionExternalId}` });
            continue;
          }

          const attendee = eventAttendees.find(a => a.externalId === item.attendeeExternalId);
          if (!attendee) {
            errors.push({ index: i, error: `Attendee not found: ${item.attendeeExternalId}` });
            continue;
          }

          const existingReg = await storage.getSessionRegistrationByAttendee(session.id, attendee.id);

          if (existingReg) {
            await storage.updateSessionRegistration(existingReg.id, { status: item.status });
            updated++;
          } else {
            await storage.createSessionRegistration({
              sessionId: session.id,
              attendeeId: attendee.id,
              status: item.status,
            });
            created++;
          }
        } catch (err: any) {
          errors.push({ index: i, error: err.message || "Processing failed" });
        }
      }

      logger.info({ customerId, eventCode: parsed.eventCode, created, updated, errors: errors.length }, "Inbound session registrations processed");
      await logInboundActivity(req, "inbound_session_registrations", { eventCode: parsed.eventCode, created, updated, errorCount: errors.length, total: parsed.registrations.length });
      res.json({ success: true, processed: created + updated, created, updated, errors });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.flatten().fieldErrors });
      }
      logger.error({ err: error }, "Error processing inbound session registrations");
      res.status(500).json({ error: "Failed to process session registrations" });
    }
  });

  logger.info("Inbound API routes registered");
}
