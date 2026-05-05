import { createChildLogger } from './logger';
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPrinterSchema, insertCustomerSchema, insertEventSchema, insertBadgeTemplateSchema, insertCustomerIntegrationSchema, insertEventIntegrationSchema, insertAttendeeSchema, updateAttendeeSchema, insertIntegrationConnectionSchema, insertSessionSchema, insertUserSchema, insertIntegrationEndpointConfigSchema, insertEventCodeMappingSchema, insertSessionCodeMappingSchema, insertEventBadgeTemplateOverrideSchema, insertEventWorkflowConfigSchema, insertEventWorkflowStepSchema, insertEventBuyerQuestionSchema, insertEventDisclaimerSchema, insertAttendeeWorkflowResponseSchema, insertAttendeeSignatureSchema, insertEventConfigurationTemplateSchema, partnerCustomerAssignments } from "@shared/schema";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  encryptCredential,
  maskCredential,
} from "./credential-manager";
import { authMiddleware, requireAuth, requireRole, canManageUsers, canAssignRole, getEffectiveCustomerId, isSuperAdmin, isPartner, isPartnerOrAbove, getPartnerAssignedCustomerIds } from "./auth";
import { badgeTemplateResolver } from "./services/badge-template-resolver";
import { checkinSyncService } from "./services/checkin-sync-service";
import badgeAiRoutes from "./routes/badge-ai";
import { createAssistantRouter } from "./assistant/route";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerLocalStorageRoutes } from "./services/local-storage";
import { registerS3StorageRoutes } from "./services/s3-storage";
import { registerReportRoutes } from "./routes/reports";
import { registerSyncInsightsRoutes } from "./routes/sync-insights";
import { registerPrinterDiagnosticsRoutes } from "./routes/printer-diagnostics";
import { registerTempStaffRoutes } from "./routes/temp-staff";
import { registerKioskRoutes } from "./routes/kiosk";
import { registerWorkflowRoutes } from "./routes/workflows";
import { registerIntegrationConnectionRoutes } from "./routes/integration-connections";
import { registerInboundApiRoutes } from "./routes/inbound-api";
import { printNodeService } from "./services/printnode";
import healthRoutes from "./routes/health";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  validatePasswordComplexity,
  saveSession,
  regenerateSession,
  sanitizeAttendeeData,
  logSettingsAudit,
  hashPasscode,
  updateUserSchema,
  penTestMode,
  startRateLimiterCleanup,
} from "./routes/shared";

const logger = createChildLogger('Routes');

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Register health check routes (no auth required)
  app.use(healthRoutes);
  
  // Apply authentication middleware to all routes
  app.use(authMiddleware);
  
  // Register file storage routes (after authMiddleware so req.dbUser is populated)
  if (process.env.REPL_ID) {
    registerObjectStorageRoutes(app);
  } else if (process.env.S3_BUCKET_NAME) {
    registerS3StorageRoutes(app);
  } else {
    registerLocalStorageRoutes(app);
  }
  
  // Register report routes (must be after authMiddleware so req.dbUser is populated)
  registerReportRoutes(app);

  // Register sync insights routes (super_admin + admin)
  registerSyncInsightsRoutes(app);

  // Register printer diagnostics routes (super_admin only)
  registerPrinterDiagnosticsRoutes(app);

  // Register temp staff routes (staff auth, check-in, printing, workflows)
  registerTempStaffRoutes(app);

  // Register inbound API routes (external systems push data via API key)
  registerInboundApiRoutes(app);

  // Register kiosk public routes (PIN-protected)
  registerKioskRoutes(app);

  // Register workflow routes (config, steps, questions, disclaimers, responses, signatures)
  registerWorkflowRoutes(app);

  // Register integration connection + sync routes (OAuth2, API keys, event sync state)
  registerIntegrationConnectionRoutes(app);

  // =====================
  // Auth Routes
  // =====================
  
  // Get current authenticated user info
  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id, email, firstName, lastName, role, customerId, isActive } = req.dbUser;

      let customer = null;
      if (customerId) {
        customer = await storage.getCustomer(customerId);
      }

      // For partners, include their assigned customer IDs
      let assignedCustomerIds: string[] | undefined;
      if (role === "partner") {
        assignedCustomerIds = await getPartnerAssignedCustomerIds(id);
      }

      res.json({
        user: { id, email, firstName, lastName, role, customerId, isActive },
        customer: customer ? { id: customer.id, name: customer.name } : null,
        isSuperAdmin: role === "super_admin",
        isPartner: role === "partner",
        assignedCustomerIds,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching current user");
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });
  
  // Email/Password Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      const bcrypt = await import("bcryptjs");
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      if (!user.passwordHash) {
        return res.status(401).json({ error: "Password login not enabled for this account. Please use Replit login or set a password first." });
      }
      
      if (!user.isActive) {
        return res.status(401).json({ error: "Account is disabled" });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Update last login time
      await storage.updateLastLogin(user.id);
      
      await regenerateSession(req.session);
      req.session.userId = user.id;
      await saveSession(req.session);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          customerId: user.customerId,
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Error during login");
      res.status(500).json({ error: "Login failed" });
    }
  });

  const penTestMode = process.env.PEN_TEST_MODE === "true";

  // Simple rate limiter for OTP requests (per identifier)
  const otpRateLimits = new Map<string, { count: number; resetAt: number }>();
  const OTP_RATE_LIMIT = penTestMode ? 500 : 5; // max requests per window
  const OTP_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
  startRateLimiterCleanup(otpRateLimits, (entry, now) => now > entry.resetAt);


  // Request OTP code for login (SMS primary, email backup)
  app.post("/api/auth/request-otp", async (req, res) => {
    try {
      const { identifier, method } = req.body; // identifier = phone or email, method = 'sms' | 'email'
      
      if (!identifier) {
        return res.status(400).json({ error: "Phone number or email is required" });
      }
      
      // Rate limiting per identifier
      const now = Date.now();
      const rateKey = `${method}:${identifier}`;
      const rateData = otpRateLimits.get(rateKey);
      
      if (rateData) {
        if (now < rateData.resetAt) {
          if (rateData.count >= OTP_RATE_LIMIT) {
            const waitMins = Math.ceil((rateData.resetAt - now) / 60000);
            return res.status(429).json({ error: `Too many code requests. Please try again in ${waitMins} minutes.` });
          }
          rateData.count++;
        } else {
          otpRateLimits.set(rateKey, { count: 1, resetAt: now + OTP_RATE_WINDOW });
        }
      } else {
        otpRateLimits.set(rateKey, { count: 1, resetAt: now + OTP_RATE_WINDOW });
      }
      
      // Find user by phone or email
      let user;
      if (method === 'email') {
        user = await storage.getUserByEmail(identifier);
      } else {
        // SMS is default/primary
        user = await storage.getUserByPhoneNumber(identifier);
      }
      
      if (!user) {
        // Don't reveal if user exists for security
        return res.json({ success: true, message: "If an account exists, a code has been sent." });
      }
      
      if (!user.isActive) {
        return res.json({ success: true, message: "If an account exists, a code has been sent." });
      }
      
      // Generate 6-digit OTP
      const { randomInt } = await import("crypto");
      const code = randomInt(100000, 1000000).toString();
      
      // Hash and store with 10 minute expiry (using hours, so 0.167 hours ≈ 10 mins)
      const bcrypt = await import("bcryptjs");
      const codeHash = await bcrypt.hash(code, 10);
      await storage.createPasswordResetToken(user.id, 0.167, codeHash); // 10 minute expiry
      
      let sent = false;
      let error: string | undefined;
      
      if (method === 'email' && user.email) {
        const { emailService } = await import('./services/email-service');
        if (emailService.isConfigured()) {
          const result = await emailService.sendOTPEmail(user.email, user.firstName, code);
          sent = result.success;
          error = result.error;
          if (sent) {
            logger.info(`OTP sent via email to ${user.email}`);
          }
        } else {
          error = 'Email service not configured';
        }
      } else if (user.phoneNumber) {
        const { smsService } = await import('./services/sms-service');
        if (smsService.isConfigured()) {
          const message = `Your Greet login code is: ${code}\n\nThis code expires in 10 minutes.`;
          const result = await smsService.sendSMS({ to: user.phoneNumber, message });
          sent = result.success;
          error = result.error;
          if (sent) {
            logger.info(`OTP sent via SMS to ${user.phoneNumber}`);
          }
        } else {
          error = 'SMS service not configured';
        }
      } else {
        error = method === 'email' ? 'User has no email configured' : 'User has no phone number configured';
      }
      
      if (!sent && error) {
        logger.error(`Failed to send OTP: ${error}`);
        return res.status(500).json({ error: `Failed to send code: ${error}` });
      }
      
      res.json({ success: true, message: "If an account exists, a code has been sent." });
    } catch (error) {
      logger.error({ err: error }, "Error requesting OTP");
      res.status(500).json({ error: "Failed to send code" });
    }
  });

  // Rate limiter for OTP verification attempts (per identifier)
  const otpVerifyAttempts = new Map<string, { count: number; resetAt: number }>();
  const OTP_VERIFY_LIMIT = 5; // max failed attempts before lockout
  const OTP_VERIFY_WINDOW = 15 * 60 * 1000; // 15 minute lockout
  startRateLimiterCleanup(otpVerifyAttempts, (entry, now) => now > entry.resetAt);

  // Verify OTP code and login
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { identifier, code, method } = req.body;
      
      if (!identifier || !code) {
        return res.status(400).json({ error: "Phone/email and code are required" });
      }
      
      // Check for too many failed attempts
      const now = Date.now();
      const attemptKey = `${method}:${identifier}`;
      const attemptData = otpVerifyAttempts.get(attemptKey);
      
      if (attemptData && now < attemptData.resetAt && attemptData.count >= OTP_VERIFY_LIMIT) {
        const waitMins = Math.ceil((attemptData.resetAt - now) / 60000);
        return res.status(429).json({ error: `Too many failed attempts. Please try again in ${waitMins} minutes.` });
      }
      
      // Find user by phone or email
      let user;
      if (method === 'email') {
        user = await storage.getUserByEmail(identifier);
      } else {
        user = await storage.getUserByPhoneNumber(identifier);
      }
      
      if (!user) {
        // Track failed attempt
        if (attemptData && now < attemptData.resetAt) {
          attemptData.count++;
        } else {
          otpVerifyAttempts.set(attemptKey, { count: 1, resetAt: now + OTP_VERIFY_WINDOW });
        }
        return res.status(401).json({ error: "Invalid code" });
      }
      
      if (!user.isActive) {
        return res.status(401).json({ error: "Account is disabled" });
      }
      
      // Get stored token
      const tokens = await storage.getPasswordResetTokensForUser(user.id);
      if (!tokens || tokens.length === 0) {
        // Track failed attempt
        if (attemptData && now < attemptData.resetAt) {
          attemptData.count++;
        } else {
          otpVerifyAttempts.set(attemptKey, { count: 1, resetAt: now + OTP_VERIFY_WINDOW });
        }
        return res.status(401).json({ error: "Invalid or expired code" });
      }
      
      // Verify code against stored hash
      const bcrypt = await import("bcryptjs");
      let validToken = null;
      
      for (const token of tokens) {
        if (token.codeHash && await bcrypt.compare(code, token.codeHash)) {
          validToken = token;
          break;
        }
      }
      
      if (!validToken) {
        // Track failed attempt
        if (attemptData && now < attemptData.resetAt) {
          attemptData.count++;
        } else {
          otpVerifyAttempts.set(attemptKey, { count: 1, resetAt: now + OTP_VERIFY_WINDOW });
        }
        return res.status(401).json({ error: "Invalid or expired code" });
      }
      
      // Clear failed attempts on successful login
      otpVerifyAttempts.delete(attemptKey);
      
      // Delete used token
      await storage.deletePasswordResetToken(validToken.token);
      
      // Update last login time
      await storage.updateLastLogin(user.id);
      
      await regenerateSession(req.session);
      req.session.userId = user.id;
      await saveSession(req.session);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          customerId: user.customerId,
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Error verifying OTP");
      res.status(500).json({ error: "Verification failed" });
    }
  });
  
  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      // Mark user as offline before destroying session
      if (req.dbUser) {
        await storage.markUserOffline(req.dbUser.id);
      }
      req.session.destroy((err) => {
        if (err) {
          logger.error({ err: err }, "Error destroying session");
          return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    } catch (error) {
      logger.error({ err: error }, "Error during logout");
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // =====================
  // User Activity Tracking (for alpha testing insights)
  // =====================
  
  // Track page view / activity (called by frontend)
  app.post("/api/activity/track", requireAuth, async (req, res) => {
    try {
      const { page, pageTitle, action, metadata, sessionId } = req.body;
      
      if (!page) {
        return res.status(400).json({ error: "Page is required" });
      }
      
      const userAgent = req.headers['user-agent'] || undefined;
      
      // Record activity
      await storage.recordUserActivity({
        userId: req.dbUser!.id,
        customerId: req.dbUser!.customerId,
        page,
        pageTitle,
        action: action || 'view',
        metadata,
        sessionId,
        userAgent,
      });
      
      // Update user presence
      await storage.updateUserPresence(req.dbUser!.id, {
        customerId: req.dbUser!.customerId,
        currentPage: page,
        currentPageTitle: pageTitle,
        sessionId,
        userAgent,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error tracking activity");
      res.status(500).json({ error: "Failed to track activity" });
    }
  });
  
  // Heartbeat to keep presence alive
  app.post("/api/activity/heartbeat", requireAuth, async (req, res) => {
    try {
      const { page, pageTitle, sessionId } = req.body;
      const userAgent = req.headers['user-agent'] || undefined;
      
      await storage.updateUserPresence(req.dbUser!.id, {
        customerId: req.dbUser!.customerId,
        currentPage: page,
        currentPageTitle: pageTitle,
        sessionId,
        userAgent,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error updating heartbeat");
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });
  
  // Get online users (super_admin only)
  app.get("/api/activity/online-users", requireRole("super_admin"), async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const onlineUsers = await storage.getOnlineUsers({ customerId });
      res.json(onlineUsers);
    } catch (error) {
      logger.error({ err: error }, "Error fetching online users");
      res.status(500).json({ error: "Failed to fetch online users" });
    }
  });
  
  // Get recent activity (super_admin only)
  app.get("/api/activity/recent", requireRole("super_admin"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const customerId = req.query.customerId as string | undefined;
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      
      const activities = await storage.getRecentUserActivity({ limit, customerId, since });
      res.json(activities);
    } catch (error) {
      logger.error({ err: error }, "Error fetching recent activity");
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });
  
  // Get activity stats (super_admin only)
  app.get("/api/activity/stats", requireRole("super_admin"), async (req, res) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const stats = await storage.getActivityStats({ customerId, since });
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching activity stats");
      res.status(500).json({ error: "Failed to fetch activity stats" });
    }
  });

  // ============================================
  // Platform-wide Stats (super admin dashboard)
  // ============================================

  app.get("/api/platform-stats", requireRole("super_admin"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const schema = await import("@shared/schema");
      const { sql: dsql, eq } = await import("drizzle-orm");

      const customers = await db.select().from(schema.customers);

      const eventCounts = await db
        .select({
          customerId: schema.events.customerId,
          staffEnabled: dsql<boolean>`(${schema.events.tempStaffSettings}->>'enabled')::boolean`,
          count: dsql<number>`count(*)::int`,
        })
        .from(schema.events)
        .groupBy(schema.events.customerId, dsql`(${schema.events.tempStaffSettings}->>'enabled')::boolean`);

      const attendeeStats = await db
        .select({
          customerId: schema.events.customerId,
          totalRegistered: dsql<number>`count(${schema.attendees.id})::int`,
          checkedIn: dsql<number>`count(case when ${schema.attendees.checkedIn} = true then 1 end)::int`,
          badgePrinted: dsql<number>`count(case when ${schema.attendees.badgePrinted} = true then 1 end)::int`,
        })
        .from(schema.attendees)
        .innerJoin(schema.events, eq(schema.attendees.eventId, schema.events.id))
        .where(dsql`(${schema.events.tempStaffSettings}->>'enabled')::boolean = true`)
        .groupBy(schema.events.customerId);

      const eventCountMap = new Map<string, { total: number; active: number; upcoming: number }>();
      for (const row of eventCounts) {
        const entry = eventCountMap.get(row.customerId) || { total: 0, active: 0, upcoming: 0 };
        entry.total += row.count;
        if (row.staffEnabled === true) entry.active += row.count;
        else entry.upcoming += row.count;
        eventCountMap.set(row.customerId, entry);
      }

      const attendeeMap = new Map<string, { totalRegistered: number; checkedIn: number; badgePrinted: number }>();
      for (const row of attendeeStats) {
        attendeeMap.set(row.customerId, {
          totalRegistered: row.totalRegistered,
          checkedIn: row.checkedIn,
          badgePrinted: row.badgePrinted,
        });
      }

      const activeCustomers = customers.filter(c => c.status === "active");
      const customerStatsResult = activeCustomers.map((customer) => {
        const ec = eventCountMap.get(customer.id) || { total: 0, active: 0, upcoming: 0 };
        const as_ = attendeeMap.get(customer.id) || { totalRegistered: 0, checkedIn: 0, badgePrinted: 0 };
        return {
          customerId: customer.id,
          customerName: customer.name,
          totalEvents: ec.total,
          activeEvents: ec.active,
          upcomingEvents: ec.upcoming,
          totalRegistered: as_.totalRegistered,
          checkedIn: as_.checkedIn,
          badgePrinted: as_.badgePrinted,
        };
      });

      const totals = {
        totalCustomers: customers.length,
        activeCustomers: activeCustomers.length,
        totalEvents: customerStatsResult.reduce((sum, c) => sum + c.totalEvents, 0),
        activeEvents: customerStatsResult.reduce((sum, c) => sum + c.activeEvents, 0),
        upcomingEvents: customerStatsResult.reduce((sum, c) => sum + c.upcomingEvents, 0),
        totalRegistered: customerStatsResult.reduce((sum, c) => sum + c.totalRegistered, 0),
        checkedIn: customerStatsResult.reduce((sum, c) => sum + c.checkedIn, 0),
        badgePrinted: customerStatsResult.reduce((sum, c) => sum + c.badgePrinted, 0),
      };

      res.json({ totals, customerStats: customerStatsResult });
    } catch (error) {
      logger.error({ err: error }, "Error fetching platform stats");
      res.status(500).json({ error: "Failed to fetch platform stats" });
    }
  });

  // ============================================
  // Error Tracking Endpoints (for alpha testing)
  // ============================================

  // Get error stats (super_admin only)
  app.get("/api/errors/stats", requireRole("super_admin"), async (req, res) => {
    try {
      const stats = await storage.getErrorStats();
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching error stats");
      res.status(500).json({ error: "Failed to fetch error stats" });
    }
  });

  // Get all errors (super_admin only)
  app.get("/api/errors", requireRole("super_admin"), async (req, res) => {
    try {
      const { errorType, isResolved, customerId, limit, offset } = req.query;
      const errors = await storage.getErrors({
        errorType: errorType as string | undefined,
        isResolved: isResolved === 'true' ? true : isResolved === 'false' ? false : undefined,
        customerId: customerId as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(errors);
    } catch (error) {
      logger.error({ err: error }, "Error fetching errors");
      res.status(500).json({ error: "Failed to fetch errors" });
    }
  });

  // Get single error (super_admin only)
  app.get("/api/errors/:id", requireRole("super_admin"), async (req, res) => {
    try {
      const error = await storage.getError(req.params.id);
      if (!error) {
        return res.status(404).json({ error: "Error not found" });
      }
      res.json(error);
    } catch (error) {
      logger.error({ err: error }, "Error fetching error");
      res.status(500).json({ error: "Failed to fetch error" });
    }
  });

  // Resolve an error (super_admin only)
  app.post("/api/errors/:id/resolve", requireRole("super_admin"), async (req, res) => {
    try {
      const user = req.user as User;
      const { notes } = req.body;
      const error = await storage.resolveError(req.params.id, user.id, notes);
      if (!error) {
        return res.status(404).json({ error: "Error not found" });
      }
      res.json(error);
    } catch (error) {
      logger.error({ err: error }, "Error resolving error");
      res.status(500).json({ error: "Failed to resolve error" });
    }
  });

  const errorLogLimits = new Map<string, { count: number; resetAt: number }>();
  const ERROR_LOG_RATE_LIMIT = 30;
  const ERROR_LOG_RATE_WINDOW = 60 * 1000;
  startRateLimiterCleanup(errorLogLimits, (entry, now) => now > entry.resetAt);

  // Log an error (internal use - for client-side error logging)
  app.post("/api/errors/log", async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const now = Date.now();
      const rateData = errorLogLimits.get(ip);
      if (rateData) {
        if (now < rateData.resetAt) {
          if (rateData.count >= ERROR_LOG_RATE_LIMIT) {
            return res.status(429).json({ error: "Too many error reports" });
          }
          rateData.count++;
        } else {
          errorLogLimits.set(ip, { count: 1, resetAt: now + ERROR_LOG_RATE_WINDOW });
        }
      } else {
        errorLogLimits.set(ip, { count: 1, resetAt: now + ERROR_LOG_RATE_WINDOW });
      }

      const { errorType, message, stack, endpoint, method, statusCode, metadata } = req.body;
      const user = req.user as User | undefined;

      const safeMessage = typeof message === 'string' ? message.slice(0, 2000) : 'Unknown error';
      const safeStack = typeof stack === 'string' ? stack.slice(0, 5000) : undefined;
      const safeEndpoint = typeof endpoint === 'string' ? endpoint.slice(0, 500) : undefined;
      let safeMetadata = metadata;
      if (metadata) {
        try {
          const metaStr = JSON.stringify(metadata);
          safeMetadata = metaStr.length > 2000 ? { truncated: true, size: metaStr.length } : metadata;
        } catch {
          safeMetadata = { error: 'unparseable metadata' };
        }
      }
      
      const error = await storage.logError({
        errorType: typeof errorType === 'string' ? errorType.slice(0, 100) : 'CLIENT_ERROR',
        message: safeMessage,
        stack: safeStack,
        endpoint: safeEndpoint,
        method: typeof method === 'string' ? method.slice(0, 10) : undefined,
        statusCode: typeof statusCode === 'number' ? statusCode : undefined,
        userId: user?.id,
        customerId: user?.customerId,
        metadata: safeMetadata,
        userAgent: req.headers['user-agent'],
        ipAddress: ip,
      });
      res.json({ success: true, errorId: error.id });
    } catch (error) {
      logger.error({ err: error }, "Error logging error");
      res.status(500).json({ error: "Failed to log error" });
    }
  });

  app.post("/api/errors/bulk-resolve", requireRole("super_admin"), async (req, res) => {
    try {
      const user = req.user as User;
      const { filter, notes } = req.body;

      if (!filter || typeof filter !== 'object') {
        return res.status(400).json({ error: "filter object is required" });
      }

      const { db } = await import("./db");
      const { sql, and, eq, like } = await import("drizzle-orm");
      const { applicationErrors } = await import("@shared/schema");

      const conditions = [eq(applicationErrors.isResolved, false)];

      if (filter.messagePattern && typeof filter.messagePattern === 'string') {
        conditions.push(like(applicationErrors.message, filter.messagePattern));
      }
      if (filter.errorType && typeof filter.errorType === 'string') {
        conditions.push(eq(applicationErrors.errorType, filter.errorType));
      }
      if (filter.endpoint && typeof filter.endpoint === 'string') {
        conditions.push(eq(applicationErrors.endpoint, filter.endpoint));
      }

      const safeNotes = typeof notes === 'string' ? notes.slice(0, 500) : 'Bulk resolved';

      const result = await db.update(applicationErrors)
        .set({
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: user.id,
          notes: safeNotes,
        })
        .where(and(...conditions));

      const resolvedCount = (result as any).rowCount || 0;
      res.json({ success: true, resolved: resolvedCount });
    } catch (error) {
      logger.error({ err: error }, "Error bulk resolving errors");
      res.status(500).json({ error: "Failed to bulk resolve errors" });
    }
  });

  // Delete old errors (super_admin only)
  app.delete("/api/errors/cleanup", requireRole("super_admin"), async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const olderThan = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const deleted = await storage.deleteOldErrors(olderThan);
      res.json({ success: true, deleted });
    } catch (error) {
      logger.error({ err: error }, "Error cleaning up errors");
      res.status(500).json({ error: "Failed to clean up errors" });
    }
  });

  // Admin Audit Log endpoints (super_admin only)
  app.get("/api/audit-logs", requireRole("super_admin"), async (req, res) => {
    try {
      const { userId, customerId, action, resourceType, limit, offset } = req.query;
      const logs = await storage.getAuditLogs({
        userId: userId as string,
        customerId: customerId as string,
        action: action as string,
        resourceType: resourceType as string,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json(logs);
    } catch (error) {
      logger.error({ err: error }, "Error fetching audit logs");
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/audit-logs/stats", requireRole("super_admin"), async (req, res) => {
    try {
      const stats = await storage.getAuditLogStats();
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching audit log stats");
      res.status(500).json({ error: "Failed to fetch audit log stats" });
    }
  });

  // Set password from token (public - for new users receiving invite email)
  app.post("/api/auth/set-password-token", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      
      const pwError = validatePasswordComplexity(password);
      if (pwError) {
        return res.status(400).json({ error: pwError });
      }
      
      const tokenData = await storage.getPasswordResetToken(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }
      
      if (tokenData.usedAt) {
        return res.status(400).json({ error: "This link has already been used" });
      }
      
      if (new Date() > tokenData.expiresAt) {
        return res.status(400).json({ error: "This link has expired. Please request a new one." });
      }
      
      const user = await storage.getUser(tokenData.userId);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }
      
      if (!user.isActive) {
        return res.status(400).json({ error: "This account is not active" });
      }
      
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(user.id, passwordHash);
      await storage.markPasswordResetTokenUsed(token);
      
      res.json({ success: true, message: "Password set successfully. You can now log in." });
    } catch (error) {
      logger.error({ err: error }, "Error setting password from token");
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  // Standalone HTML page for password setup (under /api to avoid Vite interception)
  app.get("/api/setup-password", async (req, res) => {
    const token = req.query.token as string;
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set Your Password - Greet</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 32px; max-width: 400px; width: 100%; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #1a1a1a; }
    p { color: #666; margin-bottom: 24px; }
    label { display: block; font-weight: 500; margin-bottom: 6px; color: #333; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,0.1); }
    button { width: 100%; padding: 14px; background: #0066ff; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    button:hover { background: #0052cc; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 8px; margin-bottom: 16px; display: none; }
    .success { background: #efe; color: #060; padding: 12px; border-radius: 8px; margin-bottom: 16px; display: none; text-align: center; }
    .loading { display: none; }
    .hint { font-size: 12px; color: #888; margin-top: -12px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Set Your Password</h1>
    <p id="welcome">Create a password for your account</p>
    <div class="error" id="error"></div>
    <div class="success" id="success">Password set successfully! <a href="/login">Click here to log in</a></div>
    <form id="form">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter your password" required>
      <p class="hint">Minimum 8 characters</p>
      <label for="confirm">Confirm Password</label>
      <input type="password" id="confirm" name="confirm" placeholder="Confirm your password" required>
      <button type="submit" id="submit">Set Password</button>
    </form>
  </div>
  <script>
    const token = new URLSearchParams(window.location.search).get('token');
    const form = document.getElementById('form');
    const error = document.getElementById('error');
    const success = document.getElementById('success');
    const welcome = document.getElementById('welcome');
    
    if (!token) {
      error.textContent = 'No token provided. Please use the link from your invitation email.';
      error.style.display = 'block';
      form.style.display = 'none';
    } else {
      fetch('/api/auth/verify-token/' + token)
        .then(r => r.json())
        .then(data => {
          if (!data.valid) {
            error.textContent = data.error || 'Invalid or expired link';
            error.style.display = 'block';
            form.style.display = 'none';
          } else if (data.firstName) {
            welcome.textContent = 'Welcome, ' + data.firstName + '! Create a password for ' + data.email;
          }
        })
        .catch(() => {});
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.style.display = 'none';
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('confirm').value;
      
      if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        error.textContent = 'Password must be at least 10 characters with uppercase, lowercase, and a number';
        error.style.display = 'block';
        return;
      }
      if (password !== confirm) {
        error.textContent = 'Passwords do not match';
        error.style.display = 'block';
        return;
      }
      
      document.getElementById('submit').disabled = true;
      document.getElementById('submit').textContent = 'Setting password...';
      
      try {
        const res = await fetch('/api/auth/set-password-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });
        const data = await res.json();
        if (res.ok) {
          form.style.display = 'none';
          success.style.display = 'block';
        } else {
          error.textContent = data.error || 'Failed to set password';
          error.style.display = 'block';
          document.getElementById('submit').disabled = false;
          document.getElementById('submit').textContent = 'Set Password';
        }
      } catch (err) {
        error.textContent = 'Network error. Please try again.';
        error.style.display = 'block';
        document.getElementById('submit').disabled = false;
        document.getElementById('submit').textContent = 'Set Password';
      }
    });
  </script>
</body>
</html>
    `);
  });

  // Verify token (public - for checking if token is valid before showing form)
  app.get("/api/auth/verify-token/:token", async (req, res) => {
    try {
      const tokenData = await storage.getPasswordResetToken(req.params.token);
      if (!tokenData) {
        return res.status(400).json({ valid: false, error: "Invalid token" });
      }
      
      if (tokenData.usedAt) {
        return res.status(400).json({ valid: false, error: "This link has already been used" });
      }
      
      if (new Date() > tokenData.expiresAt) {
        return res.status(400).json({ valid: false, error: "This link has expired" });
      }
      
      const user = await storage.getUser(tokenData.userId);
      if (!user || !user.isActive) {
        return res.status(400).json({ valid: false, error: "User not found or inactive" });
      }
      
      res.json({ valid: true, email: user.email, firstName: user.firstName });
    } catch (error) {
      logger.error({ err: error }, "Error verifying token");
      res.status(500).json({ valid: false, error: "Failed to verify token" });
    }
  });

  // Forgot password - request reset code via SMS
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      // Always return success to prevent enumeration
      if (!user || !user.isActive) {
        logger.info(`Forgot password request for unknown email: ${email}`);
        return res.json({ success: true, message: "If an account exists, a reset code has been sent via SMS." });
      }
      
      // Check if user has a phone number
      if (!user.phoneNumber) {
        logger.info(`User ${email} has no phone number for SMS reset`);
        return res.json({ success: true, message: "If an account exists, a reset code has been sent via SMS." });
      }
      
      // Generate a cryptographically secure 6-digit code
      const { randomInt } = await import("crypto");
      const code = randomInt(100000, 1000000).toString();
      
      // Hash the code for secure storage
      const bcrypt = await import("bcryptjs");
      const codeHash = await bcrypt.hash(code, 10);
      
      // Store the hashed code with the token in database (15 min expiry)
      await storage.createPasswordResetToken(user.id, 0.25, codeHash); // 15 minutes = 0.25 hours
      
      // Send SMS with the plain code
      const { smsService } = await import("./services/sms-service");
      const smsResult = await smsService.sendPasswordResetCode(user.phoneNumber, user.firstName, code);
      
      if (!smsResult.success) {
        logger.error({ err: smsResult.error }, `Failed to send password reset SMS to ${user.phoneNumber}`);
        // In development, log the code to console for testing when SMS isn't configured
        if (process.env.NODE_ENV === 'development') {
          logger.info(`DEV ONLY - Reset code for ${email}: ${code}`);
        }
      } else {
        logger.info(`Password reset code sent via SMS to ${user.phoneNumber}`);
      }
      
      res.json({ success: true, message: "If an account exists, a reset code has been sent via SMS." });
    } catch (error) {
      logger.error({ err: error }, "Error in forgot password");
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // Verify reset code and reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, code, and new password are required" });
      }
      
      const pwError2 = validatePasswordComplexity(newPassword);
      if (pwError2) {
        return res.status(400).json({ error: pwError2 });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);
      
      if (!user || !user.isActive) {
        return res.status(400).json({ error: "Invalid email or code" });
      }
      
      // Get the most recent valid reset token for this user
      const resetToken = await storage.getPasswordResetTokenByUserId(user.id);
      
      if (!resetToken || !resetToken.resetCodeHash) {
        return res.status(400).json({ error: "No reset request found. Please request a new code." });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "Code has expired. Please request a new one." });
      }
      
      // Rate limit: max 5 attempts
      if (resetToken.attempts >= 5) {
        await storage.markPasswordResetTokenUsed(resetToken.token);
        return res.status(400).json({ error: "Too many attempts. Please request a new code." });
      }
      
      // Increment attempts before checking
      await storage.incrementPasswordResetAttempts(resetToken.token);
      
      // Verify the code using bcrypt comparison
      const bcrypt = await import("bcryptjs");
      const codeValid = await bcrypt.compare(code.trim(), resetToken.resetCodeHash);
      
      if (!codeValid) {
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }
      
      // Code is valid - update password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, passwordHash);
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(resetToken.token);
      
      logger.info(`Password reset successful for ${email}`);
      res.json({ success: true, message: "Password reset successfully. You can now log in." });
    } catch (error) {
      logger.error({ err: error }, "Error in reset password");
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  
  // Set password (requires authentication or special token)
  app.post("/api/auth/set-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      const pwError3 = validatePasswordComplexity(newPassword);
      if (pwError3) {
        return res.status(400).json({ error: pwError3 });
      }
      
      const bcrypt = await import("bcryptjs");
      const user = req.dbUser;
      
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // If user already has a password, require and verify current password
      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Current password is required" });
        }
        const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValidPassword) {
          return res.status(401).json({ error: "Current password is incorrect" });
        }
      }
      
      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, passwordHash);
      
      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      logger.error({ err: error }, "Error setting password");
      res.status(500).json({ error: "Failed to set password" });
    }
  });
  
  // =====================
  // User Management Routes
  // =====================
  
  // Get all users (super_admin) or users in customer (admin)
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can view users" });
      }

      const customerId = req.query.customerId as string;

      if (isSuperAdmin(req.dbUser)) {
        if (customerId) {
          const users = await storage.getUsersByCustomer(customerId);
          res.json(users);
        } else {
          // Root level - show super admin and partner users (no customer assignment)
          const allUsers = await storage.getAllUsers();
          const globalUsers = allUsers.filter(u => u.role === 'super_admin' || u.role === 'partner');
          res.json(globalUsers);
        }
      } else if (isPartner(req.dbUser) && req.dbUser) {
        if (customerId) {
          // Verify partner has access to this customer
          const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
          if (!assignedIds.includes(customerId)) {
            return res.status(403).json({ error: "Not assigned to this customer" });
          }
          const users = await storage.getUsersByCustomer(customerId);
          res.json(users);
        } else {
          return res.json([]);
        }
      } else {
        if (!req.dbUser?.customerId) {
          return res.status(403).json({ error: "User not associated with customer" });
        }
        const users = await storage.getUsersByCustomer(req.dbUser.customerId);
        res.json(users);
      }
    } catch (error) {
      logger.error({ err: error }, "Error fetching users");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  // Get single user
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (isSuperAdmin(req.dbUser)) {
        return res.json(user);
      }

      if (isPartner(req.dbUser) && req.dbUser && user.customerId) {
        const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
        if (assignedIds.includes(user.customerId)) {
          return res.json(user);
        }
      }

      if (user.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(user);
    } catch (error) {
      logger.error({ err: error }, "Error fetching user");
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  
  // Create user
  app.post("/api/users", requireAuth, async (req, res) => {
    try {
      if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can create users" });
      }
      
      const userData = insertUserSchema.parse(req.body);
      
      // Role assignment validation
      if (!canAssignRole(req.dbUser, userData.role || 'staff')) {
        return res.status(403).json({ error: "Cannot assign this role" });
      }
      
      // Customer scoping
      if (!isSuperAdmin(req.dbUser) && !isPartner(req.dbUser)) {
        if (userData.customerId && userData.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Cannot create users in other customers" });
        }
        userData.customerId = req.dbUser?.customerId;
      } else if (isPartner(req.dbUser) && req.dbUser && userData.customerId) {
        // Partners can only create users in their assigned customers
        const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
        if (!assignedIds.includes(userData.customerId)) {
          return res.status(403).json({ error: "Cannot create users in unassigned customers" });
        }
      }
      
      // Super admin and partner validation — these roles span multiple accounts
      if ((userData.role === "super_admin" || userData.role === "partner") && userData.customerId) {
        return res.status(400).json({ error: `${userData.role === "super_admin" ? "Super admins" : "Partners"} cannot be assigned to a single customer` });
      }

      // Non-global roles must have customerId
      if (userData.role !== "super_admin" && userData.role !== "partner" && !userData.customerId) {
        return res.status(400).json({ error: "Non-global users must be assigned to a customer" });
      }
      
      // Check for existing user with same email
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User with this email already exists" });
      }
      
      // Check for existing user with same phone number (must be unique to prevent access conflicts)
      if (userData.phoneNumber) {
        const existingPhoneUser = await storage.getUserByPhoneNumber(userData.phoneNumber);
        if (existingPhoneUser) {
          return res.status(400).json({ error: "User with this phone number already exists. Phone numbers must be unique to prevent access level conflicts." });
        }
      }
      
      const user = await storage.createUser(userData);
      
      // Check if sendInvite is requested (now sends SMS instead of email)
      const sendInvite = req.body.sendInviteEmail === true || req.body.sendInviteSMS === true;
      logger.info(`sendInvite: ${sendInvite}, phoneNumber: ${user.phoneNumber}, sendInviteEmail: ${req.body.sendInviteEmail}, sendInviteSMS: ${req.body.sendInviteSMS}`);
      let smsSent = false;
      let smsError: string | undefined;
      
      if (sendInvite && user.phoneNumber) {
        const { smsService } = await import('./services/sms-service');
        logger.info(`SMS service configured: ${smsService.isConfigured()}`);
        if (smsService.isConfigured()) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const name = user.firstName || 'there';
          const message = `Hi ${name}! Your Greet account is ready. Log in at ${baseUrl}/login using this phone number to receive a one-time code.`;
          
          logger.info(`Sending welcome SMS to ${user.phoneNumber}`);
          const result = await smsService.sendSMS({ to: user.phoneNumber, message });
          smsSent = result.success;
          smsError = result.error;
          logger.info(`SMS result - success: ${smsSent}, error: ${smsError}`);
          
          if (smsSent) {
            logger.info(`Welcome SMS sent to ${user.phoneNumber}`);
          }
        } else {
          smsError = 'SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.';
        }
      } else if (sendInvite && !user.phoneNumber) {
        smsError = 'User has no phone number configured';
      }
      
      res.status(201).json({ ...user, smsSent, smsError, emailSent: smsSent, emailError: smsError });
    } catch (error) {
      logger.error({ err: error }, "Error creating user");
      res.status(400).json({ error: "Failed to create user" });
    }
  });
  
  // Send password setup code via SMS to existing user
  app.post("/api/users/:id/send-invite", requireAuth, async (req, res) => {
    try {
      if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can send invites" });
      }
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Non-super admin can only send invites to users in their customer (or assigned for partners)
      if (!isSuperAdmin(req.dbUser)) {
        if (isPartner(req.dbUser) && req.dbUser && user.customerId) {
          const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
          if (!assignedIds.includes(user.customerId)) {
            return res.status(403).json({ error: "Cannot send invites to users in unassigned customers" });
          }
        } else if (user.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Cannot send invites to users in other customers" });
        }
      }
      
      // Check if user has a phone number
      if (!user.phoneNumber) {
        return res.status(400).json({ error: "User has no phone number. Please add a phone number first." });
      }
      
      const { smsService } = await import('./services/sms-service');
      if (!smsService.isConfigured()) {
        return res.status(503).json({ error: "SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER." });
      }
      
      // Generate a 6-digit access code
      const { randomInt } = await import("crypto");
      const code = randomInt(100000, 1000000).toString();
      
      // Hash and store with 48 hour expiry
      const bcrypt = await import("bcryptjs");
      const codeHash = await bcrypt.hash(code, 10);
      await storage.createPasswordResetToken(user.id, 48, codeHash);
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const result = await smsService.sendPasswordSetupCode(user.phoneNumber, user.firstName, code, baseUrl);
      
      if (result.success) {
        logger.info(`Password setup code sent via SMS to ${user.phoneNumber}`);
        res.json({ success: true, message: "Password setup code sent via SMS" });
      } else {
        res.status(500).json({ error: result.error || "Failed to send SMS" });
      }
    } catch (error) {
      logger.error({ err: error }, "Error sending invite");
      res.status(500).json({ error: "Failed to send invite" });
    }
  });
  
  // Set password for user (admin only - for manual password setup when email is not available)
  app.post("/api/users/:id/set-password", requireAuth, async (req, res) => {
    try {
      if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can set user passwords" });
      }
      
      const { password } = req.body;
      const pwError4 = validatePasswordComplexity(password);
      if (pwError4) {
        return res.status(400).json({ error: pwError4 });
      }
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Non-super admin can only set passwords for users in their customer
      if (!isSuperAdmin(req.dbUser) && user.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot set password for users in other customers" });
      }
      
      // Prevent setting password for super admin users unless you're a super admin
      if (user.role === "super_admin" && !isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Cannot set password for super admin users" });
      }
      
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(user.id, passwordHash);
      
      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      logger.error({ err: error }, "Error setting password");
      res.status(500).json({ error: "Failed to set password" });
    }
  });
  
  // Update user
  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      // Parse and validate request body with strict schema
      const parseResult = updateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body", 
          details: parseResult.error.flatten().fieldErrors 
        });
      }
      // Convert null phoneNumber to undefined to match storage type
      const { phoneNumber, ...rest } = parseResult.data;
      const updates = {
        ...rest,
        ...(phoneNumber !== undefined && { phoneNumber: phoneNumber ?? undefined })
      };
      
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const isSelfUpdate = targetUser.id === req.dbUser?.id;
      
      // SECURITY: Self-updates are allowed for basic profile fields only
      if (isSelfUpdate) {
        if (updates.role !== undefined && updates.role !== targetUser.role) {
          return res.status(403).json({ error: "Cannot modify your own role" });
        }
        if (updates.customerId !== undefined && updates.customerId !== targetUser.customerId) {
          return res.status(403).json({ error: "Cannot modify your own customer assignment" });
        }
        if (updates.isActive !== undefined && updates.isActive !== targetUser.isActive) {
          return res.status(403).json({ error: "Cannot modify your own active status" });
        }
      } else if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can update other users" });
      }
      
      // Non-super admin can only update users in their customer (or assigned customers for partners)
      if (!isSuperAdmin(req.dbUser)) {
        if (isPartner(req.dbUser) && req.dbUser && targetUser.customerId) {
          const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
          if (!assignedIds.includes(targetUser.customerId)) {
            return res.status(403).json({ error: "Cannot update users in unassigned customers" });
          }
        } else if (targetUser.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Cannot update users in other customers" });
        }
      }
      
      // Non-super admin cannot update super admin or partner users
      if (!isSuperAdmin(req.dbUser) && (targetUser.role === "super_admin" || targetUser.role === "partner")) {
        return res.status(403).json({ error: "Cannot update super admin or partner users" });
      }

      // SECURITY: Only super admins can assign super_admin or partner roles
      if (!isSuperAdmin(req.dbUser) && (updates.role === "super_admin" || updates.role === "partner")) {
        return res.status(403).json({ error: "Only super admins can assign super_admin or partner roles" });
      }
      
      // Role validation using canAssignRole
      if (updates.role !== undefined && !canAssignRole(req.dbUser, updates.role)) {
        return res.status(403).json({ error: "Cannot assign this role" });
      }
      
      // Calculate effective new values
      const newRole = updates.role ?? targetUser.role;
      const newCustomerId = updates.customerId !== undefined ? updates.customerId : targetUser.customerId;
      
      // Super admins and partners cannot have a customerId
      if ((newRole === "super_admin" || newRole === "partner") && newCustomerId) {
        return res.status(400).json({ error: `${newRole === "super_admin" ? "Super admins" : "Partners"} cannot be assigned to a single customer` });
      }

      // Non-global roles must have customerId
      if (newRole !== "super_admin" && newRole !== "partner" && !newCustomerId) {
        return res.status(400).json({ error: "Non-global users must be assigned to a customer" });
      }
      
      // SECURITY: Non-super admins cannot remove customerId from users
      if (!isSuperAdmin(req.dbUser) && updates.customerId === null) {
        return res.status(403).json({ error: "Cannot remove customer assignment" });
      }
      
      // SECURITY: Non-super admins cannot change customerId to a different tenant (cross-tenant escalation)
      if (!isSuperAdmin(req.dbUser) && updates.customerId !== undefined && updates.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot assign users to a different customer" });
      }
      
      // Check for existing user with same phone number (must be unique to prevent access conflicts)
      if (updates.phoneNumber && updates.phoneNumber !== targetUser.phoneNumber) {
        const existingPhoneUser = await storage.getUserByPhoneNumber(updates.phoneNumber);
        if (existingPhoneUser && existingPhoneUser.id !== targetUser.id) {
          return res.status(400).json({ error: "User with this phone number already exists. Phone numbers must be unique to prevent access level conflicts." });
        }
      }
      
      const user = await storage.updateUser(req.params.id, updates);
      res.json(user);
    } catch (error) {
      logger.error({ err: error }, "Error updating user");
      res.status(400).json({ error: "Failed to update user" });
    }
  });
  
  // Delete user
  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!canManageUsers(req.dbUser)) {
        return res.status(403).json({ error: "Only admins can delete users" });
      }
      
      // Cannot delete yourself
      if (targetUser.id === req.dbUser?.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Non-super admin can only delete users in their customer
      if (!isSuperAdmin(req.dbUser) && targetUser.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot delete users in other customers" });
      }
      
      // Non-super admin cannot delete super admins
      if (!isSuperAdmin(req.dbUser) && targetUser.role === "super_admin") {
        return res.status(403).json({ error: "Cannot delete super admin" });
      }
      
      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Error deleting user");
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // =====================
  // Customer Routes
  // =====================
  
  // Get all customers
  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      // Super admins can see all customers
      if (isSuperAdmin(req.dbUser)) {
        const customers = await storage.getCustomers();
        return res.json(customers);
      }

      // Partners see only their assigned customers
      if (isPartner(req.dbUser) && req.dbUser) {
        const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
        if (assignedIds.length === 0) return res.json([]);
        const allCustomers = await storage.getCustomers();
        return res.json(allCustomers.filter(c => assignedIds.includes(c.id)));
      }

      // Non-super-admins can only see their own customer
      if (req.dbUser?.customerId) {
        const customer = await storage.getCustomer(req.dbUser.customerId);
        return res.json(customer ? [customer] : []);
      }

      // Users without a customer assignment see nothing
      return res.json([]);
    } catch (error) {
      logger.error({ err: error }, "Error fetching customers");
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get single customer
  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Super admins can access any customer
      if (isSuperAdmin(req.dbUser)) {
        return res.json(customer);
      }

      // Partners can access their assigned customers
      if (isPartner(req.dbUser) && req.dbUser) {
        const assignedIds = await getPartnerAssignedCustomerIds(req.dbUser.id);
        if (assignedIds.includes(customer.id)) {
          return res.json(customer);
        }
        return res.status(403).json({ error: "Access denied" });
      }

      // Other roles can only access their own customer
      if (req.dbUser?.customerId !== customer.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(customer);
    } catch (error) {
      logger.error({ err: error }, "Error fetching customer");
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  // Create customer
  app.post("/api/customers", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Only super admins can create customers" });
      }
      
      const body = { ...req.body };
      if (body.licenseStartDate && typeof body.licenseStartDate === "string") {
        body.licenseStartDate = new Date(body.licenseStartDate);
      }
      if (body.licenseEndDate && typeof body.licenseEndDate === "string") {
        body.licenseEndDate = new Date(body.licenseEndDate);
      }
      const customerData = insertCustomerSchema.parse(body);
      const customer = await storage.createCustomer(customerData);
      
      try {
        const { provisionFeatureFlags } = await import("./services/license-provisioning");
        const licenseType = (customerData.licenseType as "basic" | "premium") || "basic";
        await provisionFeatureFlags(customer.id, licenseType);
      } catch (provisionError) {
        logger.error({ err: provisionError, customerId: customer.id }, "Feature provisioning failed, cleaning up");
        await storage.deleteCustomer(customer.id);
        throw new Error("Failed to provision features for new account");
      }
      
      res.status(201).json(customer);
    } catch (error: any) {
      logger.error({ err: error }, "Error creating customer");
      if (error?.code === '23505' && error?.constraint === 'customers_contact_email_unique') {
        return res.status(400).json({ error: "A customer with this email address already exists" });
      }
      res.status(400).json({ error: "Failed to create customer" });
    }
  });

  // Update customer (rename, change status, etc.)
  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Only super admins can update customers" });
      }
      
      const { id } = req.params;
      const { name, status, contactEmail, apiBaseUrl } = req.body;
      
      const existingCustomer = await storage.getCustomer(id);
      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (status !== undefined) updateData.status = status;
      if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
      if (apiBaseUrl !== undefined) updateData.apiBaseUrl = apiBaseUrl;
      
      const updatedCustomer = await storage.updateCustomer(id, updateData);
      res.json(updatedCustomer);
    } catch (error) {
      logger.error({ err: error }, "Error updating customer");
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  // Update kiosk branding for a customer (admin can update their own account)
  app.patch("/api/customers/:id/branding", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.dbUser;

      // Admins can update their own account, super_admins can update any
      if (!isSuperAdmin(user) && user?.customerId !== id) {
        return res.status(403).json({ error: "You can only update branding for your own account" });
      }
      if (!isSuperAdmin(user) && user?.role !== "admin") {
        return res.status(403).json({ error: "Only admins can update branding" });
      }

      const existingCustomer = await storage.getCustomer(id);
      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const { kioskBranding } = req.body;
      const updatedCustomer = await storage.updateCustomer(id, { kioskBranding });
      res.json(updatedCustomer);
    } catch (error) {
      logger.error({ err: error }, "Error updating customer branding");
      res.status(500).json({ error: "Failed to update branding" });
    }
  });

  // Delete customer (permanently removes customer and all related data)
  app.delete("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Only super admins can delete customers" });
      }
      
      const { id } = req.params;
      
      const existingCustomer = await storage.getCustomer(id);
      if (!existingCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Only allow deletion of inactive customers
      if (existingCustomer.status === "active") {
        return res.status(400).json({ error: "Cannot delete an active customer. Deactivate first." });
      }
      
      await storage.deleteCustomer(id);
      res.json({ success: true, message: "Customer and all related data have been permanently deleted" });
    } catch (error) {
      logger.error({ err: error }, "Error deleting customer");
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // =====================
  // Partner Customer Assignments (super admin only)
  // =====================

  // Get assigned customers for a partner user
  app.get("/api/users/:userId/partner-assignments", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role !== "partner") {
        return res.status(400).json({ error: "User is not a partner" });
      }
      const assignments = await db.select()
        .from(partnerCustomerAssignments)
        .where(eq(partnerCustomerAssignments.userId, req.params.userId));
      res.json(assignments);
    } catch (error) {
      logger.error({ err: error }, "Error fetching partner assignments");
      res.status(500).json({ error: "Failed to fetch partner assignments" });
    }
  });

  // Set partner customer assignments (replaces all existing)
  app.put("/api/users/:userId/partner-assignments", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role !== "partner") {
        return res.status(400).json({ error: "User is not a partner" });
      }

      const { customerIds } = z.object({
        customerIds: z.array(z.string()),
      }).parse(req.body);

      // Validate all customer IDs exist (batch query, not N+1)
      if (customerIds.length > 0) {
        const allCustomers = await storage.getCustomers();
        const existingIds = new Set(allCustomers.map(c => c.id));
        const missing = customerIds.filter(id => !existingIds.has(id));
        if (missing.length > 0) {
          return res.status(400).json({ error: `Customer(s) not found: ${missing.join(", ")}` });
        }
      }

      // Delete existing assignments
      await db.delete(partnerCustomerAssignments)
        .where(eq(partnerCustomerAssignments.userId, req.params.userId));

      // Create new assignments
      if (customerIds.length > 0) {
        await db.insert(partnerCustomerAssignments).values(
          customerIds.map(cid => ({
            userId: req.params.userId,
            customerId: cid,
            assignedBy: req.dbUser!.id,
          }))
        );
      }

      const assignments = await db.select()
        .from(partnerCustomerAssignments)
        .where(eq(partnerCustomerAssignments.userId, req.params.userId));
      res.json(assignments);
    } catch (error) {
      logger.error({ err: error }, "Error updating partner assignments");
      res.status(500).json({ error: "Failed to update partner assignments" });
    }
  });

  // =====================
  // Location Routes (scoped to customer, requires authentication)
  // =====================

  // Get locations for a customer
  app.get("/api/locations", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string || getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      
      // Validate user has access to this customer
      const effectiveCustomerId = getEffectiveCustomerId(req);
      if (!isSuperAdmin(req.dbUser) && effectiveCustomerId !== customerId) {
        return res.status(403).json({ error: "Access denied to this customer's locations" });
      }
      
      const locations = await storage.getLocations(customerId);
      res.json(locations);
    } catch (error) {
      logger.error({ err: error }, "Error fetching locations");
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  // Get single location
  app.get("/api/locations/:id", requireAuth, async (req, res) => {
    try {
      const location = await storage.getLocation(req.params.id);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      
      // Validate user has access to this location's customer
      const effectiveCustomerId = getEffectiveCustomerId(req);
      if (!isSuperAdmin(req.dbUser) && effectiveCustomerId !== location.customerId) {
        return res.status(403).json({ error: "Access denied to this location" });
      }
      
      res.json(location);
    } catch (error) {
      logger.error({ err: error }, "Error fetching location");
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  // Create location
  app.post("/api/locations", requireAuth, async (req, res) => {
    try {
      const customerId = req.body.customerId || getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      
      // Validate user has access to create for this customer
      const effectiveCustomerId = getEffectiveCustomerId(req);
      if (!isSuperAdmin(req.dbUser) && effectiveCustomerId !== customerId) {
        return res.status(403).json({ error: "Access denied to create locations for this customer" });
      }
      
      const location = await storage.createLocation({ ...req.body, customerId });
      res.status(201).json(location);
    } catch (error) {
      logger.error({ err: error }, "Error creating location");
      res.status(400).json({ error: "Failed to create location" });
    }
  });

  // Update location
  app.patch("/api/locations/:id", requireAuth, async (req, res) => {
    try {
      const existingLocation = await storage.getLocation(req.params.id);
      if (!existingLocation) {
        return res.status(404).json({ error: "Location not found" });
      }
      
      // Validate user has access to this location's customer
      const effectiveCustomerId = getEffectiveCustomerId(req);
      if (!isSuperAdmin(req.dbUser) && effectiveCustomerId !== existingLocation.customerId) {
        return res.status(403).json({ error: "Access denied to update this location" });
      }
      
      // Prevent changing customerId
      const { customerId, ...updateData } = req.body;
      
      const location = await storage.updateLocation(req.params.id, updateData);
      res.json(location);
    } catch (error) {
      logger.error({ err: error }, "Error updating location");
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  // Delete location
  app.delete("/api/locations/:id", requireAuth, async (req, res) => {
    try {
      const existingLocation = await storage.getLocation(req.params.id);
      if (!existingLocation) {
        return res.status(404).json({ error: "Location not found" });
      }
      
      // Validate user has access to this location's customer
      const effectiveCustomerId = getEffectiveCustomerId(req);
      if (!isSuperAdmin(req.dbUser) && effectiveCustomerId !== existingLocation.customerId) {
        return res.status(403).json({ error: "Access denied to delete this location" });
      }
      
      const success = await storage.deleteLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Error deleting location");
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // =====================
  // Event Routes (scoped to customer)
  // =====================
  
  // Get events for a customer
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const events = await storage.getEvents(customerId);
      res.json(events);
    } catch (error) {
      logger.error({ err: error }, "Error fetching events");
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Get all events for a customer (for kiosk mode - requires customerId)
  app.get("/api/events/all", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required for kiosk mode" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      const events = await storage.getEvents(customerId);
      res.json(events);
    } catch (error) {
      logger.error({ err: error }, "Error fetching events for kiosk");
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Get single event (scoped - for kiosk/public access with customer verification)
  app.get("/api/events/:id/scoped", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied: Event does not belong to this customer" });
      }
      res.json(event);
    } catch (error) {
      logger.error({ err: error }, "Error fetching scoped event");
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.get("/api/events/:eventId/kiosk-pin", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== event.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json({ hasPin: !!event.kioskPin, pin: event.kioskPin || null });
    } catch (error) {
      logger.error({ err: error }, "Error fetching kiosk pin");
      res.status(500).json({ error: "Failed to fetch kiosk pin" });
    }
  });

  app.put("/api/events/:eventId/kiosk-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be at least 4 digits" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== event.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.updateEvent(req.params.eventId, { kioskPin: pin });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error setting kiosk pin");
      res.status(500).json({ error: "Failed to set kiosk pin" });
    }
  });

  app.delete("/api/events/:eventId/kiosk-pin", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== event.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.updateEvent(req.params.eventId, { kioskPin: null });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error clearing kiosk pin");
      res.status(500).json({ error: "Failed to clear kiosk pin" });
    }
  });


  // Rate limiter for expensive operations (event copy, bulk imports)
  const expensiveOpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: penTestMode ? 100 : 5, // 5 per minute per user
    keyGenerator: (req) => req.dbUser?.id || req.ip || 'unknown',
    message: { error: "Too many requests. Please wait a moment and try again." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Copy/duplicate an event with all its configuration
  app.post("/api/events/:sourceEventId/copy", requireAuth, requireRole(['super_admin', 'partner', 'admin', 'manager']), expensiveOpLimiter, async (req, res) => {
    try {
      const sourceEvent = await storage.getEvent(req.params.sourceEventId);
      if (!sourceEvent) {
        return res.status(404).json({ error: "Source event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && !isPartner(req.dbUser) && req.dbUser?.customerId !== sourceEvent.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const copyInput = z.object({
        name: z.string().min(1).max(500).optional(),
        eventDate: z.string().datetime().optional(),
      }).parse(req.body);

      const newName = copyInput.name || `${sourceEvent.name} (Copy)`;
      const newDate = copyInput.eventDate ? new Date(copyInput.eventDate) : sourceEvent.eventDate;

      // Create the new event with copied settings
      const newEvent = await storage.createEvent({
        customerId: sourceEvent.customerId,
        name: newName,
        eventDate: newDate,
        timezone: sourceEvent.timezone,
        locationId: sourceEvent.locationId,
        defaultBadgeTemplateId: sourceEvent.defaultBadgeTemplateId,
        selectedPrinterId: sourceEvent.selectedPrinterId,
        printerSettings: sourceEvent.printerSettings,
        badgeSettings: sourceEvent.badgeSettings,
        tempStaffSettings: sourceEvent.tempStaffSettings,
        syncSettings: sourceEvent.syncSettings,
        kioskPin: sourceEvent.kioskPin,
        configStatus: 'configured',
        // Reset integration-specific fields
        integrationId: null,
        externalEventId: null,
      });

      // Copy badge template overrides
      const overrides = await storage.getEventBadgeTemplateOverrides(sourceEvent.id);
      for (const override of overrides) {
        await storage.createEventBadgeTemplateOverride({
          eventId: newEvent.id,
          participantType: override.participantType,
          badgeTemplateId: override.badgeTemplateId,
          priority: override.priority,
        });
      }

      // Copy workflow config + steps + questions + disclaimers
      const workflowConfig = await storage.getEventWorkflowConfig(sourceEvent.id);
      if (workflowConfig) {
        const newConfig = await storage.createEventWorkflowConfig({
          eventId: newEvent.id,
          enabled: workflowConfig.enabled,
          enabledForStaff: workflowConfig.enabledForStaff,
          enabledForKiosk: workflowConfig.enabledForKiosk,
        });

        const steps = await storage.getEventWorkflowSteps(sourceEvent.id);
        for (const step of steps) {
          const newStep = await storage.createEventWorkflowStep({
            eventId: newEvent.id,
            stepType: step.stepType,
            position: step.position,
            enabled: step.enabled,
            config: step.config,
          });

          // Copy buyer questions for this step
          const questions = await storage.getEventBuyerQuestions(step.id);
          for (const q of questions) {
            await storage.createEventBuyerQuestion({
              eventId: newEvent.id,
              stepId: newStep.id,
              questionText: q.questionText,
              questionType: q.questionType,
              required: q.required,
              position: q.position,
              options: q.options || [],
              placeholder: q.placeholder,
            });
          }

          // Copy disclaimer for this step
          const disclaimer = await storage.getEventDisclaimer(step.id);
          if (disclaimer) {
            await storage.createEventDisclaimer({
              eventId: newEvent.id,
              stepId: newStep.id,
              title: disclaimer.title,
              disclaimerText: disclaimer.disclaimerText,
              requireSignature: disclaimer.requireSignature,
              confirmationText: disclaimer.confirmationText,
            });
          }
        }
      }

      // Copy notification rules
      const notificationRules = await storage.getEventNotificationRules(sourceEvent.id);
      for (const rule of notificationRules) {
        await storage.createEventNotificationRule({
          customerId: sourceEvent.customerId,
          eventId: newEvent.id,
          triggerEvent: rule.triggerEvent,
          participantTypeFilter: rule.participantTypeFilter,
          nameFilter: rule.nameFilter,
          webhookEnabled: rule.webhookEnabled,
          webhookUrl: rule.webhookUrl,
          webhookMethod: rule.webhookMethod,
          webhookHeaders: rule.webhookHeaders,
          customPayload: rule.customPayload,
          smsEnabled: rule.smsEnabled,
          smsRecipients: rule.smsRecipients,
          emailEnabled: rule.emailEnabled,
          emailRecipients: rule.emailRecipients,
        });
      }

      logger.info({ sourceEventId: sourceEvent.id, newEventId: newEvent.id }, "Event copied successfully");
      res.status(201).json(newEvent);
    } catch (error) {
      logger.error({ err: error }, "Error copying event");
      res.status(500).json({ error: "Failed to copy event" });
    }
  });

  // Kiosk Public Endpoints — extracted to routes/kiosk.ts


  // Get single event (tenant-scoped)
  app.get("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isSuperAdmin(req.dbUser) && req.dbUser!.customerId !== event.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(event);
    } catch (error) {
      logger.error({ err: error }, "Error fetching event");
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  // Create event
  app.post("/api/events", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      if (!req.body.eventDate || req.body.eventDate === "") {
        return res.status(400).json({ error: "Event date is required" });
      }
      
      const parsedDate = new Date(req.body.eventDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid event date format" });
      }
      
      const body = { 
        ...req.body, 
        eventDate: parsedDate
      };
      const eventData = insertEventSchema.parse(body);
      
      if (eventData.integrationId) {
        const integration = await storage.getCustomerIntegration(eventData.integrationId);
        if (!integration || integration.customerId !== eventData.customerId) {
          return res.status(400).json({ error: "Invalid integration for this customer" });
        }
      }
      
      const event = await storage.createEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      logger.error({ err: error }, "Error creating event");
      res.status(400).json({ error: "Failed to create event" });
    }
  });

  // Update event
  app.patch("/api/events/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      let eventDate: Date | undefined = undefined;
      if (req.body.eventDate && req.body.eventDate !== "") {
        eventDate = new Date(req.body.eventDate);
        if (isNaN(eventDate.getTime())) {
          return res.status(400).json({ error: "Invalid event date format" });
        }
      }
      
      const existingEvent = await storage.getEvent(req.params.id);
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Merge badgeSettings while allowing fontOverrides to be fully replaced
      // (client sends complete fontOverrides map with deleted keys removed)
      let mergedBadgeSettings = req.body.badgeSettings;
      if (req.body.badgeSettings) {
        const existingBadgeSettings = existingEvent.badgeSettings || {};
        mergedBadgeSettings = {
          ...existingBadgeSettings,
          ...req.body.badgeSettings,
          // fontOverrides is replaced entirely (not merged) so deletions work
        };
      }
      
      const body = { 
        ...req.body, 
        eventDate,
        ...(mergedBadgeSettings && { badgeSettings: mergedBadgeSettings }),
      };
      const partialSchema = insertEventSchema.partial();
      const validatedUpdates = partialSchema.parse(body);
      
      if (validatedUpdates.integrationId) {
        const integration = await storage.getCustomerIntegration(validatedUpdates.integrationId);
        if (!integration || integration.customerId !== existingEvent.customerId) {
          return res.status(400).json({ error: "Invalid integration for this customer" });
        }
      }
      
      // Validate locationId belongs to the same customer
      if (validatedUpdates.locationId) {
        const location = await storage.getLocation(validatedUpdates.locationId);
        if (!location || location.customerId !== existingEvent.customerId) {
          return res.status(400).json({ error: "Invalid location for this customer" });
        }
      }
      
      const event = await storage.updateEvent(req.params.id, validatedUpdates);
      res.json(event);
    } catch (error) {
      logger.error({ err: error }, "Error updating event");
      res.status(400).json({ error: "Failed to update event" });
    }
  });

  // Delete event
  app.delete("/api/events/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot delete events from other customers" });
      }
      
      const success = await storage.deleteEvent(req.params.id);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete event" });
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, "Error deleting event");
      if (error?.code === '23503') {
        res.status(409).json({ error: "Cannot delete this event because it has associated data. Please remove linked integrations, attendees, and settings first." });
      } else {
        res.status(500).json({ error: "Failed to delete event" });
      }
    }
  });

  // =====================
  // Badge Template Routes (scoped to customer)
  // =====================
  
  // Get badge templates for a customer
  app.get("/api/badge-templates", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      const templates = await storage.getBadgeTemplates(customerId);
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching badge templates");
      res.status(500).json({ error: "Failed to fetch badge templates" });
    }
  });

  // Get single badge template
  app.get("/api/badge-templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getBadgeTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, "Error fetching badge template");
      res.status(500).json({ error: "Failed to fetch badge template" });
    }
  });

  // Create badge template
  app.post("/api/badge-templates", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const templateData = insertBadgeTemplateSchema.parse(req.body);
      if (!templateData.name || !templateData.name.trim()) {
        return res.status(400).json({ error: "Badge template name is required" });
      }
      if (templateData.name.length > 50) {
        return res.status(400).json({ error: "Badge template name must be 50 characters or less" });
      }
      const template = await storage.createBadgeTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      logger.error({ err: error }, "Error creating badge template");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to create badge template" });
    }
  });

  // Update badge template
  app.patch("/api/badge-templates/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const templateData = insertBadgeTemplateSchema.partial().parse(req.body);
      if (templateData.name !== undefined && !templateData.name.trim()) {
        return res.status(400).json({ error: "Badge template name is required" });
      }
      if (templateData.name && templateData.name.length > 50) {
        return res.status(400).json({ error: "Badge template name must be 50 characters or less" });
      }
      const template = await storage.updateBadgeTemplate(req.params.id, templateData);
      if (!template) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, "Error updating badge template");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to update badge template" });
    }
  });

  // Delete badge template
  app.delete("/api/badge-templates/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const deleted = await storage.deleteBadgeTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      logger.error({ err: error }, "Error deleting badge template");
      if (error?.code === '23503') {
        return res.status(409).json({ error: "This template is currently assigned to one or more events. Remove the assignments first, then delete the template." });
      }
      res.status(500).json({ error: "Failed to delete badge template" });
    }
  });

  // Get badge templates available for a specific event (uses template resolver logic)
  app.get("/api/events/:eventId/badge-templates", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user has access to this event
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get customer's badge templates
      const templates = await storage.getBadgeTemplates(event.customerId);
      
      // If event has specific selected templates, filter to those
      if (event.selectedTemplates && event.selectedTemplates.length > 0) {
        const selectedTemplates = templates.filter(t => 
          event.selectedTemplates.includes(t.id) || 
          event.selectedTemplates.includes(t.participantType)
        );
        if (selectedTemplates.length > 0) {
          return res.json(selectedTemplates);
        }
      }
      
      // Return all customer templates as fallback
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching event badge templates");
      res.status(500).json({ error: "Failed to fetch badge templates" });
    }
  });

  // =====================
  // Event Badge Template Override Routes (maps participant types to templates per event)
  // =====================
  
  // Get all template overrides for an event
  app.get("/api/events/:eventId/badge-template-overrides", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const overrides = await storage.getEventBadgeTemplateOverrides(eventId);
      res.json(overrides);
    } catch (error) {
      logger.error({ err: error }, "Error fetching badge template overrides");
      res.status(500).json({ error: "Failed to fetch badge template overrides" });
    }
  });

  // Get template override for specific participant type
  app.get("/api/events/:eventId/badge-template-overrides/by-type/:participantType", requireAuth, async (req, res) => {
    try {
      const { eventId, participantType } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const override = await storage.getEventBadgeTemplateOverrideByType(eventId, participantType);
      if (!override) {
        return res.status(404).json({ error: "No template override found for this attendee type" });
      }
      res.json(override);
    } catch (error) {
      logger.error({ err: error }, "Error fetching badge template override");
      res.status(500).json({ error: "Failed to fetch badge template override" });
    }
  });

  // Create template override
  app.post("/api/events/:eventId/badge-template-overrides", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const overrideData = insertEventBadgeTemplateOverrideSchema.parse({
        ...req.body,
        eventId,
      });
      const override = await storage.createEventBadgeTemplateOverride(overrideData);
      res.status(201).json(override);
    } catch (error) {
      logger.error({ err: error }, "Error creating badge template override");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to create badge template override" });
    }
  });

  // Update template override
  app.patch("/api/events/:eventId/badge-template-overrides/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId, id } = req.params;
      const existing = await storage.getEventBadgeTemplateOverride(id);
      if (!existing || existing.eventId !== eventId) {
        return res.status(404).json({ error: "Badge template override not found" });
      }
      
      const partialSchema = insertEventBadgeTemplateOverrideSchema.partial();
      const updates = partialSchema.parse(req.body);
      const override = await storage.updateEventBadgeTemplateOverride(id, updates);
      res.json(override);
    } catch (error) {
      logger.error({ err: error }, "Error updating badge template override");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to update badge template override" });
    }
  });

  // Delete template override
  app.delete("/api/events/:eventId/badge-template-overrides/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId, id } = req.params;
      const existing = await storage.getEventBadgeTemplateOverride(id);
      if (!existing || existing.eventId !== eventId) {
        return res.status(404).json({ error: "Badge template override not found" });
      }
      
      const deleted = await storage.deleteEventBadgeTemplateOverride(id);
      if (!deleted) {
        return res.status(404).json({ error: "Badge template override not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Error deleting badge template override");
      res.status(500).json({ error: "Failed to delete badge template override" });
    }
  });

  // =====================
  // Event Merge Field Overrides (event-level badge field customization)
  // =====================

  // Get all merge field overrides for an event
  app.get("/api/events/:eventId/merge-field-overrides", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event.badgeSettings?.mergeFieldOverrides || {});
    } catch (error) {
      logger.error({ err: error }, "Error fetching merge field overrides");
      res.status(500).json({ error: "Failed to fetch merge field overrides" });
    }
  });

  // Get merge field overrides for a specific template
  app.get("/api/events/:eventId/merge-field-overrides/:templateId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const overrides = event.badgeSettings?.mergeFieldOverrides?.[req.params.templateId] || null;
      res.json(overrides || { add: [], remove: [], replace: [] });
    } catch (error) {
      logger.error({ err: error }, "Error fetching merge field overrides for template");
      res.status(500).json({ error: "Failed to fetch merge field overrides" });
    }
  });

  // Set merge field overrides for a specific template
  app.put("/api/events/:eventId/merge-field-overrides/:templateId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { add, remove, replace } = req.body;
      const existingSettings = event.badgeSettings || {};
      const existingOverrides = existingSettings.mergeFieldOverrides || {};

      existingOverrides[req.params.templateId] = {
        ...(add?.length > 0 && { add }),
        ...(remove?.length > 0 && { remove }),
        ...(replace?.length > 0 && { replace }),
      };

      await storage.updateEvent(event.id, {
        badgeSettings: {
          ...existingSettings,
          mergeFieldOverrides: existingOverrides,
        },
      } as any);

      res.json({ success: true, overrides: existingOverrides[req.params.templateId] });
    } catch (error) {
      logger.error({ err: error }, "Error saving merge field overrides");
      res.status(500).json({ error: "Failed to save merge field overrides" });
    }
  });

  // Delete merge field overrides for a specific template
  app.delete("/api/events/:eventId/merge-field-overrides/:templateId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const existingSettings = event.badgeSettings || {};
      const existingOverrides = { ...(existingSettings.mergeFieldOverrides || {}) };
      delete existingOverrides[req.params.templateId];

      await storage.updateEvent(event.id, {
        badgeSettings: {
          ...existingSettings,
          mergeFieldOverrides: Object.keys(existingOverrides).length > 0 ? existingOverrides : undefined,
        },
      } as any);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting merge field overrides");
      res.status(500).json({ error: "Failed to delete merge field overrides" });
    }
  });

  // =====================
  // Event Configuration Template Routes (One-Touch Setup)
  // =====================
  
  // Get all configuration templates for a customer
  app.get("/api/configuration-templates", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      
      // Verify user has access to this customer
      if (!isSuperAdmin(req.dbUser) && customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const templates = await storage.getEventConfigurationTemplates(customerId);
      res.json(templates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching configuration templates");
      res.status(500).json({ error: "Failed to fetch configuration templates" });
    }
  });

  // Get single configuration template
  app.get("/api/configuration-templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getEventConfigurationTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Configuration template not found" });
      }
      
      // Verify user has access to this template's customer
      if (!isSuperAdmin(req.dbUser) && template.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, "Error fetching configuration template");
      res.status(500).json({ error: "Failed to fetch configuration template" });
    }
  });

  // Get default configuration template for a customer
  app.get("/api/configuration-templates/default/:customerId", requireAuth, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Verify user has access to this customer
      if (!isSuperAdmin(req.dbUser) && customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const template = await storage.getDefaultEventConfigurationTemplate(customerId);
      if (!template) {
        return res.status(404).json({ error: "No default configuration template found" });
      }
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, "Error fetching default configuration template");
      res.status(500).json({ error: "Failed to fetch default configuration template" });
    }
  });

  // Create configuration template
  app.post("/api/configuration-templates", requireAuth, async (req, res) => {
    try {
      const templateData = insertEventConfigurationTemplateSchema.parse(req.body);
      
      // Verify user has access to the target customer
      if (!isSuperAdmin(req.dbUser) && templateData.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // If this is being set as default, clear other defaults first
      if (templateData.isDefault) {
        const existing = await storage.getDefaultEventConfigurationTemplate(templateData.customerId);
        if (existing) {
          await storage.updateEventConfigurationTemplate(existing.id, { isDefault: false });
        }
      }
      
      const template = await storage.createEventConfigurationTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      logger.error({ err: error }, "Error creating configuration template");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to create configuration template" });
    }
  });

  // Update configuration template
  app.patch("/api/configuration-templates/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getEventConfigurationTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Configuration template not found" });
      }
      
      // Verify user has access to this template's customer
      if (!isSuperAdmin(req.dbUser) && existing.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const partialSchema = insertEventConfigurationTemplateSchema.partial();
      const updates = partialSchema.parse(req.body);
      
      // Prevent changing customerId to a different customer
      if (updates.customerId && updates.customerId !== existing.customerId) {
        return res.status(400).json({ error: "Cannot change template owner" });
      }
      
      // If setting as default, clear other defaults first
      if (updates.isDefault) {
        const currentDefault = await storage.getDefaultEventConfigurationTemplate(existing.customerId);
        if (currentDefault && currentDefault.id !== existing.id) {
          await storage.updateEventConfigurationTemplate(currentDefault.id, { isDefault: false });
        }
      }
      
      const template = await storage.updateEventConfigurationTemplate(req.params.id, updates);
      res.json(template);
    } catch (error) {
      logger.error({ err: error }, "Error updating configuration template");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to update configuration template" });
    }
  });

  // Delete configuration template
  app.delete("/api/configuration-templates/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getEventConfigurationTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Configuration template not found" });
      }
      
      // Verify user has access to this template's customer
      if (!isSuperAdmin(req.dbUser) && existing.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const deleted = await storage.deleteEventConfigurationTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Configuration template not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Error deleting configuration template");
      res.status(500).json({ error: "Failed to delete configuration template" });
    }
  });

  // Create configuration template from an existing event
  app.post("/api/configuration-templates/from-event/:eventId", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Template name is required" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Verify user has access to this event's customer
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get the event's workflow configuration
      const workflowConfig = await storage.getEventWorkflowConfig(eventId);
      const workflowSteps = await storage.getEventWorkflowSteps(eventId);
      const buyerQuestions = await storage.getEventBuyerQuestionsByEvent(eventId);
      const disclaimers = await storage.getEventDisclaimersByEvent(eventId);
      
      // Get badge template overrides for this event
      const overrides = await storage.getEventBadgeTemplateOverrides(eventId);
      const badgeTemplateOverrides: Record<string, string> = {};
      for (const override of overrides) {
        badgeTemplateOverrides[override.participantType] = override.badgeTemplateId;
      }
      
      // Build the workflow snapshot
      const workflowSnapshot = workflowConfig ? {
        enabled: workflowConfig.enabled,
        enabledForStaff: workflowConfig.enabledForStaff,
        enabledForKiosk: workflowConfig.enabledForKiosk,
        steps: workflowSteps.map(s => ({
          stepType: s.stepType,
          position: s.position,
          enabled: s.enabled,
          config: s.config as Record<string, unknown>,
        })),
        buyerQuestions: buyerQuestions.map(q => ({
          questionText: q.questionText,
          questionType: q.questionType,
          required: q.required,
          position: q.position,
          options: q.options || [],
          placeholder: q.placeholder || undefined,
        })),
        disclaimers: disclaimers.map(d => ({
          title: d.title,
          disclaimerText: d.disclaimerText,
          requireSignature: d.requireSignature,
          confirmationText: d.confirmationText || undefined,
        })),
      } : null;
      
      // Build staff settings snapshot - use relative presets for templates
      const staffSettings = event.tempStaffSettings?.enabled ? {
        enabled: true,
        startPreset: '1_week_before' as const,
        endPreset: 'day_after_event' as const,
        printPreviewOnCheckin: event.tempStaffSettings.printPreviewOnCheckin,
        defaultRegistrationStatusFilter: event.tempStaffSettings.defaultRegistrationStatusFilter,
      } : null;
      
      // Capture selected statuses from the source event
      const eventSelectedStatuses = (event.syncSettings)?.selectedStatuses || null;

      const template = await storage.createEventConfigurationTemplate({
        customerId: event.customerId,
        name,
        description: description || `Created from event: ${event.name}`,
        defaultBadgeTemplateId: event.defaultBadgeTemplateId,
        badgeTemplateOverrides: Object.keys(badgeTemplateOverrides).length > 0 ? badgeTemplateOverrides : null,
        defaultPrinterId: event.selectedPrinterId,
        staffSettings,
        workflowSnapshot,
        selectedStatuses: eventSelectedStatuses,
        isDefault: false,
      });
      
      res.status(201).json(template);
    } catch (error) {
      logger.error({ err: error }, "Error creating configuration template from event");
      res.status(500).json({ error: "Failed to create configuration template from event" });
    }
  });

  // Apply configuration to an event (one-touch setup)
  app.post("/api/events/:eventId/apply-configuration", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { templateId, sourceEventId, passcode, manualSetup } = req.body;
      
      if (!templateId && !sourceEventId && !manualSetup) {
        return res.status(400).json({ error: "Either templateId, sourceEventId, or manualSetup is required" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Verify user has access to this event's customer
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      let config: any = null;
      
      if (templateId) {
        // Apply from configuration template
        config = await storage.getEventConfigurationTemplate(templateId);
        if (!config) {
          return res.status(404).json({ error: "Configuration template not found" });
        }
        // Verify template belongs to the same customer
        if (config.customerId !== event.customerId) {
          return res.status(403).json({ error: "Cannot apply template from a different customer" });
        }
      } else if (sourceEventId) {
        // Copy from source event - build config on the fly
        const sourceEvent = await storage.getEvent(sourceEventId);
        if (!sourceEvent) {
          return res.status(404).json({ error: "Source event not found" });
        }
        // Verify source event belongs to the same customer
        if (sourceEvent.customerId !== event.customerId) {
          return res.status(403).json({ error: "Cannot copy configuration from an event belonging to a different customer" });
        }
        
        // Get source event's full configuration
        const workflowConfig = await storage.getEventWorkflowConfig(sourceEventId);
        const workflowSteps = await storage.getEventWorkflowSteps(sourceEventId);
        const buyerQuestions = await storage.getEventBuyerQuestionsByEvent(sourceEventId);
        const disclaimers = await storage.getEventDisclaimersByEvent(sourceEventId);
        const overrides = await storage.getEventBadgeTemplateOverrides(sourceEventId);
        
        const badgeTemplateOverrides: Record<string, string> = {};
        for (const override of overrides) {
          badgeTemplateOverrides[override.participantType] = override.badgeTemplateId;
        }
        
        config = {
          defaultBadgeTemplateId: sourceEvent.defaultBadgeTemplateId,
          badgeTemplateOverrides: Object.keys(badgeTemplateOverrides).length > 0 ? badgeTemplateOverrides : null,
          defaultPrinterId: sourceEvent.selectedPrinterId,
          selectedStatuses: (sourceEvent.syncSettings as any)?.selectedStatuses || null,
          staffSettings: sourceEvent.tempStaffSettings?.enabled ? {
            enabled: true,
            startPreset: '1_week_before',
            endPreset: 'day_after_event',
            printPreviewOnCheckin: sourceEvent.tempStaffSettings.printPreviewOnCheckin,
            defaultRegistrationStatusFilter: sourceEvent.tempStaffSettings.defaultRegistrationStatusFilter,
          } : null,
          workflowSnapshot: workflowConfig ? {
            enabled: workflowConfig.enabled,
            enabledForStaff: workflowConfig.enabledForStaff,
            enabledForKiosk: workflowConfig.enabledForKiosk,
            steps: workflowSteps.map(s => ({
              stepType: s.stepType,
              position: s.position,
              enabled: s.enabled,
              config: s.config,
            })),
            buyerQuestions: buyerQuestions.map(q => ({
              questionText: q.questionText,
              questionType: q.questionType,
              required: q.required,
              position: q.position,
              options: q.options || [],
              placeholder: q.placeholder || undefined,
            })),
            disclaimers: disclaimers.map(d => ({
              title: d.title,
              disclaimerText: d.disclaimerText,
              requireSignature: d.requireSignature,
              confirmationText: d.confirmationText || undefined,
            })),
          } : null,
        };
      } else if (manualSetup) {
        // Manual setup - just mark as configured with minimal defaults
        // User will configure everything manually in event settings
        const bcryptLib = await import("bcryptjs");
        const generatedPasscode = passcode || Math.random().toString(36).substring(2, 8).toUpperCase();
        const hashedPasscode = await bcryptLib.hash(generatedPasscode, 10);
        
        // Set default dates based on event date
        const eventDate = event.eventDate || new Date();
        const defaultStartTime = new Date(eventDate);
        defaultStartTime.setDate(defaultStartTime.getDate() - 7);
        defaultStartTime.setHours(0, 0, 0, 0);
        const defaultEndTime = new Date(eventDate);
        defaultEndTime.setDate(defaultEndTime.getDate() + 1);
        defaultEndTime.setHours(23, 59, 59, 999);
        
        const manualStatusesOk = !!(event.syncSettings)?.statusesConfigured;
        await storage.updateEvent(eventId, {
          configStatus: manualStatusesOk ? 'configured' : 'unconfigured',
          tempStaffSettings: {
            enabled: true,
            passcodeHash: hashedPasscode,
            startTime: defaultStartTime.toISOString(),
            endTime: defaultEndTime.toISOString(),
          },
        });
        
        return res.json({ 
          success: true, 
          message: "Event marked for manual configuration",
          passcode: generatedPasscode,
        });
      }
      
      // Helper function to calculate dates based on presets
      const calculateDate = (eventDate: Date, preset: string, isStart: boolean): Date => {
        const date = new Date(eventDate);
        switch (preset) {
          case 'day_of_event':
            date.setHours(0, 0, 0, 0);
            return date;
          case '1_week_before':
            date.setDate(date.getDate() - 7);
            date.setHours(0, 0, 0, 0);
            return date;
          case '2_weeks_before':
            date.setDate(date.getDate() - 14);
            date.setHours(0, 0, 0, 0);
            return date;
          case '1_month_before':
            date.setMonth(date.getMonth() - 1);
            date.setHours(0, 0, 0, 0);
            return date;
          case '3_months_before':
            date.setMonth(date.getMonth() - 3);
            date.setHours(0, 0, 0, 0);
            return date;
          case 'day_after_event':
            date.setDate(date.getDate() + 1);
            date.setHours(23, 59, 59, 999);
            return date;
          case '1_week_after':
            date.setDate(date.getDate() + 7);
            date.setHours(23, 59, 59, 999);
            return date;
          case 'never':
            // Set to year 2099 as "never"
            return new Date('2099-12-31T23:59:59.999Z');
          default:
            return date;
        }
      };
      
      // Apply badge template
      if (config.defaultBadgeTemplateId) {
        await storage.updateEvent(eventId, { defaultBadgeTemplateId: config.defaultBadgeTemplateId });
      }
      
      // Apply badge template overrides
      if (config.badgeTemplateOverrides) {
        // First, delete existing overrides
        const existingOverrides = await storage.getEventBadgeTemplateOverrides(eventId);
        for (const override of existingOverrides) {
          await storage.deleteEventBadgeTemplateOverride(override.id);
        }
        
        // Create new overrides
        let position = 0;
        for (const [participantType, badgeTemplateId] of Object.entries(config.badgeTemplateOverrides)) {
          await storage.createEventBadgeTemplateOverride({
            eventId,
            participantType,
            badgeTemplateId: badgeTemplateId as string,
            priority: position++,
          });
        }
      }
      
      // Apply default printer
      if (config.defaultPrinterId) {
        await storage.updateEvent(eventId, { selectedPrinterId: config.defaultPrinterId });
      }
      
      // Apply staff settings with calculated dates
      if (config.staffSettings?.enabled) {
        const eventDate = event.startDate || event.eventDate;
        const endDate = event.endDate || event.eventDate;
        
        const startTime = calculateDate(eventDate, config.staffSettings.startPreset, true);
        const endTime = calculateDate(endDate, config.staffSettings.endPreset, false);
        
        // Use provided passcode or generate a default
        const staffPasscode = passcode || Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await storage.updateEvent(eventId, {
          tempStaffSettings: {
            enabled: true,
            passcodeHash: hashPasscode(staffPasscode),
            passcode: staffPasscode,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            printPreviewOnCheckin: config.staffSettings.printPreviewOnCheckin ?? false,
            defaultRegistrationStatusFilter: config.staffSettings.defaultRegistrationStatusFilter,
          },
        });
      }
      
      // Apply workflow configuration
      if (config.workflowSnapshot) {
        // Delete existing workflow config and steps
        const existingConfig = await storage.getEventWorkflowConfig(eventId);
        if (existingConfig) {
          // Delete associated data first
          const existingSteps = await storage.getEventWorkflowSteps(eventId);
          for (const step of existingSteps) {
            // Delete questions and disclaimers associated with this step
            const questions = await storage.getEventBuyerQuestions(step.id);
            for (const q of questions) {
              await storage.deleteEventBuyerQuestion(q.id);
            }
            const stepDisclaimer = await storage.getEventDisclaimer(step.id);
            if (stepDisclaimer) {
              await storage.deleteEventDisclaimer(stepDisclaimer.id);
            }
            await storage.deleteEventWorkflowStep(step.id);
          }
          await storage.deleteEventWorkflowConfig(existingConfig.id);
        }
        
        // Create new workflow config
        const newConfig = await storage.createEventWorkflowConfig({
          eventId,
          enabled: config.workflowSnapshot.enabled,
          enabledForStaff: config.workflowSnapshot.enabledForStaff,
          enabledForKiosk: config.workflowSnapshot.enabledForKiosk,
        });
        
        // Create steps with their associated data
        const stepIdMap = new Map<number, string>(); // position -> stepId mapping
        const buyerQuestionsStepIds: string[] = []; // stepIds for buyer_questions steps in order
        const disclaimerStepIds: string[] = []; // stepIds for disclaimer steps in order
        
        for (const stepSnapshot of config.workflowSnapshot.steps) {
          const step = await storage.createEventWorkflowStep({
            eventId,
            stepType: stepSnapshot.stepType,
            position: stepSnapshot.position,
            enabled: stepSnapshot.enabled,
            config: stepSnapshot.config,
          });
          stepIdMap.set(stepSnapshot.position, step.id);
          
          if (stepSnapshot.stepType === 'buyer_questions') {
            buyerQuestionsStepIds.push(step.id);
          } else if (stepSnapshot.stepType === 'disclaimer') {
            disclaimerStepIds.push(step.id);
          }
        }
        
        // Create buyer questions (use stepIndex to assign to correct step)
        if (config.workflowSnapshot.buyerQuestions && config.workflowSnapshot.buyerQuestions.length > 0) {
          for (const q of config.workflowSnapshot.buyerQuestions) {
            const stepIndex = q.stepIndex ?? 0;
            const stepId = buyerQuestionsStepIds[stepIndex] || buyerQuestionsStepIds[0];
            if (stepId) {
              await storage.createEventBuyerQuestion({
                eventId,
                stepId,
                questionText: q.questionText,
                questionType: q.questionType,
                required: q.required,
                position: q.position,
                options: q.options || [],
                placeholder: q.placeholder,
              });
            }
          }
        }
        
        // Create disclaimers (use stepIndex to assign to correct step)
        if (config.workflowSnapshot.disclaimers && config.workflowSnapshot.disclaimers.length > 0) {
          for (const d of config.workflowSnapshot.disclaimers) {
            const stepIndex = d.stepIndex ?? 0;
            const stepId = disclaimerStepIds[stepIndex] || disclaimerStepIds[0];
            if (stepId) {
              await storage.createEventDisclaimer({
                eventId,
                stepId,
                title: d.title,
                disclaimerText: d.disclaimerText,
                requireSignature: d.requireSignature,
                confirmationText: d.confirmationText,
              });
            }
          }
        }
      }
      
      // Apply selected statuses from template/source if available
      if (config.selectedStatuses && config.selectedStatuses.length > 0) {
        const currentSyncSettings = (event.syncSettings) || {};
        await storage.updateEvent(eventId, {
          syncSettings: {
            ...currentSyncSettings,
            selectedStatuses: config.selectedStatuses,
            statusesConfigured: true,
          },
        });
      }

      // Update event config status — only mark configured if statuses are set
      const refreshedEvent = await storage.getEvent(eventId);
      const statusesOk = !!(refreshedEvent?.syncSettings as any)?.statusesConfigured;
      await storage.updateEvent(eventId, {
        configStatus: statusesOk ? 'configured' : 'unconfigured',
        configuredAt: statusesOk ? new Date() : null,
        configTemplateId: templateId || null,
      });
      
      // Fetch updated event
      const updatedEvent = await storage.getEvent(eventId);
      
      res.json({
        success: true,
        event: updatedEvent,
        message: "Configuration applied successfully",
      });
    } catch (error) {
      logger.error({ err: error }, "Error applying configuration");
      res.status(500).json({ error: "Failed to apply configuration" });
    }
  });

  // =====================
  // Badge Template Resolution Routes
  // =====================
  
  // Resolve template for a specific attendee
  app.get("/api/events/:eventId/attendees/:attendeeId/resolve-template", requireAuth, async (req, res) => {
    try {
      const { eventId, attendeeId } = req.params;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee || attendee.eventId !== eventId) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      const result = await badgeTemplateResolver.resolveTemplateForAttendee(attendee, eventId);

      // Apply event-level merge field overrides
      if (result.template && event.badgeSettings) {
        result.template = badgeTemplateResolver.applyMergeFieldOverrides(result.template, event.badgeSettings);
      }

      res.json({
        template: result.template,
        resolutionPath: result.resolutionPath,
        participantType: result.participantType,
      });
    } catch (error) {
      logger.error({ err: error }, "Error resolving template");
      res.status(500).json({ error: "Failed to resolve template" });
    }
  });

  // Resolve template for a specific participant type (preview/testing)
  app.get("/api/events/:eventId/resolve-template/:participantType", requireAuth, async (req, res) => {
    try {
      const { eventId, participantType } = req.params;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const result = await badgeTemplateResolver.resolveTemplateForParticipantType(eventId, participantType);

      // Apply event-level merge field overrides
      if (result.template && event.badgeSettings) {
        result.template = badgeTemplateResolver.applyMergeFieldOverrides(result.template, event.badgeSettings);
      }

      res.json({
        template: result.template,
        resolutionPath: result.resolutionPath,
        participantType: result.participantType,
      });
    } catch (error) {
      logger.error({ err: error }, "Error resolving template");
      res.status(500).json({ error: "Failed to resolve template" });
    }
  });

  // Get all template mappings for an event (shows which template each participant type would use)
  app.get("/api/events/:eventId/template-mappings", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Get overrides for this event
      const overrides = await storage.getEventBadgeTemplateOverrides(eventId);
      const overrideMap = new Map(overrides.map(o => [o.participantType, o]));
      
      // Get all customer templates  
      const templates = await storage.getBadgeTemplates(event.customerId);
      const templateMap = new Map(templates.map(t => [t.id, t]));
      
      const actualTypes = await storage.getDistinctParticipantTypes(eventId);
      const standardTypes = ['General', 'VIP', 'Speaker', 'Sponsor', 'Staff', 'Press', 'Media', 'Exhibitor'];
      const participantTypes = [...new Set([...actualTypes, ...standardTypes])];
      
      // Build mappings with resolution path
      const mappingsObject: Record<string, { 
        templateId: string | null; 
        templateName: string | null;
        resolutionPath: 'event_override' | 'customer_default' | 'any_template' | 'none';
      }> = {};
      
      for (const type of participantTypes) {
        const result = await badgeTemplateResolver.resolveTemplateForParticipantType(eventId, type);
        mappingsObject[type] = {
          templateId: result.template?.id || null,
          templateName: result.template?.name || null,
          resolutionPath: result.resolutionPath,
        };
      }
      
      res.json(mappingsObject);
    } catch (error) {
      logger.error({ err: error }, "Error fetching template mappings");
      res.status(500).json({ error: "Failed to fetch template mappings" });
    }
  });

  // Get distinct participant types for an event (from synced attendees)
  app.get("/api/events/:eventId/participant-types", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const types = await storage.getDistinctParticipantTypes(eventId);
      res.json(types);
    } catch (error) {
      logger.error({ err: error }, "Error fetching participant types");
      res.status(500).json({ error: "Failed to fetch participant types" });
    }
  });

  // =====================
  // Sync Schedule Configuration Routes
  // =====================
  
  // Get sync schedule for an endpoint config
  app.get("/api/integrations/:integrationId/endpoint-configs/:dataType/sync-schedule", requireAuth, async (req, res) => {
    try {
      const { integrationId, dataType } = req.params;
      const config = await storage.getIntegrationEndpointConfig(integrationId, dataType);
      if (!config) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      res.json({
        syncEnabled: config.syncEnabled,
        syncIntervalSeconds: config.syncIntervalSeconds,
        syncMinIntervalSeconds: config.syncMinIntervalSeconds,
        syncMaxIntervalSeconds: config.syncMaxIntervalSeconds,
        syncWindowStart: config.syncWindowStart,
        syncWindowEnd: config.syncWindowEnd,
        lastSyncAt: config.lastSyncAt,
        nextSyncAt: config.nextSyncAt,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncError: config.lastSyncError,
        lastSyncCount: config.lastSyncCount,
        runOnCheckInRequest: config.runOnCheckInRequest,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching sync schedule");
      res.status(500).json({ error: "Failed to fetch sync schedule" });
    }
  });

  // Update sync schedule for an endpoint config
  app.patch("/api/integrations/:integrationId/endpoint-configs/:dataType/sync-schedule", requireAuth, async (req, res) => {
    try {
      const { integrationId, dataType } = req.params;
      const config = await storage.getIntegrationEndpointConfig(integrationId, dataType);
      if (!config) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      
      const scheduleSchema = z.object({
        syncEnabled: z.boolean().optional(),
        syncIntervalSeconds: z.number().min(60).max(86400).optional(),
        syncMinIntervalSeconds: z.number().min(60).optional(),
        syncMaxIntervalSeconds: z.number().max(86400).optional(),
        syncWindowStart: z.string().nullable().optional(),
        syncWindowEnd: z.string().nullable().optional(),
        runOnCheckInRequest: z.boolean().optional(),
      });
      
      const updates = scheduleSchema.parse(req.body);
      
      // Validate interval constraints
      const minInterval = updates.syncMinIntervalSeconds ?? config.syncMinIntervalSeconds ?? 60;
      const maxInterval = updates.syncMaxIntervalSeconds ?? config.syncMaxIntervalSeconds ?? 86400;
      const interval = updates.syncIntervalSeconds ?? config.syncIntervalSeconds ?? 3600;
      
      if (interval < minInterval || interval > maxInterval) {
        return res.status(400).json({ 
          error: `Sync interval must be between ${minInterval} and ${maxInterval} seconds` 
        });
      }
      
      const updated = await storage.updateIntegrationEndpointConfig(config.id, updates);
      res.json({
        syncEnabled: updated?.syncEnabled,
        syncIntervalSeconds: updated?.syncIntervalSeconds,
        syncMinIntervalSeconds: updated?.syncMinIntervalSeconds,
        syncMaxIntervalSeconds: updated?.syncMaxIntervalSeconds,
        syncWindowStart: updated?.syncWindowStart,
        syncWindowEnd: updated?.syncWindowEnd,
        lastSyncAt: updated?.lastSyncAt,
        nextSyncAt: updated?.nextSyncAt,
        lastSyncStatus: updated?.lastSyncStatus,
        runOnCheckInRequest: updated?.runOnCheckInRequest,
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating sync schedule");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to update sync schedule" });
    }
  });

  // Trigger immediate sync for an endpoint config
  app.post("/api/integrations/:integrationId/endpoint-configs/:dataType/sync-now", requireAuth, async (req, res) => {
    try {
      const { integrationId, dataType } = req.params;
      const config = await storage.getIntegrationEndpointConfig(integrationId, dataType);
      if (!config) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Determine job type based on dataType
      const jobType = dataType === 'events' ? 'event_sync' : 'attendee_sync';
      
      // Create a sync job
      const job = await storage.createSyncJob({
        integrationId,
        endpointConfigId: config.id,
        jobType,
        triggerType: 'manual',
        priority: 1, // High priority for manual triggers
        status: 'pending',
      });
      
      res.status(202).json({ 
        message: "Sync job created",
        jobId: job.id,
        jobType: job.jobType,
        status: job.status,
      });
    } catch (error) {
      logger.error({ err: error }, "Error triggering sync");
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  app.post("/api/integrations/:integrationId/sync/attendees/outbound", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { integrationId } = req.params;
      const { eventId, attendeeIds } = req.body;

      if (!eventId || typeof eventId !== 'string') {
        return res.status(400).json({ error: "eventId is required and must be a string" });
      }

      if (attendeeIds !== undefined && (!Array.isArray(attendeeIds) || !attendeeIds.every((id: unknown) => typeof id === 'string'))) {
        return res.status(400).json({ error: "attendeeIds must be an array of strings" });
      }

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      if (!isSuperAdmin(req.dbUser) && integration.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied to this event" });
      }

      const eventCodeMappings = await storage.getEventCodeMappings(integrationId);
      const mapping = eventCodeMappings.find(m => m.eventId === eventId);
      if (!mapping) {
        return res.status(400).json({ error: "No event code mapping found for this event and integration. Please link the event to the external platform first." });
      }

      let attendees = await storage.getAttendees(eventId);

      if (attendeeIds && Array.isArray(attendeeIds) && attendeeIds.length > 0) {
        attendees = attendees.filter(a => attendeeIds.includes(a.id));
      } else {
        attendees = attendees.filter(a => !a.externalId);
      }

      if (attendees.length === 0) {
        return res.json({ pushed: 0, failed: 0, errors: [], message: "No attendees to push" });
      }

      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      const result = await syncOrchestrator.pushAttendeesToExternal({
        integration,
        eventId,
        externalEventId: mapping.externalEventId,
        attendees: attendees.map(a => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          company: a.company,
          title: a.title,
          participantType: a.participantType,
          registrationStatus: a.registrationStatus,
          customFields: a.customFields,
        })),
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error pushing attendees to external platform");
      res.status(500).json({ error: (error as Error).message || "Failed to push attendees" });
    }
  });

  // Get sync job history
  app.get("/api/integrations/:integrationId/sync-jobs", requireAuth, async (req, res) => {
    try {
      const { integrationId } = req.params;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const jobs = await storage.getSyncJobs(integrationId);
      res.json(jobs);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sync jobs");
      res.status(500).json({ error: "Failed to fetch sync jobs" });
    }
  });

  // =====================
  // Customer Integration Routes (scoped to customer)
  // =====================
  
  // Get integrations for a customer
  app.get("/api/integrations", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      const integrations = await storage.getCustomerIntegrations(customerId);
      res.json(integrations);
    } catch (error) {
      logger.error({ err: error }, "Error fetching integrations");
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  // Get single integration
  app.get("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      const integration = await storage.getCustomerIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error) {
      logger.error({ err: error }, "Error fetching integration");
      res.status(500).json({ error: "Failed to fetch integration" });
    }
  });

  // Create integration (with optional credentials)
  app.post("/api/integrations", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    let createdIntegration: any = null;
    let createdConnection: any = null;
    let credentialsStored = false;
    let credentialError: string | null = null;
    
    try {
      // Extract credentials from request body if provided
      const { credentials, ...integrationBody } = req.body;
      
      // Validate credentials match auth type before creating anything
      if (credentials) {
        const authType = integrationBody.authType;
        if (authType === "basic" && (!credentials.username || !credentials.password)) {
          return res.status(400).json({ 
            error: "Basic authentication requires both username and password" 
          });
        }
        if ((authType === "apikey" || authType === "bearer") && !credentials.apiKey) {
          return res.status(400).json({ 
            error: "API key or bearer token authentication requires an apiKey value" 
          });
        }
      }
      
      const integrationData = insertCustomerIntegrationSchema.parse(integrationBody);
      
      // Apply Certain-specific defaults for sync and realtime settings
      const isCertainIntegration = integrationBody.providerId?.startsWith('certain') ||
        integrationBody.baseUrl?.toLowerCase().includes('certain') ||
        integrationBody.name?.toLowerCase().includes('certain');
      
      if (isCertainIntegration) {
        if (!integrationData.syncTemplates) {
          integrationData.syncTemplates = {
            attendees: { endpointPath: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}?max_results=5000" },
            sessions: { endpointPath: "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/sessions?dateModified_after={{lastSyncTimestamp}}" },
            sessionRegistrations: { endpointPath: "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/registrations" },
          };
        }
        
        if (!integrationData.defaultSyncSettings) {
          integrationData.defaultSyncSettings = {
            preEventIntervalMinutes: 1440,
            duringEventIntervalMinutes: 1,
          };
        }
        
        if (!integrationData.realtimeSyncConfig) {
          integrationData.realtimeSyncConfig = {
            enabled: true,
            endpointUrl: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}/{{externalId}}",
            walkinEndpointUrl: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}",
            walkinStatus: "Attended",
            walkinSource: "Greet",
            checkinStatus: "Attended",
            revertStatus: "Registered",
            maxRetries: 3,
            retryDelayMs: 1000,
            timeoutMs: 30000,
          };
        }
      }
      
      createdIntegration = await storage.createCustomerIntegration(integrationData);
      
      // If credentials were provided, store them immediately
      if (credentials) {
        try {
          let authMethod: "api_key" | "bearer_token" | "basic" | "oauth2" = "bearer_token";
          if (createdIntegration.authType === "basic") authMethod = "basic";
          else if (createdIntegration.authType === "apikey") authMethod = "api_key";
          else if (createdIntegration.authType === "oauth2") authMethod = "oauth2";
          else if (createdIntegration.authType === "bearer") authMethod = "bearer_token";
          
          // Create the connection record
          createdConnection = await storage.createIntegrationConnection({
            integrationId: createdIntegration.id,
            authMethod,
            connectionStatus: "pending_validation",
          });
          
          // Store credentials based on auth type
          if (credentials.username && credentials.password) {
            // Basic auth - store both username and password
            const encryptedUsername = encryptCredential(credentials.username);
            await storage.createStoredCredential({
              connectionId: createdConnection.id,
              credentialType: "basic_username",
              encryptedValue: encryptedUsername.encryptedValue,
              encryptionKeyId: encryptedUsername.encryptionKeyId,
              iv: encryptedUsername.iv,
              authTag: encryptedUsername.authTag,
              maskedValue: maskCredential(credentials.username),
            });
            
            const encryptedPassword = encryptCredential(credentials.password);
            await storage.createStoredCredential({
              connectionId: createdConnection.id,
              credentialType: "basic_password",
              encryptedValue: encryptedPassword.encryptedValue,
              encryptionKeyId: encryptedPassword.encryptionKeyId,
              iv: encryptedPassword.iv,
              authTag: encryptedPassword.authTag,
              maskedValue: maskCredential(credentials.password),
            });
            credentialsStored = true;
          } else if (credentials.apiKey) {
            // API key or bearer token
            const credentialType = createdIntegration.authType === "apikey" ? "api_key" : "bearer_token";
            const encrypted = encryptCredential(credentials.apiKey);
            await storage.createStoredCredential({
              connectionId: createdConnection.id,
              credentialType,
              encryptedValue: encrypted.encryptedValue,
              encryptionKeyId: encrypted.encryptionKeyId,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              maskedValue: maskCredential(credentials.apiKey),
            });
            credentialsStored = true;
          }
        } catch (err) {
          // Log credential storage failure - don't fail the request but report it
          logger.warn({ err: err }, "Failed to store credentials during integration creation");
          credentialError = "Credentials could not be saved. Please add them from the integration settings.";
        }
      }
      
      // Return integration with credential storage status
      res.status(201).json({
        ...createdIntegration,
        _credentialsStored: credentialsStored,
        _credentialError: credentialError,
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating integration");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to create integration" });
    }
  });

  // Update a customer integration
  app.patch("/api/integrations/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await storage.getCustomerIntegration(id);
      if (!existing) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const updateSchema = z.object({
        name: z.string().optional(),
        baseUrl: z.string().optional(),
        accountCode: z.string().nullable().optional(),
        rateLimitPolicy: z.any().optional(),
        endpoints: z.any().optional(),
        testEndpointPath: z.string().nullable().optional(),
        eventListEndpointPath: z.string().nullable().optional(),
        syncTemplates: z.object({
          attendees: z.object({ endpointPath: z.string() }).optional(),
          sessions: z.object({ endpointPath: z.string() }).optional(),
          sessionRegistrations: z.object({ endpointPath: z.string() }).optional(),
        }).nullable().optional(),
        defaultSyncSettings: z.object({
          preEventIntervalMinutes: z.number(),
          duringEventIntervalMinutes: z.number(),
          syncWindowStartOffset: z.any().optional(),
          syncWindowEndOffset: z.any().optional(),
        }).nullable().optional(),
        realtimeSyncConfig: z.object({
          enabled: z.boolean(),
          endpointUrl: z.string(),
          checkinStatus: z.string().optional(),
          revertStatus: z.string().optional(),
          maxRetries: z.number().optional(),
          retryDelayMs: z.number().optional(),
          timeoutMs: z.number().optional(),
        }).nullable().optional(),
      });
      
      const updates = updateSchema.parse(req.body);
      
      const auditableFields: Record<string, any> = {};
      const oldAuditableValues: Record<string, any> = {};
      const sensitiveKeys = ['syncTemplates', 'defaultSyncSettings', 'realtimeSyncConfig', 'baseUrl', 'eventListEndpointPath', 'testEndpointPath', 'endpoints', 'rateLimitPolicy'];
      for (const key of sensitiveKeys) {
        if (key in updates) {
          auditableFields[key] = (updates as any)[key];
          oldAuditableValues[key] = (existing as any)[key];
        }
      }
      
      const integration = await storage.updateCustomerIntegration(id, updates);
      
      if (Object.keys(auditableFields).length > 0) {
        let action = 'integration_update';
        if ('realtimeSyncConfig' in auditableFields) action = 'realtime_sync_update';
        else if ('syncTemplates' in auditableFields) action = 'sync_templates_update';
        else if ('defaultSyncSettings' in auditableFields) action = 'sync_settings_update';
        
        const customer = await storage.getCustomer(existing.customerId);
        logSettingsAudit(req, {
          action,
          resourceType: 'customer_integration',
          resourceId: id,
          resourceName: existing.name,
          customerId: existing.customerId,
          customerName: customer?.name,
          oldValues: oldAuditableValues,
          newValues: auditableFields,
        });
      }
      
      res.json(integration);
    } catch (error) {
      logger.error({ err: error }, "Error updating integration");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: "Failed to update integration" });
    }
  });

  // Delete integration (only allowed before initial sync is completed)
  app.delete("/api/integrations/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await storage.getCustomerIntegration(id);
      if (!existing) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Block deletion if initial sync has been completed
      if (existing.initialSyncCompletedAt) {
        return res.status(403).json({ 
          error: "Cannot delete integration after initial sync has been completed. Contact support for assistance." 
        });
      }
      
      // Delete associated connections and credentials first
      const connection = await storage.getIntegrationConnectionByIntegration(id);
      if (connection) {
        // Delete stored credentials
        await storage.deleteStoredCredentialsByConnection(connection.id);
        // Delete connection
        await storage.deleteIntegrationConnection(connection.id);
      }
      
      // Delete the integration
      await storage.deleteCustomerIntegration(id);
      res.json({ success: true, message: "Integration deleted successfully" });
    } catch (error) {
      logger.error({ err: error }, "Error deleting integration");
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // Duplicate integration (creates a copy without credentials)
  // Note: Duplicated integrations always start as "active" since they need fresh credentials
  app.post("/api/integrations/:id/duplicate", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const id = req.params.id;
      const existing = await storage.getCustomerIntegration(id);
      if (!existing) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Create a copy with a new name
      const newName = req.body.name || `${existing.name} (Copy)`;
      const newAccountCode = req.body.accountCode || null; // Allow specifying new account code
      const copyCredentials = req.body.copyCredentials === true;
      
      const duplicated = await storage.createCustomerIntegration({
        customerId: existing.customerId,
        providerId: existing.providerId,
        name: newName,
        baseUrl: existing.baseUrl,
        accountCode: newAccountCode, // Use provided account code or null
        testEndpointPath: existing.testEndpointPath,
        eventListEndpointPath: existing.eventListEndpointPath,
        authType: existing.authType,
        rateLimitPolicy: existing.rateLimitPolicy,
        endpoints: existing.endpoints,
        syncTemplates: existing.syncTemplates,
        defaultSyncSettings: existing.defaultSyncSettings,
        status: "active",
      });
      
      // Optionally copy credentials from the source integration
      let credentialsCopied = 0;
      if (copyCredentials) {
        const sourceConnection = await storage.getIntegrationConnectionByIntegration(id);
        if (sourceConnection) {
          const sourceCredentials = await storage.getStoredCredentials(sourceConnection.id);
          if (sourceCredentials && sourceCredentials.length > 0) {
            // Create connection for the new integration
            const targetConnection = await storage.createIntegrationConnection({
              integrationId: duplicated.id,
              authMethod: sourceConnection.authMethod,
              connectionStatus: "pending_validation",
            });
            
            // Copy each valid credential
            for (const credential of sourceCredentials) {
              if (!credential.isValid) continue;
              await storage.createStoredCredential({
                connectionId: targetConnection.id,
                credentialType: credential.credentialType,
                encryptedValue: credential.encryptedValue,
                encryptionKeyId: credential.encryptionKeyId,
                iv: credential.iv,
                authTag: credential.authTag,
                maskedValue: credential.maskedValue,
              });
              credentialsCopied++;
            }
          }
        }
      }
      
      res.status(201).json({ 
        ...duplicated, 
        credentialsCopied,
        _credentialsCopied: credentialsCopied > 0
      });
    } catch (error) {
      logger.error({ err: error }, "Error duplicating integration");
      res.status(500).json({ error: "Failed to duplicate integration" });
    }
  });

  // Get sync logs for an integration
  app.get("/api/integrations/:id/sync-logs", requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const existing = await storage.getCustomerIntegration(id);
      if (!existing) {
        return res.status(404).json({ error: "Integration not found" });
      }
      const logs = await storage.getSyncLogs(id, limit);
      res.json(logs);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sync logs");
      res.status(500).json({ error: "Failed to fetch sync logs" });
    }
  });

  // =====================
  // Event Integration Routes (links events to account integrations)
  // =====================
  
  // Get integrations for an event
  app.get("/api/events/:eventId/integrations", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const eventIntegrations = await storage.getEventIntegrations(eventId);
      res.json(eventIntegrations);
    } catch (error) {
      logger.error({ err: error }, "Error fetching event integrations");
      res.status(500).json({ error: "Failed to fetch event integrations" });
    }
  });

  // Create event integration (link event to account integration)
  app.post("/api/events/:eventId/integrations", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Validate that the integration belongs to the same customer
      const integration = await storage.getCustomerIntegration(req.body.integrationId);
      if (!integration) {
        return res.status(400).json({ error: "Integration not found" });
      }
      if (integration.customerId !== event.customerId) {
        return res.status(403).json({ error: "Integration does not belong to this customer" });
      }
      
      const eventIntegrationData = insertEventIntegrationSchema.parse({
        ...req.body,
        eventId,
      });
      const eventIntegration = await storage.createEventIntegration(eventIntegrationData);
      res.status(201).json(eventIntegration);
    } catch (error) {
      logger.error({ err: error }, "Error creating event integration");
      res.status(400).json({ error: "Failed to create event integration" });
    }
  });

  // Update event integration (update variables, status, etc.)
  app.patch("/api/events/:eventId/integrations/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const eventIntegrationId = req.params.id;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const existing = await storage.getEventIntegration(eventIntegrationId);
      if (!existing) {
        return res.status(404).json({ error: "Event integration not found" });
      }
      if (existing.eventId !== eventId) {
        return res.status(403).json({ error: "Event integration does not belong to this event" });
      }
      
      // Validate cross-tenant: ensure the linked integration belongs to the same customer
      const integration = await storage.getCustomerIntegration(existing.integrationId);
      if (!integration || integration.customerId !== event.customerId) {
        return res.status(403).json({ error: "Cross-tenant access denied" });
      }
      
      const partialSchema = insertEventIntegrationSchema.partial();
      const validatedUpdates = partialSchema.parse(req.body);
      const eventIntegration = await storage.updateEventIntegration(eventIntegrationId, validatedUpdates);
      res.json(eventIntegration);
    } catch (error) {
      logger.error({ err: error }, "Error updating event integration");
      res.status(400).json({ error: "Failed to update event integration" });
    }
  });

  // Delete event integration
  app.delete("/api/events/:eventId/integrations/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const eventIntegrationId = req.params.id;
      
      // Validate event exists
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const existing = await storage.getEventIntegration(eventIntegrationId);
      if (!existing) {
        return res.status(404).json({ error: "Event integration not found" });
      }
      if (existing.eventId !== eventId) {
        return res.status(403).json({ error: "Event integration does not belong to this event" });
      }
      
      // Validate cross-tenant: ensure the linked integration belongs to the same customer
      const integration = await storage.getCustomerIntegration(existing.integrationId);
      if (!integration || integration.customerId !== event.customerId) {
        return res.status(403).json({ error: "Cross-tenant access denied" });
      }
      
      const success = await storage.deleteEventIntegration(eventIntegrationId);
      if (!success) {
        return res.status(404).json({ error: "Event integration not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting event integration");
      res.status(500).json({ error: "Failed to delete event integration" });
    }
  });

  // =====================
  // Integration Providers Catalog
  // =====================

  // Get all available integration providers
  app.get("/api/integration-providers", requireAuth, async (req, res) => {
    try {
      const providers = await storage.getIntegrationProviders();
      res.json(providers);
    } catch (error) {
      logger.error({ err: error }, "Error fetching integration providers");
      res.status(500).json({ error: "Failed to fetch integration providers" });
    }
  });

  // Get single integration provider
  app.get("/api/integration-providers/:id", requireAuth, async (req, res) => {
    try {
      const provider = await storage.getIntegrationProvider(req.params.id);
      if (!provider) {
        return res.status(404).json({ error: "Integration provider not found" });
      }
      res.json(provider);
    } catch (error) {
      logger.error({ err: error }, "Error fetching integration provider");
      res.status(500).json({ error: "Failed to fetch integration provider" });
    }
  });

  // Get provider specs from catalog (for UI configuration)
  app.get("/api/provider-catalog", requireAuth, async (req, res) => {
    try {
      const { INTEGRATION_PROVIDERS } = await import("../shared/integration-providers");
      res.json(INTEGRATION_PROVIDERS);
    } catch (error) {
      logger.error({ err: error }, "Error fetching provider catalog");
      res.status(500).json({ error: "Failed to fetch provider catalog" });
    }
  });

  // Get single provider spec
  app.get("/api/provider-catalog/:providerId", requireAuth, async (req, res) => {
    try {
      const { getProviderSpec } = await import("../shared/integration-providers");
      const spec = getProviderSpec(req.params.providerId);
      if (!spec) {
        return res.status(404).json({ error: "Provider not found in catalog" });
      }
      res.json(spec);
    } catch (error) {
      logger.error({ err: error }, "Error fetching provider spec");
      res.status(500).json({ error: "Failed to fetch provider spec" });
    }
  });

  // =====================
  // Integration Endpoint Configurations
  // =====================

  // Get endpoint configs for an integration
  app.get("/api/integrations/:integrationId/endpoints", requireAuth, async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      const configs = await storage.getIntegrationEndpointConfigs(integrationId);
      res.json(configs);
    } catch (error) {
      logger.error({ err: error }, "Error fetching endpoint configs");
      res.status(500).json({ error: "Failed to fetch endpoint configs" });
    }
  });

  // Get or create endpoint config for a data type
  app.get("/api/integrations/:integrationId/endpoints/:dataType", requireAuth, async (req, res) => {
    try {
      const { integrationId, dataType } = req.params;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      const config = await storage.getIntegrationEndpointConfig(integrationId, dataType);
      if (!config) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      res.json(config);
    } catch (error) {
      logger.error({ err: error }, "Error fetching endpoint config");
      res.status(500).json({ error: "Failed to fetch endpoint config" });
    }
  });

  // Create endpoint config
  app.post("/api/integrations/:integrationId/endpoints", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const configData = insertIntegrationEndpointConfigSchema.parse({
        ...req.body,
        integrationId,
      });
      const config = await storage.createIntegrationEndpointConfig(configData);
      res.status(201).json(config);
    } catch (error) {
      logger.error({ err: error }, "Error creating endpoint config");
      res.status(400).json({ error: "Failed to create endpoint config" });
    }
  });

  // Update endpoint config
  app.patch("/api/integrations/:integrationId/endpoints/:configId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { integrationId, configId } = req.params;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const partialSchema = insertIntegrationEndpointConfigSchema.partial();
      const updates = partialSchema.parse(req.body);
      const config = await storage.updateIntegrationEndpointConfig(configId, updates);
      if (!config) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      res.json(config);
    } catch (error) {
      logger.error({ err: error }, "Error updating endpoint config");
      res.status(400).json({ error: "Failed to update endpoint config" });
    }
  });

  // Delete endpoint config
  app.delete("/api/integrations/:integrationId/endpoints/:configId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const success = await storage.deleteIntegrationEndpointConfig(req.params.configId);
      if (!success) {
        return res.status(404).json({ error: "Endpoint config not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting endpoint config");
      res.status(500).json({ error: "Failed to delete endpoint config" });
    }
  });

  // =====================
  // Event Code Mappings (links external events to internal events)
  // =====================

  // Get event code mappings for an integration
  app.get("/api/integrations/:integrationId/event-mappings", requireAuth, async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      const mappings = await storage.getEventCodeMappings(integrationId);
      res.json(mappings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching event code mappings");
      res.status(500).json({ error: "Failed to fetch event code mappings" });
    }
  });

  // Create event code mapping
  app.post("/api/integrations/:integrationId/event-mappings", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      const mappingData = insertEventCodeMappingSchema.parse({
        ...req.body,
        integrationId,
      });
      const mapping = await storage.createEventCodeMapping(mappingData);
      res.status(201).json(mapping);
    } catch (error) {
      logger.error({ err: error }, "Error creating event code mapping");
      res.status(400).json({ error: "Failed to create event code mapping" });
    }
  });

  // Update event code mapping
  app.patch("/api/integrations/:integrationId/event-mappings/:mappingId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const partialSchema = insertEventCodeMappingSchema.partial();
      const updates = partialSchema.parse(req.body);
      const mapping = await storage.updateEventCodeMapping(req.params.mappingId, updates);
      if (!mapping) {
        return res.status(404).json({ error: "Event code mapping not found" });
      }
      res.json(mapping);
    } catch (error) {
      logger.error({ err: error }, "Error updating event code mapping");
      res.status(400).json({ error: "Failed to update event code mapping" });
    }
  });

  // Delete event code mapping
  app.delete("/api/integrations/:integrationId/event-mappings/:mappingId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const success = await storage.deleteEventCodeMapping(req.params.mappingId);
      if (!success) {
        return res.status(404).json({ error: "Event code mapping not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting event code mapping");
      res.status(500).json({ error: "Failed to delete event code mapping" });
    }
  });

  // =====================
  // Session Code Mappings (links external sessions to internal sessions)
  // =====================

  // Get session code mappings for an event code mapping
  app.get("/api/event-mappings/:eventMappingId/session-mappings", requireAuth, async (req, res) => {
    try {
      const mappings = await storage.getSessionCodeMappings(req.params.eventMappingId);
      res.json(mappings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching session code mappings");
      res.status(500).json({ error: "Failed to fetch session code mappings" });
    }
  });

  // Create session code mapping
  app.post("/api/event-mappings/:eventMappingId/session-mappings", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventMappingId = req.params.eventMappingId;
      const eventMapping = await storage.getEventCodeMapping(eventMappingId);
      if (!eventMapping) {
        return res.status(404).json({ error: "Event code mapping not found" });
      }
      
      const mappingData = insertSessionCodeMappingSchema.parse({
        ...req.body,
        eventCodeMappingId: eventMappingId,
        integrationId: eventMapping.integrationId,
      });
      const mapping = await storage.createSessionCodeMapping(mappingData);
      res.status(201).json(mapping);
    } catch (error) {
      logger.error({ err: error }, "Error creating session code mapping");
      res.status(400).json({ error: "Failed to create session code mapping" });
    }
  });

  // Update session code mapping
  app.patch("/api/session-mappings/:mappingId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const partialSchema = insertSessionCodeMappingSchema.partial();
      const updates = partialSchema.parse(req.body);
      const mapping = await storage.updateSessionCodeMapping(req.params.mappingId, updates);
      if (!mapping) {
        return res.status(404).json({ error: "Session code mapping not found" });
      }
      res.json(mapping);
    } catch (error) {
      logger.error({ err: error }, "Error updating session code mapping");
      res.status(400).json({ error: "Failed to update session code mapping" });
    }
  });

  // Delete session code mapping
  app.delete("/api/session-mappings/:mappingId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const success = await storage.deleteSessionCodeMapping(req.params.mappingId);
      if (!success) {
        return res.status(404).json({ error: "Session code mapping not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting session code mapping");
      res.status(500).json({ error: "Failed to delete session code mapping" });
    }
  });

  // =====================

  // Integration Connection + Event Sync Routes — extracted to routes/integration-connections.ts


  // =====================
  // Attendee Routes (scoped to event or customer)
  // =====================
  
  // Get attendees (by event or by customer)
  app.get("/api/attendees", requireAuth, async (req, res) => {
    try {
      const eventId = req.query.eventId as string;
      const customerId = req.query.customerId as string;
      
      if (eventId) {
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }
        if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
        const attendees = await storage.getAttendees(eventId);
        res.json(attendees);
      } else if (customerId) {
        if (!isSuperAdmin(req.dbUser) && customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
        const attendees = await storage.getAttendeesByCustomer(customerId);
        res.json(attendees);
      } else {
        return res.status(400).json({ error: "eventId or customerId is required" });
      }
    } catch (error) {
      logger.error({ err: error }, "Error fetching attendees");
      res.status(500).json({ error: "Failed to fetch attendees" });
    }
  });

  // Get single attendee
  app.get("/api/attendees/:id", requireAuth, async (req, res) => {
    try {
      const attendee = await storage.getAttendee(req.params.id);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      if (!isSuperAdmin(req.dbUser)) {
        const event = await storage.getEvent(attendee.eventId);
        if (!event || event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      res.json(attendee);
    } catch (error) {
      logger.error({ err: error }, "Error fetching attendee");
      res.status(500).json({ error: "Failed to fetch attendee" });
    }
  });

  // Create attendee
  app.post("/api/attendees", requireAuth, async (req, res) => {
    try {
      if (!req.body.participantType || req.body.participantType.trim() === '') {
        return res.status(400).json({ error: "Attendee type is required. Please select an attendee type." });
      }
      const attendeeData = sanitizeAttendeeData(insertAttendeeSchema.parse(req.body));
      const attendee = await storage.createAttendee(attendeeData);
      res.status(201).json(attendee);
    } catch (error) {
      logger.error({ err: error }, "Error creating attendee");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to create attendee" });
    }
  });

  // Update attendee (for check-in, badge printing, etc.)
  app.patch("/api/attendees/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getAttendee(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      if (!isSuperAdmin(req.dbUser)) {
        const event = await storage.getEvent(existing.eventId);
        if (!event || event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const validatedUpdates = sanitizeAttendeeData(updateAttendeeSchema.parse(req.body));
      const attendee = await storage.updateAttendee(req.params.id, validatedUpdates);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      res.json(attendee);
    } catch (error) {
      logger.error({ err: error }, "Error updating attendee");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to update attendee" });
    }
  });

  // Delete attendee
  app.delete("/api/attendees/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const existing = await storage.getAttendee(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      if (!isSuperAdmin(req.dbUser)) {
        const event = await storage.getEvent(existing.eventId);
        if (!event || event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const success = await storage.deleteAttendee(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting attendee");
      res.status(500).json({ error: "Failed to delete attendee" });
    }
  });

  // Check-in attendee
  app.post("/api/attendees/:id/checkin", requireAuth, async (req, res) => {
    try {
      const attendee = await storage.getAttendee(req.params.id);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      if (!isSuperAdmin(req.dbUser)) {
        const event = await storage.getEvent(attendee.eventId);
        if (!event || event.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Cast to any to include check-in fields that aren't in InsertAttendee schema
      const checkInUpdates = {
        checkedIn: true,
        checkedInAt: new Date(),
        registrationStatus: "Attended",
      };
      
      const updated = await storage.updateAttendee(req.params.id, checkInUpdates as any);
      
      // Send real-time sync to external system (async, non-blocking)
      // Use void to explicitly indicate fire-and-forget pattern
      const event = await storage.getEvent(attendee.eventId);
      if (event && updated) {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
        if (integration) {
          void checkinSyncService.sendCheckinSync(updated, event, integration, req.body.checkedInBy)
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Check-in sync failed');
              }
            })
            .catch(err => logger.error({ err: err }, 'Check-in sync error'));
        }
        
        // Send SMS notifications based on notification rules (async, non-blocking)
        void (async () => {
          try {
            const { smsService } = await import('./services/sms-service');
            if (!smsService.isConfigured()) {
              return;
            }
            
            const rules = await storage.getActiveNotificationRulesForAttendee(
              attendee.eventId,
              {
                participantType: attendee.participantType,
                company: attendee.company,
                firstName: attendee.firstName,
                lastName: attendee.lastName,
              }
            );
            
            if (rules.length === 0) return;
            
            for (const rule of rules) {
              const recipients = (rule.smsRecipients as Array<{ phoneNumber: string; name?: string }>) || [];
              if (recipients.length === 0) continue;
              
              // Build notification message
              let message = rule.customMessage || 'Check-in alert:';
              if (rule.includeAttendeeName) {
                message += ` ${attendee.firstName} ${attendee.lastName}`;
              }
              if (rule.includeCompany && attendee.company) {
                message += ` (${attendee.company})`;
              }
              message += ` has checked in`;
              if (rule.includeCheckinTime) {
                const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                message += ` at ${time}`;
              }
              message += ` - ${event.name}`;
              
              // Send to all recipients
              for (const recipient of recipients) {
                void smsService.sendSMS({ to: recipient.phoneNumber, message })
                  .then(result => {
                    if (result.success) {
                      logger.info(`SMS sent to ${recipient.phoneNumber} for check-in: ${attendee.firstName} ${attendee.lastName}`);
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
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error checking in attendee");
      res.status(500).json({ error: "Failed to check in attendee" });
    }
  });

  // Revert attendee check-in
  app.delete("/api/attendees/:id/checkin", requireAuth, async (req, res) => {
    try {
      const attendee = await storage.getAttendee(req.params.id);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }

      const event = await storage.getEvent(attendee.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Resolve revert status: event override → integration config → default
      const eventSyncSettings = event.syncSettings;
      let revertStatus = 'Registered';
      let integration: any = null;
      if (event.integrationId) {
        integration = await storage.getCustomerIntegration(event.integrationId);
        const rtConfig = integration?.realtimeSyncConfig as any;
        if (rtConfig?.revertStatus) revertStatus = rtConfig.revertStatus;
      }
      if (eventSyncSettings?.revertStatus) revertStatus = eventSyncSettings.revertStatus;

      const revertUpdates = {
        checkedIn: false,
        checkedInAt: null,
        registrationStatus: revertStatus,
        badgePrinted: false,
        badgePrintedAt: null,
      };

      const updated = await storage.updateAttendee(req.params.id, revertUpdates as any);

      await storage.deleteAttendeeWorkflowResponses(req.params.id, attendee.eventId);
      await storage.deleteAttendeeSignaturesByAttendee(req.params.id, attendee.eventId);

      // Send real-time sync revert to external system (async, non-blocking)
      if (event && updated) {
        if (!integration && event.integrationId) {
          integration = await checkinSyncService.getIntegrationForEvent(event);
        } else if (!integration) {
          integration = await checkinSyncService.getIntegrationForEvent(event);
        }
        if (integration) {
          void checkinSyncService.sendCheckinRevertSync(updated, event, integration, req.body.revertedBy)
            .then(result => {
              if (!result.success) {
                logger.warn({ err: result.error }, 'Check-in revert sync failed');
              }
            })
            .catch(err => logger.error({ err: err }, 'Check-in revert sync error'));
        }
      }
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error reverting check-in");
      res.status(500).json({ error: "Failed to revert check-in" });
    }
  });

  // =====================
  // Event Notification Rules Routes
  // =====================

  // Helper to verify event belongs to user's customer
  const verifyEventAccess = async (eventId: string, req: any): Promise<{ event: any; error?: string }> => {
    const event = await storage.getEvent(eventId);
    if (!event) {
      return { event: null, error: "Event not found" };
    }
    const effectiveCustomerId = getEffectiveCustomerId(req);
    if (event.customerId !== effectiveCustomerId && !isSuperAdmin(req.dbUser)) {
      return { event: null, error: "Access denied" };
    }
    return { event };
  };

  // E.164 phone number validation
  const isValidE164 = (phone: string): boolean => /^\+[1-9]\d{1,14}$/.test(phone);

  // Get notification rules for an event
  app.get("/api/events/:eventId/notification-rules", requireAuth, async (req, res) => {
    try {
      const { event, error } = await verifyEventAccess(req.params.eventId, req);
      if (error) {
        return res.status(error === "Event not found" ? 404 : 403).json({ error });
      }
      const rules = await storage.getEventNotificationRules(req.params.eventId);
      res.json(rules);
    } catch (error) {
      logger.error({ err: error }, "Error fetching notification rules");
      res.status(500).json({ error: "Failed to fetch notification rules" });
    }
  });

  // Create notification rule
  app.post("/api/events/:eventId/notification-rules", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { event, error } = await verifyEventAccess(req.params.eventId, req);
      if (error) {
        return res.status(error === "Event not found" ? 404 : 403).json({ error });
      }

      const { name, participantTypes, companyNames, attendeeNames, smsRecipients, includeAttendeeName, includeCompany, includeCheckinTime, customMessage, isActive } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Name is required" });
      }

      if (!Array.isArray(smsRecipients) || smsRecipients.length === 0) {
        return res.status(400).json({ error: "At least one SMS recipient is required" });
      }

      for (const recipient of smsRecipients) {
        if (!recipient.phoneNumber || !isValidE164(recipient.phoneNumber)) {
          return res.status(400).json({ error: `Invalid phone number format: ${recipient.phoneNumber}. Use E.164 format (e.g., +15551234567)` });
        }
      }

      const rule = await storage.createEventNotificationRule({
        eventId: req.params.eventId,
        name: name.trim(),
        participantTypes: Array.isArray(participantTypes) ? participantTypes : [],
        companyNames: Array.isArray(companyNames) ? companyNames : [],
        attendeeNames: Array.isArray(attendeeNames) ? attendeeNames : [],
        smsRecipients,
        includeAttendeeName: includeAttendeeName !== false,
        includeCompany: includeCompany !== false,
        includeCheckinTime: includeCheckinTime !== false,
        customMessage: customMessage || null,
        isActive: isActive !== false,
      });
      res.status(201).json(rule);
    } catch (error) {
      logger.error({ err: error }, "Error creating notification rule");
      res.status(500).json({ error: "Failed to create notification rule" });
    }
  });

  // Update notification rule
  app.patch("/api/notification-rules/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const existingRule = await storage.getEventNotificationRule(req.params.id);
      if (!existingRule) {
        return res.status(404).json({ error: "Notification rule not found" });
      }

      const { event, error } = await verifyEventAccess(existingRule.eventId, req);
      if (error) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { name, smsRecipients } = req.body;
      
      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        return res.status(400).json({ error: "Name cannot be empty" });
      }

      if (smsRecipients !== undefined) {
        if (!Array.isArray(smsRecipients)) {
          return res.status(400).json({ error: "smsRecipients must be an array" });
        }
        for (const recipient of smsRecipients) {
          if (!recipient.phoneNumber || !isValidE164(recipient.phoneNumber)) {
            return res.status(400).json({ error: `Invalid phone number format: ${recipient.phoneNumber}` });
          }
        }
      }

      const rule = await storage.updateEventNotificationRule(req.params.id, req.body);
      res.json(rule);
    } catch (error) {
      logger.error({ err: error }, "Error updating notification rule");
      res.status(500).json({ error: "Failed to update notification rule" });
    }
  });

  // Delete notification rule
  app.delete("/api/notification-rules/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const existingRule = await storage.getEventNotificationRule(req.params.id);
      if (!existingRule) {
        return res.status(404).json({ error: "Notification rule not found" });
      }

      const { event, error } = await verifyEventAccess(existingRule.eventId, req);
      if (error) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteEventNotificationRule(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting notification rule");
      res.status(500).json({ error: "Failed to delete notification rule" });
    }
  });

  // Get unique participant types for an event (for filter dropdown)
  app.get("/api/events/:eventId/participant-types", requireAuth, async (req, res) => {
    try {
      const attendees = await storage.getAttendees(req.params.eventId);
      const types = [...new Set(attendees.map(a => a.participantType).filter(Boolean))];
      res.json(types);
    } catch (error) {
      logger.error({ err: error }, "Error fetching participant types");
      res.status(500).json({ error: "Failed to fetch participant types" });
    }
  });

  // Get unique companies for an event (for filter dropdown)
  app.get("/api/events/:eventId/companies", requireAuth, async (req, res) => {
    try {
      const attendees = await storage.getAttendees(req.params.eventId);
      const companies = [...new Set(attendees.map(a => a.company).filter(Boolean) as string[])];
      res.json(companies.sort());
    } catch (error) {
      logger.error({ err: error }, "Error fetching companies");
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  // =====================
  // Printer Routes
  // =====================
  
  // Get all printers for a customer
  app.get("/api/printers", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string || getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID required" });
      }
      const printers = await storage.getPrinters(customerId);
      res.json(printers);
    } catch (error) {
      logger.error({ err: error }, "Error fetching printers");
      res.status(500).json({ error: "Failed to fetch printers" });
    }
  });

  // Get a single printer
  app.get("/api/printers/:id", requireAuth, async (req, res) => {
    try {
      const printer = await storage.getPrinter(req.params.id);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.json(printer);
    } catch (error) {
      logger.error({ err: error }, "Error fetching printer");
      res.status(500).json({ error: "Failed to fetch printer" });
    }
  });

  // Create a new printer
  app.post("/api/printers", requireAuth, async (req, res) => {
    try {
      // Accept customerId from request body or from authenticated user's session
      const customerId = req.body.customerId || getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID required" });
      }
      
      // For super_admins, allow any customerId; for regular users, verify they can only create for their own customer
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customerId) {
        return res.status(403).json({ error: "Cannot create printer for another customer" });
      }
      
      // Validate locationId belongs to the same customer if provided
      if (req.body.locationId) {
        const location = await storage.getLocation(req.body.locationId);
        if (!location || location.customerId !== customerId) {
          return res.status(400).json({ error: "Invalid location for this customer" });
        }
      }
      
      const printerData = insertPrinterSchema.parse({
        ...req.body,
        customerId,
      });

      const printer = await storage.createPrinter(printerData);
      res.status(201).json(printer);
    } catch (error) {
      logger.error({ err: error }, "Error creating printer");
      res.status(400).json({ error: "Failed to create printer" });
    }
  });

  // Update a printer
  app.patch("/api/printers/:id", requireAuth, async (req, res) => {
    try {
      const customerId = getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID required" });
      }
      
      // Verify printer exists and belongs to customer
      const existing = await storage.getPrinter(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Printer not found" });
      }
      if (existing.customerId !== customerId) {
        return res.status(403).json({ error: "Unauthorized to modify this printer" });
      }

      // Validate locationId belongs to the same customer if provided
      if (req.body.locationId) {
        const location = await storage.getLocation(req.body.locationId);
        if (!location || location.customerId !== existing.customerId) {
          return res.status(400).json({ error: "Invalid location for this customer" });
        }
      }
      
      // Validate partial update with schema (omit required fields for partial update)
      const partialSchema = insertPrinterSchema.partial().omit({ customerId: true });
      const validatedUpdates = partialSchema.parse(req.body);

      const printer = await storage.updatePrinter(req.params.id, validatedUpdates);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.json(printer);
    } catch (error) {
      logger.error({ err: error }, "Error updating printer");
      res.status(400).json({ error: "Failed to update printer", details: error instanceof Error ? error.message : undefined });
    }
  });

  // Delete a printer
  app.delete("/api/printers/:id", requireAuth, async (req, res) => {
    try {
      const customerId = req.query.customerId as string || getEffectiveCustomerId(req);
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID required" });
      }
      
      // Verify printer exists and belongs to customer
      const existing = await storage.getPrinter(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Printer not found" });
      }
      if (existing.customerId !== customerId) {
        return res.status(403).json({ error: "Unauthorized to delete this printer" });
      }

      const success = await storage.deletePrinter(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting printer");
      res.status(500).json({ error: "Failed to delete printer" });
    }
  });

  // =====================
  // PrintNode Admin Routes
  // =====================

  // Get PrintNode status (admin)
  app.get("/api/printnode/status", requireAuth, async (req, res) => {
    try {
      const result = await printNodeService.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get PrintNode printers (admin)
  app.get("/api/printnode/printers", requireAuth, async (req, res) => {
    try {
      if (!printNodeService.isConfigured()) {
        return res.json({ 
          configured: false, 
          printers: [],
          message: 'PrintNode is not configured. Please add PRINTNODE_API_KEY to your environment secrets.'
        });
      }

      const printers = await printNodeService.getPrinters();
      res.json({ 
        configured: true,
        printers: printers.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          computerName: p.computer?.name || 'Unknown',
          state: p.state,
        })),
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error fetching PrintNode printers");
      res.status(500).json({ error: error.message || "Failed to fetch PrintNode printers" });
    }
  });

  const largeBodyParser = express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    }
  });

  // Print via PrintNode (admin)
  app.post("/api/printnode/print", largeBodyParser, requireAuth, async (req, res) => {
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

  // =====================
  // Synced Questions & Responses Routes
  // =====================

  // Get synced questions for an event (profile + registration)
  app.get("/api/events/:eventId/synced-questions", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const questions = await storage.getSyncedQuestions(event.customerId, event.id);
      res.json(questions);
    } catch (error) {
      logger.error({ err: error }, "Error fetching synced questions");
      res.status(500).json({ error: "Failed to fetch synced questions" });
    }
  });

  // Update synced question config flags (admin only)
  app.patch("/api/events/:eventId/synced-questions/:questionId", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allowedFields = ['displayOnBadge', 'displayOnStaffEdit', 'displayOnAdminEdit', 'readOnly', 'syncResponseBack', 'sortOrder'];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const updated = await storage.updateSyncedQuestion(req.params.questionId, updates);
      if (!updated) return res.status(404).json({ error: "Question not found" });
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating synced question");
      res.status(500).json({ error: "Failed to update synced question" });
    }
  });

  // Get available merge fields for badge designer (built-in + synced questions)
  app.get("/api/events/:eventId/available-merge-fields", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      // Built-in fields
      const builtIn = [
        { value: "fullName", label: "Full Name", source: "built-in" },
        { value: "firstName", label: "First Name", source: "built-in" },
        { value: "lastName", label: "Last Name", source: "built-in" },
        { value: "email", label: "Email", source: "built-in" },
        { value: "company", label: "Company", source: "built-in" },
        { value: "title", label: "Job Title", source: "built-in" },
        { value: "participantType", label: "Attendee Type", source: "built-in" },
        { value: "externalId", label: "Reg Code", source: "built-in" },
        { value: "orderCode", label: "Order Code", source: "built-in" },
      ];

      // Dynamic fields from synced questions where displayOnBadge=true
      const questions = await storage.getSyncedQuestions(event.customerId, event.id);
      const dynamic = questions
        .filter(q => q.displayOnBadge)
        .map(q => ({
          value: q.mergeFieldKey,
          label: q.questionLabel || q.questionName,
          source: q.questionSource,
          questionId: q.id,
        }));

      res.json([...builtIn, ...dynamic]);
    } catch (error) {
      logger.error({ err: error }, "Error fetching available merge fields");
      res.status(500).json({ error: "Failed to fetch merge fields" });
    }
  });

  // Get question responses for a specific attendee
  app.get("/api/events/:eventId/attendees/:attendeeId/question-responses", requireAuth, async (req, res) => {
    try {
      const responses = await storage.getAttendeeQuestionResponses(req.params.attendeeId);
      res.json(responses);
    } catch (error) {
      logger.error({ err: error }, "Error fetching question responses");
      res.status(500).json({ error: "Failed to fetch question responses" });
    }
  });

  // Update a single question response
  app.patch("/api/events/:eventId/attendees/:attendeeId/question-responses/:responseId", requireAuth, async (req, res) => {
    try {
      const { responseValue, responseValues } = req.body;
      const updated = await storage.updateAttendeeQuestionResponse(req.params.responseId, {
        responseValue,
        responseValues,
        editedLocally: true,
        editedBy: req.dbUser?.id || 'admin',
        editedAt: new Date(),
      });
      if (!updated) return res.status(404).json({ error: "Response not found" });

      // Rebuild customFields for this attendee
      const question = await storage.getSyncedQuestion(updated.questionId);
      if (question && responseValue) {
        const attendee = await storage.getAttendee(req.params.attendeeId);
        if (attendee) {
          const updatedFields = { ...(attendee.customFields || {}), [question.mergeFieldKey]: responseValue };
          await storage.updateAttendee(attendee.id, { customFields: updatedFields });
        }
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating question response");
      res.status(500).json({ error: "Failed to update question response" });
    }
  });

  // Bulk upsert question responses for an attendee
  app.post("/api/events/:eventId/attendees/:attendeeId/question-responses/bulk", requireAuth, async (req, res) => {
    try {
      const { responses } = req.body; // Array of { questionId, responseValue, responseValues? }
      if (!Array.isArray(responses)) return res.status(400).json({ error: "responses array required" });

      const results = [];
      const mergeFieldUpdates: Record<string, string> = {};

      for (const r of responses) {
        const result = await storage.upsertAttendeeQuestionResponse({
          attendeeId: req.params.attendeeId,
          questionId: r.questionId,
          responseValue: r.responseValue || null,
          responseValues: r.responseValues || null,
          editedLocally: true,
          editedBy: req.dbUser?.id || 'admin',
          editedAt: new Date(),
        });
        results.push(result);

        // Build customFields update
        const question = await storage.getSyncedQuestion(r.questionId);
        if (question && r.responseValue) {
          mergeFieldUpdates[question.mergeFieldKey] = r.responseValue;
        }
      }

      // Rebuild customFields for this attendee
      if (Object.keys(mergeFieldUpdates).length > 0) {
        const attendee = await storage.getAttendee(req.params.attendeeId);
        if (attendee) {
          const updatedFields = { ...(attendee.customFields || {}), ...mergeFieldUpdates };
          await storage.updateAttendee(attendee.id, { customFields: updatedFields });
        }
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      logger.error({ err: error }, "Error bulk updating question responses");
      res.status(500).json({ error: "Failed to update question responses" });
    }
  });

  // =====================
  // Session Routes
  // =====================

  // Get sessions for an event
  app.get("/api/events/:eventId/sessions", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const customerId = req.query.customerId as string;
      
      // Validate event exists and belongs to customer if specified
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied: Event does not belong to this customer" });
      }
      
      const sessions = await storage.getSessions(eventId);
      res.json(sessions);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sessions");
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get single session
  app.get("/api/sessions/:id", requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      logger.error({ err: error }, "Error fetching session");
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Create session
  app.post("/api/events/:eventId/sessions", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId } = req.params;
      
      // Validate event exists
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const body = { ...req.body };
      if (body.startTime && typeof body.startTime === 'string') {
        body.startTime = new Date(body.startTime);
      }
      if (body.endTime && typeof body.endTime === 'string') {
        body.endTime = new Date(body.endTime);
      }
      
      const sessionData = insertSessionSchema.parse({
        ...body,
        eventId,
      });
      const session = await storage.createSession(sessionData);
      res.status(201).json(session);
    } catch (error) {
      logger.error({ err: error }, "Error creating session");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to create session" });
    }
  });

  // Update session
  app.patch("/api/sessions/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.startTime && typeof body.startTime === 'string') {
        body.startTime = new Date(body.startTime);
      }
      if (body.endTime && typeof body.endTime === 'string') {
        body.endTime = new Date(body.endTime);
      }
      const partialSchema = insertSessionSchema.partial();
      const validatedUpdates = partialSchema.parse(body);
      const session = await storage.updateSession(req.params.id, validatedUpdates);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      logger.error({ err: error }, "Error updating session");
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ error: `Validation error: ${fieldErrors}` });
      }
      res.status(400).json({ error: "Failed to update session" });
    }
  });

  // Delete session
  app.delete("/api/sessions/:id", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const success = await storage.deleteSession(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting session");
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // =====================
  // Session Registration Routes
  // =====================

  // Get registrations for a session
  app.get("/api/sessions/:sessionId/registrations", requireAuth, async (req, res) => {
    try {
      const registrations = await storage.getSessionRegistrations(req.params.sessionId);
      res.json(registrations);
    } catch (error) {
      logger.error({ err: error }, "Error fetching session registrations");
      res.status(500).json({ error: "Failed to fetch registrations" });
    }
  });

  // Get registration status for an attendee
  app.get("/api/sessions/:sessionId/registrations/:attendeeId", requireAuth, async (req, res) => {
    try {
      const registration = await storage.getSessionRegistrationByAttendee(
        req.params.sessionId,
        req.params.attendeeId
      );
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      res.json(registration);
    } catch (error) {
      logger.error({ err: error }, "Error fetching registration");
      res.status(500).json({ error: "Failed to fetch registration" });
    }
  });

  // Register attendee for session (with capacity and waitlist handling)
  app.post("/api/sessions/:sessionId/register", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { attendeeId } = req.body;
      
      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }
      
      // Validate session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Validate attendee exists
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      // Check if already registered
      const existing = await storage.getSessionRegistrationByAttendee(sessionId, attendeeId);
      if (existing) {
        return res.status(409).json({ error: "Already registered for this session", registration: existing });
      }
      
      // Check capacity
      const registeredCount = await storage.getSessionRegistrationCount(sessionId, "registered");
      
      if (session.capacity && registeredCount >= session.capacity) {
        // Session is full - add to waitlist if allowed
        if (session.allowWaitlist) {
          const waitlistPosition = await storage.getNextWaitlistPosition(sessionId);
          const registration = await storage.createSessionRegistration({
            sessionId,
            attendeeId,
            status: "waitlisted",
            waitlistPosition,
          });
          return res.status(201).json({ 
            ...registration, 
            message: "Added to waitlist",
            waitlistPosition 
          });
        } else {
          return res.status(409).json({ error: "Session is at capacity and waitlist is not allowed" });
        }
      }
      
      // Register normally
      const registration = await storage.createSessionRegistration({
        sessionId,
        attendeeId,
        status: "registered",
      });
      res.status(201).json(registration);
    } catch (error) {
      logger.error({ err: error }, "Error registering for session");
      res.status(400).json({ error: "Failed to register for session" });
    }
  });

  // Cancel registration
  app.delete("/api/sessions/:sessionId/registrations/:attendeeId", requireAuth, async (req, res) => {
    try {
      const registration = await storage.getSessionRegistrationByAttendee(
        req.params.sessionId,
        req.params.attendeeId
      );
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      
      const wasRegistered = registration.status === "registered";
      
      // Delete registration
      await storage.deleteSessionRegistration(registration.id);
      
      // If they were registered (not waitlisted), promote from waitlist
      if (wasRegistered) {
        const promoted = await storage.promoteFromWaitlist(req.params.sessionId);
        if (promoted) {
          res.json({ success: true, promoted: promoted });
          return;
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error cancelling registration");
      res.status(500).json({ error: "Failed to cancel registration" });
    }
  });

  // =====================
  // Session Check-in Routes
  // =====================

  // Get check-ins for a session
  app.get("/api/sessions/:sessionId/checkins", requireAuth, async (req, res) => {
    try {
      const checkins = await storage.getSessionCheckins(req.params.sessionId);
      res.json(checkins);
    } catch (error) {
      logger.error({ err: error }, "Error fetching session check-ins");
      res.status(500).json({ error: "Failed to fetch check-ins" });
    }
  });

  // Check-in attendee to session (via QR code scan)
  app.post("/api/sessions/:sessionId/checkin", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { attendeeId, source, checkedInBy } = req.body;
      
      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }
      
      // Validate session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Validate attendee exists
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      // Check if session restricts to registered attendees
      if (session.restrictToRegistered) {
        const registration = await storage.getSessionRegistrationByAttendee(sessionId, attendeeId);
        if (!registration || registration.status !== "registered") {
          return res.status(403).json({ 
            error: "This session is restricted to pre-registered attendees only",
            isRegistered: !!registration,
            registrationStatus: registration?.status 
          });
        }
      }
      
      // Check if already checked in
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, attendeeId);
      if (isCheckedIn) {
        return res.status(409).json({ error: "Attendee is already checked in", alreadyCheckedIn: true });
      }

      // Check capacity (staff can override)
      const forceOverride = req.body.overrideCapacity === true;
      if (session.capacity && !forceOverride) {
        const checkins = await storage.getSessionCheckins(sessionId);
        const checkinIds = new Set(checkins.filter(c => c.action === 'checkin').map(c => c.attendeeId));
        const checkoutIds = new Set(checkins.filter(c => c.action === 'checkout').map(c => c.attendeeId));
        const activeCount = [...checkinIds].filter(id => !checkoutIds.has(id)).length;
        if (activeCount >= session.capacity) {
          return res.status(409).json({
            error: `Session is at capacity (${activeCount}/${session.capacity})`,
            atCapacity: true,
            currentCount: activeCount,
            capacity: session.capacity,
          });
        }
      }

      // Create check-in record
      const checkin = await storage.createSessionCheckin({
        sessionId,
        attendeeId,
        action: "checkin",
        source: source || "kiosk",
        checkedInBy,
      });

      // Fire-and-forget: sync session check-in to external system
      const event = await storage.getEvent(session.eventId);
      if (event) {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
        if (integration) {
          void checkinSyncService.sendSessionCheckinSync(attendee, session, event, integration)
            .catch(err => logger.error({ err: err }, 'Error'));
        }
      }
      
      res.status(201).json({
        ...checkin,
        attendee: {
          id: attendee.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company,
        },
        session: {
          id: session.id,
          name: session.name,
          location: session.location,
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Error checking in to session");
      res.status(400).json({ error: "Failed to check in" });
    }
  });

  // Check-out attendee from session
  app.post("/api/sessions/:sessionId/checkout", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { attendeeId, source, checkedInBy } = req.body;
      
      if (!attendeeId) {
        return res.status(400).json({ error: "attendeeId is required" });
      }
      
      // Validate session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Check if actually checked in
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, attendeeId);
      if (!isCheckedIn) {
        return res.status(409).json({ error: "Attendee is not checked in" });
      }
      
      // Create check-out record
      const checkout = await storage.createSessionCheckin({
        sessionId,
        attendeeId,
        action: "checkout",
        source: source || "kiosk",
        checkedInBy,
      });
      
      res.status(201).json(checkout);
    } catch (error) {
      logger.error({ err: error }, "Error checking out from session");
      res.status(400).json({ error: "Failed to check out" });
    }
  });

  // Get session check-in status for attendee
  app.get("/api/sessions/:sessionId/status/:attendeeId", requireAuth, async (req, res) => {
    try {
      const { sessionId, attendeeId } = req.params;
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const attendee = await storage.getAttendee(attendeeId);
      if (!attendee) {
        return res.status(404).json({ error: "Attendee not found" });
      }
      
      const registration = await storage.getSessionRegistrationByAttendee(sessionId, attendeeId);
      const isCheckedIn = await storage.isAttendeeCheckedIntoSession(sessionId, attendeeId);
      const latestCheckin = await storage.getLatestSessionCheckin(sessionId, attendeeId);
      
      res.json({
        sessionId,
        attendeeId,
        isRegistered: !!registration,
        registrationStatus: registration?.status || null,
        waitlistPosition: registration?.waitlistPosition || null,
        isCheckedIn,
        lastAction: latestCheckin?.action || null,
        lastActionTime: latestCheckin?.timestamp || null,
        session: {
          name: session.name,
          location: session.location,
          restrictToRegistered: session.restrictToRegistered,
        },
        attendee: {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company,
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching session status");
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // =====================
  // Custom Fonts Management
  // =====================

  // Get all custom fonts for a customer
  app.get("/api/customers/:customerId/fonts", requireAuth, async (req, res) => {
    try {
      const fonts = await storage.getCustomFonts(req.params.customerId);
      res.json(fonts);
    } catch (error) {
      logger.error({ err: error }, "Error fetching custom fonts");
      res.status(500).json({ error: "Failed to fetch custom fonts" });
    }
  });

  // Get single custom font
  app.get("/api/fonts/:fontId", requireAuth, async (req, res) => {
    try {
      const font = await storage.getCustomFont(req.params.fontId);
      if (!font) {
        return res.status(404).json({ error: "Font not found" });
      }
      res.json(font);
    } catch (error) {
      logger.error({ err: error }, "Error fetching custom font");
      res.status(500).json({ error: "Failed to fetch custom font" });
    }
  });

  // Upload custom font
  app.post("/api/customers/:customerId/fonts", largeBodyParser, requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const customerId = req.params.customerId;
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const { displayName, fontFamily, fontWeight, fontStyle, mimeType, fileSize, fontData } = req.body;
      
      // Validate file size (max 5MB)
      if (fileSize > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "Font file too large. Maximum size is 5MB." });
      }

      // Validate MIME type
      const allowedMimeTypes = [
        "font/ttf", "font/woff", "font/woff2",
        "application/x-font-ttf", "application/font-woff", "application/font-woff2"
      ];
      if (!allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ error: "Invalid font file type. Allowed: TTF, WOFF, WOFF2" });
      }

      const font = await storage.createCustomFont({
        customerId,
        displayName,
        fontFamily,
        fontWeight: fontWeight || "400",
        fontStyle: fontStyle || "normal",
        mimeType,
        fileSize,
        fontData,
        isActive: true,
        uploadedBy: null,
      });
      
      res.status(201).json(font);
    } catch (error) {
      logger.error({ err: error }, "Error uploading custom font");
      res.status(400).json({ error: "Failed to upload custom font" });
    }
  });

  // Update custom font
  app.patch("/api/fonts/:fontId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { displayName, fontFamily, fontWeight, fontStyle, isActive } = req.body;
      const font = await storage.updateCustomFont(req.params.fontId, {
        displayName,
        fontFamily,
        fontWeight,
        fontStyle,
        isActive,
      });
      if (!font) {
        return res.status(404).json({ error: "Font not found" });
      }
      res.json(font);
    } catch (error) {
      logger.error({ err: error }, "Error updating custom font");
      res.status(400).json({ error: "Failed to update custom font" });
    }
  });

  // Delete custom font
  app.delete("/api/fonts/:fontId", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const success = await storage.deleteCustomFont(req.params.fontId);
      if (!success) {
        return res.status(404).json({ error: "Font not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting custom font");
      res.status(500).json({ error: "Failed to delete custom font" });
    }
  });

  // Get available fonts (web-safe + Google Fonts + custom)
  app.get("/api/customers/:customerId/fonts/available", requireAuth, async (req, res) => {
    try {
      const { WEB_SAFE_FONTS, GOOGLE_FONTS } = await import("@shared/schema");
      const customFonts = await storage.getCustomFonts(req.params.customerId);
      
      res.json({
        webSafe: WEB_SAFE_FONTS,
        googleFonts: GOOGLE_FONTS,
        custom: customFonts.map(f => ({
          id: f.id,
          family: f.fontFamily,
          displayName: f.displayName,
          weight: f.fontWeight,
          style: f.fontStyle,
          category: "custom",
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching available fonts");
      res.status(500).json({ error: "Failed to fetch available fonts" });
    }
  });


  // Temp Staff Routes — extracted to routes/temp-staff.ts



  // Event Workflow Routes — extracted to routes/workflows.ts


  // =====================
  // System Settings Routes (Super Admin only, except public login background)
  // =====================

  // Public endpoint to get login background settings (no auth required)
  app.get("/api/settings/login-background", async (req, res) => {
    try {
      const [imageSetting, colorSetting] = await Promise.all([
        storage.getSystemSetting("login_background_image"),
        storage.getSystemSetting("login_background_color"),
      ]);
      res.json({ 
        imageUrl: imageSetting?.value || null,
        backgroundColor: colorSetting?.value || null,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching login background");
      res.status(500).json({ error: "Failed to fetch login background" });
    }
  });

  app.get("/api/settings/feature-flags", requireAuth, async (req, res) => {
    try {
      // Platform-wide settings (not per-account)
      const badgeFlipSetting = await storage.getSystemSetting("feature_badge_flip_preview");
      const betaFeedbackSetting = await storage.getSystemSetting("feature_beta_feedback");

      // Per-account feature flags — read from account_feature_configs when customer context exists
      const customerId = getEffectiveCustomerId(req);
      let kioskWalkinEnabled = false;
      let groupCheckinEnabled = false;
      let eventSyncEnabled = true; // Default ON

      if (customerId) {
        const { getAccountFeatureConfigs } = await import("./services/license-provisioning");
        const configs = await getAccountFeatureConfigs(customerId);
        const configMap = new Map(configs.map(c => [c.featureKey, c.enabled]));
        kioskWalkinEnabled = configMap.get("walkin_registration") ?? false;
        groupCheckinEnabled = configMap.get("group_checkin") ?? false;
        eventSyncEnabled = configMap.get("event_sync") ?? true;
      } else {
        // No customer context (e.g., super admin root level) — fall back to platform flags
        const kioskWalkinFlag = await storage.getFeatureFlagByKey("kiosk_walkin_registration");
        const groupCheckinFlag = await storage.getFeatureFlagByKey("group_checkin");
        kioskWalkinEnabled = kioskWalkinFlag?.enabled ?? false;
        groupCheckinEnabled = groupCheckinFlag?.enabled ?? false;
      }

      res.json({
        badgeFlipPreview: badgeFlipSetting?.value === "true",
        betaFeedback: betaFeedbackSetting?.value === "true",
        penTestMode: process.env.PEN_TEST_MODE === "true",
        kioskWalkinRegistration: kioskWalkinEnabled,
        groupCheckin: groupCheckinEnabled,
        eventSync: eventSyncEnabled,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching feature flags");
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  // ===== License & Usage Management =====

  app.get("/api/customers/:customerId/license", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { customerId } = req.params;
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const { getAccountFeatureConfigs } = await import("./services/license-provisioning");
      const featureConfigs = await getAccountFeatureConfigs(customerId);

      res.json({
        licenseType: customer.licenseType,
        licensePlan: customer.licensePlan,
        prepaidAttendees: customer.prepaidAttendees,
        licenseStartDate: customer.licenseStartDate,
        licenseEndDate: customer.licenseEndDate,
        licenseNotes: customer.licenseNotes,
        featureConfigs,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching license info");
      res.status(500).json({ error: "Failed to fetch license info" });
    }
  });

  // Billing: get billable attendee counts for a customer within a date range
  app.get("/api/customers/:customerId/billing", requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
    try {
      const { customerId } = req.params;

      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      // Use contract dates or query params for date range
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : customer.licenseStartDate || new Date(0);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : customer.licenseEndDate || new Date();

      const events = await storage.getEvents(customerId);
      const eventBreakdown = [];
      let totalBillable = 0;
      let totalAttendees = 0;

      for (const event of events) {
        const attendees = await storage.getAttendees(event.id);
        const billable = attendees.filter((a: any) => {
          if (!a.billableAt) return false;
          const billableDate = new Date(a.billableAt);
          return billableDate >= startDate && billableDate <= endDate;
        });

        totalAttendees += attendees.length;
        totalBillable += billable.length;

        if (attendees.length > 0) {
          eventBreakdown.push({
            eventId: event.id,
            eventName: event.name,
            eventDate: event.eventDate,
            totalAttendees: attendees.length,
            billableAttendees: billable.length,
            statusesConfigured: !!(event.syncSettings)?.statusesConfigured,
          });
        }
      }

      res.json({
        customerId,
        contractStart: startDate,
        contractEnd: endDate,
        prepaidAttendees: customer.prepaidAttendees || 0,
        totalAttendees,
        totalBillable,
        overage: Math.max(0, totalBillable - (customer.prepaidAttendees || 0)),
        events: eventBreakdown,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching billing data");
      res.status(500).json({ error: "Failed to fetch billing data" });
    }
  });

  const licenseUpdateSchema = z.object({
    licenseType: z.enum(["basic", "premium"]).optional(),
    licensePlan: z.enum(["starter", "professional", "enterprise", "strategic"]).nullable().optional(),
    prepaidAttendees: z.number().int().positive().nullable().optional(),
    licenseStartDate: z.string().nullable().optional(),
    licenseEndDate: z.string().nullable().optional(),
    licenseNotes: z.string().max(1000).nullable().optional(),
  });

  app.patch("/api/customers/:customerId/license", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const { customerId } = req.params;
      const parsed = licenseUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const { licenseType, licensePlan, prepaidAttendees, licenseStartDate, licenseEndDate, licenseNotes } = parsed.data;
      const updateData: Record<string, any> = {};
      if (licenseType !== undefined) updateData.licenseType = licenseType;
      if (licensePlan !== undefined) updateData.licensePlan = licensePlan;
      if (prepaidAttendees !== undefined) updateData.prepaidAttendees = prepaidAttendees;
      if (licenseStartDate !== undefined) updateData.licenseStartDate = licenseStartDate ? new Date(licenseStartDate) : null;
      if (licenseEndDate !== undefined) updateData.licenseEndDate = licenseEndDate ? new Date(licenseEndDate) : null;
      if (licenseNotes !== undefined) updateData.licenseNotes = licenseNotes;

      const updated = await storage.updateCustomer(customerId, updateData);

      if (licenseType && licenseType !== customer.licenseType) {
        const { updateLicenseFeatures } = await import("./services/license-provisioning");
        await updateLicenseFeatures(customerId, licenseType);
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating license");
      res.status(500).json({ error: "Failed to update license" });
    }
  });

  app.get("/api/customers/:customerId/features", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { customerId } = req.params;
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { getAccountFeatureConfigs, getFeatureDefinitions } = await import("./services/license-provisioning");
      const configs = await getAccountFeatureConfigs(customerId);
      const definitions = getFeatureDefinitions();

      const features = definitions.map(def => {
        const config = configs.find(c => c.featureKey === def.key);
        return {
          key: def.key,
          name: def.name,
          description: def.description || null,
          category: def.category,
          basic: def.basic,
          premium: def.premium,
          enabled: config?.enabled ?? false,
          metadata: config?.metadata || def.metadata || null,
        };
      });

      res.json(features);
    } catch (error) {
      logger.error({ err: error }, "Error fetching account features");
      res.status(500).json({ error: "Failed to fetch features" });
    }
  });

  app.patch("/api/customers/:customerId/features/:featureKey", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const { customerId, featureKey } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const { toggleAccountFeature } = await import("./services/license-provisioning");
      const success = await toggleAccountFeature(customerId, featureKey, enabled);

      if (!success) {
        return res.status(404).json({ error: "Feature config not found" });
      }

      res.json({ featureKey, enabled });
    } catch (error) {
      logger.error({ err: error }, "Error toggling feature");
      res.status(500).json({ error: "Failed to toggle feature" });
    }
  });

  app.get("/api/customers/:customerId/usage", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { customerId } = req.params;
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { getUsageSummary } = await import("./services/usage-tracking");
      const summary = await getUsageSummary(customerId);
      if (!summary) return res.status(404).json({ error: "Customer not found" });
      res.json(summary);
    } catch (error) {
      logger.error({ err: error }, "Error fetching usage");
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  app.get("/api/mission-control/usage-overview", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const { getAllPremiumUsageSummaries } = await import("./services/usage-tracking");
      const summaries = await getAllPremiumUsageSummaries();
      res.json(summaries);
    } catch (error) {
      logger.error({ err: error }, "Error fetching usage overview");
      res.status(500).json({ error: "Failed to fetch usage overview" });
    }
  });

  app.post("/api/mission-control/usage-snapshot", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const { runDailyUsageCheck } = await import("./services/usage-tracking");
      await runDailyUsageCheck();
      res.json({ success: true, message: "Usage snapshots taken and alerts checked" });
    } catch (error) {
      logger.error({ err: error }, "Error running usage snapshot");
      res.status(500).json({ error: "Failed to run usage snapshot" });
    }
  });

  // ===== Mission Control: Feature Flags CRUD (super admin only) =====

  app.get("/api/mission-control/flags", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const flags = await storage.getFeatureFlags();
      res.json(flags);
    } catch (error) {
      logger.error({ err: error }, "Error fetching feature flags");
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  app.get("/api/mission-control/flags/:id", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const flag = await storage.getFeatureFlag(req.params.id);
      if (!flag) return res.status(404).json({ error: "Feature flag not found" });
      res.json(flag);
    } catch (error) {
      logger.error({ err: error }, "Error fetching feature flag");
      res.status(500).json({ error: "Failed to fetch feature flag" });
    }
  });

  app.post("/api/mission-control/flags", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const createSchema = z.object({
        key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
        name: z.string().min(1).max(200),
        description: z.string().max(500).optional().nullable(),
        category: z.string().min(1).max(50).default("general"),
        enabled: z.boolean().default(false),
        scope: z.enum(["platform", "account", "event"]).default("platform"),
        rolloutPercentage: z.number().int().min(0).max(100).default(0),
        metadata: z.record(z.unknown()).optional().nullable(),
      });
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      }
      const existing = await storage.getFeatureFlagByKey(parsed.data.key);
      if (existing) {
        return res.status(409).json({ error: "A flag with this key already exists" });
      }
      const flag = await storage.createFeatureFlag({
        ...parsed.data,
        description: parsed.data.description || null,
        metadata: parsed.data.metadata || null,
        createdBy: req.dbUser?.id || null,
        updatedBy: req.dbUser?.id || null,
      });
      res.status(201).json(flag);
    } catch (error) {
      logger.error({ err: error }, "Error creating feature flag");
      res.status(500).json({ error: "Failed to create feature flag" });
    }
  });

  app.patch("/api/mission-control/flags/:id", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const existing = await storage.getFeatureFlag(req.params.id);
      if (!existing) return res.status(404).json({ error: "Feature flag not found" });
      const updateSchema = z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(500).optional().nullable(),
        category: z.string().min(1).max(50).optional(),
        enabled: z.boolean().optional(),
        scope: z.enum(["platform", "account", "event"]).optional(),
        rolloutPercentage: z.number().int().min(0).max(100).optional(),
        metadata: z.record(z.unknown()).optional().nullable(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      }
      const flag = await storage.updateFeatureFlag(req.params.id, {
        ...parsed.data,
        updatedBy: req.dbUser?.id || null,
      } as any);
      res.json(flag);
    } catch (error) {
      logger.error({ err: error }, "Error updating feature flag");
      res.status(500).json({ error: "Failed to update feature flag" });
    }
  });

  app.delete("/api/mission-control/flags/:id", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const existing = await storage.getFeatureFlag(req.params.id);
      if (!existing) return res.status(404).json({ error: "Feature flag not found" });
      await storage.deleteFeatureFlag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting feature flag");
      res.status(500).json({ error: "Failed to delete feature flag" });
    }
  });

  app.patch("/api/mission-control/flags/:id/toggle", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const existing = await storage.getFeatureFlag(req.params.id);
      if (!existing) return res.status(404).json({ error: "Feature flag not found" });
      const flag = await storage.updateFeatureFlag(req.params.id, {
        enabled: !existing.enabled,
        rolloutPercentage: !existing.enabled ? 100 : 0,
        updatedBy: req.dbUser?.id || null,
      });
      res.json(flag);
    } catch (error) {
      logger.error({ err: error }, "Error toggling feature flag");
      res.status(500).json({ error: "Failed to toggle feature flag" });
    }
  });

  // Test Twilio configuration (super admin only)
  app.post("/api/admin/test-twilio", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      const { smsService } = await import('./services/sms-service');
      
      // Check if configured
      if (!smsService.isConfigured()) {
        return res.json({ 
          success: false, 
          error: "Twilio is not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER secrets." 
        });
      }
      
      // Try to send a test SMS to the requesting user's phone
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.json({
          success: false,
          error: "Please provide a phone number to test"
        });
      }
      
      const result = await smsService.sendSMS({ 
        to: phoneNumber, 
        message: "Greet Twilio test successful! Your SMS configuration is working." 
      });
      
      if (result.success) {
        res.json({ success: true, message: "Test SMS sent successfully!" });
      } else {
        res.json({ success: false, error: result.error || "Unknown error sending SMS" });
      }
    } catch (error: any) {
      logger.error({ err: error }, "Error testing Twilio");
      res.json({ 
        success: false, 
        error: error.message || "Failed to test Twilio configuration" 
      });
    }
  });

  // Get all system settings (super admin only)
  app.get("/api/admin/settings", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching system settings");
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  });

  // Get specific system setting (super admin only)
  app.get("/api/admin/settings/:key", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      logger.error({ err: error }, "Error fetching system setting");
      res.status(500).json({ error: "Failed to fetch system setting" });
    }
  });

  // Update/create system setting (super admin only)
  app.put("/api/admin/settings/:key", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      const { value, jsonValue, description } = req.body;
      const setting = await storage.upsertSystemSetting(
        req.params.key,
        value ?? null,
        jsonValue ?? null,
        description,
        req.dbUser?.id
      );
      res.json(setting);
    } catch (error) {
      logger.error({ err: error }, "Error updating system setting");
      res.status(500).json({ error: "Failed to update system setting" });
    }
  });

  // Delete system setting (super admin only)
  app.delete("/api/admin/settings/:key", requireAuth, async (req, res) => {
    try {
      if (!isSuperAdmin(req.dbUser)) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      const deleted = await storage.deleteSystemSetting(req.params.key);
      if (!deleted) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting system setting");
      res.status(500).json({ error: "Failed to delete system setting" });
    }
  });

  // ==================== User Preferences (Pinned Events / Favorites) ====================

  app.get("/api/user/preferences/:key", requireAuth, async (req: any, res) => {
    try {
      const userId = req.dbUser.id;
      const { key } = req.params;
      const { eq, and } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { userPreferences } = await import("@shared/schema");
      
      const [pref] = await db.select().from(userPreferences)
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
        .limit(1);
      
      res.json({ value: pref?.value ?? null });
    } catch (error) {
      logger.error({ err: error }, "Error getting user preference");
      res.status(500).json({ error: "Failed to get preference" });
    }
  });

  app.put("/api/user/preferences/:key", requireAuth, async (req: any, res) => {
    try {
      const userId = req.dbUser.id;
      const { key } = req.params;
      const { value } = req.body;
      const { eq, and } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { userPreferences } = await import("@shared/schema");
      const { randomUUID } = await import("crypto");
      
      const [existing] = await db.select().from(userPreferences)
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
        .limit(1);
      
      if (existing) {
        const [updated] = await db.update(userPreferences)
          .set({ value, updatedAt: new Date() })
          .where(eq(userPreferences.id, existing.id))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db.insert(userPreferences)
          .values({ id: randomUUID(), userId, key, value, updatedAt: new Date() })
          .returning();
        res.json(created);
      }
    } catch (error) {
      logger.error({ err: error }, "Error setting user preference");
      res.status(500).json({ error: "Failed to set preference" });
    }
  });

  // ==========================================
  // Beta Feedback Agent API Routes
  // ==========================================

  app.post("/api/feedback/conversation", requireAuth, async (req: any, res) => {
    try {
      const { converseFeedback } = await import("./services/feedback-ai");
      const { transcript, page } = req.body;

      if (!Array.isArray(transcript)) {
        return res.status(400).json({ error: "transcript must be an array" });
      }

      const userName = req.dbUser?.name || req.dbUser?.username || undefined;
      const result = await converseFeedback(transcript, page || "/", userName);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error in feedback conversation");
      res.status(500).json({ error: "Failed to process conversation" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { randomUUID } = await import("crypto");

      const { getEffectiveCustomerId } = await import("./auth");
      const userId = req.dbUser?.id;
      const userRole = req.dbUser?.role;
      const customerId = getEffectiveCustomerId(req) || req.dbUser?.customerId;
      const { eventId, page, pageTitle, type, message, tags, severity, screenshotUrl } = req.body;

      if (!message || !type) {
        return res.status(400).json({ error: "Message and type are required" });
      }

      const { sql } = await import("drizzle-orm");
      const ticketResult = await db.execute(sql`SELECT nextval('feedback_ticket_seq') as num`);
      const ticketNumber = Number(ticketResult.rows?.[0]?.num ?? ticketResult[0]?.num);

      const [entry] = await db.insert(feedbackEntries).values({
        id: `fb-${randomUUID().substring(0, 8)}`,
        ticketNumber,
        customerId: customerId || null,
        eventId: eventId || null,
        userId: userId || null,
        userRole: userRole || null,
        page: page || null,
        pageTitle: pageTitle || null,
        type,
        message,
        tags: tags || [],
        severity: severity || null,
        screenshotUrl: screenshotUrl || null,
        status: "new",
      }).returning();

      let customerName = "";
      if (customerId) {
        try {
          const { customers } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1);
          if (cust?.name) customerName = cust.name;
        } catch {}
      }
      if (!customerName && userRole === "super_admin") {
        customerName = "Super Admin (Platform)";
      }

      const { sendFeedbackToSlack } = await import("./services/slack-feedback");
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      sendFeedbackToSlack({
        type,
        message,
        severity,
        page,
        pageTitle,
        userName: req.dbUser?.email || req.dbUser?.name || "Unknown",
        userRole,
        customerName,
        eventId,
        tags,
        screenshotUrl: screenshotUrl ? `${baseUrl}${screenshotUrl}` : undefined,
        ticketRef: ticketNumber ? `FB-${ticketNumber}` : undefined,
      }).catch(() => {});

      res.json(entry);
    } catch (error) {
      logger.error({ err: error }, "Error submitting feedback");
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // ==========================================
  // User Feedback History Routes (My Feedback)
  // ==========================================

  app.get("/api/my-feedback", requireAuth, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");

      const userId = req.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const entries = await db.select().from(feedbackEntries)
        .where(eq(feedbackEntries.userId, userId))
        .orderBy(desc(feedbackEntries.createdAt));

      const result = entries.map(e => ({
        id: e.id,
        ticketNumber: e.ticketNumber,
        ticketRef: e.ticketNumber ? `FB-${e.ticketNumber}` : e.id.substring(0, 11),
        type: e.type,
        message: e.message,
        status: e.status,
        severity: e.severity,
        createdAt: e.createdAt,
        adminResponse: e.adminResponse,
        adminResponseAt: e.adminResponseAt,
        userReadAt: e.userReadAt,
        hasUnreadResponse: !!(e.adminResponse && (!e.userReadAt || (e.adminResponseAt && e.adminResponseAt > e.userReadAt))),
      }));

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error fetching user feedback");
      res.status(500).json({ error: "Failed to fetch feedback history" });
    }
  });

  app.get("/api/my-feedback/unread-count", requireAuth, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { eq, and, isNotNull, sql } = await import("drizzle-orm");

      const userId = req.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const entries = await db.select({
        adminResponseAt: feedbackEntries.adminResponseAt,
        userReadAt: feedbackEntries.userReadAt,
      }).from(feedbackEntries)
        .where(and(
          eq(feedbackEntries.userId, userId),
          isNotNull(feedbackEntries.adminResponse),
        ));

      const unreadCount = entries.filter(e =>
        !e.userReadAt || (e.adminResponseAt && e.adminResponseAt > e.userReadAt)
      ).length;

      res.json({ unreadCount });
    } catch (error) {
      logger.error({ err: error }, "Error fetching unread count");
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/my-feedback/:id/read", requireAuth, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const userId = req.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [updated] = await db.update(feedbackEntries)
        .set({ userReadAt: new Date() })
        .where(and(
          eq(feedbackEntries.id, req.params.id),
          eq(feedbackEntries.userId, userId),
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Feedback not found" });
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error marking feedback as read");
      res.status(500).json({ error: "Failed to mark feedback as read" });
    }
  });

  app.post("/api/behavior-events", requireAuth, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { behaviorEvents } = await import("@shared/schema");
      const { randomUUID } = await import("crypto");

      const userRole = req.dbUser?.role;
      const customerId = req.dbUser?.customerId;
      const isSuperAdmin = userRole === "super_admin";
      const events = Array.isArray(req.body) ? req.body : [req.body];

      const values = events.map((e: any) => ({
        id: `be-${randomUUID().substring(0, 8)}`,
        customerId: isSuperAdmin ? (e.customerId || customerId || null) : (customerId || null),
        eventId: e.eventId || null,
        userRole: userRole || null,
        feature: e.feature,
        step: e.step || null,
        action: e.action,
        durationMs: e.durationMs || null,
        metadata: e.metadata || null,
      }));

      await db.insert(behaviorEvents).values(values);
      res.json({ success: true, count: values.length });
    } catch (error) {
      logger.error({ err: error }, "Error recording behavior events");
      res.status(500).json({ error: "Failed to record behavior events" });
    }
  });

  app.get("/api/admin/feedback", requireAuth, async (req: any, res) => {
    try {
      const isSuperAdmin = req.dbUser?.role === "super_admin";
      const isAdmin = req.dbUser?.role === "admin";
      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { db } = await import("./db");
      const { feedbackEntries, customers } = await import("@shared/schema");
      const { desc, eq, and, gte, sql } = await import("drizzle-orm");

      const { type, status, page: pageNum = "1", limit: limitStr = "50", since, customerId: filterCustomerId } = req.query;
      const limit = Math.min(parseInt(limitStr as string) || 50, 200);
      const offset = (Math.max(parseInt(pageNum as string) || 1, 1) - 1) * limit;

      let conditions: any[] = [];
      if (!isSuperAdmin && req.dbUser?.customerId) {
        conditions.push(eq(feedbackEntries.customerId, req.dbUser.customerId));
      } else if (isSuperAdmin && filterCustomerId) {
        conditions.push(eq(feedbackEntries.customerId, filterCustomerId as string));
      }
      if (type) conditions.push(eq(feedbackEntries.type, type as any));
      if (status) conditions.push(eq(feedbackEntries.status, status as any));
      if (since) conditions.push(gte(feedbackEntries.createdAt, new Date(since as string)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [entries, [{ count }]] = await Promise.all([
        db.select({
          id: feedbackEntries.id,
          ticketNumber: feedbackEntries.ticketNumber,
          customerId: feedbackEntries.customerId,
          customerName: customers.name,
          eventId: feedbackEntries.eventId,
          userId: feedbackEntries.userId,
          userRole: feedbackEntries.userRole,
          submitterName: feedbackEntries.submitterName,
          page: feedbackEntries.page,
          pageTitle: feedbackEntries.pageTitle,
          type: feedbackEntries.type,
          message: feedbackEntries.message,
          tags: feedbackEntries.tags,
          sentiment: feedbackEntries.sentiment,
          severity: feedbackEntries.severity,
          status: feedbackEntries.status,
          screenshotUrl: feedbackEntries.screenshotUrl,
          adminNotes: feedbackEntries.adminNotes,
          adminResponse: feedbackEntries.adminResponse,
          adminResponseAt: feedbackEntries.adminResponseAt,
          adminResponderId: feedbackEntries.adminResponderId,
          userReadAt: feedbackEntries.userReadAt,
          createdAt: feedbackEntries.createdAt,
        }).from(feedbackEntries)
          .leftJoin(customers, eq(feedbackEntries.customerId, customers.id))
          .where(where)
          .orderBy(desc(feedbackEntries.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(feedbackEntries).where(where),
      ]);

      res.json({ entries, total: count, page: parseInt(pageNum as string) || 1, limit });
    } catch (error) {
      logger.error({ err: error }, "Error fetching feedback");
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.patch("/api/admin/feedback/:id", requireAuth, async (req: any, res) => {
    try {
      const isSuperAdmin = req.dbUser?.role === "super_admin";
      const isAdmin = req.dbUser?.role === "admin";
      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const { status, adminNotes, severity, adminResponse } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (severity !== undefined) updates.severity = severity;
      if (adminResponse !== undefined) {
        updates.adminResponse = adminResponse || null;
        if (adminResponse && adminResponse.trim()) {
          updates.adminResponseAt = new Date();
          updates.adminResponderId = req.dbUser?.id;
        } else {
          updates.adminResponseAt = null;
          updates.adminResponderId = null;
        }
      }

      let whereCondition: any = eq(feedbackEntries.id, req.params.id);
      if (!isSuperAdmin && req.dbUser?.customerId) {
        whereCondition = and(
          eq(feedbackEntries.id, req.params.id),
          eq(feedbackEntries.customerId, req.dbUser.customerId)
        );
      }

      // ─── FEEDBACK REPLY EMAIL NOTIFICATION (setup) ─────────────────
      // Fetch the existing record before updating so we can detect
      // whether the admin response actually changed (avoids duplicate emails).
      // To enable notifications: also uncomment the send block below.
      // ───────────────────────────────────────────────────────────────
      // const [existing] = await db.select({
      //   adminResponse: feedbackEntries.adminResponse,
      // }).from(feedbackEntries).where(whereCondition);
      // const previousAdminResponse = existing?.adminResponse || null;

      const [updated] = await db.update(feedbackEntries)
        .set(updates)
        .where(whereCondition)
        .returning();

      if (!updated) return res.status(404).json({ error: "Feedback not found" });

      // ─── FEEDBACK REPLY EMAIL NOTIFICATION (send) ──────────────────
      // To enable: uncomment this block AND the "setup" block above.
      // Ensure SENDGRID_API_KEY and EMAIL_FROM are set in env vars.
      // Only sends when admin response text is new or changed.
      // ───────────────────────────────────────────────────────────────
      // if (adminResponse && adminResponse.trim() && updated.userId) {
      //   const isNewOrChanged = previousAdminResponse !== adminResponse.trim();
      //   if (isNewOrChanged) {
      //     try {
      //       const { users } = await import("@shared/schema");
      //       const [feedbackUser] = await db.select({
      //         email: users.email,
      //         firstName: users.firstName,
      //       }).from(users).where(eq(users.id, updated.userId));
      //
      //       if (feedbackUser?.email) {
      //         const { emailService } = await import("./services/email-service");
      //         await emailService.sendFeedbackReplyEmail(
      //           feedbackUser.email,
      //           feedbackUser.firstName,
      //           updated.type,
      //           adminResponse.trim(),
      //           updated.ticketNumber
      //         );
      //         logger.info({ feedbackId: updated.id, to: feedbackUser.email }, "Feedback reply email sent");
      //       }
      //     } catch (emailErr) {
      //       logger.error({ err: emailErr, feedbackId: updated.id }, "Failed to send feedback reply email (non-blocking)");
      //     }
      //   }
      // }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating feedback");
      res.status(500).json({ error: "Failed to update feedback" });
    }
  });


  app.get("/api/admin/feedback/stats", requireAuth, async (req: any, res) => {
    try {
      const isSuperAdmin = req.dbUser?.role === "super_admin";
      const isAdmin = req.dbUser?.role === "admin";
      if (!isSuperAdmin && !isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { db } = await import("./db");
      const { feedbackEntries } = await import("@shared/schema");
      const { sql, eq } = await import("drizzle-orm");

      const { customerId: filterCustomerId } = req.query;
      let tenantFilter;
      if (!isSuperAdmin && req.dbUser?.customerId) {
        tenantFilter = eq(feedbackEntries.customerId, req.dbUser.customerId);
      } else if (isSuperAdmin && filterCustomerId) {
        tenantFilter = eq(feedbackEntries.customerId, filterCustomerId as string);
      }

      const [stats] = await db.select({
        total: sql<number>`count(*)::int`,
        newCount: sql<number>`count(*) filter (where status = 'new')::int`,
        comments: sql<number>`count(*) filter (where type = 'comment')::int`,
        featureRequests: sql<number>`count(*) filter (where type = 'feature_request')::int`,
        issues: sql<number>`count(*) filter (where type = 'issue')::int`,
      }).from(feedbackEntries).where(tenantFilter);

      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching feedback stats");
      res.status(500).json({ error: "Failed to fetch feedback stats" });
    }
  });

  app.post("/api/admin/feedback/insights", requireAuth, async (req: any, res) => {
    try {
      if (req.dbUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { db } = await import("./db");
      const { feedbackEntries, behaviorAggregates } = await import("@shared/schema");
      const { desc, gte } = await import("drizzle-orm");
      const { analyzeFeedback } = await import("./services/feedback-ai");

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

      const [recentFeedback, recentAggregates] = await Promise.all([
        db.select({
          type: feedbackEntries.type,
          message: feedbackEntries.message,
          severity: feedbackEntries.severity,
          page: feedbackEntries.page,
          userRole: feedbackEntries.userRole,
          createdAt: feedbackEntries.createdAt,
        }).from(feedbackEntries)
          .orderBy(desc(feedbackEntries.createdAt))
          .limit(100),
        db.select({
          day: behaviorAggregates.day,
          feature: behaviorAggregates.feature,
          step: behaviorAggregates.step,
          starts: behaviorAggregates.starts,
          completions: behaviorAggregates.completions,
          abandons: behaviorAggregates.abandons,
          avgDurationMs: behaviorAggregates.avgDurationMs,
        }).from(behaviorAggregates)
          .where(gte(behaviorAggregates.day, thirtyDaysAgo))
          .orderBy(desc(behaviorAggregates.day))
          .limit(200),
      ]);

      const insights = await analyzeFeedback(
        recentFeedback.map(f => ({
          ...f,
          severity: f.severity || undefined,
          page: f.page || undefined,
          userRole: f.userRole || undefined,
          createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString(),
        })),
        recentAggregates.map(a => ({
          ...a,
          step: a.step || undefined,
          avgDurationMs: a.avgDurationMs || undefined,
        }))
      );

      res.json(insights);
    } catch (error) {
      logger.error({ err: error }, "Error generating feedback insights");
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.get("/api/admin/behavior-aggregates", requireAuth, async (req: any, res) => {
    try {
      if (req.dbUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { db } = await import("./db");
      const { behaviorAggregates } = await import("@shared/schema");
      const { desc, gte, and } = await import("drizzle-orm");

      const { since, limit: limitStr = "100" } = req.query;
      const limit = Math.min(parseInt(limitStr as string) || 100, 500);

      let conditions: any[] = [];
      if (since) conditions.push(gte(behaviorAggregates.day, since as string));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const aggregates = await db.select().from(behaviorAggregates)
        .where(where)
        .orderBy(desc(behaviorAggregates.day))
        .limit(limit);

      res.json(aggregates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching behavior aggregates");
      res.status(500).json({ error: "Failed to fetch behavior aggregates" });
    }
  });

  function cleanupExpiredRateLimits() {
    const now = Date.now();
    const cleanup = (map: Map<string, any>) => {
      const keysToDelete: string[] = [];
      map.forEach((val, key) => {
        const expiry = val.resetAt || (val.firstAttempt ? val.firstAttempt + 15 * 60 * 1000 : 0);
        if (expiry && now > expiry && (!val.lockedUntil || now > val.lockedUntil)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(k => map.delete(k));
    };
    cleanup(otpRateLimits);
    cleanup(otpVerifyAttempts);
    cleanup(staffLoginAttempts);
    cleanup(errorLogLimits);
  }
  setInterval(cleanupExpiredRateLimits, 60 * 60 * 1000);

  // ===== Data Retention Policy Management =====

  app.get("/api/customers/:customerId/retention-policy", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const customerId = req.params.customerId;
      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const policy = await storage.getCustomerRetentionPolicy(customerId);
      res.json({ policy: policy || null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/customers/:customerId/retention-policy", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const customerId = req.params.customerId;
      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { enabled, retentionDays, action, notifyDaysBefore, retentionBasis } = req.body;
      if (typeof enabled !== 'boolean' || !['anonymize', 'delete'].includes(action)) {
        return res.status(400).json({ error: "Invalid policy: enabled (boolean), action ('anonymize'|'delete') required" });
      }
      if (typeof retentionDays !== 'number' || retentionDays < 1) {
        return res.status(400).json({ error: "retentionDays must be a positive number" });
      }
      const policy = {
        enabled,
        retentionDays: Math.round(retentionDays),
        action: action as 'anonymize' | 'delete',
        notifyDaysBefore: Math.round(notifyDaysBefore || 7),
        retentionBasis: (retentionBasis || 'event_end_date') as 'event_end_date' | 'last_check_in',
      };
      const updated = await storage.updateCustomerRetentionPolicy(customerId, policy);
      if (!updated) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json({ policy: updated.dataRetentionPolicy });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:eventId/retention-policy", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (user.role !== 'super_admin' && user.customerId !== event.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const override = await storage.getEventRetentionOverride(req.params.eventId);
      res.json({ override: override || null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:eventId/retention-policy", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      if (user.role !== 'super_admin' && user.customerId !== event.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { override } = req.body;
      if (override !== null && typeof override !== 'object') {
        return res.status(400).json({ error: "override must be an object or null" });
      }
      if (override) {
        if (override.action && !['anonymize', 'delete'].includes(override.action)) {
          return res.status(400).json({ error: "action must be 'anonymize' or 'delete'" });
        }
        if (override.retentionDays !== undefined && (typeof override.retentionDays !== 'number' || override.retentionDays < 1)) {
          return res.status(400).json({ error: "retentionDays must be a positive number" });
        }
      }
      const updated = await storage.updateEventRetentionOverride(req.params.eventId, override);
      if (!updated) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json({ override: updated.dataRetentionOverride || null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/customers/:customerId/retention-log", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const customerId = req.params.customerId;
      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const logs = await storage.getRetentionLogs(customerId);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/customers/:customerId/retention-preview", requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = req.dbUser!;
      const customerId = req.params.customerId;
      if (user.role !== 'super_admin' && user.customerId !== customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const preview = await storage.getRetentionPreview(customerId);
      res.json({ events: preview });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
