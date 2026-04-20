import { createChildLogger } from './logger';
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPrinterSchema, insertCustomerSchema, insertEventSchema, insertBadgeTemplateSchema, insertCustomerIntegrationSchema, insertEventIntegrationSchema, insertAttendeeSchema, updateAttendeeSchema, insertIntegrationConnectionSchema, insertSessionSchema, insertUserSchema, insertIntegrationEndpointConfigSchema, insertEventCodeMappingSchema, insertSessionCodeMappingSchema, insertEventBadgeTemplateOverrideSchema, insertEventWorkflowConfigSchema, insertEventWorkflowStepSchema, insertEventBuyerQuestionSchema, insertEventDisclaimerSchema, insertAttendeeWorkflowResponseSchema, insertAttendeeSignatureSchema, insertEventConfigurationTemplateSchema, userRoles, type StaffSession, type Event } from "@shared/schema";
import { z } from "zod";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { 
  encryptCredential, 
  decryptCredential, 
  maskCredential,
  generateState,
  generatePKCEVerifier,
  generatePKCEChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  isTokenExpired,
  calculateTokenExpiry
} from "./credential-manager";
import { authMiddleware, requireAuth, requireRole, canManageUsers, canAssignRole, getEffectiveCustomerId, isSuperAdmin } from "./auth";
import { badgeTemplateResolver } from "./services/badge-template-resolver";
import { checkinSyncService } from "./services/checkin-sync-service";
import badgeAiRoutes from "./routes/badge-ai";
import { createAssistantRouter } from "./assistant/route";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerLocalStorageRoutes } from "./services/local-storage";
import { registerReportRoutes } from "./routes/reports";
import { printNodeService } from "./services/printnode";
import healthRoutes from "./routes/health";

const logger = createChildLogger('Routes');

function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validatePasswordComplexity(password: string): string | null {
  if (!password || password.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null;
}

function saveSession(session: import('express-session').Session & Partial<import('express-session').SessionData>): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function regenerateSession(session: import('express-session').Session & Partial<import('express-session').SessionData>): Promise<void> {
  return new Promise((resolve, reject) => {
    session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sanitizeAttendeeData<T extends Record<string, string | undefined | null>>(data: T): T {
  const fieldsToSanitize = ['firstName', 'lastName', 'email', 'company', 'title', 'phone'] as const;
  const sanitized = { ...data };
  for (const field of fieldsToSanitize) {
    if (typeof sanitized[field] === 'string') {
      (sanitized as Record<string, string | undefined | null>)[field] = sanitizeHtml(sanitized[field] as string);
    }
  }
  return sanitized;
}

// Audit logging helper for tracking integration/webhook settings changes
async function logSettingsAudit(req: Request, options: {
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  customerId?: string;
  customerName?: string;
  oldValues: Record<string, any>;
  newValues: Record<string, any>;
}) {
  try {
    const user = req.dbUser;
    if (!user) return;

    const changedFields: Array<{ field: string; oldValue: any; newValue: any }> = [];
    for (const key of Object.keys(options.newValues)) {
      const oldVal = options.oldValues[key];
      const newVal = options.newValues[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields.push({ field: key, oldValue: oldVal, newValue: newVal });
      }
    }

    if (changedFields.length === 0) return;

    await storage.createAuditLog({
      userId: user.id,
      userEmail: user.email || "unknown",
      userRole: user.role,
      customerId: options.customerId || null,
      customerName: options.customerName || null,
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      resourceName: options.resourceName || null,
      changedFields,
      metadata: null,
      ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to log audit entry");
  }
}

// Temp Staff Utilities
function hashPasscode(passcode: string): string {
  return createHash('sha256').update(passcode).digest('hex');
}

function verifyPasscode(passcode: string, hash: string): boolean {
  const inputHash = Buffer.from(hashPasscode(passcode), 'hex');
  const storedHash = Buffer.from(hash, 'hex');
  if (inputHash.length !== storedHash.length) return false;
  return timingSafeEqual(inputHash, storedHash);
}

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

// Extended request type for temp staff auth
interface StaffRequest extends Request {
  staffSession?: StaffSession;
  staffEvent?: Event;
}

// Middleware to validate temp staff session token
async function staffAuth(req: StaffRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  
  const token = authHeader.substring(7);
  const session = await storage.getStaffSessionByToken(token);
  
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session token" });
  }
  
  // Check if session is still active and not expired
  if (!session.isActive || new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({ error: "Session has expired" });
  }
  
  // Get the event and verify temp staff access is still valid
  const event = await storage.getEvent(session.eventId);
  if (!event || !event.tempStaffSettings?.enabled) {
    return res.status(403).json({ error: "Temp staff access is no longer enabled for this event" });
  }
  
  // Block access to unconfigured events
  if (event.configStatus === 'unconfigured') {
    return res.status(403).json({ 
      error: "This event has not been configured for check-in yet",
      code: "EVENT_NOT_CONFIGURED"
    });
  }
  
  // Check time window - only enforce if times are set
  const now = new Date();
  const settings = event.tempStaffSettings;
  
  if (settings.startTime) {
    const startTime = new Date(settings.startTime);
    if (now < startTime) {
      return res.status(403).json({ error: "Temp staff access has not started yet" });
    }
  }
  
  if (settings.endTime) {
    const endTime = new Date(settings.endTime);
    if (now > endTime) {
      return res.status(403).json({ error: "Temp staff access has ended" });
    }
  }
  
  req.staffSession = session;
  req.staffEvent = event;
  next();
}

// Strict schema for user updates - only allow specific fields
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone must be in E.164 format (e.g., +15551234567)").optional().nullable(),
  role: z.enum(userRoles).optional(),
  customerId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sendInviteSMS: z.boolean().optional(), // Ignored for updates, but allowed from form
}).strict(); // Reject unknown fields

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Register health check routes (no auth required)
  app.use(healthRoutes);
  
  // Apply authentication middleware to all routes
  app.use(authMiddleware);
  
  // Register object storage routes (after authMiddleware so req.dbUser is populated)
  if (process.env.REPL_ID) {
    registerObjectStorageRoutes(app);
  } else {
    registerLocalStorageRoutes(app);
  }
  
  // Register report routes (must be after authMiddleware so req.dbUser is populated)
  registerReportRoutes(app);
  
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
      
      res.json({
        user: { id, email, firstName, lastName, role, customerId, isActive },
        customer: customer ? { id: customer.id, name: customer.name } : null,
        isSuperAdmin: role === "super_admin",
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
          // Inside a customer account - show only that customer's users
          const users = await storage.getUsersByCustomer(customerId);
          res.json(users);
        } else {
          // Root level - only show super admin users (no customer assignment)
          const allUsers = await storage.getAllUsers();
          const superAdminUsers = allUsers.filter(u => u.role === 'super_admin');
          res.json(superAdminUsers);
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
      
      if (!isSuperAdmin(req.dbUser) && user.customerId !== req.dbUser?.customerId) {
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
      if (!isSuperAdmin(req.dbUser)) {
        if (userData.customerId && userData.customerId !== req.dbUser?.customerId) {
          return res.status(403).json({ error: "Cannot create users in other customers" });
        }
        userData.customerId = req.dbUser?.customerId;
      }
      
      // Super admin validation
      if (userData.role === "super_admin" && userData.customerId) {
        return res.status(400).json({ error: "Super admins cannot be assigned to a customer" });
      }
      
      // Non-super_admin must have customerId
      if (userData.role !== "super_admin" && !userData.customerId) {
        return res.status(400).json({ error: "Non-super admin users must be assigned to a customer" });
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
      
      // Non-super admin can only send invites to users in their customer
      if (!isSuperAdmin(req.dbUser) && user.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot send invites to users in other customers" });
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
      
      // Non-super admin can only update users in their customer
      if (!isSuperAdmin(req.dbUser) && targetUser.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Cannot update users in other customers" });
      }
      
      // Non-super admin cannot update super admin users
      if (!isSuperAdmin(req.dbUser) && targetUser.role === "super_admin") {
        return res.status(403).json({ error: "Cannot update super admin users" });
      }
      
      // SECURITY: Non-super admin cannot assign super_admin role to anyone
      if (!isSuperAdmin(req.dbUser) && updates.role === "super_admin") {
        return res.status(403).json({ error: "Only super admins can assign super_admin role" });
      }
      
      // Role validation using canAssignRole
      if (updates.role !== undefined && !canAssignRole(req.dbUser, updates.role)) {
        return res.status(403).json({ error: "Cannot assign this role" });
      }
      
      // Calculate effective new values
      const newRole = updates.role ?? targetUser.role;
      const newCustomerId = updates.customerId !== undefined ? updates.customerId : targetUser.customerId;
      
      // Super admins cannot have a customerId
      if (newRole === "super_admin" && newCustomerId) {
        return res.status(400).json({ error: "Super admins cannot be assigned to a customer" });
      }
      
      // Non-super_admin must have customerId
      if (newRole !== "super_admin" && !newCustomerId) {
        return res.status(400).json({ error: "Non-super admin users must be assigned to a customer" });
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
      
      // Non-super-admins can only access their own customer
      if (!isSuperAdmin(req.dbUser) && req.dbUser?.customerId !== customer.id) {
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

  // ===== Kiosk Public Endpoints (PIN-protected) =====

  const kioskPinAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
  const KIOSK_PIN_MAX_ATTEMPTS = penTestMode ? 500 : 5;
  const KIOSK_PIN_WINDOW_MS = 15 * 60 * 1000;
  const KIOSK_PIN_LOCKOUT_MS = 30 * 60 * 1000;

  function checkKioskPinRateLimit(eventId: string, ip: string): { allowed: boolean; retryAfterMs?: number } {
    const key = `${eventId}:${ip}`;
    const now = Date.now();
    const record = kioskPinAttempts.get(key);

    if (record?.lockedUntil && now < record.lockedUntil) {
      return { allowed: false, retryAfterMs: record.lockedUntil - now };
    }

    if (!record || now - record.firstAttempt > KIOSK_PIN_WINDOW_MS) {
      kioskPinAttempts.set(key, { count: 1, firstAttempt: now });
      return { allowed: true };
    }

    if (record.count >= KIOSK_PIN_MAX_ATTEMPTS) {
      record.lockedUntil = now + KIOSK_PIN_LOCKOUT_MS;
      return { allowed: false, retryAfterMs: KIOSK_PIN_LOCKOUT_MS };
    }

    record.count++;
    return { allowed: true };
  }

  function validateKioskPin(eventPin: string | null, providedPin: string, eventId: string, ip: string, res: any): boolean {
    const rateCheck = checkKioskPinRateLimit(eventId, ip);
    if (!rateCheck.allowed) {
      res.status(429).json({ error: "Too many attempts. Please try again later." });
      return false;
    }

    if (!eventPin || eventPin !== providedPin) {
      res.status(403).json({ error: "Invalid kiosk PIN" });
      return false;
    }

    const key = `${eventId}:${ip}`;
    kioskPinAttempts.delete(key);
    return true;
  }

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
      const hasPin = !!(event.tempStaffSettings as any)?.kioskPin;
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

      if (attendee.checkedIn) {
        return res.json({
          success: true,
          alreadyCheckedIn: true,
          attendee: {
            id: attendee.id, firstName: attendee.firstName, lastName: attendee.lastName,
            email: attendee.email, company: attendee.company, title: attendee.title,
            participantType: attendee.participantType, checkedIn: attendee.checkedIn,
            checkedInAt: attendee.checkedInAt, badgePrinted: attendee.badgePrinted,
            externalId: attendee.externalId,
          },
        });
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
      const eventSelectedStatuses = (event.syncSettings as any)?.selectedStatuses || null;

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
        
        const manualStatusesOk = !!(event.syncSettings as any)?.statusesConfigured;
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
        const currentSyncSettings = (event.syncSettings as any) || {};
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
  // Integration Connection Routes (OAuth2 and API Key management)
  // =====================

  // Get connection status for an integration
  app.get("/api/integrations/:integrationId/connection", requireAuth, async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.json({ 
          integrationId,
          connectionStatus: "not_configured",
          authMethod: integration.authType
        });
      }

      res.json({
        id: connection.id,
        integrationId: connection.integrationId,
        authMethod: connection.authMethod,
        connectionStatus: connection.connectionStatus,
        grantedScopes: connection.grantedScopes,
        lastValidatedAt: connection.lastValidatedAt,
        lastSuccessfulCallAt: connection.lastSuccessfulCallAt,
        consecutiveFailures: connection.consecutiveFailures,
        lastErrorMessage: connection.lastErrorMessage,
        connectedAt: connection.connectedAt,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching connection status");
      res.status(500).json({ error: "Failed to fetch connection status" });
    }
  });

  // Start OAuth2 authorization flow
  app.post("/api/integrations/:integrationId/oauth/start", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const { redirectUri } = req.body;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const provider = await storage.getIntegrationProvider(integration.providerId);
      if (!provider || !provider.oauth2Config) {
        return res.status(400).json({ error: "Provider does not support OAuth2" });
      }

      const state = generateState();
      const codeVerifier = generatePKCEVerifier();
      const codeChallenge = generatePKCEChallenge(codeVerifier);

      let connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (connection) {
        await storage.updateIntegrationConnection(connection.id, {
          oauth2State: state,
          pkceCodeVerifier: codeVerifier,
          connectionStatus: "connecting",
        });
      } else {
        connection = await storage.createIntegrationConnection({
          integrationId,
          authMethod: "oauth2",
          connectionStatus: "connecting",
          oauth2State: state,
          pkceCodeVerifier: codeVerifier,
        });
      }

      const oauth2Config = provider.oauth2Config;
      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      
      const authUrl = await buildAuthorizationUrl(
        {
          clientId,
          authorizationUrl: oauth2Config.authorizationUrl!,
          tokenUrl: oauth2Config.tokenUrl!,
          scope: oauth2Config.scope,
          redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/api/integrations/oauth/callback`,
        },
        state,
        codeChallenge
      );

      res.json({ 
        authorizationUrl: authUrl,
        state,
        connectionId: connection.id
      });
    } catch (error) {
      logger.error({ err: error }, "Error starting OAuth flow");
      res.status(500).json({ error: "Failed to start OAuth authorization" });
    }
  });

  // OAuth2 callback handler
  app.get("/api/integrations/oauth/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError, error_description } = req.query;

      if (oauthError) {
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>${oauthError}: ${error_description || 'Unknown error'}</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: '${oauthError}' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      if (!code || !state) {
        return res.status(400).json({ error: "Missing code or state parameter" });
      }

      const customers = await storage.getCustomers();
      let match: { connection: any; integration: any; provider: any } | null = null;

      for (const customer of customers) {
        if (match) break;
        const integrations = await storage.getCustomerIntegrations(customer.id);
        for (const integration of integrations) {
          const conn = await storage.getIntegrationConnectionByIntegration(integration.id);
          if (conn && conn.oauth2State === state) {
            const provider = await storage.getIntegrationProvider(integration.providerId);
            if (provider) {
              match = { connection: conn, integration, provider };
              break;
            }
          }
        }
      }

      if (!match) {
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>Invalid or expired state parameter</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: 'invalid_state' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      const { connection, integration, provider } = match;
      
      if (!provider.oauth2Config) {
        return res.status(400).json({ error: "Provider OAuth2 config not found" });
      }

      if (!connection.pkceCodeVerifier) {
        logger.error({ err: connection.id }, "PKCE code verifier not found for connection");
        return res.status(400).send(`
          <html><body>
            <h1>Authorization Failed</h1>
            <p>PKCE verification failed - missing code verifier</p>
            <script>window.opener?.postMessage({ type: 'oauth_error', error: 'pkce_error' }, '*'); window.close();</script>
          </body></html>
        `);
      }

      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      const clientSecret = process.env[`${integration.providerId.toUpperCase()}_CLIENT_SECRET`] || "";
      const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/oauth/callback`;

      const tokens = await exchangeCodeForTokens(
        {
          clientId,
          clientSecret,
          authorizationUrl: provider.oauth2Config.authorizationUrl!,
          tokenUrl: provider.oauth2Config.tokenUrl!,
          redirectUri,
        },
        code as string,
        connection.pkceCodeVerifier
      );

      const accessTokenEncrypted = encryptCredential(tokens.access_token);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType: "access_token",
        encryptedValue: accessTokenEncrypted.encryptedValue,
        encryptionKeyId: accessTokenEncrypted.encryptionKeyId,
        iv: accessTokenEncrypted.iv,
        authTag: accessTokenEncrypted.authTag,
        maskedValue: maskCredential(tokens.access_token),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null,
      });

      if (tokens.refresh_token) {
        const refreshTokenEncrypted = encryptCredential(tokens.refresh_token);
        await storage.createStoredCredential({
          connectionId: connection.id,
          credentialType: "refresh_token",
          encryptedValue: refreshTokenEncrypted.encryptedValue,
          encryptionKeyId: refreshTokenEncrypted.encryptionKeyId,
          iv: refreshTokenEncrypted.iv,
          authTag: refreshTokenEncrypted.authTag,
          maskedValue: maskCredential(tokens.refresh_token),
        });
      }

      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "connected",
        oauth2State: null,
        pkceCodeVerifier: null,
        grantedScopes: tokens.scope ? tokens.scope.split(" ") : null,
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
      });

      res.send(`
        <html><body>
          <h1>Authorization Successful</h1>
          <p>You can close this window.</p>
          <script>window.opener?.postMessage({ type: 'oauth_success', integrationId: '${integration.id}' }, '*'); window.close();</script>
        </body></html>
      `);
    } catch (error) {
      logger.error({ err: error }, "Error in OAuth callback");
      res.status(500).send(`
        <html><body>
          <h1>Authorization Failed</h1>
          <p>An error occurred during authorization</p>
          <script>window.opener?.postMessage({ type: 'oauth_error', error: 'server_error' }, '*'); window.close();</script>
        </body></html>
      `);
    }
  });

  // Submit API key/token credentials
  app.post("/api/integrations/:integrationId/credentials", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const { credentialType, value } = req.body;

      if (!value || !credentialType) {
        return res.status(400).json({ error: "credentialType and value are required" });
      }

      if (!["api_key", "bearer_token", "client_secret", "password", "basic_username", "basic_password"].includes(credentialType)) {
        return res.status(400).json({ error: "Invalid credential type" });
      }

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      let connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        let authMethod: "api_key" | "bearer_token" | "basic" = "bearer_token";
        if (credentialType === "api_key") authMethod = "api_key";
        else if (credentialType === "basic_username" || credentialType === "basic_password") authMethod = "basic";
        
        connection = await storage.createIntegrationConnection({
          integrationId,
          authMethod,
          connectionStatus: "connecting",
        });
      }

      const existingCredential = await storage.getStoredCredentialByType(connection.id, credentialType);
      if (existingCredential) {
        await storage.updateStoredCredential(existingCredential.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "replaced",
        });
      }

      const encrypted = encryptCredential(value);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType,
        encryptedValue: encrypted.encryptedValue,
        encryptionKeyId: encrypted.encryptionKeyId,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        maskedValue: maskCredential(value),
      });

      // Mark as pending_validation - user must test connection to verify credentials work
      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "pending_validation",
      });

      res.json({ 
        success: true, 
        connectionId: connection.id,
        maskedValue: maskCredential(value),
        message: "Credentials saved. Please test the connection to verify they work."
      });
    } catch (error) {
      logger.error({ err: error }, "Error storing credentials");
      res.status(500).json({ error: "Failed to store credentials" });
    }
  });

  // Copy credentials from another integration (reuse same credentials with different account code)
  app.post("/api/integrations/:integrationId/copy-credentials", requireAuth, async (req, res) => {
    try {
      const targetIntegrationId = req.params.integrationId;
      const { sourceIntegrationId } = req.body;

      if (!sourceIntegrationId) {
        return res.status(400).json({ error: "sourceIntegrationId is required" });
      }

      // Get both integrations
      const targetIntegration = await storage.getCustomerIntegration(targetIntegrationId);
      const sourceIntegration = await storage.getCustomerIntegration(sourceIntegrationId);

      if (!targetIntegration) {
        return res.status(404).json({ error: "Target integration not found" });
      }
      if (!sourceIntegration) {
        return res.status(404).json({ error: "Source integration not found" });
      }

      // Verify same customer owns both integrations
      if (targetIntegration.customerId !== sourceIntegration.customerId) {
        return res.status(403).json({ error: "Cannot copy credentials between different customers" });
      }

      // Get source connection and credentials
      const sourceConnection = await storage.getIntegrationConnectionByIntegration(sourceIntegrationId);
      if (!sourceConnection) {
        return res.status(400).json({ error: "Source integration has no connection" });
      }

      const sourceCredentials = await storage.getStoredCredentials(sourceConnection.id);
      if (!sourceCredentials || sourceCredentials.length === 0) {
        return res.status(400).json({ error: "Source integration has no credentials to copy" });
      }

      // Create or get target connection
      let targetConnection = await storage.getIntegrationConnectionByIntegration(targetIntegrationId);
      if (!targetConnection) {
        targetConnection = await storage.createIntegrationConnection({
          integrationId: targetIntegrationId,
          authMethod: sourceConnection.authMethod,
          connectionStatus: "connecting",
        });
      }

      // Copy each credential
      let copiedCount = 0;
      for (const credential of sourceCredentials) {
        if (!credential.isValid) continue;

        // Check if target already has this credential type
        const existing = await storage.getStoredCredentialByType(targetConnection.id, credential.credentialType);
        if (existing) {
          await storage.updateStoredCredential(existing.id, {
            isValid: false,
            invalidatedAt: new Date(),
            invalidationReason: "replaced",
          });
        }

        // Copy the encrypted credential directly (same encryption, just new connection)
        await storage.createStoredCredential({
          connectionId: targetConnection.id,
          credentialType: credential.credentialType,
          encryptedValue: credential.encryptedValue,
          encryptionKeyId: credential.encryptionKeyId,
          iv: credential.iv,
          authTag: credential.authTag,
          maskedValue: credential.maskedValue,
        });
        copiedCount++;
      }

      // Mark target as pending validation
      await storage.updateIntegrationConnection(targetConnection.id, {
        connectionStatus: "pending_validation",
        authMethod: sourceConnection.authMethod,
      });

      res.json({ 
        success: true, 
        copiedCount,
        message: `Copied ${copiedCount} credential(s). Please test the connection to verify they work with the new account code.`
      });
    } catch (error) {
      logger.error({ err: error }, "Error copying credentials");
      res.status(500).json({ error: "Failed to copy credentials" });
    }
  });

  // Disconnect integration
  app.post("/api/integrations/:integrationId/disconnect", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.json({ success: true, message: "No connection found" });
      }

      await storage.deleteStoredCredentialsByConnection(connection.id);

      await storage.updateIntegrationConnection(connection.id, {
        connectionStatus: "disconnected",
        disconnectedAt: new Date(),
        grantedScopes: null,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error disconnecting integration");
      res.status(500).json({ error: "Failed to disconnect integration" });
    }
  });

  // Validate connection (test API call)
  app.post("/api/integrations/:integrationId/validate", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ error: "Integration not connected" });
      }

      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      if (!accessToken && !apiKey && !bearerToken && !hasBasicAuth) {
        return res.status(400).json({ error: "No credentials found" });
      }

      await storage.updateIntegrationConnection(connection.id, {
        lastValidatedAt: new Date(),
        lastSuccessfulCallAt: new Date(),
        consecutiveFailures: 0,
      });

      res.json({ 
        valid: true, 
        lastValidatedAt: new Date().toISOString(),
        hasAccessToken: !!accessToken,
        hasApiKey: !!apiKey,
        hasBearerToken: !!bearerToken,
        hasBasicAuth: hasBasicAuth,
        tokenExpiry: accessToken?.expiresAt
      });
    } catch (error) {
      logger.error({ err: error }, "Error validating connection");
      res.status(500).json({ error: "Failed to validate connection" });
    }
  });

  // Test connection with actual API call to testEndpointPath
  app.post("/api/integrations/:integrationId/test-connection", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ 
          success: false, 
          message: "Integration not found",
          latencyMs: Date.now() - startTime 
        });
      }

      // Check if test endpoint is configured
      if (!integration.testEndpointPath) {
        return res.status(400).json({ 
          success: false, 
          message: "No test endpoint configured. Please set a test endpoint path in the integration settings.",
          latencyMs: Date.now() - startTime 
        });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.status(400).json({ 
          success: false, 
          message: "No connection found. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials - check all possible types
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build the test URL - handle case where full URL is entered in path field
      let testEndpointPath = integration.testEndpointPath;
      try {
        const pathUrl = new URL(testEndpointPath);
        // If it parsed as a URL, extract just the pathname
        testEndpointPath = pathUrl.pathname + pathUrl.search;
        logger.info(`Extracted path from full URL: ${testEndpointPath}`);
      } catch {
        // Not a full URL, use as-is
      }
      
      // Substitute {accountCode} or {{accountCode}} variable if present
      if (integration.accountCode) {
        testEndpointPath = testEndpointPath.replace(/\{\{accountCode\}\}/g, integration.accountCode);
        testEndpointPath = testEndpointPath.replace(/\{accountCode\}/g, integration.accountCode);
      }
      
      const testUrl = `${integration.baseUrl.replace(/\/$/, '')}${testEndpointPath.startsWith('/') ? '' : '/'}${testEndpointPath}`;
      logger.info(`Testing URL: ${testUrl}`);

      // Build headers with auth
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        headers['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Make the test request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(testUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          // Update connection status on success and clear any previous error
          await storage.updateIntegrationConnection(connection.id, {
            lastValidatedAt: new Date(),
            lastSuccessfulCallAt: new Date(),
            consecutiveFailures: 0,
            connectionStatus: "connected",
            lastErrorMessage: null,
            lastErrorAt: null,
          });

          return res.json({
            success: true,
            statusCode: response.status,
            message: `Connection successful! API responded with status ${response.status}`,
            latencyMs,
          });
        } else {
          // Map error codes to user-friendly messages
          let message = `API returned status ${response.status}`;
          if (response.status === 401) {
            message = "Authentication failed. Please check your credentials.";
          } else if (response.status === 403) {
            message = "Access denied. Your credentials may not have sufficient permissions.";
          } else if (response.status === 404) {
            message = "Test endpoint not found. Please verify the test endpoint path.";
          } else if (response.status >= 500) {
            message = "The external API is experiencing issues. Please try again later.";
          }

          await storage.updateIntegrationConnection(connection.id, {
            consecutiveFailures: (connection.consecutiveFailures || 0) + 1,
            lastErrorMessage: message,
            lastErrorAt: new Date(),
          });

          return res.json({
            success: false,
            statusCode: response.status,
            message,
            latencyMs,
          });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        let message = "Failed to connect to the API";
        if (fetchError.name === 'AbortError') {
          message = "Request timed out after 30 seconds";
        } else if (fetchError.code === 'ENOTFOUND') {
          message = "Could not resolve host. Please check the base URL.";
        } else if (fetchError.code === 'ECONNREFUSED') {
          message = "Connection refused. The API server may be down.";
        }

        return res.json({
          success: false,
          message,
          latencyMs,
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Error testing connection");
      res.status(500).json({ 
        success: false, 
        message: "Failed to test connection",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // Discover events from external platform (Certain only)
  app.post("/api/integrations/:integrationId/discover-events", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ 
          success: false, 
          message: "Integration not found",
          latencyMs: Date.now() - startTime 
        });
      }

      // Only allow for Certain integrations
      if (!integration.providerId.startsWith('certain')) {
        return res.status(400).json({ 
          success: false, 
          message: "Event discovery is only available for Certain platform integrations",
          latencyMs: Date.now() - startTime 
        });
      }

      // Check if event list endpoint is configured
      if (!integration.eventListEndpointPath) {
        return res.status(400).json({ 
          success: false, 
          message: "No event list endpoint configured. Please set an event list endpoint path in the integration settings.",
          latencyMs: Date.now() - startTime 
        });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ 
          success: false, 
          message: "Integration not connected. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials and build auth headers
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Import and call the sync orchestrator
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      
      const result = await syncOrchestrator.discoverEvents({
        integration,
        authHeaders,
      });

      const latencyMs = Date.now() - startTime;

      const parts = [`Discovered ${result.processedCount} events`];
      if (result.filteredOutCount > 0) parts.push(`${result.filteredOutCount} filtered out (no "checkmate" tag)`);
      parts.push(`Created ${result.createdCount} new, updated ${result.skippedCount} existing`);
      if (result.removedCount > 0) parts.push(`removed ${result.removedCount} untagged`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);

      res.json({
        success: result.success,
        message: parts.join('. ') + '.',
        processedCount: result.processedCount,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        removedCount: result.removedCount,
        filteredOutCount: result.filteredOutCount,
        errors: result.errors.length > 0 ? result.errors.map(e => e.error) : undefined,
        latencyMs,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error discovering events");
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to discover events",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // Full initial sync - runs events, attendees, sessions, and session registrations in sequence
  app.post("/api/integrations/:integrationId/initial-sync", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const integrationId = req.params.integrationId;
      const { delayBetweenStepsMs = 3000 } = req.body;

      // Get the integration
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ success: false, message: "Integration not found" });
      }

      // Get connection and credentials
      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ 
          success: false, 
          message: "Integration not connected. Please connect credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Get credentials and build auth headers (same pattern as discover-events)
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        return res.status(400).json({ 
          success: false, 
          message: "No credentials found. Please configure credentials first.",
          latencyMs: Date.now() - startTime 
        });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};

      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Import and run the sequential sync
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      
      const result = await syncOrchestrator.runSequentialSync({
        integration,
        customerId: integration.customerId,
        authHeaders,
        delayBetweenStepsMs,
      });

      // Mark initial sync as completed on success
      if (result.success) {
        await storage.updateCustomerIntegration(integrationId, {
          initialSyncCompletedAt: new Date(),
          lastSync: new Date(),
        });
      }

      const latencyMs = Date.now() - startTime;
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Initial sync complete. Total records: ${result.totalRecords}` 
          : 'Initial sync completed with some errors',
        steps: result.steps,
        totalRecords: result.totalRecords,
        durationMs: result.durationMs,
        latencyMs,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error during initial sync");
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to run initial sync",
        latencyMs: Date.now() - startTime 
      });
    }
  });

  // =====================
  // Event Sync State Routes
  // =====================

  // Get sync states for an event
  app.get("/api/events/:eventId/sync-states", requireAuth, async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const syncStates = await storage.getEventSyncStates(eventId);
      res.json(syncStates);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sync states");
      res.status(500).json({ error: "Failed to fetch sync states" });
    }
  });

  // Initialize sync states for an event (creates states for attendees, sessions, session_registrations)
  app.post("/api/events/:eventId/sync-states/initialize", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const eventId = req.params.eventId;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (!event.integrationId) {
        return res.status(400).json({ error: "Event has no integration configured" });
      }

      const integration = await storage.getCustomerIntegration(event.integrationId);
      if (!integration) {
        return res.status(400).json({ error: "Integration not found" });
      }

      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      const dataTypes = ['attendees', 'sessions', 'session_registrations'];
      const createdStates = [];

      for (const dataType of dataTypes) {
        const existing = await storage.getEventSyncState(eventId, dataType);
        const syncTemplates = integration.syncTemplates as any;
        const templateKey = dataType === 'session_registrations' ? 'sessionRegistrations' : dataType;
        const template = syncTemplates?.[templateKey];
        
        let resolvedEndpoint: string | null = null;
        if (template?.endpointPath) {
          resolvedEndpoint = syncOrchestrator.buildResolvedEndpoint(
            template.endpointPath,
            { accountCode: event.accountCode, eventCode: event.eventCode }
          );
        }

        if (!existing) {
          const state = await storage.createEventSyncState({
            eventId,
            integrationId: integration.id,
            dataType,
            resolvedEndpoint,
            syncEnabled: true,
            syncStatus: 'pending',
          });
          createdStates.push(state);
        } else if (resolvedEndpoint && existing.resolvedEndpoint !== resolvedEndpoint) {
          await storage.updateEventSyncState(existing.id, { resolvedEndpoint });
          logger.info(`Updated ${dataType} endpoint: ${existing.resolvedEndpoint} → ${resolvedEndpoint}`);
        }
      }

      const allStates = await storage.getEventSyncStates(eventId);
      res.json({ 
        message: `Initialized ${createdStates.length} new sync states`,
        syncStates: allStates 
      });
    } catch (error) {
      logger.error({ err: error }, "Error initializing sync states");
      res.status(500).json({ error: "Failed to initialize sync states" });
    }
  });

  // Update sync state for a specific data type
  app.patch("/api/events/:eventId/sync-states/:dataType", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const { eventId, dataType } = req.params;
      const state = await storage.getEventSyncState(eventId, dataType);
      if (!state) {
        return res.status(404).json({ error: "Sync state not found" });
      }

      const updateSchema = z.object({
        syncEnabled: z.boolean().optional(),
        syncIntervalMinutes: z.number().min(1).optional(),
        resolvedEndpoint: z.string().optional(),
      });

      const updates = updateSchema.parse(req.body);
      const updated = await storage.updateEventSyncState(state.id, updates);
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating sync state");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update sync state" });
    }
  });

  // Trigger manual sync for a specific data type
  app.post("/api/events/:eventId/sync/:dataType", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    const startTime = Date.now();
    try {
      const { eventId, dataType } = req.params;
      
      if (!['attendees', 'sessions', 'session_registrations'].includes(dataType)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid data type. Must be one of: attendees, sessions, session_registrations" 
        });
      }

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found" });
      }

      const evtSyncSettings = event.syncSettings as { syncFrozen?: boolean } | null;
      if (evtSyncSettings?.syncFrozen) {
        return res.status(423).json({ success: false, message: "Inbound sync is frozen for this event. Unfreeze in event settings to sync." });
      }

      if (!event.integrationId) {
        return res.status(400).json({ success: false, message: "Event has no integration configured" });
      }

      const integration = await storage.getCustomerIntegration(event.integrationId);
      if (!integration) {
        return res.status(400).json({ success: false, message: "Integration not found" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integration.id);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ success: false, message: "Integration not connected" });
      }

      // Get or create sync state, always re-resolve endpoint from current integration templates
      const { syncOrchestrator: orchestrator } = await import("./services/sync-orchestrator");
      const syncTemplates = integration.syncTemplates as any;
      const templateKey = dataType === 'session_registrations' ? 'sessionRegistrations' : dataType;
      const template = syncTemplates?.[templateKey];
      
      let currentResolvedEndpoint: string | null = null;
      if (template?.endpointPath) {
        currentResolvedEndpoint = orchestrator.buildResolvedEndpoint(
          template.endpointPath,
          { accountCode: event.accountCode, eventCode: event.eventCode }
        );
      }

      let syncState = await storage.getEventSyncState(eventId, dataType);
      if (!syncState) {
        syncState = await storage.createEventSyncState({
          eventId,
          integrationId: integration.id,
          dataType,
          resolvedEndpoint: currentResolvedEndpoint,
          syncEnabled: true,
          syncStatus: 'pending',
        });
      } else if (currentResolvedEndpoint && syncState.resolvedEndpoint !== currentResolvedEndpoint) {
        await storage.updateEventSyncState(syncState.id, { resolvedEndpoint: currentResolvedEndpoint });
        logger.info(`Updated endpoint from integration: ${syncState.resolvedEndpoint} → ${currentResolvedEndpoint}`);
        syncState = { ...syncState, resolvedEndpoint: currentResolvedEndpoint };
      }

      if (!syncState.resolvedEndpoint) {
        return res.status(400).json({ 
          success: false, 
          message: `No endpoint configured for ${dataType}. Please configure sync templates in the integration settings.` 
        });
      }

      // Mark as syncing
      await storage.updateEventSyncState(syncState.id, { syncStatus: 'syncing' });

      // Get credentials and build auth headers
      const accessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      const apiKey = await storage.getStoredCredentialByType(connection.id, "api_key");
      const bearerToken = await storage.getStoredCredentialByType(connection.id, "bearer_token");
      const basicUsername = await storage.getStoredCredentialByType(connection.id, "basic_username");
      const basicPassword = await storage.getStoredCredentialByType(connection.id, "basic_password");
      
      const hasBasicAuth = basicUsername && basicPassword;
      const hasAnyCredential = accessToken || apiKey || bearerToken || hasBasicAuth;
      
      if (!hasAnyCredential) {
        await storage.updateEventSyncState(syncState.id, { 
          syncStatus: 'error', 
          lastErrorMessage: 'No credentials found' 
        });
        return res.status(400).json({ success: false, message: "No credentials found" });
      }

      // Build auth headers
      const authHeaders: Record<string, string> = {};
      if (accessToken) {
        const token = decryptCredential({
          encryptedValue: accessToken.encryptedValue,
          iv: accessToken.iv,
          authTag: accessToken.authTag,
          encryptionKeyId: accessToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (bearerToken) {
        const token = decryptCredential({
          encryptedValue: bearerToken.encryptedValue,
          iv: bearerToken.iv,
          authTag: bearerToken.authTag,
          encryptionKeyId: bearerToken.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${token}`;
      } else if (apiKey) {
        const key = decryptCredential({
          encryptedValue: apiKey.encryptedValue,
          iv: apiKey.iv,
          authTag: apiKey.authTag,
          encryptionKeyId: apiKey.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Bearer ${key}`;
      } else if (hasBasicAuth) {
        const username = decryptCredential({
          encryptedValue: basicUsername.encryptedValue,
          iv: basicUsername.iv,
          authTag: basicUsername.authTag,
          encryptionKeyId: basicUsername.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: basicPassword.encryptedValue,
          iv: basicPassword.iv,
          authTag: basicPassword.authTag,
          encryptionKeyId: basicPassword.encryptionKeyId,
        });
        authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      // Build the full URL with lastSyncTimestamp substituted at sync time
      const { syncOrchestrator: orchestratorForUrl } = await import("./services/sync-orchestrator");
      const baseUrl = integration.baseUrl.replace(/\/$/, '');
      
      // We've already verified resolvedEndpoint is not null above
      const resolvedEndpoint = syncState.resolvedEndpoint!;
      
      // Check if this endpoint requires per-attendee iteration
      const requiresAttendeeIteration = orchestratorForUrl.templateRequiresAttendeeIteration(
        resolvedEndpoint
      );
      
      let records: any[] = [];
      let latencyMs = 0;
      let apiCallCount = 0;
      let errorCount = 0;
      let lastError: string | null = null;
      
      if (requiresAttendeeIteration) {
        // Fetch all attendees for this event
        const attendees = await storage.getAttendees(eventId);
        const attendeesWithExternalId = attendees.filter(a => a.externalId);
        
        if (attendeesWithExternalId.length === 0) {
          await storage.updateEventSyncState(syncState.id, { 
            syncStatus: 'error', 
            lastErrorMessage: 'No attendees with external IDs found. Sync attendees first.',
            lastErrorAt: new Date(),
          });
          return res.json({
            success: false,
            message: 'No attendees with external IDs found. Please sync attendees first before syncing per-attendee data.',
            latencyMs: Date.now() - startTime,
          });
        }
        
        logger.info(`Per-attendee sync: processing ${attendeesWithExternalId.length} attendees`);
        
        // Make API call for each attendee
        for (const attendee of attendeesWithExternalId) {
          const attendeeEndpoint = orchestratorForUrl.prepareEndpointForAttendee(
            resolvedEndpoint,
            attendee.externalId
          );
          
          if (!attendeeEndpoint) continue;
          
          // Also substitute lastSyncTimestamp
          const finalEndpoint = orchestratorForUrl.prepareEndpointForSync(
            attendeeEndpoint,
            syncState.lastSyncTimestamp
          );
          
          let endpointPath = finalEndpoint;
          try {
            const pathUrl = new URL(finalEndpoint);
            endpointPath = pathUrl.pathname + pathUrl.search;
          } catch {
            // Not a full URL, use as-is
          }
          endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
          const url = `${baseUrl}${endpointPath}`;
          
          try {
            const callStart = Date.now();
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...authHeaders,
              },
            });
            latencyMs += Date.now() - callStart;
            apiCallCount++;
            
            if (!response.ok) {
              if (response.status === 404) {
                logger.info(`API returned 404 for attendee ${attendee.externalId} — treating as no data`);
                continue;
              }
              errorCount++;
              lastError = `API returned ${response.status} for attendee ${attendee.externalId}`;
              logger.warn(`Error for attendee ${attendee.externalId}: ${response.status}`);
              continue;
            }
            
            const data = await response.json();
            
            // Extract records from this response
            let attendeeRecords: any[] = [];
            if (Array.isArray(data)) {
              attendeeRecords = data;
            } else if (data.results && Array.isArray(data.results)) {
              attendeeRecords = data.results;
            } else if (data.data && Array.isArray(data.data)) {
              attendeeRecords = data.data;
            } else if (data.registrations && Array.isArray(data.registrations)) {
              attendeeRecords = data.registrations;
            } else if (data.sessions && Array.isArray(data.sessions)) {
              attendeeRecords = data.sessions;
            }
            
            // Tag each record with the attendee info for later processing
            attendeeRecords.forEach(r => {
              r._attendeeId = attendee.id;
              r._attendeeExternalId = attendee.externalId;
            });
            
            records.push(...attendeeRecords);
          } catch (err: any) {
            errorCount++;
            lastError = err.message;
            logger.error({ err: err.message }, `Failed for attendee ${attendee.externalId}`);
          }
        }
        
        logger.info(`Per-attendee sync complete: ${records.length} total records from ${apiCallCount} calls, ${errorCount} errors`);
        
        // Handle complete failure (all calls failed)
        if (apiCallCount > 0 && errorCount === apiCallCount) {
          await storage.updateEventSyncState(syncState.id, { 
            syncStatus: 'error', 
            lastErrorMessage: `All ${apiCallCount} per-attendee API calls failed. Last error: ${lastError}`,
            lastErrorAt: new Date(),
            consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
          });
          return res.json({
            success: false,
            message: `All ${apiCallCount} per-attendee API calls failed`,
            lastError,
            latencyMs,
          });
        }
        
      } else {
        // Standard single-endpoint sync
        const endpoint = orchestratorForUrl.prepareEndpointForSync(
          resolvedEndpoint,
          syncState.lastSyncTimestamp
        );

        let endpointPath = endpoint;
        try {
          const pathUrl = new URL(endpoint);
          endpointPath = pathUrl.pathname + pathUrl.search;
        } catch {
          // Not a full URL, use as-is
        }
        endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
        const url = `${baseUrl}${endpointPath}`;

        logger.info(`Syncing ${dataType} from: ${url}`);

        // Make the API call
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...authHeaders,
          },
        });

        latencyMs = Date.now() - startTime;
        apiCallCount = 1;

        if (!response.ok) {
          const errorText = await response.text();
          
          const errorLower = errorText.toLowerCase();
          const is404NoData = response.status === 404 && (
            errorLower.includes('no sessions') || 
            errorLower.includes('no registrations') || 
            errorLower.includes('no attendees') ||
            errorLower.includes('not_found') ||
            errorLower.includes('not found')
          );
          
          if (is404NoData) {
            logger.info(`API returned 404 (no data found) for ${dataType} — treating as empty result`);
            records = [];
          } else {
            await storage.updateEventSyncState(syncState.id, { 
              syncStatus: 'error', 
              lastErrorMessage: `API returned ${response.status}: ${errorText}`,
              lastErrorAt: new Date(),
              consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
            });
            return res.json({
              success: false,
              message: `API returned status ${response.status}`,
              latencyMs,
            });
          }
        }

        if (records.length === 0 && response.ok) {
          const data = await response.json();
        
          if (Array.isArray(data)) {
            records = data;
          } else if (data.results && Array.isArray(data.results)) {
            records = data.results;
          } else if (data.data && Array.isArray(data.data)) {
            records = data.data;
          } else if (data.attendees && Array.isArray(data.attendees)) {
            records = data.attendees;
          } else if (data.sessions && Array.isArray(data.sessions)) {
            records = data.sessions;
          } else if (data.registrations && Array.isArray(data.registrations)) {
            records = data.registrations;
          }
        }
      }

      // Process and save records to database based on data type
      const { syncOrchestrator } = await import("./services/sync-orchestrator");
      let createdCount = 0;
      let updatedCount = 0;
      let processErrorCount = 0;

      if (dataType === 'attendees' && records.length > 0) {
        logger.info(`Processing ${records.length} attendee records for event ${event.name}`);
        for (const rawAttendee of records) {
          try {
            // Transform using the same logic as SequentialSync
            const profile = rawAttendee.profile || {};
            const statusLabel = rawAttendee.registrationStatusLabel || '';
            const externalId = String(rawAttendee.registrationCode || rawAttendee.pkRegId || '');
            // orderCode links guests to primary attendee - matches primary's externalId
            // For primary attendees, orderCode equals their own externalId
            const orderCode = String(rawAttendee.orderCode || externalId);
            const attendeeData = {
              externalId,
              firstName: profile.firstName || rawAttendee.firstName || '',
              lastName: profile.lastName || rawAttendee.lastName || '',
              email: profile.email || rawAttendee.email || '',
              company: profile.organization || profile.company || null,
              title: profile.position || profile.title || null,
              participantType: rawAttendee.attendeeType || rawAttendee.attendeeTypeCode || 'General',
              registrationStatus: statusLabel || (rawAttendee.isActive ? 'Registered' : 'Invited'),
              registrationStatusLabel: statusLabel || null,
              orderCode,
            };

            if (!attendeeData.externalId) continue;

            const isAttended = (attendeeData.registrationStatus || '').toLowerCase() === 'attended';

            const existing = await storage.getAttendeeByExternalId(event.id, attendeeData.externalId);
            if (existing) {
              const updatePayload: any = {
                firstName: attendeeData.firstName,
                lastName: attendeeData.lastName,
                email: attendeeData.email,
                company: attendeeData.company,
                title: attendeeData.title,
                participantType: attendeeData.participantType,
                registrationStatus: attendeeData.registrationStatus,
                registrationStatusLabel: attendeeData.registrationStatusLabel,
                orderCode: attendeeData.orderCode,
              };
              if (existing.checkedIn) {
                updatePayload.registrationStatus = 'Attended';
                updatePayload.registrationStatusLabel = attendeeData.registrationStatusLabel || existing.registrationStatusLabel || null;
              } else if (isAttended) {
                updatePayload.checkedIn = true;
                updatePayload.checkedInAt = existing.checkedInAt || new Date();
              }
              await storage.updateAttendee(existing.id, updatePayload);
              updatedCount++;
            } else {
              const createPayload: any = {
                eventId: event.id,
                firstName: attendeeData.firstName,
                lastName: attendeeData.lastName,
                email: attendeeData.email,
                company: attendeeData.company,
                title: attendeeData.title,
                participantType: attendeeData.participantType,
                externalId: attendeeData.externalId,
                registrationStatus: attendeeData.registrationStatus,
                registrationStatusLabel: attendeeData.registrationStatusLabel,
                orderCode: attendeeData.orderCode,
              };
              if (isAttended) {
                createPayload.checkedIn = true;
                createPayload.checkedInAt = new Date();
              }
              await storage.createAttendee(createPayload);
              createdCount++;
            }
          } catch (e: any) {
            logger.warn({ err: e.message }, `Failed to process attendee`);
            processErrorCount++;
          }
        }
        logger.info(`Attendee processing complete: ${createdCount} created, ${updatedCount} updated, ${processErrorCount} errors`);
      }

      // Update sync state with result — format as yyyy/MM/dd HH:mm:ss for Certain API compatibility
      const now = new Date();
      const serverTimestamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
      const defaultSyncSettings = (integration.defaultSyncSettings as any) || {};
      const nextSyncAt = syncOrchestrator.calculateNextSyncTime(
        { startDate: event.startDate, endDate: event.endDate },
        defaultSyncSettings
      );
      
      // Determine final status based on error count
      const totalErrors = errorCount + processErrorCount;
      const hasPartialFailure = totalErrors > 0;
      const finalSyncStatus = hasPartialFailure ? 'partial' : 'success';
      
      await storage.updateEventSyncState(syncState.id, { 
        syncStatus: finalSyncStatus,
        lastSyncAt: new Date(),
        lastSyncTimestamp: hasPartialFailure ? syncState.lastSyncTimestamp : serverTimestamp,
        consecutiveFailures: hasPartialFailure ? (syncState.consecutiveFailures || 0) : 0,
        lastErrorMessage: hasPartialFailure ? `${totalErrors} errors during sync` : null,
        nextSyncAt,
        lastSyncResult: {
          processedCount: records.length,
          createdCount,
          updatedCount,
          errorCount: totalErrors,
          durationMs: Date.now() - startTime,
        },
      });

      let responseMessage: string;
      if (dataType === 'attendees' && (createdCount > 0 || updatedCount > 0)) {
        responseMessage = `Synced ${records.length} attendees: ${createdCount} created, ${updatedCount} updated${totalErrors > 0 ? `, ${totalErrors} errors` : ''}`;
      } else if (requiresAttendeeIteration) {
        responseMessage = `Synced ${records.length} ${dataType} records from ${apiCallCount} attendees${errorCount > 0 ? ` (${errorCount} errors)` : ''}`;
      } else {
        responseMessage = `Synced ${records.length} ${dataType} records`;
      }
      
      res.json({
        success: true,
        message: responseMessage,
        recordCount: records.length,
        createdCount,
        updatedCount,
        apiCallCount,
        errorCount: totalErrors,
        latencyMs: Date.now() - startTime,
      });
    } catch (error: any) {
      logger.error({ err: error }, `Error syncing ${req.params.dataType}`);
      try {
        const syncState = await storage.getEventSyncState(req.params.eventId, req.params.dataType);
        if (syncState) {
          await storage.updateEventSyncState(syncState.id, {
            syncStatus: 'error',
            lastErrorMessage: error.message || `Failed to sync ${req.params.dataType}`,
            lastErrorAt: new Date(),
            consecutiveFailures: (syncState.consecutiveFailures || 0) + 1,
          });
        }
      } catch (stateErr) {
        logger.error({ err: stateErr }, 'Failed to update sync state after error');
      }
      res.status(500).json({ 
        success: false, 
        message: error.message || `Failed to sync ${req.params.dataType}`,
        latencyMs: Date.now() - startTime,
      });
    }
  });

  // Bulk resync check-in statuses back to external platform
  app.post("/api/events/:eventId/resync-checkins", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const user = req.dbUser;
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      if (user.role !== 'super_admin' && user.customerId !== event.customerId) {
        return res.status(403).json({ error: "Not authorized to manage this event" });
      }

      const integration = await checkinSyncService.getIntegrationForEvent(event);
      if (!integration) {
        return res.status(400).json({ error: "No active integration found for this event" });
      }

      const config = integration.realtimeSyncConfig as any;
      if (!config?.enabled || !config?.endpointUrl) {
        return res.status(400).json({ error: "Realtime sync is not configured for this integration. Please configure the realtime sync settings first." });
      }

      const attendees = await storage.getAttendees(eventId);
      const checkedInAttendees = attendees.filter((a: any) => a.checkedIn && a.externalId);

      if (checkedInAttendees.length === 0) {
        return res.json({ success: true, message: "No checked-in attendees to resync", synced: 0, failed: 0, total: 0 });
      }

      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      const RATE_LIMIT_DELAY_MS = 200;

      for (const attendee of checkedInAttendees) {
        try {
          const result = await checkinSyncService.sendCheckinSync(attendee, event, integration);
          if (result.success) {
            synced++;
          } else {
            failed++;
            if (errors.length < 10) {
              errors.push(`${attendee.firstName} ${attendee.lastName} (${attendee.externalId}): ${result.error || 'Unknown error'}`);
            }
          }
          if (RATE_LIMIT_DELAY_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }
        } catch (err: any) {
          failed++;
          if (errors.length < 10) {
            errors.push(`${attendee.firstName} ${attendee.lastName}: ${err.message}`);
          }
        }
      }

      logger.info(`Event ${event.name}: ${synced} synced, ${failed} failed out of ${checkedInAttendees.length} checked-in attendees`);

      res.json({
        success: failed === 0,
        message: `Resynced ${synced} of ${checkedInAttendees.length} checked-in attendees${failed > 0 ? ` (${failed} failed)` : ''}`,
        synced,
        failed,
        total: checkedInAttendees.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error");
      res.status(500).json({ error: error.message || "Failed to resync check-ins" });
    }
  });

  // Reset all check-ins for an event (for testing/reset purposes)
  app.post("/api/events/:eventId/reset-checkins", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const user = req.dbUser;
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admins can reset event check-ins" });
      }

      const { db } = await import("./db");
      const schema = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const result = await db.update(schema.attendees)
        .set({
          checkedIn: false,
          checkedInAt: null,
          registrationStatus: 'Registered',
          badgePrinted: false,
          badgePrintedAt: null,
        })
        .where(
          and(
            eq(schema.attendees.eventId, eventId),
            eq(schema.attendees.checkedIn, true)
          )
        )
        .returning({ id: schema.attendees.id });

      const resetCount = result.length;
      logger.info(`Event ${event.name}: Reset ${resetCount} checked-in attendees`);

      res.json({
        success: true,
        message: `Reset ${resetCount} attendee${resetCount !== 1 ? 's' : ''} to Registered status`,
        resetCount,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error");
      res.status(500).json({ error: error.message || "Failed to reset check-ins" });
    }
  });

  // Update integration sync templates
  app.patch("/api/integrations/:integrationId/sync-templates", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const templateSchema = z.object({
        attendees: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
        sessions: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
        sessionRegistrations: z.object({
          endpointPath: z.string(),
          method: z.string().optional(),
          headers: z.record(z.string()).optional(),
          responseMapping: z.record(z.string()).optional(),
        }).optional(),
      });

      const syncTemplates = templateSchema.parse(req.body);
      const oldSyncTemplates = integration.syncTemplates;
      const updated = await storage.updateCustomerIntegration(integrationId, { syncTemplates });
      
      const customer = await storage.getCustomer(integration.customerId);
      logSettingsAudit(req, {
        action: 'sync_templates_update',
        resourceType: 'customer_integration',
        resourceId: integrationId,
        resourceName: integration.name,
        customerId: integration.customerId,
        customerName: customer?.name,
        oldValues: { syncTemplates: oldSyncTemplates },
        newValues: { syncTemplates },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating sync templates");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update sync templates" });
    }
  });

  // Update integration default sync settings
  app.patch("/api/integrations/:integrationId/default-sync-settings", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const settingsSchema = z.object({
        preEventIntervalMinutes: z.number().min(1).default(1440), // 24 hours
        duringEventIntervalMinutes: z.number().min(1).default(1), // 1 minute
        syncWindowStartOffset: z.number().optional(),
        syncWindowEndOffset: z.number().optional(),
      });

      const oldSyncSettings = integration.defaultSyncSettings;
      const defaultSyncSettings = settingsSchema.parse(req.body);
      const updated = await storage.updateCustomerIntegration(integrationId, { defaultSyncSettings });
      
      const customer = await storage.getCustomer(integration.customerId);
      logSettingsAudit(req, {
        action: 'sync_settings_update',
        resourceType: 'customer_integration',
        resourceId: integrationId,
        resourceName: integration.name,
        customerId: integration.customerId,
        customerName: customer?.name,
        oldValues: { defaultSyncSettings: oldSyncSettings },
        newValues: { defaultSyncSettings },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating default sync settings");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update default sync settings" });
    }
  });

  // Refresh OAuth2 token
  app.post("/api/integrations/:integrationId/refresh-token", requireAuth, requireRole(['super_admin', 'admin', 'manager']), async (req, res) => {
    try {
      const integrationId = req.params.integrationId;

      const integration = await storage.getCustomerIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }

      const provider = await storage.getIntegrationProvider(integration.providerId);
      if (!provider || !provider.oauth2Config) {
        return res.status(400).json({ error: "Provider does not support OAuth2" });
      }

      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        return res.status(400).json({ error: "No connection found" });
      }

      const refreshTokenCred = await storage.getStoredCredentialByType(connection.id, "refresh_token");
      if (!refreshTokenCred) {
        return res.status(400).json({ error: "No refresh token available" });
      }

      const refreshToken = decryptCredential({
        encryptedValue: refreshTokenCred.encryptedValue,
        iv: refreshTokenCred.iv,
        authTag: refreshTokenCred.authTag,
        encryptionKeyId: refreshTokenCred.encryptionKeyId,
      });

      const clientId = process.env[`${integration.providerId.toUpperCase()}_CLIENT_ID`] || "";
      const clientSecret = process.env[`${integration.providerId.toUpperCase()}_CLIENT_SECRET`] || "";

      const tokens = await refreshAccessToken(
        {
          clientId,
          clientSecret,
          authorizationUrl: provider.oauth2Config.authorizationUrl!,
          tokenUrl: provider.oauth2Config.tokenUrl!,
          redirectUri: "",
        },
        refreshToken
      );

      const existingAccessToken = await storage.getStoredCredentialByType(connection.id, "access_token");
      if (existingAccessToken) {
        await storage.updateStoredCredential(existingAccessToken.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "refreshed",
        });
      }

      const accessTokenEncrypted = encryptCredential(tokens.access_token);
      await storage.createStoredCredential({
        connectionId: connection.id,
        credentialType: "access_token",
        encryptedValue: accessTokenEncrypted.encryptedValue,
        encryptionKeyId: accessTokenEncrypted.encryptionKeyId,
        iv: accessTokenEncrypted.iv,
        authTag: accessTokenEncrypted.authTag,
        maskedValue: maskCredential(tokens.access_token),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null,
      });

      if (tokens.refresh_token) {
        await storage.updateStoredCredential(refreshTokenCred.id, {
          isValid: false,
          invalidatedAt: new Date(),
          invalidationReason: "rotated",
        });

        const newRefreshTokenEncrypted = encryptCredential(tokens.refresh_token);
        await storage.createStoredCredential({
          connectionId: connection.id,
          credentialType: "refresh_token",
          encryptedValue: newRefreshTokenEncrypted.encryptedValue,
          encryptionKeyId: newRefreshTokenEncrypted.encryptionKeyId,
          iv: newRefreshTokenEncrypted.iv,
          authTag: newRefreshTokenEncrypted.authTag,
          maskedValue: maskCredential(tokens.refresh_token),
        });
      }

      await storage.updateIntegrationConnection(connection.id, {
        lastValidatedAt: new Date(),
      });

      res.json({ 
        success: true, 
        expiresAt: tokens.expires_in ? calculateTokenExpiry(tokens.expires_in) : null
      });
    } catch (error) {
      logger.error({ err: error }, "Error refreshing token");
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

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

      const dbUser = (req as any).dbUser;
      if (!dbUser?.isSuperAdmin && event.customerId !== dbUser?.customerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const revertUpdates = {
        checkedIn: false,
        checkedInAt: null,
        registrationStatus: "Registered",
        badgePrinted: false,
        badgePrintedAt: null,
      };
      
      const updated = await storage.updateAttendee(req.params.id, revertUpdates as any);

      await storage.deleteAttendeeWorkflowResponses(req.params.id, attendee.eventId);
      await storage.deleteAttendeeSignaturesByAttendee(req.params.id, attendee.eventId);
      
      // Send real-time sync revert to external system (async, non-blocking)
      // Use void to explicitly indicate fire-and-forget pattern
      if (event && updated) {
        const integration = await checkinSyncService.getIntegrationForEvent(event);
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

  // =====================
  // Temp Staff Routes
  // =====================

  // Get event sync settings
  app.get("/api/events/:eventId/sync-settings", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (!isSuperAdmin(req.dbUser) && event.customerId !== req.dbUser?.customerId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const syncSettings = (event.syncSettings as any) || {};
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

      const existing = (event.syncSettings as any) || {};

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

      const syncSettings = (event.syncSettings as any) || {};
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

      const existing = (event.syncSettings as any) || {};
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
  app.get("/api/staff/session", staffAuth as any, async (req: StaffRequest, res) => {
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

  app.post("/api/staff/feedback", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/printers", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/printnode/printers", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/printnode/status", staffAuth as any, async (req: StaffRequest, res) => {
    try {
      const result = await printNodeService.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Print badge via PrintNode
  app.post("/api/staff/printnode/print", largeBodyParser, staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/printnode/test-print", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/logout", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/attendees", staffAuth as any, async (req: StaffRequest, res) => {
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
      })));
    } catch (error) {
      logger.error({ err: error }, "Error fetching attendees for temp staff");
      res.status(500).json({ error: "Failed to fetch attendees" });
    }
  });

  app.post("/api/staff/attendees", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/sessions", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/sessions/:sessionId/registrations", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/checkin", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/badge-printed", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/revert-checkin", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/network-print", largeBodyParser, staffAuth as any, async (req: StaffRequest, res) => {
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

  // Temp staff test printer connection
  app.post("/api/staff/test-printer", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.patch("/api/staff/attendees/:attendeeId", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/sessions/:sessionId/checkin", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.post("/api/staff/sessions/:sessionId/checkout", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/badge-templates", staffAuth as any, async (req: StaffRequest, res) => {
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
  app.get("/api/staff/attendees/:attendeeId/resolve-template", staffAuth as any, async (req: StaffRequest, res) => {
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

  // =====================
  // Event Workflow Configuration Routes
  // =====================

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
      const badgeFlipSetting = await storage.getSystemSetting("feature_badge_flip_preview");
      const betaFeedbackSetting = await storage.getSystemSetting("feature_beta_feedback");
      const kioskWalkinFlag = await storage.getFeatureFlagByKey("kiosk_walkin_registration");
      const groupCheckinFlag = await storage.getFeatureFlagByKey("group_checkin");
      res.json({
        badgeFlipPreview: badgeFlipSetting?.value === "true",
        betaFeedback: betaFeedbackSetting?.value === "true",
        penTestMode: process.env.PEN_TEST_MODE === "true",
        kioskWalkinRegistration: kioskWalkinFlag?.enabled ?? false,
        groupCheckin: groupCheckinFlag?.enabled ?? false,
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
            statusesConfigured: !!(event.syncSettings as any)?.statusesConfigured,
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
          category: def.category,
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
