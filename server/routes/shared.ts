import { createChildLogger } from '../logger';
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { userRoles, type StaffSession, type Event } from "@shared/schema";

const logger = createChildLogger('RouteUtils');

export const penTestMode = process.env.PEN_TEST_MODE === "true";

/**
 * Periodically sweep expired entries from rate limiter Maps to prevent memory leaks.
 * Call once per Map at module init. Runs every 15 minutes.
 */
export function startRateLimiterCleanup<T extends Record<string, any>>(
  map: Map<string, T>,
  isExpired: (entry: T, now: number) => boolean,
  intervalMs: number = 15 * 60 * 1000,
): void {
  const sweep = () => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of map) {
      if (isExpired(entry, now)) {
        map.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned, remaining: map.size }, "Rate limiter cleanup sweep");
    }
  };
  setInterval(sweep, intervalMs).unref();
}

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function validatePasswordComplexity(password: string): string | null {
  if (!password || password.length < 10) return "Password must be at least 10 characters";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null;
}

export function saveSession(session: import('express-session').Session & Partial<import('express-session').SessionData>): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function regenerateSession(session: import('express-session').Session & Partial<import('express-session').SessionData>): Promise<void> {
  return new Promise((resolve, reject) => {
    session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function sanitizeAttendeeData<T extends Record<string, string | undefined | null>>(data: T): T {
  const fieldsToSanitize = ['firstName', 'lastName', 'email', 'company', 'title', 'phone'] as const;
  const sanitized = { ...data };
  for (const field of fieldsToSanitize) {
    if (typeof sanitized[field] === 'string') {
      (sanitized as Record<string, string | undefined | null>)[field] = sanitizeHtml(sanitized[field] as string);
    }
  }
  return sanitized;
}

export async function logSettingsAudit(req: Request, options: {
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
export function hashPasscode(passcode: string): string {
  return createHash('sha256').update(passcode).digest('hex');
}

export function verifyPasscode(passcode: string, hash: string): boolean {
  const inputHash = Buffer.from(hashPasscode(passcode), 'hex');
  const storedHash = Buffer.from(hash, 'hex');
  if (inputHash.length !== storedHash.length) return false;
  return timingSafeEqual(inputHash, storedHash);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export interface StaffRequest extends Request {
  staffSession?: StaffSession;
  staffEvent?: Event;
}

export async function staffAuth(req: StaffRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7);
  const session = await storage.getStaffSessionByToken(token);

  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session token" });
  }

  if (!session.isActive || new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({ error: "Session has expired" });
  }

  const event = await storage.getEvent(session.eventId);
  if (!event || !event.tempStaffSettings?.enabled) {
    return res.status(403).json({ error: "Temp staff access is no longer enabled for this event" });
  }

  if (event.configStatus === 'unconfigured') {
    return res.status(403).json({
      error: "This event has not been configured for check-in yet",
      code: "EVENT_NOT_CONFIGURED"
    });
  }

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

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone must be in E.164 format (e.g., +15551234567)").optional().nullable(),
  role: z.enum(userRoles).optional(),
  customerId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sendInviteSMS: z.boolean().optional(),
}).strict();

// Kiosk PIN rate limiting
const kioskPinAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
const KIOSK_PIN_MAX_ATTEMPTS = penTestMode ? 500 : 5;
const KIOSK_PIN_WINDOW_MS = 15 * 60 * 1000;
const KIOSK_PIN_LOCKOUT_MS = 30 * 60 * 1000;

startRateLimiterCleanup(kioskPinAttempts, (entry, now) => {
  if (entry.lockedUntil && now > entry.lockedUntil) return true;
  return now - entry.firstAttempt > KIOSK_PIN_WINDOW_MS;
});

export function checkKioskPinRateLimit(eventId: string, ip: string): { allowed: boolean; retryAfterMs?: number } {
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

export function validateKioskPin(eventPin: string | null, providedPin: string, eventId: string, ip: string, res: any): boolean {
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
