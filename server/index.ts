import { createChildLogger } from './logger';
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./replitAuth";

const logger = createChildLogger('Server');

const app = express();

const isDev = process.env.NODE_ENV === "development";

const allowedOrigins: string[] = [];
if (process.env.REPLIT_DOMAINS) {
  for (const domain of process.env.REPLIT_DOMAINS.split(',')) {
    allowedOrigins.push(`https://${domain.trim()}`);
  }
}
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (isDev) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600,
}));

app.use(helmet({
  contentSecurityPolicy: isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );
  next();
});

const penTestMode = process.env.PEN_TEST_MODE === "true";
if (penTestMode) {
  logger.info("PEN_TEST_MODE enabled — rate limits relaxed for automated scanning");
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: penTestMode ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => req.path === "/health" || req.path === "/__health",
});
app.use("/api", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: penTestMode ? 500 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
  validate: { xForwardedForHeader: false },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/request-otp", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);

// Health check endpoints - respond immediately for deployment health checks
// These must be registered before any other middleware to ensure fast response
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.get('/__health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Track when the app is ready to serve requests
let appReady = false;
setTimeout(() => { appReady = true; }, 100);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
const printRoutes = ['/api/printnode/print', '/api/staff/printnode/print'];
app.use((req, res, next) => {
  if (printRoutes.some(route => req.path === route) && req.method === 'POST') {
    return next();
  }
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    }
  })(req, res, next);
});
app.use((req, res, next) => {
  if (printRoutes.some(route => req.path === route) && req.method === 'POST') {
    return next();
  }
  express.urlencoded({ extended: false, limit: '2mb' })(req, res, next);
});

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

const sensitivePathPrefixes = [
  '/api/auth/', '/api/login', '/api/callback', '/api/logout',
  '/api/credentials', '/api/oauth2',
];

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const isSensitive = sensitivePathPrefixes.some(p => path.startsWith(p));

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isSensitive) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await setupAuth(app);
  const server = await registerRoutes(app);

  app.use(async (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    const isJsonParseError = err.type === 'entity.parse.failed' || 
      (err instanceof SyntaxError && 'body' in err && status === 400);

    if (isJsonParseError) {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }

    try {
      const { storage } = await import("./storage");
      const user = _req.user as { id?: string; customerId?: string } | undefined;
      await storage.logError({
        errorType: 'API_ERROR',
        message: message,
        stack: err.stack,
        endpoint: _req.originalUrl || _req.url,
        method: _req.method,
        statusCode: status,
        userId: user?.id,
        customerId: user?.customerId,
        metadata: { body: _req.body, query: _req.query, params: _req.params },
        userAgent: _req.headers['user-agent'],
        ipAddress: _req.ip,
      });
    } catch (logError) {
      logger.error({ err: logError }, 'Failed to log error to database');
    }

    res.status(status).json({ message });
    logger.error({ err: err }, 'API Error');
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  const backgroundTimers: NodeJS.Timeout[] = [];

  async function aggregateBehaviorEvents() {
    try {
      const { db } = await import("./db");
      const { behaviorEvents, behaviorAggregates } = await import("@shared/schema");
      const { sql, and, gte, lt } = await import("drizzle-orm");

      const now = new Date();
      const dayStr = now.toISOString().slice(0, 10);
      const dayStart = new Date(dayStr + "T00:00:00Z");
      const dayEnd = new Date(dayStr + "T23:59:59.999Z");

      const rows = await db.select({
        feature: behaviorEvents.feature,
        step: behaviorEvents.step,
        customerId: behaviorEvents.customerId,
        eventId: behaviorEvents.eventId,
        starts: sql<number>`count(*) filter (where action = 'start')::int`,
        completions: sql<number>`count(*) filter (where action = 'complete')::int`,
        abandons: sql<number>`count(*) filter (where action = 'abandon')::int`,
        avgDurationMs: sql<number>`avg(duration_ms)::int`,
        uniqueRoles: sql<string[]>`array_agg(distinct user_role) filter (where user_role is not null)`,
      })
        .from(behaviorEvents)
        .where(and(gte(behaviorEvents.createdAt, dayStart), lt(behaviorEvents.createdAt, dayEnd)))
        .groupBy(behaviorEvents.feature, behaviorEvents.step, behaviorEvents.customerId, behaviorEvents.eventId);

      for (const row of rows) {
        const id = `ba-${dayStr}-${row.feature}-${row.step || 'none'}-${row.customerId || 'all'}-${row.eventId || 'all'}`;
        await db.insert(behaviorAggregates).values({
          id,
          day: dayStr,
          feature: row.feature,
          step: row.step,
          customerId: row.customerId,
          eventId: row.eventId,
          starts: row.starts,
          completions: row.completions,
          abandons: row.abandons,
          avgDurationMs: row.avgDurationMs,
          uniqueRoles: row.uniqueRoles || [],
        }).onConflictDoUpdate({
          target: behaviorAggregates.id,
          set: {
            starts: row.starts,
            completions: row.completions,
            abandons: row.abandons,
            avgDurationMs: row.avgDurationMs,
            uniqueRoles: row.uniqueRoles || [],
          },
        });
      }
      if (rows.length > 0) {
        log(`Aggregated ${rows.length} behavior event groups for ${dayStr}`);
      }
    } catch (err) {
      logger.error({ err: err }, "Behavior aggregation error");
    }
  }

  backgroundTimers.push(setInterval(aggregateBehaviorEvents, 60 * 60 * 1000));
  backgroundTimers.push(setTimeout(aggregateBehaviorEvents, 30000));

  const { startFeedbackMonitoring } = await import("./services/feedback-monitoring");
  startFeedbackMonitoring();

  const { syncScheduler } = await import("./services/sync-scheduler");
  syncScheduler.start().then(() => {
    logger.info("Sync scheduler started");
  }).catch((err) => {
    logger.error({ err }, "Failed to start sync scheduler");
  });

  const { dataRetentionWorker } = await import("./workers/data-retention-worker");
  dataRetentionWorker.start();
  logger.info("Data retention worker started");

  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log(`${signal} received — starting graceful shutdown`);

    for (const timer of backgroundTimers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    log("Background timers cleared");

    (async () => {
      try {
        await syncScheduler.stop();
        log("Sync scheduler stopped");
      } catch {}

      try {
        dataRetentionWorker.stop();
        log("Data retention worker stopped");
      } catch {}

      server.close(async () => {
        log("HTTP server closed");
        try {
          const { pool } = await import("./db");
          if (pool && typeof pool.end === "function") {
            await pool.end();
            log("Database connections closed");
          }
        } catch {}
        process.exit(0);
      });
    })();

    setTimeout(() => {
      logger.error("Graceful shutdown timed out after 15s — forcing exit");
      process.exit(1);
    }, 15000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ err: reason }, "Unhandled Promise Rejection");
    try {
      import("./storage").then(({ storage }) => {
        storage.logError({
          errorType: "UNHANDLED_REJECTION",
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
          metadata: { type: "unhandledRejection" },
        }).catch(() => {});
      }).catch(() => {});
    } catch {}
  });

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Uncaught Exception");
    try {
      import("./storage").then(({ storage }) => {
        storage.logError({
          errorType: "UNCAUGHT_EXCEPTION",
          message: error.message,
          stack: error.stack,
          metadata: { type: "uncaughtException" },
        }).then(() => process.exit(1)).catch(() => process.exit(1));
      }).catch(() => process.exit(1));
    } catch {
      process.exit(1);
    }
  });
})();
