# Checkmate — AWS Capacity Planning & Autoscaling Guide

This document provides the exact runtime specifications, resource consumption profiles, and scaling thresholds for Checkmate's AWS migration. It is intended for the DevOps and database teams to plan infrastructure, set autoscaling policies, and anticipate bottlenecks before production traffic arrives.

> **Companion document:** See `AWS-Migration-Checklist.md` for Docker, infrastructure setup, and security configuration.

---

## 1. Current Default Configuration (Baseline)

These are the values currently baked into the codebase. Each section notes the file where the value is set, so your team can adjust them via environment variables or code changes.

### 1.1 Database Connection Pool

| Setting | Current Value | File | Notes |
|---|---|---|---|
| Pool library | `@neondatabase/serverless` | `server/db.ts:3` | Swap to `pg.Pool` for RDS |
| Max connections | **7** | `server/db.ts:16` | Neon serverless limit; RDS supports hundreds |
| Idle timeout | 30,000 ms (30s) | `server/db.ts:17` | Unused connections released after 30s |
| Connection timeout | 10,000 ms (10s) | `server/db.ts:18` | Fails if no connection available in 10s |
| WebSocket proxy | `ws` library | `server/db.ts:6` | Required for Neon serverless; not needed for RDS |

**Impact:** With 7 max connections, each held for ~5-50ms per query, the pool can serve approximately **50-80 concurrent users** before connection queuing begins. This is the single tightest constraint in the current config.

### 1.2 Express Server

| Setting | Current Value | File | Notes |
|---|---|---|---|
| Process model | **Single process** | `server/index.ts` | No clustering or worker threads |
| `reusePort` | `true` | `server/index.ts:236` | Ready for multi-process binding |
| Body parser limit | 2 MB | `server/index.ts:123-135` | JSON and URL-encoded |
| CORS `maxAge` | 600s (10 min) | `server/index.ts` | Preflight cache |
| Trust proxy | Level 1 | `server/replitAuth.ts` | Required behind ALB/NLB |
| HTTP keepAlive timeout | Node.js default (5s) | Not set explicitly | Consider increasing to 65s behind ALB |
| Server timeout | Node.js default | Not set explicitly | No explicit `server.timeout` |

### 1.3 Rate Limiting

| Endpoint | Window | Limit (Standard) | Limit (PEN_TEST_MODE) | File |
|---|---|---|---|---|
| `/api/*` (general) | 15 min | **300 req** | 10,000 req | `server/index.ts:77-87` |
| `/api/auth/login` | 15 min | **15 req** | 500 req | `server/index.ts:88-97` |
| OTP request | 15 min | **5 req** per identifier | — | `server/routes.ts:316` |
| OTP verify | 15 min | **5 failed attempts** → lockout | — | `server/routes.ts:421` |
| Staff login | 15 min | **5 failed attempts** → lockout | — | `server/routes.ts` |

> ⚠️ `PEN_TEST_MODE` must be disabled (`false` or unset) before go-live. It relaxes rate limits for automated scanning.

**Multi-instance note:** Rate limiting uses in-memory storage by default. Behind a load balancer with multiple instances, each instance tracks its own counts. To enforce global limits, switch to a Redis-backed store (e.g., `rate-limit-redis`).

### 1.4 Session Management

| Setting | Value | File |
|---|---|---|
| Store | PostgreSQL (`connect-pg-simple`) | `server/replitAuth.ts:26-32` |
| Table | `auth_sessions` | `server/replitAuth.ts:28` |
| Session TTL | 7 days | `server/replitAuth.ts:25` |
| Cookie maxAge | 7 days | `server/replitAuth.ts:48` |
| Cookie secure | `true` | `server/replitAuth.ts:46` |
| Cookie sameSite | `lax` (production) / `none` (dev) | `server/replitAuth.ts:47` |
| Admin idle timeout | **4 hours** | `client/src/App.tsx:262` |
| Staff idle timeout | **8 hours** | `client/src/components/dashboard/StaffDashboard.tsx:89` |
| Idle warning | 2 minutes before logout | Both locations |
| Temp staff session max age | **12 hours** or event end time | `server/routes.ts:7546-7560` |

**Multi-instance note:** Sessions are stored in PostgreSQL, so they work correctly behind a load balancer without sticky sessions.

### 1.5 Real-Time Connections

| Feature | Technology | Persistent Connection? | File |
|---|---|---|---|
| AI Assistant chat | Server-Sent Events (SSE) | Yes (during chat) | `server/assistant/route.ts` |
| Database (Neon) | WebSocket | Yes (connection pool) | `server/db.ts` |
| Check-in sync | HTTP webhooks (outbound) | No | `server/services/checkin-sync-service.ts` |
| Printing (Zebra) | Client-side local WS | No (browser only) | `client/src/services/zebra-print-service.ts` |

No `socket.io` or server-side WebSocket servers. The only persistent server connections are SSE streams during AI assistant conversations.

---

## 2. Background Services (In-Process)

All background services run inside the main Node.js process on the event loop. There are no external workers, queues, or separate processes.

| Service | Interval | CPU Impact | Memory Impact | File |
|---|---|---|---|---|
| **Sync Scheduler** | Poll every **30s** | Low (DB query) → High (during sync) | Up to **50-200 MB** during large attendee pulls | `server/services/sync-scheduler.ts` |
| **Token Refresh Worker** | Every **60s** | Minimal | Minimal | `server/workers/token-refresh-worker.ts` |
| **Feedback Monitor** (urgent) | Every **2 min** | Low | Low | `server/services/feedback-monitoring.ts` |
| **Feedback Monitor** (digest) | Every **24 hours** (6 PM PT) | Low | Low | `server/services/feedback-monitoring.ts` |
| **Behavior Aggregator** | Every **1 hour** | Medium (SQL aggregation) | Low | `server/index.ts` |
| **Stale Job Recovery** | On startup only | Low | Minimal | `server/services/sync-scheduler.ts` |

> **Note:** The Token Refresh Worker module exists but is not currently imported by `server/index.ts` at startup. It will only become active once explicitly wired into the main entry point. Until then, OAuth token refresh relies on lazy refresh at request time.

### Sync Scheduler Details

| Setting | Value | File |
|---|---|---|
| Max concurrent sync jobs | **5** | `sync-scheduler.ts:23` |
| Batch size (items per page) | **100** attendees | `sync-orchestrator.ts:99` |
| Max retry attempts | **3** | `sync-scheduler.ts:288` |
| Shutdown timeout | **60 seconds** | `sync-scheduler.ts:24` |
| Queue depth | **Unlimited** (DB-backed) | `db-storage.ts:1109` |
| Job priority ordering | Priority ASC, then createdAt ASC | `db-storage.ts:1118` |
| Duplicate prevention | `activeSyncs` Map prevents same integration/event running twice | `sync-orchestrator.ts:102-105` |

---

## 3. Health Check Endpoints

Your DevOps team should wire these into ALB target group health checks and ECS task definitions.

| Endpoint | Purpose | What It Checks | Response |
|---|---|---|---|
| `GET /health` | **Quick liveness** | Process is responding | `200 OK` (plain text) |
| `GET /__health` | **JSON liveness** | Process is responding | `200 {"status":"healthy","timestamp":"..."}` |
| `GET /ready` | **Readiness probe** | Database connectivity (`SELECT 1`) | `200 {"ready":true}` or `503 {"ready":false}` |
| `GET /live` | **Liveness probe** | Minimal process check | `200 {"alive":true}` |

**Recommended ALB configuration:**
- Health check path: `/ready`
- Interval: 30 seconds
- Timeout: 10 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3
- Start period (ECS): 15 seconds

---

## 4. Capacity Estimates by Scenario

### 4.1 Single Instance (Current Default)

| Metric | Capacity | Bottleneck |
|---|---|---|
| Concurrent staff users | **50-80** | DB pool (7 connections) |
| Concurrent events with active check-in | **1-2** | Event loop + pool contention |
| Attendee sync (background) | **5,000 records** without degrading check-in | Memory + event loop blocking |
| Badge PDF renders (concurrent) | **3-5** | CPU-bound, blocks event loop |
| AI assistant sessions (concurrent) | **5-10** | SSE connections + OpenAI API latency |

### 4.2 Single Instance with AWS-Tuned Pool (25 connections)

| Metric | Capacity | Bottleneck |
|---|---|---|
| Concurrent staff users | **150-200** | Event loop (single process) |
| Concurrent events with active check-in | **3-5** | CPU contention during badge renders |
| Attendee sync (background) | **10,000 records** acceptable | Memory (~200MB per large sync) |

### 4.3 Multi-Instance (2-4 instances, 25 connections each)

| Metric | Capacity | Notes |
|---|---|---|
| Concurrent staff users | **400-800** | Linear scaling with instances |
| Concurrent events | **8-15** | Depends on check-in rate per event |
| Total DB connections | **50-100** | Must stay under RDS `max_connections` |
| Background sync jobs | **5** (single scheduler instance) | See warning below |

> ⚠️ **Multi-Instance Scheduler Warning:** The sync scheduler's duplicate prevention (`activeSyncs` Map) is in-process memory only. If multiple instances each run the scheduler, they can pick up and execute the same sync job simultaneously — the `getDueSyncJobs` → `updateSyncJob(status='running')` sequence is not an atomic distributed claim.
>
> **Before scaling to multiple instances, choose one of these approaches:**
> 1. **Single scheduler instance:** Run the sync scheduler on only one instance (e.g., via `WORKER_MODE` env var — see Section 8). All other instances handle web traffic only.
> 2. **Database advisory lock:** Add a `SELECT pg_try_advisory_lock()` call before processing jobs, so only one instance can claim a given job at a time.
> 3. **Atomic claim query:** Replace the two-step fetch-then-update with a single `UPDATE sync_jobs SET status='running' WHERE id = (SELECT id FROM sync_jobs WHERE status='pending' ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *` query.

---

## 5. Autoscaling Triggers — When to Scale

### 5.1 Recommended ECS/Fargate Autoscaling Policy

| Trigger | Scale-Out Threshold | Scale-In Threshold | Cooldown |
|---|---|---|---|
| **CPU utilization** | > 60% avg for 2 min | < 30% avg for 10 min | 120s out / 300s in |
| **Memory utilization** | > 75% avg for 2 min | < 40% avg for 10 min | 120s out / 300s in |
| **ALB request count** | > 1000 req/min per target | < 200 req/min per target | 120s out / 300s in |
| **Response time (P95)** | > 500ms for 3 min | < 200ms for 10 min | 120s out / 300s in |

### 5.2 Instance Sizing

| Tier | vCPU | Memory | Recommended For |
|---|---|---|---|
| **Minimum** | 1 vCPU | 1 GB | Development, staging |
| **Standard** | 2 vCPU | 2 GB | Production (up to 3 concurrent events) |
| **High** | 2 vCPU | 4 GB | Production with large syncs (10K+ attendees) |

### 5.3 Scaling Boundaries

| Setting | Recommended Value |
|---|---|
| Min instances | **2** (availability + zero-downtime deploys) |
| Max instances | **8** (adjust based on event schedule) |
| Desired (baseline) | **2** |

---

## 6. Where Slowdowns Will Appear First

Listed in order of likelihood, from most to least probable:

### 6.1 Database Connection Pool Exhaustion (CRITICAL)
- **Symptom:** `connection timeout` errors in logs; staff check-in page shows spinning loader
- **When:** > 50 concurrent users on 7-connection pool; > 150 on 25-connection pool
- **Fix:** Increase `max` in `server/db.ts`, or add instances behind a load balancer
- **Monitor:** Track pool `waiting` count and average checkout time

### 6.2 Event Loop Blocking During Sync + Check-in (HIGH)
- **Symptom:** All API responses slow down by 1-5 seconds during active sync jobs
- **When:** Large attendee sync (5K+ records) runs while staff are checking in attendees
- **Fix:** Move sync to separate worker instances (see Section 8); or schedule syncs outside event hours
- **Monitor:** Event loop lag metric (custom: `process.hrtime` delta per tick)

### 6.3 Memory Pressure from Concurrent Syncs (MEDIUM)
- **Symptom:** OOM kills in ECS; container restarts unexpectedly
- **When:** 3+ sync jobs each pulling 5K+ attendees simultaneously (~150-600 MB spike)
- **Fix:** Reduce `maxConcurrentJobs` from 5 to 2-3; increase instance memory; offload to workers
- **Monitor:** Container memory utilization, Node.js `process.memoryUsage().heapUsed`

### 6.4 Badge PDF Rendering (MEDIUM)
- **Symptom:** Check-in confirmations stall; badge print queue backs up
- **When:** Multiple staff trigger badge prints simultaneously at large events
- **Fix:** Long-term: move PDF rendering to a dedicated service or Lambda function
- **Monitor:** P95 response time on badge/print endpoints

### 6.5 Rate Limit Exhaustion (LOW)
- **Symptom:** `429 Too Many Requests` responses; staff locked out
- **When:** Single-IP venues with many staff devices (all share one public IP)
- **Fix:** Increase general API limit from 300; or whitelist known venue IPs
- **Monitor:** 429 response count in ALB access logs

### 6.6 Session Table Growth (LOW, LONG-TERM)
- **Symptom:** Slow logins; increasing query time on `auth_sessions`
- **When:** After months of operation without session cleanup
- **Fix:** Add a cron job or scheduled task to `DELETE FROM auth_sessions WHERE expire < NOW()`
- **Monitor:** Row count on `auth_sessions` table

---

## 7. Recommended AWS Configuration Changes

### 7.1 Database Pool (Priority: CRITICAL)

```typescript
// server/db.ts — change for RDS PostgreSQL
import { Pool } from "pg"; // Replace @neondatabase/serverless

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25,                      // Up from 7
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Remove neonConfig.webSocketConstructor line
});
```

**Environment variable alternative:** Make pool size configurable without code changes:
```typescript
max: parseInt(process.env.DB_POOL_MAX || "25", 10),
```

### 7.2 RDS PostgreSQL Settings

| Parameter | Recommended | Default | Why |
|---|---|---|---|
| `max_connections` | **200** | 100 (varies by instance) | 4 app instances × 25 pool + headroom |
| `shared_buffers` | 25% of RAM | 128 MB | Standard PostgreSQL tuning |
| `work_mem` | 4-8 MB | 4 MB | Helps with sorting/aggregation queries |
| `effective_cache_size` | 75% of RAM | 4 GB | Query planner optimization |
| Instance class | `db.t3.medium` (2 vCPU, 4 GB) minimum | — | Handles 200 connections comfortably |

**Connection math:**
- 4 app instances × 25 connections = 100 active connections
- Sync scheduler: up to 5 additional connections per instance during sync = 20 more
- Headroom for admin queries, migrations: 30
- **Total needed: ~150** → set `max_connections` to 200

### 7.3 ALB Configuration

| Setting | Value | Why |
|---|---|---|
| Idle timeout | **65 seconds** | Standard value for ALB; Node.js `keepAliveTimeout` must be set **higher** (see Section 7.4) |
| Deregistration delay | **30 seconds** | Allow in-flight requests to complete during deploy |
| Stickiness | **Disabled** | Sessions are in PostgreSQL; no need for sticky sessions |
| Health check | `/ready` | Verifies database connectivity |
| HTTPS listener | Port 443 → Target 5000 | Standard TLS termination |

### 7.4 Node.js Server Tuning

```typescript
// server/index.ts — add after server.listen()
server.keepAliveTimeout = 66000;    // 66s — MUST be > ALB idle timeout (65s)
server.headersTimeout = 67000;      // 67s — MUST be > keepAliveTimeout
```

> **Why:** If Node.js closes a keep-alive connection before the ALB does, the ALB will route a request to a closed socket, producing a 502. Node's `keepAliveTimeout` must always exceed the ALB's idle timeout.

### 7.5 Multi-Process (PM2 or ECS Tasks)

**Option A: PM2 cluster mode** (simpler, single container)
```json
// ecosystem.config.js
{
  "apps": [{
    "name": "checkmate",
    "script": "dist/index.js",
    "instances": "max",
    "exec_mode": "cluster",
    "max_memory_restart": "1G"
  }]
}
```

**Option B: Multiple ECS tasks** (recommended for production)
- Set ECS service desired count to 2-4
- Each task runs a single Node.js process
- ALB distributes traffic across tasks
- Autoscaling adjusts task count based on CPU/memory/request count

### 7.6 Rate Limiting with Redis (Multi-Instance)

```typescript
// server/index.ts — replace in-memory store
import RedisStore from "rate-limit-redis";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const apiLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 15 * 60 * 1000,
  max: 300,
});
```

---

## 8. Future Architecture: Separating Workers (Recommended)

For events with 500+ attendees or 5+ concurrent events, consider separating background sync from the web server:

```
                    ┌──────────────┐
  Users ──▶ ALB ──▶ │  Web Server  │ ──▶ RDS PostgreSQL
                    │  (ECS Tasks) │
                    │  No sync     │
                    └──────────────┘

                    ┌──────────────┐
  SQS Queue ──────▶ │  Sync Worker │ ──▶ RDS PostgreSQL
  (or EventBridge)  │  (ECS Tasks) │ ──▶ External APIs
                    │  No web      │
                    └──────────────┘
```

**Benefits:**
- Sync jobs can't block check-in traffic
- Workers scale independently from web servers
- A large sync won't cause OOM on web instances
- Sync failures don't crash the web server

**Implementation:**
1. Add `WORKER_MODE=true` environment variable
2. When `WORKER_MODE=true`: start sync scheduler, skip Express server
3. When `WORKER_MODE=false` (or unset): start Express server, skip sync scheduler
4. Both share the same codebase and database

---

## 9. Monitoring Checklist

### 9.1 CloudWatch Metrics to Configure

| Metric | Source | Alarm Threshold |
|---|---|---|
| CPU utilization | ECS | > 70% for 5 min |
| Memory utilization | ECS | > 80% for 5 min |
| Active DB connections | RDS | > 80% of `max_connections` |
| Read/Write latency | RDS | > 20ms average |
| ALB 5xx error rate | ALB | > 1% of requests |
| ALB target response time | ALB | P95 > 1 second |
| ALB request count | ALB | Baseline + 2x = investigate |
| Healthy host count | ALB Target Group | < min instances = critical |

### 9.2 Application-Level Metrics (Custom)

These should be emitted to CloudWatch or Datadog via the app:

| Metric | How to Capture | Why |
|---|---|---|
| DB pool checkout time | Instrument `pool.connect()` | Early warning for pool exhaustion |
| DB pool waiting count | `pool.waitingCount` | Direct pool pressure indicator |
| Sync job duration | Already logged in `sync_jobs.result` | Track sync performance trends |
| Event loop lag | `perf_hooks.monitorEventLoopDelay()` | Detect CPU-bound blocking |
| Active SSE connections | Counter in assistant route | AI assistant load tracking |
| Badge render time | Instrument print endpoints | PDF rendering bottleneck detection |

### 9.3 Log-Based Alerts

| Pattern | Severity | Action |
|---|---|---|
| `connection timeout` | Critical | Scale out or increase pool |
| `ENOMEM` or `heap out of memory` | Critical | Increase memory or reduce concurrency |
| `Sync already in progress` | Warning | Expected during high sync load |
| `429 Too Many Requests` (in access logs) | Warning | Check if legitimate traffic or attack |
| `unhandledRejection` | Error | Investigate; app logs error to DB (does not exit) |

---

## 10. Quick Reference — Scaling Tiers

| Scenario | Instances | DB Pool (per inst) | RDS Class | Total DB Conns |
|---|---|---|---|---|
| **Dev/Staging** | 1 | 10 | `db.t3.micro` | 10 |
| **Small** (1-2 events, < 100 staff) | 2 | 25 | `db.t3.small` | 50 |
| **Medium** (3-5 events, < 300 staff) | 3 | 25 | `db.t3.medium` | 75 |
| **Large** (5-10 events, 300-800 staff) | 4-6 | 25 | `db.r6g.large` | 100-150 |
| **Enterprise** (10+ events, 800+ staff) | 6-8 + workers | 30 | `db.r6g.xlarge` | 180-240 |

---

## Appendix A: Environment Variables for Tuning

These values should be configurable without code changes. Where the codebase currently uses hardcoded values, the recommended environment variable name is shown:

| Variable | Current Default | Recommended | Purpose |
|---|---|---|---|
| `DB_POOL_MAX` | 7 (hardcoded) | 25 | Max DB connections per instance |
| `DB_POOL_IDLE_TIMEOUT` | 30000 (hardcoded) | 30000 | Idle connection timeout (ms) |
| `DB_POOL_CONNECT_TIMEOUT` | 10000 (hardcoded) | 10000 | Connection acquisition timeout (ms) |
| `SYNC_MAX_CONCURRENT_JOBS` | 5 (hardcoded) | 3-5 | Max parallel sync jobs |
| `SYNC_POLL_INTERVAL_MS` | 30000 (hardcoded) | 30000 | How often scheduler checks for work |
| `RATE_LIMIT_API_MAX` | 300 (hardcoded) | 500-1000 | General API rate limit per window |
| `RATE_LIMIT_WINDOW_MS` | 900000 (hardcoded) | 900000 | Rate limit window (15 min) |
| `PEN_TEST_MODE` | unset | Must be `false` in prod | Relaxes rate limits for security scanning |
| `NODE_ENV` | development | `production` | Enables production optimizations |

---

*Last updated: April 2026*
*Based on codebase commit: current main branch*
