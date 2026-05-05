import { createChildLogger } from '../logger';
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, isSuperAdmin } from "../auth";
import { badgeTemplateResolver } from "../services/badge-template-resolver";
import { checkinSyncService } from "../services/checkin-sync-service";
import { printNodeService } from "../services/printnode";
import {
  sanitizeHtml,
  sanitizeAttendeeData,
  hashPasscode,
  verifyPasscode,
  generateSessionToken,
  staffAuth,
  penTestMode,
  startRateLimiterCleanup,
  type StaffRequest,
} from "./shared";

const logger = createChildLogger('TempStaffRoutes');

export function registerTempStaffRoutes(app: Express): void {
  // Get event sync settings
  app.get("/api/events/:eventId/sync-settings", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const syncSettings = (event.syncSettings) || {};
      let accountRealtimeEnabled = false;
      let accountSessionRealtimeEnabled = false;
      let accountSyncIntervalMinutes = 60;
      if (event.integrationId) {
        const integration = await storage.getCustomerIntegration(event.integrationId);
        const rtConfig = integration?.realtimeSyncConfig as any;
        accountRealtimeEnabled = !!(rtConfig?.enabled);
        const sessionRtConfig = integration?.realtimeSessionSyncConfig as any;
        accountSessionRealtimeEnabled = !!(sessionRtConfig?.enabled);
        const defaultSync = integration?.defaultSyncSettings as any;
        if (defaultSync?.syncIntervalMinutes) {
          accountSyncIntervalMinutes = defaultSync.syncIntervalMinutes;
        }
      }

      res.json({
        realtimeSyncEnabled: syncSettings.realtimeSyncEnabled ?? null,
        realtimeSessionSyncEnabled: syncSettings.realtimeSessionSyncEnabled ?? null,
        syncFrozen: syncSettings.syncFrozen ?? false,
        syncFrozenAt: syncSettings.syncFrozenAt ?? null,
        syncIntervalMinutes: syncSettings.syncIntervalMinutes ?? null,
        accountSyncIntervalMinutes,
        accountRealtimeEnabled,
        accountSessionRealtimeEnabled,
      });
    } catch (error: any) {
      logger.error({ err: error }, "GET error");
      res.status(500).json({ error: "Failed to get sync settings" });
    }
  });

  // Update event sync settings
  app.patch("/api/events/:eventId/sync-settings", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { realtimeSyncEnabled, realtimeSessionSyncEnabled, syncFrozen, syncIntervalMinutes } = req.body;

      if (realtimeSyncEnabled !== undefined && realtimeSyncEnabled !== null && typeof realtimeSyncEnabled !== 'boolean') {
        return res.status(400).json({ error: "realtimeSyncEnabled must be boolean or null" });
      }
      if (realtimeSessionSyncEnabled !== undefined && realtimeSessionSyncEnabled !== null && typeof realtimeSessionSyncEnabled !== 'boolean') {
        return res.status(400).json({ error: "realtimeSessionSyncEnabled must be boolean or null" });
      }
      if (syncFrozen !== undefined && typeof syncFrozen !== 'boolean') {
        return res.status(400).json({ error: "syncFrozen must be boolean" });
      }
      if (syncIntervalMinutes !== undefined && syncIntervalMinutes !== null) {
        const interval = Number(syncIntervalMinutes);
        if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
          return res.status(400).json({ error: "syncIntervalMinutes must be an integer between 1 and 1440, or null" });
        }
      }

      const existing = (event.syncSettings) || {};

      const updated: any = { ...existing };
      if (realtimeSyncEnabled !== undefined) {
        updated.realtimeSyncEnabled = realtimeSyncEnabled;
      }
      if (realtimeSessionSyncEnabled !== undefined) {
        updated.realtimeSessionSyncEnabled = realtimeSessionSyncEnabled;
      }
      if (syncFrozen !== undefined) {
        updated.syncFrozen = syncFrozen;
        if (syncFrozen && !existing.syncFrozenAt) {
          updated.syncFrozenAt = new Date().toISOString();
        } else if (!syncFrozen) {
          updated.syncFrozenAt = null;
        }
      }
      if (syncIntervalMinutes !== undefined) {
        updated.syncIntervalMinutes = syncIntervalMinutes;
      }

      const updatedEvent = await storage.updateEvent(eventId, { syncSettings: updated });

      await storage.createAuditLog({
        action: "event_sync_settings_update",
        userId: req.dbUser?.id || "unknown",
        userEmail: req.dbUser?.email || "unknown",
        userRole: req.dbUser?.role || "unknown",
        customerId: event.customerId,
        customerName: null,
        resourceType: "event",
        resourceId: eventId,
        resourceName: event.name,
        changedFields: [
          ...(realtimeSyncEnabled !== undefined ? [{
            field: "realtimeSyncEnabled",
            oldValue: existing.realtimeSyncEnabled ?? null,
            newValue: updated.realtimeSyncEnabled,
          }] : []),
          ...(realtimeSessionSyncEnabled !== undefined ? [{
            field: "realtimeSessionSyncEnabled",
            oldValue: existing.realtimeSessionSyncEnabled ?? null,
            newValue: updated.realtimeSessionSyncEnabled,
          }] : []),
          ...(syncFrozen !== undefined ? [{
            field: "syncFrozen",
            oldValue: existing.syncFrozen ?? false,
            newValue: updated.syncFrozen,
          }] : []),
        ],
        metadata: null,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      });

      logger.info(`Updated event ${eventId}: realtimeSyncEnabled=${updated.realtimeSyncEnabled}, realtimeSessionSyncEnabled=${updated.realtimeSessionSyncEnabled}, syncFrozen=${updated.syncFrozen}`);

      res.json({
        realtimeSyncEnabled: updated.realtimeSyncEnabled ?? null,
        realtimeSessionSyncEnabled: updated.realtimeSessionSyncEnabled ?? null,
        syncFrozen: updated.syncFrozen ?? false,
        syncFrozenAt: updated.syncFrozenAt ?? null,
      });
    } catch (error: any) {
      logger.error({ err: error }, "PATCH error");
      res.status(500).json({ error: "Failed to update sync settings" });
    }
  });

  // Get discovered attendee statuses for an event
  app.get("/api/events/:eventId/discovered-statuses", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const attendees = await storage.getAttendees(eventId);
      const statusCounts = new Map<string, number>();
      for (const a of attendees) {
        const label = (a as any).registrationStatusLabel || a.registrationStatus || 'Unknown';
        statusCounts.set(label, (statusCounts.get(label) || 0) + 1);
      }

      const statuses = Array.from(statusCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      const syncSettings = (event.syncSettings) || {};
      res.json({
        statuses,
        selectedStatuses: syncSettings.selectedStatuses || null,
        statusesConfigured: !!syncSettings.statusesConfigured,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error fetching discovered statuses");
      res.status(500).json({ error: "Failed to fetch discovered statuses" });
    }
  });

  // Update selected attendee statuses for an event (add-only for non-super_admin)
  app.patch("/api/events/:eventId/selected-statuses", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { selectedStatuses } = req.body;
      if (!Array.isArray(selectedStatuses) || selectedStatuses.length === 0) {
        return res.status(400).json({ error: "selectedStatuses must be a non-empty array of strings" });
      }

      const existing = (event.syncSettings) || {};
      const previouslySelected: string[] = existing.selectedStatuses || [];

      // Add-only enforcement: non-super_admin cannot remove previously selected statuses
      if (!isSuperAdmin(req.dbUser) && previouslySelected.length > 0) {
        const removed = previouslySelected.filter((s: string) => !selectedStatuses.includes(s));
        if (removed.length > 0) {
          return res.status(403).json({
            error: "Only super admins can remove previously selected statuses",
            removedStatuses: removed,
          });
        }
      }

      const updated = {
        ...existing,
        selectedStatuses,
        statusesConfigured: true,
      };

      const updatedEvent = await storage.updateEvent(eventId, { syncSettings: updated });

      // Stamp billableAt on matching attendees that don't already have it
      const attendees = await storage.getAttendees(eventId);
      const now = new Date();
      let newlyBillable = 0;
      for (const attendee of attendees) {
        if ((attendee as any).billableAt) continue; // Already stamped
        const status = (attendee as any).registrationStatusLabel || attendee.registrationStatus;
        if (selectedStatuses.includes(status)) {
          await storage.updateAttendee(attendee.id, { billableAt: now } as any);
          newlyBillable++;
        }
      }
      if (newlyBillable > 0) {
        logger.info(`Stamped billableAt on ${newlyBillable} attendees for event ${eventId}`);
      }

      await storage.createAuditLog({
        action: "event_status_selection_update",
        userId: req.dbUser?.id || "unknown",
        userEmail: req.dbUser?.email || "unknown",
        userRole: req.dbUser?.role || "unknown",
        customerId: event.customerId,
        customerName: null,
        resourceType: "event",
        resourceId: eventId,
        resourceName: event.name,
        changedFields: [{
          field: "selectedStatuses",
          oldValue: previouslySelected.length > 0 ? previouslySelected.join(", ") : "none",
          newValue: selectedStatuses.join(", "),
        }],
        metadata: null,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        selectedStatuses: updated.selectedStatuses,
        statusesConfigured: true,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error updating selected statuses");
      res.status(500).json({ error: "Failed to update selected statuses" });
    }
  });

  // Configure temp staff settings for an event (admin only)
  app.patch("/api/events/:eventId/staff-settings", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user has access to this event
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { enabled, passcode, startTime, endTime, badgeTemplateId, allowedSessionIds, allowWalkins, allowKioskFromStaff, allowGroupCheckin, groupDisclaimerMode, groupCheckinEnabled, allowKioskWalkins, kioskWalkinConfig } = req.body;

      // Validate time window
      if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ error: "Start time must be before end time" });
      }

      // Validate passcode minimum length
      if (passcode && passcode.length < 4) {
        return res.status(400).json({ error: "Passcode must be at least 4 characters" });
      }

      let staffSettings = event.tempStaffSettings;

      if (enabled === false) {
        // Disable temp staff access
        staffSettings = null;
      } else {
        // Build or update settings
        const newSettings: typeof staffSettings = {
          enabled: true,
          passcodeHash: passcode ? hashPasscode(passcode) : (staffSettings?.passcodeHash || ''),
          passcode: passcode || staffSettings?.passcode,
          startTime: startTime || staffSettings?.startTime || new Date().toISOString(),
          endTime: endTime || staffSettings?.endTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          badgeTemplateId: badgeTemplateId !== undefined ? badgeTemplateId : staffSettings?.badgeTemplateId,
          allowedSessionIds: allowedSessionIds !== undefined ? allowedSessionIds : staffSettings?.allowedSessionIds,
          allowWalkins: allowWalkins !== undefined ? allowWalkins : (staffSettings?.allowWalkins ?? false),
          allowKioskFromStaff: allowKioskFromStaff !== undefined ? allowKioskFromStaff : (staffSettings?.allowKioskFromStaff ?? false),
          allowGroupCheckin: allowGroupCheckin !== undefined ? allowGroupCheckin : (staffSettings?.allowGroupCheckin ?? false),
          groupDisclaimerMode: groupDisclaimerMode !== undefined ? groupDisclaimerMode : (staffSettings?.groupDisclaimerMode ?? 'group'),
          groupCheckinEnabled: groupCheckinEnabled !== undefined ? groupCheckinEnabled : (staffSettings?.groupCheckinEnabled ?? false),
          allowKioskWalkins: allowKioskWalkins !== undefined ? allowKioskWalkins : (staffSettings?.allowKioskWalkins ?? false),
          kioskWalkinConfig: kioskWalkinConfig !== undefined ? {
            enabledFields: Array.isArray(kioskWalkinConfig?.enabledFields) ? kioskWalkinConfig.enabledFields.filter((f: string) => ['firstName', 'lastName', 'email', 'company', 'title', 'participantType'].includes(f)) : ['firstName', 'lastName', 'email'],
            requiredFields: Array.isArray(kioskWalkinConfig?.requiredFields) ? kioskWalkinConfig.requiredFields.filter((f: string) => ['firstName', 'lastName', 'email', 'company', 'title', 'participantType'].includes(f)) : ['firstName', 'lastName', 'email'],
            availableTypes: Array.isArray(kioskWalkinConfig?.availableTypes) && kioskWalkinConfig.availableTypes.length > 0 ? kioskWalkinConfig.availableTypes.map((t: string) => String(t).trim()).filter(Boolean) : ['Walk-in'],
            defaultType: kioskWalkinConfig?.defaultType && typeof kioskWalkinConfig.defaultType === 'string' ? kioskWalkinConfig.defaultType.trim() : 'Walk-in',
          } : staffSettings?.kioskWalkinConfig,
        };

        // Passcode is required for new settings
        if (!newSettings.passcodeHash) {
          return res.status(400).json({ error: "Passcode is required when enabling temp staff access" });
        }

        staffSettings = newSettings;
      }

      // When enabling staff settings, also mark event as configured
      const updateData: Record<string, unknown> = {
        tempStaffSettings: staffSettings as any,
      };
      if (staffSettings?.enabled) {
        const staffEvent = await storage.getEvent(req.params.eventId);
        const staffStatusesOk = !!(staffEvent?.syncSettings as any)?.statusesConfigured;
        if (staffStatusesOk) {
          updateData.configStatus = 'configured';
        }
      }

      const updatedEvent = await storage.updateEvent(req.params.eventId, updateData);

      res.json({
        success: true,
        event: {
          id: updatedEvent?.id,
          name: updatedEvent?.name,
          staffEnabled: !!updatedEvent?.tempStaffSettings?.enabled,
          staffStartTime: updatedEvent?.tempStaffSettings?.startTime,
          staffEndTime: updatedEvent?.tempStaffSettings?.endTime,
          configStatus: updatedEvent?.configStatus,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating temp staff settings");
      res.status(500).json({ error: "Failed to update temp staff settings" });
    }
  });

  // Get temp staff settings for an event (admin only)
  app.get("/api/events/:eventId/staff-settings", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user has access to this event
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const settings = event.tempStaffSettings;

      res.json({
        enabled: settings?.enabled || false,
        startTime: settings?.startTime || null,
        endTime: settings?.endTime || null,
        badgeTemplateId: settings?.badgeTemplateId || null,
        allowedSessionIds: settings?.allowedSessionIds || null,
        hasPasscode: !!settings?.passcodeHash,
        passcode: settings?.passcode || null,
        allowWalkins: settings?.allowWalkins || false,
        allowKioskFromStaff: settings?.allowKioskFromStaff || false,
        allowGroupCheckin: settings?.allowGroupCheckin || false,
        groupDisclaimerMode: settings?.groupDisclaimerMode || 'group',
        groupCheckinEnabled: settings?.groupCheckinEnabled || false,
        allowKioskWalkins: settings?.allowKioskWalkins || false,
        kioskWalkinConfig: settings?.kioskWalkinConfig || null,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching temp staff settings");
      res.status(500).json({ error: "Failed to fetch temp staff settings" });
    }
  });

  // Staff login rate limiting: 5 attempts per 15 minutes per eventId+IP
  const staffLoginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
  const STAFF_LOGIN_MAX_ATTEMPTS = penTestMode ? 500 : 5;
  const STAFF_LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const STAFF_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
  startRateLimiterCleanup(staffLoginAttempts, (entry, now) => {
    if (entry.lockedUntil && now > entry.lockedUntil) return true;
    return now - entry.firstAttempt > STAFF_LOGIN_WINDOW_MS;
  });

  // Temp staff login (public - no auth required)
  app.post("/api/staff/events/:eventId/login", async (req, res) => {
    try {
      const rateLimitKey = `${req.params.eventId}:${req.ip}`;
      const now = Date.now();
      const attempts = staffLoginAttempts.get(rateLimitKey);

      if (attempts) {
        if (attempts.lockedUntil && now < attempts.lockedUntil) {
          const retryAfter = Math.ceil((attempts.lockedUntil - now) / 1000);
          return res.status(429).json({
            error: "Too many login attempts. Please try again later.",
            retryAfterSeconds: retryAfter,
          });
        }
        if (now - attempts.firstAttempt > STAFF_LOGIN_WINDOW_MS) {
          staffLoginAttempts.delete(rateLimitKey);
        }
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Block access to unconfigured events
      if (event.configStatus === 'unconfigured') {
        return res.status(403).json({ 
          error: "This event has not been configured for check-in yet. Please contact your event administrator.",
          code: "EVENT_NOT_CONFIGURED"
        });
      }

      const settings = event.tempStaffSettings;
      if (!settings?.enabled) {
        return res.status(403).json({ error: "Temp staff access is not enabled for this event" });
      }

      // Validate time window - only enforce if times are set
      const currentTime = new Date();

      if (settings.startTime) {
        const startTime = new Date(settings.startTime);
        if (currentTime < startTime) {
          return res.status(403).json({ 
            error: "Temp staff access has not started yet",
            startsAt: settings.startTime,
          });
        }
      }

      if (settings.endTime) {
        const endTime = new Date(settings.endTime);
        if (currentTime > endTime) {
          return res.status(403).json({ 
            error: "Temp staff access has ended",
            endedAt: settings.endTime,
          });
        }
      }

      const { passcode, staffName } = req.body;

      if (!passcode || !staffName) {
        return res.status(400).json({ error: "Passcode and staff name are required" });
      }

      // Verify passcode
      if (!verifyPasscode(passcode, settings.passcodeHash)) {
        const current = staffLoginAttempts.get(rateLimitKey) || { count: 0, firstAttempt: now };
        current.count++;
        if (current.count >= STAFF_LOGIN_MAX_ATTEMPTS) {
          current.lockedUntil = now + STAFF_LOGIN_LOCKOUT_MS;
        }
        staffLoginAttempts.set(rateLimitKey, current);

        const remaining = STAFF_LOGIN_MAX_ATTEMPTS - current.count;
        return res.status(401).json({
          error: "Invalid passcode",
          ...(remaining > 0 && remaining <= 2 ? { attemptsRemaining: remaining } : {}),
        });
      }

      staffLoginAttempts.delete(rateLimitKey);

      // Create session token
      const token = generateSessionToken();
      // Expire at end time if set, otherwise 12 hours from now
      const maxExpiry = Date.now() + 12 * 60 * 60 * 1000;
      let expiresAt: Date;
      
      if (settings.endTime) {
        const endTimeMs = new Date(settings.endTime).getTime();
        // Guard against malformed date strings producing NaN
        if (!Number.isNaN(endTimeMs)) {
          expiresAt = new Date(Math.min(endTimeMs, maxExpiry));
        } else {
          logger.warn("Malformed endTime in temp staff settings, falling back to max expiry");
          expiresAt = new Date(maxExpiry);
        }
      } else {
        expiresAt = new Date(maxExpiry);
      }

      const session = await storage.createStaffSession({
        eventId: event.id,
        staffName: staffName.trim(),
        token,
        expiresAt,
        isActive: true,
      });

      // Log the login
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'login',
        metadata: { staffName: staffName.trim() },
      });

      const customer = await storage.getCustomer(event.customerId);

      res.json({
        success: true,
        token,
        expiresAt: expiresAt.toISOString(),
        session: {
          id: session.id,
          staffName: session.staffName,
        },
        event: {
          id: event.id,
          name: event.name,
          customerId: event.customerId,
          customerName: customer?.name,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error during temp staff login");
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Get temp staff session info (validates token is still valid)
  app.get("/api/staff/session", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const customer = await storage.getCustomer(event.customerId);

      res.json({
        session: {
          id: session.id,
          staffName: session.staffName,
          expiresAt: session.expiresAt,
        },
        event: {
          id: event.id,
          name: event.name,
          customerId: event.customerId,
          customerName: customer?.name,
          eventDate: event.eventDate,
          syncSettings: event.syncSettings || null,
          tempStaffSettings: event.tempStaffSettings || null,
        },
        settings: {
          printPreviewOnCheckin: event.tempStaffSettings?.printPreviewOnCheckin || false,
          allowWalkins: event.tempStaffSettings?.allowWalkins || false,
          allowKioskFromStaff: event.tempStaffSettings?.allowKioskFromStaff || false,
          allowGroupCheckin: event.tempStaffSettings?.allowGroupCheckin || false,
          groupDisclaimerMode: event.tempStaffSettings?.groupDisclaimerMode || 'group',
          groupCheckinEnabled: event.tempStaffSettings?.groupCheckinEnabled || false,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching temp staff session");
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.post("/api/staff/feedback", staffAuth, async (req: StaffRequest, res) => {
    try {
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { randomUUID } = await import("crypto");
      const { sql } = await import("drizzle-orm");

      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { type, message, severity, screenshotDataUrl } = req.body;

      if (!message || !type) {
        return res.status(400).json({ error: "Message and type are required" });
      }

      const validTypes = ["issue", "feature_request", "comment"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid feedback type" });
      }

      if (typeof message !== "string" || message.length > 5000) {
        return res.status(400).json({ error: "Message must be a string under 5000 characters" });
      }

      const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
      const ALLOWED_IMAGE_TYPES = ["png", "jpeg", "jpg", "gif", "webp"];
      let screenshotUrl: string | undefined;
      if (screenshotDataUrl && typeof screenshotDataUrl === "string" && screenshotDataUrl.startsWith("data:image/")) {
        try {
          const matches = screenshotDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1].toLowerCase();
            if (!ALLOWED_IMAGE_TYPES.includes(ext)) {
              return res.status(400).json({ error: "Invalid screenshot image type" });
            }
            const buffer = Buffer.from(matches[2], "base64");
            if (buffer.length > MAX_SCREENSHOT_BYTES) {
              return res.status(400).json({ error: "Screenshot must be under 5MB" });
            }
            const { default: objectStorage } = await import("@replit/object-storage");
            const client = new objectStorage();
            const key = `feedback/staff-screenshot-${Date.now()}.${ext}`;
            await client.uploadFromBytes(key, buffer);
            screenshotUrl = `/objects/${key}`;
          }
        } catch (uploadErr) {
          logger.error({ err: uploadErr }, "Screenshot upload failed");
        }
      }

      const staffPage = `/staff/${event.id}/dashboard`;
      const staffPageTitle = `Staff Dashboard - ${event.name}`;

      const ticketResult = await db.execute(sql`SELECT nextval('feedback_ticket_seq') as num`);
      const ticketNumber = Number(ticketResult.rows?.[0]?.num ?? ticketResult[0]?.num);

      const [entry] = await db.insert(feedbackEntries).values({
        id: `fb-${randomUUID().substring(0, 8)}`,
        ticketNumber,
        customerId: event.customerId,
        eventId: event.id,
        userId: null,
        userRole: "staff",
        submitterName: session.staffName,
        page: staffPage,
        pageTitle: staffPageTitle,
        type,
        message,
        tags: ["staff-feedback"],
        severity: severity || null,
        screenshotUrl: screenshotUrl || null,
        status: "new",
      }).returning();

      let customerName = "";
      try {
        const { customers } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, event.customerId)).limit(1);
        if (cust?.name) customerName = cust.name;
      } catch {}

      const { sendFeedbackToSlack } = await import("./services/slack-feedback");
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendFeedbackToSlack({
        type,
        message,
        severity,
        page: staffPage,
        pageTitle: staffPageTitle,
        userName: `${session.staffName} (Staff)`,
        userRole: "staff",
        customerName,
        eventId: event.id,
        tags: ["staff-feedback"],
        screenshotUrl: screenshotUrl ? `${baseUrl}${screenshotUrl}` : undefined,
        ticketRef: ticketNumber ? `FB-${ticketNumber}` : undefined,
      }).catch(() => {});

      res.json(entry);
    } catch (error) {
      logger.error({ err: error }, "Error submitting staff feedback");
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get printers available for temp staff (from account-level configuration)
  // Filters by event's locationId if assigned, otherwise returns all customer printers
  app.get("/api/staff/printers", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      let printers = await storage.getPrinters(event.customerId);
      
      // Filter by event location if assigned
      if (event.locationId) {
        printers = printers.filter(p => 
          p.locationId === event.locationId || p.locationId === null
        );
      }
      
      res.json({
        printers: printers.map(p => ({
          id: p.id,
          name: p.name,
          connectionType: p.connectionType,
          ipAddress: p.ipAddress,
          port: p.port,
          dpi: p.dpi,
          locationId: p.locationId,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching printers for temp staff");
      res.status(500).json({ error: "Failed to fetch printers" });
    }
  });

  // Get PrintNode printers (for temp staff)
  app.get("/api/staff/printnode/printers", staffAuth, async (req: StaffRequest, res) => {
    try {
      if (!printNodeService.isConfigured()) {
        return res.json({ 
          configured: false, 
          printers: [],
          message: 'PrintNode is not configured. Contact your administrator.'
        });
      }

      const printers = await printNodeService.getPrinters();
      res.json({ 
        configured: true,
        printers: printers.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          computerName: p.computer.name,
          state: p.state,
        })),
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error fetching PrintNode printers");
      res.status(500).json({ error: error.message || "Failed to fetch PrintNode printers" });
    }
  });

  // Test PrintNode connection
  app.get("/api/staff/printnode/status", staffAuth, async (req: StaffRequest, res) => {
    try {
      const result = await printNodeService.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Print badge via PrintNode
  app.post("/api/staff/printnode/print", largeBodyParser, staffAuth, async (req: StaffRequest, res) => {
    try {
      const { printerId, pdfBase64, zplData, title, badgeWidth, badgeHeight } = req.body;

      if (!printerId) {
        return res.status(400).json({ error: "printerId is required" });
      }

      if (!pdfBase64 && !zplData) {
        return res.status(400).json({ error: "Either pdfBase64 or zplData is required" });
      }

      let result;
      if (zplData) {
        result = await printNodeService.printRaw(printerId, zplData, title || 'Badge Print');
      } else {
        const printOptions = badgeWidth && badgeHeight
          ? { widthInches: badgeWidth, heightInches: badgeHeight, fitToPage: true }
          : undefined;
        result = await printNodeService.printPdf(printerId, pdfBase64, title || 'Badge Print', printOptions);
      }

      res.json({ success: true, jobId: result.id });
    } catch (error: any) {
      logger.error({ err: error }, "Error printing via PrintNode");
      res.status(500).json({ error: error.message || "Print failed" });
    }
  });

  // Test print - sends a simple test label to verify printer connection
  app.post("/api/staff/printnode/test-print", staffAuth, async (req: StaffRequest, res) => {
    try {
      const { printerId } = req.body;

      if (!printerId) {
        return res.status(400).json({ error: "printerId is required" });
      }

      // Simple test ZPL that should work on any Zebra printer (203 DPI, 2x3 inch label)
      const testZpl = `^XA
^MMT
^PW406
^LL609
^LS0
^FO20,50^A0N,40,40^FDPrintNode Test^FS
^FO20,100^A0N,30,30^FDIf you see this,^FS
^FO20,140^A0N,30,30^FDZPL printing works!^FS
^FO20,200^A0N,20,20^FDPrinter ID: ${printerId}^FS
^FO20,230^A0N,20,20^FDTime: ${new Date().toISOString()}^FS
^XZ`;

      logger.info('Sending TEST print to printer', printerId);
      const result = await printNodeService.printRaw(printerId, testZpl, 'Test Print');
      
      res.json({ success: true, jobId: result.id, message: 'Test print sent - check your printer!' });
    } catch (error: any) {
      logger.error({ err: error }, "Error sending test print");
      res.status(500).json({ error: error.message || "Test print failed" });
    }
  });

  // Temp staff logout
  app.post("/api/staff/logout", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;

      await storage.invalidateStaffSession(session.id);

      // Log the logout
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: session.eventId,
        action: 'logout',
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error during temp staff logout");
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Get attendees for temp staff event
  app.get("/api/staff/attendees", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const attendees = await storage.getAttendees(event.id);

      res.json(attendees.map(a => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        company: a.company,
        title: a.title,
        participantType: a.participantType,
        registrationStatus: a.registrationStatus,
        registrationStatusLabel: a.registrationStatusLabel,
        checkedIn: a.checkedIn,
        checkedInAt: a.checkedInAt,
        badgePrinted: a.badgePrinted,
        badgePrintedAt: a.badgePrintedAt,
        externalId: a.externalId,
        orderCode: a.orderCode,
        customFields: a.customFields,
      })));
    } catch (error) {
      logger.error({ err: error }, "Error fetching attendees for temp staff");
      res.status(500).json({ error: "Failed to fetch attendees" });
    }
  });

  // Staff group lookup by order code
  app.get("/api/staff/group/:orderCode", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const allAttendees = await storage.getAttendees(event.id);
      const members = allAttendees.filter((a: any) => a.orderCode === req.params.orderCode);

      if (members.length === 0) {
        return res.json({ found: false, members: [], primaryId: null });
      }

      const primary = members.find((a: any) => a.externalId === req.params.orderCode);
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
      logger.error({ err: error }, "Error in staff group lookup");
      res.status(500).json({ error: "Group lookup failed" });
    }
  });

  // Staff batch group check-in
  app.post("/api/staff/group-checkin", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const { attendeeIds, checkedInBy } = req.body;
      if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
        return res.status(400).json({ error: "attendeeIds must be a non-empty array" });
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

          try {
            const integration = await checkinSyncService.getIntegrationForEvent(event);
            if (integration) {
              void checkinSyncService.sendCheckinSync(updated, event, integration, checkedInBy || "Staff Group");
            }
          } catch (syncErr) {
            logger.warn({ err: syncErr }, `Sync failed for attendee ${attendeeId} in staff group check-in`);
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
      logger.error({ err: error }, "Error in staff group check-in");
      res.status(500).json({ error: "Group check-in failed" });
    }
  });

  app.post("/api/staff/attendees", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;

      if (!event.tempStaffSettings?.allowWalkins) {
        return res.status(403).json({ error: "Walk-in attendee creation is not enabled for this event" });
      }

      const { firstName, lastName, email, participantType, company, title } = req.body;

      if (typeof firstName !== 'string' || typeof lastName !== 'string' || typeof email !== 'string' || typeof participantType !== 'string') {
        return res.status(400).json({ error: "firstName, lastName, email, and participantType must be strings" });
      }

      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedParticipantType = participantType.trim();

      if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !trimmedParticipantType) {
        return res.status(400).json({ error: "First name, last name, email, and attendee type are required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const sanitizedData = sanitizeAttendeeData({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        company: (typeof company === 'string' ? company.trim() : null) || null,
        title: (typeof title === 'string' ? title.trim() : null) || null,
        participantType: trimmedParticipantType,
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

      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'add_walkin',
        targetId: attendee.id,
        metadata: {
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          attendeeEmail: attendee.email,
          participantType: attendee.participantType,
          staffName: session.staffName,
        },
      });

      {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
        if (integration) {
          void checkinSyncService.sendWalkinRegistrationSync(attendee, event, integration, session.staffName)
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Staff walk-in registration sync failed');
              }
            })
            .catch(err => logger.error({ err }, 'Staff walk-in registration sync error'));
        }
      }

      res.status(201).json({
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        company: attendee.company,
        title: attendee.title,
        participantType: attendee.participantType,
        checkedIn: attendee.checkedIn,
        checkedInAt: attendee.checkedInAt,
        badgePrinted: attendee.badgePrinted,
        badgePrintedAt: attendee.badgePrintedAt,
        externalId: attendee.externalId,
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating walk-in attendee");
      res.status(500).json({ error: "Failed to create attendee" });
    }
  });

  // Get sessions for temp staff event
  app.get("/api/staff/sessions", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const settings = event.tempStaffSettings!;
      
      let sessions = await storage.getSessions(event.id);
      
      // Filter to allowed sessions if specified
      if (settings.allowedSessionIds && settings.allowedSessionIds.length > 0) {
        sessions = sessions.filter(s => settings.allowedSessionIds!.includes(s.id));
      }

      // Get check-in counts for each session
      const sessionsWithCounts = await Promise.all(
        sessions.map(async (s) => {
          const checkins = await storage.getSessionCheckins(s.id);
          const activeCheckins = checkins.filter(c => c.action === 'checkin').length;
          const checkouts = checkins.filter(c => c.action === 'checkout').length;
          
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            location: s.location,
            startTime: s.startTime,
            endTime: s.endTime,
            capacity: s.capacity,
            checkedInCount: activeCheckins - checkouts,
            restrictToRegistered: s.restrictToRegistered,
          };
        })
      );

      res.json(sessionsWithCounts);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sessions for temp staff");
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get session registrations with attendee details for temp staff
  app.get("/api/staff/sessions/:sessionId/registrations", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const { sessionId } = req.params;
      const settings = event.tempStaffSettings!;

      // Verify session exists and belongs to this event
      const session = await storage.getSession(sessionId);
      if (!session || session.eventId !== event.id) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if session is in allowed list
      if (settings.allowedSessionIds && settings.allowedSessionIds.length > 0) {
        if (!settings.allowedSessionIds.includes(sessionId)) {
          return res.status(403).json({ error: "You do not have access to this session" });
        }
      }

      // Get registrations for this session
      const registrations = await storage.getSessionRegistrations(sessionId);
      
      // Get attendee details for each registration
      const registrationsWithAttendees = await Promise.all(
        registrations.filter(r => r.status === "registered").map(async (reg) => {
          const attendee = await storage.getAttendee(reg.attendeeId);
          if (!attendee) return null;
          
          // Check if attendee is checked into this session
          const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, reg.attendeeId);
          
          return {
            registrationId: reg.id,
            attendee: {
              id: attendee.id,
              firstName: attendee.firstName,
              lastName: attendee.lastName,
              email: attendee.email,
              company: attendee.company,
              title: attendee.title,
              participantType: attendee.participantType,
              checkedIn: attendee.checkedIn,
              externalId: attendee.externalId,
            },
            sessionCheckedIn: isCheckedIn,
            registeredAt: reg.registeredAt,
          };
        })
      );

      res.json(registrationsWithAttendees.filter(r => r !== null));
    } catch (error) {
      logger.error({ err: error }, "Error fetching session registrations");
      res.status(500).json({ error: "Failed to fetch session registrations" });
    }
  });

  // Temp staff event-level check-in
  app.post("/api/staff/checkin", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { attendeeId } = req.body;

      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Verify attendee belongs to this event
      if (attendee.eventId !== event.id) {
        return res.status(403).json({ error: "Attendee does not belong to this event" });
      }

      // Check if already checked in
      if (attendee.checkedIn) {
        return res.status(409).json({ 
          error: "Attendee is already checked in",
          alreadyCheckedIn: true,
          checkedInAt: attendee.checkedInAt,
        });
      }

      // Update attendee check-in status and set registrationStatus to 'Attended'
      const updatedAttendee = await storage.updateAttendee(attendeeId, {
        checkedIn: true,
        checkedInAt: new Date(),
        registrationStatus: 'Attended',
      } as any);

      // Log the check-in
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'checkin',
        targetId: attendeeId,
        metadata: {
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          staffName: session.staffName,
        },
      });

      // Send real-time sync to external system (async, non-blocking)
      if (updatedAttendee) {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
        if (integration) {
          void checkinSyncService.sendCheckinSync(updatedAttendee, event, integration, session.staffName)
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Check-in sync failed');
              }
            })
            .catch(err => logger.error({ err: err }, 'Check-in sync error'));
        }
      }

      // Send SMS notifications based on notification rules (async, non-blocking)
      if (updatedAttendee) {
        void (async () => {
          try {
            const { smsService } = await import('./services/sms-service');
            if (!smsService.isConfigured()) {
              return;
            }
            
            const rules = await storage.getActiveNotificationRulesForAttendee(
              event.id,
              {
                participantType: updatedAttendee.participantType,
                company: updatedAttendee.company,
                firstName: updatedAttendee.firstName,
                lastName: updatedAttendee.lastName,
              }
            );
            
            if (rules.length === 0) return;
            
            for (const rule of rules) {
              const recipients = (rule.smsRecipients as Array<{ phoneNumber: string; name?: string }>) || [];
              if (recipients.length === 0) continue;
              
              let message = rule.customMessage || 'Check-in alert:';
              if (rule.includeAttendeeName) {
                message += ` ${updatedAttendee.firstName} ${updatedAttendee.lastName}`;
              }
              if (rule.includeCompany && updatedAttendee.company) {
                message += ` (${updatedAttendee.company})`;
              }
              message += ` has checked in`;
              if (rule.includeCheckinTime) {
                const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                message += ` at ${time}`;
              }
              message += ` - ${event.name}`;
              
              for (const recipient of recipients) {
                void smsService.sendSMS({ to: recipient.phoneNumber, message })
                  .then(result => {
                    if (result.success) {
                      logger.info(`SMS sent to ${recipient.phoneNumber} for check-in: ${updatedAttendee.firstName} ${updatedAttendee.lastName}`);
                    } else {
                      logger.warn({ err: result.error }, `SMS failed to ${recipient.phoneNumber}`);
                    }
                  })
                  .catch(err => logger.error({ err: err }, 'SMS error'));
              }
            }
          } catch (err) {
            logger.error({ err: err }, 'Error processing check-in notifications');
          }
        })();
      }

      // Get badge template if print preview is enabled using the resolver
      let badgeTemplate = null;
      const settings = event.tempStaffSettings;
      if (settings?.printPreviewOnCheckin) {
        // Use the resolver which checks event overrides first, then falls back
        const result = await badgeTemplateResolver.resolveTemplateForParticipantType(
          event.id, 
          updatedAttendee?.participantType || 'General'
        );
        badgeTemplate = result.template;
        
        if (!badgeTemplate) {
          logger.warn(`Print preview enabled but no badge template found for event ${event.id}`);
        }
      }

      res.json({
        success: true,
        attendee: {
          id: updatedAttendee?.id,
          firstName: updatedAttendee?.firstName,
          lastName: updatedAttendee?.lastName,
          email: updatedAttendee?.email,
          company: updatedAttendee?.company,
          title: updatedAttendee?.title,
          participantType: updatedAttendee?.participantType,
          registrationStatus: updatedAttendee?.registrationStatus,
          checkedIn: updatedAttendee?.checkedIn,
          checkedInAt: updatedAttendee?.checkedInAt,
          externalId: updatedAttendee?.externalId,
          badgePrinted: updatedAttendee?.badgePrinted,
          badgePrintedAt: updatedAttendee?.badgePrintedAt,
          customFields: updatedAttendee?.customFields,
        },
        // Only include printPreview if enabled AND template was found
        printPreview: (settings?.printPreviewOnCheckin && badgeTemplate) ? {
          enabled: true,
          template: {
            id: badgeTemplate.id,
            name: badgeTemplate.name,
            width: badgeTemplate.width,
            height: badgeTemplate.height,
            backgroundColor: badgeTemplate.backgroundColor,
            textColor: badgeTemplate.textColor,
            accentColor: badgeTemplate.accentColor,
            fontFamily: badgeTemplate.fontFamily,
            includeQR: badgeTemplate.includeQR,
            qrPosition: badgeTemplate.qrPosition,
            qrCodeConfig: badgeTemplate.qrCodeConfig,
            mergeFields: badgeTemplate.mergeFields,
            imageElements: badgeTemplate.imageElements,
          },
        } : undefined,
      });
    } catch (error) {
      logger.error({ err: error }, "Error during temp staff check-in");
      res.status(500).json({ error: "Check-in failed" });
    }
  });

  // Temp staff mark badge as printed
  app.post("/api/staff/badge-printed", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { attendeeId } = req.body;

      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Verify attendee belongs to this event
      if (attendee.eventId !== event.id) {
        return res.status(403).json({ error: "Attendee does not belong to this event" });
      }

      // Update badge printed status and set registrationStatus to 'Attended'
      const updatedAttendee = await storage.updateAttendee(attendeeId, {
        badgePrinted: true,
        badgePrintedAt: new Date(),
        registrationStatus: 'Attended',
      } as any);

      // Log the badge print
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'badge_print',
        targetId: attendeeId,
        metadata: {
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          staffName: session.staffName,
        },
      });

      res.json({
        success: true,
        attendee: {
          id: updatedAttendee?.id,
          badgePrinted: updatedAttendee?.badgePrinted,
          badgePrintedAt: updatedAttendee?.badgePrintedAt,
          registrationStatus: updatedAttendee?.registrationStatus,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error marking badge as printed");
      res.status(500).json({ error: "Failed to mark badge as printed" });
    }
  });

  // Temp staff revert check-in
  app.post("/api/staff/revert-checkin", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { attendeeId } = req.body;

      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Verify attendee belongs to this event
      if (attendee.eventId !== event.id) {
        return res.status(403).json({ error: "Attendee does not belong to this event" });
      }

      // Check if not checked in
      if (!attendee.checkedIn) {
        return res.status(409).json({ 
          error: "Attendee is not checked in",
          notCheckedIn: true,
        });
      }

      // Revert check-in status - restore registrationStatus to 'Registered'
      const updatedAttendee = await storage.updateAttendee(attendeeId, {
        checkedIn: false,
        checkedInAt: null,
        registrationStatus: 'Registered',
        badgePrinted: false,
        badgePrintedAt: null,
      } as any);

      await storage.deleteAttendeeWorkflowResponses(attendeeId, event.id);
      await storage.deleteAttendeeSignaturesByAttendee(attendeeId, event.id);

      // Send real-time sync revert to external system (async, non-blocking)
      if (updatedAttendee && event.integrationId) {
        const integration = await storage.getCustomerIntegration(event.integrationId);
        if (integration) {
          void checkinSyncService.sendCheckinRevertSync(updatedAttendee, event, integration, session.staffName)
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Staff check-in revert sync failed');
              }
            })
            .catch(err => logger.error({ err: err }, 'Staff check-in revert sync error'));
        }
      }

      // Log the revert
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'revert_checkin',
        targetId: attendeeId,
        metadata: {
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          staffName: session.staffName,
        },
      });

      res.json({
        success: true,
        attendee: {
          id: updatedAttendee?.id,
          firstName: updatedAttendee?.firstName,
          lastName: updatedAttendee?.lastName,
          checkedIn: updatedAttendee?.checkedIn,
          checkedInAt: updatedAttendee?.checkedInAt,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error reverting check-in");
      res.status(500).json({ error: "Revert check-in failed" });
    }
  });

  // Temp staff network print to Zebra printer via IP:9100 (for iOS/mobile support)
  app.post("/api/staff/network-print", largeBodyParser, staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { printerIp, zplData, port = 9100 } = req.body;

      if (!printerIp) {
        return res.status(400).json({ error: "printerIp is required" });
      }
      if (!zplData) {
        return res.status(400).json({ error: "zplData is required" });
      }

      // Validate IP address format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(printerIp)) {
        return res.status(400).json({ error: "Invalid IP address format" });
      }

      // Use Node.js net module to send ZPL to printer
      const net = await import('net');
      
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const client = new net.Socket();
        const timeout = 10000; // 10 second timeout

        client.setTimeout(timeout);

        client.on('connect', () => {
          client.write(zplData, 'utf8', (err) => {
            if (err) {
              client.destroy();
              resolve({ success: false, error: err.message });
            } else {
              // Give the printer a moment to receive the data
              setTimeout(() => {
                client.destroy();
                resolve({ success: true });
              }, 500);
            }
          });
        });

        client.on('timeout', () => {
          client.destroy();
          resolve({ success: false, error: 'Connection timed out' });
        });

        client.on('error', (err) => {
          client.destroy();
          resolve({ success: false, error: err.message });
        });

        client.connect(port, printerIp);
      });

      if (!result.success) {
        return res.status(500).json({ 
          error: "Print failed", 
          details: result.error 
        });
      }

      // Log the network print
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'network_print',
        targetId: printerIp,
        metadata: {
          printerIp,
          port,
          staffName: session.staffName,
          zplLength: zplData.length,
        },
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error sending network print");
      res.status(500).json({ error: "Network print failed" });
    }
  });

  // Temp staff card print — send PDF to card printer (Zebra ZC300, etc.)
  // Supports PrintNode (cloud/USB) and direct network via port 9100
  app.post("/api/staff/card-print", largeBodyParser, staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { pdfBase64, printerIp, printNodePrinterId, port = 9100, title = "ID Card" } = req.body;

      if (!pdfBase64) {
        return res.status(400).json({ error: "pdfBase64 is required (base64-encoded PDF)" });
      }

      let printResult: { success: boolean; jobId?: any; error?: string };

      if (printNodePrinterId) {
        // Route 1: PrintNode — sends PDF through Windows driver (handles dye-sub rendering)
        const { PrintNodeService } = await import('../services/printnode');
        const printNode = new PrintNodeService();
        const job = await printNode.printPdf(
          printNodePrinterId,
          pdfBase64,
          title,
          { widthInches: 3.375, heightInches: 2.125, fitToPage: true }
        );
        printResult = { success: true, jobId: job.id };

      } else if (printerIp) {
        // Route 2: Direct network — send raw PDF data to card printer
        // Card printers in pass-through mode accept PDF/image on port 9100
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(printerIp)) {
          return res.status(400).json({ error: "Invalid IP address format" });
        }

        const net = await import('net');
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');

        printResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
          const client = new net.Socket();
          client.setTimeout(15000); // 15s timeout for card print (slower than label)

          client.on('connect', () => {
            client.write(pdfBuffer, (err) => {
              if (err) {
                client.destroy();
                resolve({ success: false, error: err.message });
              } else {
                setTimeout(() => {
                  client.destroy();
                  resolve({ success: true });
                }, 1000); // Card printers need more time to buffer
              }
            });
          });

          client.on('timeout', () => {
            client.destroy();
            resolve({ success: false, error: 'Connection timed out' });
          });

          client.on('error', (err) => {
            client.destroy();
            resolve({ success: false, error: err.message });
          });

          client.connect(port, printerIp);
        });

      } else {
        return res.status(400).json({ error: "Either printNodePrinterId or printerIp is required" });
      }

      if (!printResult.success) {
        return res.status(500).json({ error: "Card print failed", details: printResult.error });
      }

      // Log the card print
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'card_print',
        targetId: printNodePrinterId?.toString() || printerIp,
        metadata: {
          printerIp: printerIp || null,
          printNodePrinterId: printNodePrinterId || null,
          port,
          title,
          staffName: session.staffName,
          pdfSize: pdfBase64.length,
          jobId: printResult.jobId || null,
        },
      });

      res.json({ success: true, jobId: printResult.jobId || null });
    } catch (error) {
      logger.error({ err: error }, "Error sending card print");
      res.status(500).json({ error: "Card print failed" });
    }
  });

  // Temp staff synced questions (displayOnStaffEdit=true only)
  app.get("/api/staff/synced-questions", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const questions = await storage.getSyncedQuestions(event.customerId, event.id);
      res.json(questions.filter(q => q.displayOnStaffEdit));
    } catch (error) {
      logger.error({ err: error }, "Error fetching staff synced questions");
      res.status(500).json({ error: "Failed to fetch synced questions" });
    }
  });

  // Temp staff question responses for an attendee
  app.get("/api/staff/attendees/:attendeeId/question-responses", staffAuth, async (req: StaffRequest, res) => {
    try {
      const responses = await storage.getAttendeeQuestionResponses(req.params.attendeeId);
      res.json(responses);
    } catch (error) {
      logger.error({ err: error }, "Error fetching staff question responses");
      res.status(500).json({ error: "Failed to fetch question responses" });
    }
  });

  // Temp staff bulk update question responses (readOnly enforced)
  app.patch("/api/staff/attendees/:attendeeId/question-responses", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { responses } = req.body; // Array of { questionId, responseValue, responseValues? }
      if (!Array.isArray(responses)) return res.status(400).json({ error: "responses array required" });

      // Load questions to enforce readOnly
      const questions = await storage.getSyncedQuestions(event.customerId, event.id);
      const editableIds = new Set(questions.filter(q => q.displayOnStaffEdit && !q.readOnly).map(q => q.id));

      const results = [];
      const mergeFieldUpdates: Record<string, string> = {};

      for (const r of responses) {
        if (!editableIds.has(r.questionId)) continue; // Skip readOnly questions
        const result = await storage.upsertAttendeeQuestionResponse({
          attendeeId: req.params.attendeeId,
          questionId: r.questionId,
          responseValue: r.responseValue || null,
          responseValues: r.responseValues || null,
          editedLocally: true,
          editedBy: `staff:${session.staffName}`,
          editedAt: new Date(),
        });
        results.push(result);

        const question = questions.find(q => q.id === r.questionId);
        if (question && r.responseValue) {
          mergeFieldUpdates[question.mergeFieldKey] = r.responseValue;
        }
      }

      // Rebuild customFields
      if (Object.keys(mergeFieldUpdates).length > 0) {
        const attendee = await storage.getAttendee(req.params.attendeeId);
        if (attendee) {
          const updatedFields = { ...(attendee.customFields || {}), ...mergeFieldUpdates };
          await storage.updateAttendee(attendee.id, { customFields: updatedFields });
        }
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      logger.error({ err: error }, "Error updating staff question responses");
      res.status(500).json({ error: "Failed to update question responses" });
    }
  });

  // Temp staff test printer connection
  app.post("/api/staff/test-printer", staffAuth, async (req: StaffRequest, res) => {
    try {
      const { printerIp, port = 9100 } = req.body;

      if (!printerIp) {
        return res.status(400).json({ error: "printerIp is required" });
      }

      // Validate IP address format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(printerIp)) {
        return res.status(400).json({ error: "Invalid IP address format" });
      }

      const net = await import('net');
      
      const result = await new Promise<{ connected: boolean; error?: string }>((resolve) => {
        const client = new net.Socket();
        const timeout = 5000; // 5 second timeout

        client.setTimeout(timeout);

        client.on('connect', () => {
          // Send a simple ZPL status query
          const testZpl = '^XA^XZ'; // Minimal valid ZPL command
          client.write(testZpl, 'utf8', () => {
            client.destroy();
            resolve({ connected: true });
          });
        });

        client.on('timeout', () => {
          client.destroy();
          resolve({ connected: false, error: 'Connection timed out' });
        });

        client.on('error', (err) => {
          client.destroy();
          resolve({ connected: false, error: err.message });
        });

        client.connect(port, printerIp);
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error testing printer connection");
      res.status(500).json({ connected: false, error: "Connection test failed" });
    }
  });

  // Temp staff update attendee badge data
  app.patch("/api/staff/attendees/:attendeeId", staffAuth, async (req: StaffRequest, res) => {
    try {
      const session = req.staffSession!;
      const event = req.staffEvent!;
      const { attendeeId } = req.params;
      const { firstName, lastName, company, title } = req.body;

      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Verify attendee belongs to this event
      if (attendee.eventId !== event.id) {
        return res.status(403).json({ error: "Attendee does not belong to this event" });
      }

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = sanitizeHtml(firstName);
      if (lastName !== undefined) updateData.lastName = sanitizeHtml(lastName);
      if (company !== undefined) updateData.company = sanitizeHtml(company);
      if (title !== undefined) updateData.title = sanitizeHtml(title);

      const updatedAttendee = await storage.updateAttendee(attendeeId, updateData);

      // Log the update
      await storage.createStaffActivityLog({
        sessionId: session.id,
        eventId: event.id,
        action: 'update_attendee',
        targetId: attendeeId,
        metadata: {
          attendeeName: `${updatedAttendee?.firstName} ${updatedAttendee?.lastName}`,
          staffName: session.staffName,
          updatedFields: Object.keys(updateData),
        },
      });

      res.json({
        success: true,
        attendee: updatedAttendee,
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating attendee");
      res.status(500).json({ error: "Failed to update attendee" });
    }
  });

  // Temp staff session check-in
  app.post("/api/staff/sessions/:sessionId/checkin", staffAuth, async (req: StaffRequest, res) => {
    try {
      const staffSession = req.staffSession!;
      const event = req.staffEvent!;
      const { sessionId } = req.params;
      const { attendeeId } = req.body;

      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }

      // Verify session exists and belongs to this event
      const eventSession = await storage.getSession(sessionId);
      if (!eventSession || eventSession.eventId !== event.id) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if session is in allowed list
      const settings = event.tempStaffSettings!;
      if (settings.allowedSessionIds && settings.allowedSessionIds.length > 0) {
        if (!settings.allowedSessionIds.includes(sessionId)) {
          return res.status(403).json({ error: "You do not have access to this session" });
        }
      }

      // Verify attendee exists and belongs to this event
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Check if session restricts to registered attendees
      if (eventSession.restrictToRegistered) {
        const registration = await storage.getSessionRegistrationByAttendee(sessionId, attendeeId);
        if (!registration || registration.status !== "registered") {
          return res.status(403).json({ 
            error: "This session is restricted to pre-registered attendees only",
            isRegistered: !!registration,
            registrationStatus: registration?.status,
          });
        }
      }

      // Check if already checked in
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, attendeeId);
      if (isCheckedIn) {
        return res.status(409).json({ error: "Attendee is already checked in to this session", alreadyCheckedIn: true });
      }

      // Create session check-in
      const checkin = await storage.createSessionCheckin({
        sessionId,
        attendeeId,
        action: "checkin",
        source: "staff",
        checkedInBy: staffSession.staffName,
      });

      // Log the session check-in
      await storage.createStaffActivityLog({
        sessionId: staffSession.id,
        eventId: event.id,
        action: 'session_checkin',
        targetId: sessionId,
        metadata: {
          attendeeId,
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          sessionName: eventSession.name,
          staffName: staffSession.staffName,
        },
      });

      // Fire-and-forget: sync session check-in to external system
      const integration = await checkinSyncService.getIntegrationForEvent(event);
      if (integration) {
        void checkinSyncService.sendSessionCheckinSync(attendee, eventSession, event, integration)
          .catch(err => logger.error({ err: err }, 'Staff error'));
      }

      res.status(201).json({
        success: true,
        checkin,
        attendee: {
          id: attendee.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company,
        },
        session: {
          id: eventSession.id,
          name: eventSession.name,
          location: eventSession.location,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error during temp staff session check-in");
      res.status(500).json({ error: "Session check-in failed" });
    }
  });

  // Staff session check-out endpoint
  app.post("/api/staff/sessions/:sessionId/checkout", staffAuth, async (req: StaffRequest, res) => {
    try {
      const staffSession = req.staffSession!;
      const event = req.staffEvent!;
      const { sessionId } = req.params;
      const { attendeeId } = req.body;

      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }

      // Verify session exists and belongs to this event
      const eventSession = await storage.getSession(sessionId);
      if (!eventSession || eventSession.eventId !== event.id) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if session is in allowed list
      const settings = event.tempStaffSettings!;
      if (settings.allowedSessionIds && settings.allowedSessionIds.length > 0) {
        if (!settings.allowedSessionIds.includes(sessionId)) {
          return res.status(403).json({ error: "You do not have access to this session" });
        }
      }

      // Verify attendee exists and belongs to this event
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      // Check if currently checked in
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, attendeeId);
      if (!isCheckedIn) {
        return res.status(409).json({ error: "Attendee is not checked in to this session", notCheckedIn: true });
      }

      // Create session check-out
      const checkout = await storage.createSessionCheckin({
        sessionId,
        attendeeId,
        action: "checkout",
        source: "staff",
        checkedInBy: staffSession.staffName,
      });

      // Log the session check-out
      await storage.createStaffActivityLog({
        sessionId: staffSession.id,
        eventId: event.id,
        action: 'session_checkout',
        targetId: sessionId,
        metadata: {
          attendeeId,
          attendeeName: `${attendee.firstName} ${attendee.lastName}`,
          sessionName: eventSession.name,
          staffName: staffSession.staffName,
        },
      });

      res.status(201).json({
        success: true,
        checkout,
        attendee: {
          id: attendee.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company,
        },
        session: {
          id: eventSession.id,
          name: eventSession.name,
          location: eventSession.location,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error during temp staff session check-out");
      res.status(500).json({ error: "Session check-out failed" });
    }
  });

  // Get temp staff activity logs for event (admin only)
  app.get("/api/events/:eventId/staff-activity", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user has access to this event
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await storage.getStaffActivityLogs(req.params.eventId);

      // Enrich with session info
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const session = await storage.getStaffSession(log.sessionId);
          return {
            ...log,
            staffName: session?.staffName || 'Unknown',
          };
        })
      );

      res.json(enrichedLogs);
    } catch (error) {
      logger.error({ err: error }, "Error fetching temp staff activity");
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // Get active temp staff sessions for event (admin only)
  app.get("/api/events/:eventId/staff-sessions", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user has access to this event
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const sessions = await storage.getStaffSessions(req.params.eventId);
      
      // Filter to active sessions only
      const now = new Date();
      const activeSessions = sessions.filter(s => s.isActive && new Date(s.expiresAt) > now);

      res.json(activeSessions.map(s => ({
        id: s.id,
        staffName: s.staffName,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })));
    } catch (error) {
      logger.error({ err: error }, "Error fetching temp staff sessions");
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get badge templates for temp staff (for badge printing)
  app.get("/api/staff/badge-templates", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const settings = event.tempStaffSettings!;
      
      // Get customer's badge templates
      const templates = await storage.getBadgeTemplates(event.customerId);
      
      // If a specific badge template is set for temp staff, filter to just that one
      if (settings.badgeTemplateId) {
        const template = templates.find(t => t.id === settings.badgeTemplateId);
        if (template) {
          return res.json([template]);
        }
      }
      
      // Otherwise, return event's selected templates
      if (event.selectedTemplates.length > 0) {
        const selectedTemplates = templates.filter(t => event.selectedTemplates.includes(t.id) || event.selectedTemplates.includes(t.participantType));
        if (selectedTemplates.length > 0) {
          return res.json(selectedTemplates);
        }
      }
      
      // Fallback to all templates
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching badge templates for temp staff");
      res.status(500).json({ error: "Failed to fetch badge templates" });
    }
  });

  // Resolve badge template for a specific attendee based on participant type
  app.get("/api/staff/attendees/:attendeeId/resolve-template", staffAuth, async (req: StaffRequest, res) => {
    try {
      const event = req.staffEvent!;
      const { attendeeId } = req.params;
      
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== event.id) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      const result = await badgeTemplateResolver.resolveTemplateForAttendee(attendee, event.id);
      
      res.json({
        template: result.template,
        resolutionPath: result.resolutionPath,
        participantType: result.participantType,
      });
    } catch (error) {
      logger.error({ err: error }, "Error resolving template for temp staff attendee");
      res.status(500).json({ error: "Failed to resolve template" });
    }
  });

  // Public endpoint to check if temp staff access is available for an event
  app.get("/api/staff/events/:eventId/status", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const settings = event.tempStaffSettings;
      const customer = await storage.getCustomer(event.customerId);

      if (!settings?.enabled) {
        return res.json({
          available: false,
          reason: "Temp staff access is not enabled for this event",
        });
      }

      const now = new Date();

      // Only check time constraints if they are set
      if (settings.startTime) {
        const startTime = new Date(settings.startTime);
        if (now < startTime) {
          return res.json({
            available: false,
            reason: "Temp staff access has not started yet",
            startsAt: settings.startTime,
            event: {
              id: event.id,
              name: event.name,
              customerName: customer?.name,
            },
          });
        }
      }

      if (settings.endTime) {
        const endTime = new Date(settings.endTime);
        if (now > endTime) {
          return res.json({
            available: false,
            reason: "Temp staff access has ended",
            endedAt: settings.endTime,
            event: {
              id: event.id,
              name: event.name,
              customerName: customer?.name,
            },
          });
        }
      }

      res.json({
        available: true,
        event: {
          id: event.id,
          name: event.name,
          eventDate: event.eventDate,
          customerName: customer?.name,
        },
        accessWindow: {
          startTime: settings.startTime || null,
          endTime: settings.endTime || null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error checking temp staff status");
      res.status(500).json({ error: "Failed to check status" });
    }
  });
}
