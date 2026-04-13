# OWASP Top 10:2025 Internal Security Audit

**Application:** CheckinKit (Checkmate)  
**Audit Date:** March 2, 2026  
**Auditor:** Internal Automated Review  
**Scope:** Full codebase — server routes, authentication, data access, client-side security

---

## Executive Summary

| # | OWASP Category | Risk Level | Status |
|---|---|---|---|
| A01 | Broken Access Control | **HIGH** | Partially addressed — IDOR gaps remain |
| A02 | Security Misconfiguration | **MEDIUM** | Mostly good — CSP needs tightening |
| A03 | Software Supply Chain Failures | **LOW** | Clean — minor dependency hygiene issues |
| A04 | Cryptographic Failures | **LOW** | Strong — AES-256-GCM, bcrypt in use |
| A05 | Injection | **LOW** | Well protected — Drizzle ORM parameterizes, canvas-based rendering |
| A06 | Insecure Design | **MEDIUM** | Race conditions and workflow bypass risks |
| A07 | Authentication Failures | **MEDIUM** | Solid OTP/session design — session fixation gap |
| A08 | Software/Data Integrity Failures | **LOW** | Webhook signing implemented, no eval/prototype pollution |
| A09 | Security Logging & Alerting Failures | **MEDIUM** | Good audit logs — gaps in failed login logging |
| A10 | Mishandling Exceptional Conditions | **LOW** | Good error handling — missing unhandled rejection handler |

---

## A01:2025 — Broken Access Control (HIGH)

### What We Have
- `requireAuth` middleware on all `/api` routes via global `authMiddleware`
- `requireRole()` middleware for admin/manager operations
- `staffAuth` middleware scoping staff to specific events
- Super admin tenant bypass via `isSuperAdmin()` check
- Customer impersonation via `x-impersonate-customer` header (super admins only)

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| AC-1 | ~~CRITICAL~~ ✅ FIXED | `GET /api/attendees/:id` — tenant validation added via event→customerId check. | routes.ts:5882 |
| AC-2 | ~~CRITICAL~~ ✅ FIXED | `PATCH /api/attendees/:id` — tenant validation added via event→customerId check. | routes.ts:5921 |
| AC-3 | ~~HIGH~~ ✅ FIXED | `GET /api/attendees` — now validates session customerId instead of trusting user-provided param. | routes.ts:5852 |
| AC-4 | Already protected | `GET /api/users/:id` — already had `isSuperAdmin` + customerId check (line 1301). | routes.ts:1294 |
| AC-5 | **MEDIUM** | `PATCH /api/staff/attendees/:attendeeId` — staff middleware validates event scope, but doesn't verify the attendee belongs to that event. | routes.ts:8021 |
| AC-6 | **LOW** | `GET /api/staff/events/:eventId/status` — unauthenticated, leaks event configuration info. | routes.ts:8367 |
| AC-7 | **MEDIUM** | `GET/PATCH /api/fonts/:fontId` — no ownership verification. | routes.ts:6886 |

### Recommendations
1. Add tenant validation (`req.dbUser.customerId` check) to all single-resource GET/PATCH/DELETE endpoints
2. Never trust client-provided `customerId` — always derive from session
3. Add event-attendee linkage check in staff attendee mutations

---

## A02:2025 — Security Misconfiguration (MEDIUM)

### What We Have
- Helmet with CSP, HSTS, X-Frame-Options
- Permissions-Policy header blocking camera/microphone/geolocation/payment
- CORS with explicit origin allowlist from REPLIT_DOMAINS
- Secure cookie settings (httpOnly, secure, sameSite)
- Rate limiting on API and auth endpoints

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| MC-1 | **MEDIUM** | CSP includes `'unsafe-inline'` in `scriptSrc` — allows inline script execution, weakens XSS protection. | index.ts:43 |
| MC-2 | **LOW** | CSP disabled entirely in development mode. | index.ts:40 |
| MC-3 | **LOW** | CORS allows all origins when `allowedOrigins` is empty or in dev mode. | index.ts:25-28 |
| MC-4 | **LOW** | Global error handler returns `err.message` to client — could leak internal details. | index.ts:205 |
| MC-5 | **INFO** | `crossOriginEmbedderPolicy` and `crossOriginOpenerPolicy` disabled. | index.ts:55-56 |

### Recommendations
1. Replace `'unsafe-inline'` with nonce-based CSP when feasible
2. Sanitize error messages in production — return generic messages, log details server-side
3. Ensure `allowedOrigins` is never empty in production builds

---

## A03:2025 — Software Supply Chain Failures (LOW)

### What We Have
- `package-lock.json` present for deterministic installs
- No `eval()` or `new Function()` in application code
- Dynamic imports use string literals only (safe)

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| SC-1 | **LOW** | `printnode-client` declared in root `package.json` but no longer used — replaced with direct API calls. Dead dependency. | package.json (root) |
| SC-2 | **LOW** | Duplicate packages between root and `CheckinKit/package.json` at different versions (e.g., `openai` ^6.14.0 vs ^6.10.0). | Both package.json files |
| SC-3 | **INFO** | 50+ dynamic `await import()` calls in routes.ts for lazy loading — all use literal strings, no user-controlled paths. | routes.ts |

### Recommendations
1. Remove unused `printnode-client` from root package.json
2. Consolidate dependency versions between root and CheckinKit directories
3. Run `npm audit` periodically to check for known vulnerabilities

---

## A04:2025 — Cryptographic Failures (LOW)

### What We Have
- **Password hashing**: bcryptjs with proper salt rounds
- **Credential encryption**: AES-256-GCM with unique IVs and auth tags
- **OTP codes**: Generated with `crypto.randomInt()`, hashed with bcrypt before storage
- **Session tokens**: 32-byte random hex via `crypto.randomBytes()`
- **Credential masking**: Secrets masked in API responses via `maskCredential()`

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| CR-1 | **LOW** | Staff passcodes hashed with SHA-256 instead of bcrypt. Short-lived but weaker against offline cracking. | routes.ts:106 |
| CR-2 | **LOW** | Kiosk PIN returned in plain text in `/api/events/:eventId/kiosk-pin` response. | routes.ts:1935 |
| CR-3 | **INFO** | Encryption key falls back to `SESSION_SECRET` if `CREDENTIAL_ENCRYPTION_KEY` not set (deferred to AWS migration). | credential-manager.ts:13 |

### Recommendations
1. Upgrade staff passcode hashing to bcrypt (low effort)
2. Restrict kiosk PIN endpoint to super_admin/admin roles only

---

## A05:2025 — Injection (LOW)

### What We Have
- **SQL Injection**: Drizzle ORM parameterizes all queries automatically
- **XSS**: Badge rendering uses Canvas `fillText()` (not innerHTML) — immune to XSS
- **Input sanitization**: `sanitizeHtml` helper applied to attendee data before storage
- **Command injection**: No `exec()`, `spawn()`, or `child_process` calls in codebase

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| IN-1 | **LOW** | Some raw SQL via `dsql` template literals for complex queries (JSON field casts). Currently uses static strings — monitor for future changes. | routes.ts:674 |

### Recommendations
1. Continue using Drizzle ORM for all database operations
2. Audit any new raw SQL additions during code review

---

## A06:2025 — Insecure Design (MEDIUM)

### What We Have
- Workflow engine with configurable steps (disclaimers, signatures, questions)
- Check-in status tracking with conflict detection
- Multi-tenant data isolation architecture

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| ID-1 | **MEDIUM** | Race condition in check-in: "check-then-set" pattern not wrapped in a database transaction. Two concurrent requests could both succeed. | routes.ts:7591 |
| ID-2 | **MEDIUM** | Check-in API does not verify that required workflow steps (signatures, questions) were completed. Backend trusts frontend to enforce workflow. | routes.ts:7571 |
| ID-3 | **LOW** | No server-side enforcement that badge template belongs to the same customer before printing. | Workflow print flow |

### Recommendations
1. Wrap check-in logic in a database transaction with `UPDATE ... WHERE checked_in = false`
2. Add server-side workflow completion validation before allowing check-in
3. Validate template ownership before print operations

---

## A07:2025 — Authentication Failures (MEDIUM)

### What We Have
- Multi-factor authentication: email/password + OTP (SMS/email)
- bcrypt password hashing with 10+ character minimum, complexity requirements
- Rate limiting on all auth endpoints (15/15min normal, 500/15min pen test mode)
- OTP brute-force protection (5 attempts before lockout)
- Staff sessions with time-bounded expiry
- Session store backed by PostgreSQL (not in-memory)

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| AU-1 | ~~MEDIUM~~ ✅ FIXED | Session regeneration added to both password and OTP login flows — prevents session fixation. | routes.ts:272, routes.ts:512 |
| AU-2 | **LOW** | OTP rate limiting and lockout counters stored in-memory Maps — cleared on server restart. | routes.ts:410 |
| AU-3 | **LOW** | `PEN_TEST_MODE` in production raises all rate limits to 500 — remember to disable after testing. | index.ts:78 |
| AU-4 | **INFO** | Password reset uses bcrypt-hashed 6-digit code with 5-attempt limit and token expiry — solid design. | routes.ts:1186 |

### Recommendations
1. Add `req.session.regenerate()` after successful login to prevent session fixation
2. Move OTP attempt tracking to database for persistence across restarts
3. Set a calendar reminder to disable `PEN_TEST_MODE` after pen testing concludes

---

## A08:2025 — Software/Data Integrity Failures (LOW)

### What We Have
- Webhook signature verification using HMAC SHA-256 with `crypto.timingSafeEqual`
- Outgoing webhooks signed with SHA-256 HMAC
- No `eval()`, `new Function()`, or prototype-pollution-prone deep merge operations
- `JSON.parse` wrapped in try-catch blocks

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| DI-1 | **LOW** | Webhook secret defaults to empty string if not configured — signature check passes trivially. | webhooks.ts:69 |
| DI-2 | **LOW** | Parsed JSON from AI services not validated with Zod schema — could cause downstream logic errors. | feedback-ai.ts, badge-ai-assistant.ts |

### Recommendations
1. Reject webhook requests when no secret is configured (fail-closed)
2. Add Zod validation on AI service JSON responses

---

## A09:2025 — Security Logging & Alerting Failures (MEDIUM)

### What We Have
- Staff activity logging to `staff_activity_logs` table (login, checkin, checkout, print)
- Error logging to database via `storage.logError()`
- Slack integration for feedback alerts and monitoring
- `lastLogin` timestamp updated on user login

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| LG-1 | **MEDIUM** | Failed login attempts are NOT logged to database — only tracked in-memory for rate limiting. No audit trail of attack patterns. | routes.ts |
| LG-2 | **MEDIUM** | Security events (repeated failed logins, unauthorized access attempts, rate limit hits) are not sent to Slack monitoring. | notification-service.ts |
| LG-3 | **LOW** | No dedicated audit log entry created for successful admin logins (only `lastLogin` timestamp updated). | routes.ts:267 |

### Recommendations
1. Log failed login attempts to database with IP, timestamp, and identifier
2. Add Slack alerts for security events (>5 failed logins, rate limit triggers)
3. Create audit log entries for admin login/logout events

---

## A10:2025 — Mishandling Exceptional Conditions (LOW)

### What We Have
- Global Express error handler that logs full details server-side and returns generic message to client
- Most async operations wrapped in try-catch
- Error responses consistently structured as `{ error: "message" }`

### Findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| EX-1 | ~~MEDIUM~~ ✅ FIXED | Global `unhandledRejection` and `uncaughtException` handlers added — logs errors to database before exit. | index.ts:334-362 |
| EX-2 | **LOW** | Some catch blocks return original string on JSON.parse failure instead of a safe default — could cause unexpected behavior downstream. | data-transformer.ts:199 |

### Recommendations
1. Add global `unhandledRejection` and `uncaughtException` handlers with logging
2. Return safe defaults (empty object/null) on parse failures rather than raw input

---

## Priority Action Items

### ~~Immediate (Before Pen Test)~~ ✅ ALL COMPLETED
1. ~~**AC-1/AC-2**: Add tenant validation to `GET/PATCH /api/attendees/:id`~~ ✅ Fixed — also added to DELETE and checkin endpoints
2. ~~**AU-1**: Add session regeneration after login~~ ✅ Fixed — both password and OTP login flows
3. ~~**EX-1**: Add `process.on('unhandledRejection')` handler~~ ✅ Fixed — plus `uncaughtException` handler with DB logging

### Short-Term (Next Sprint)
4. **AC-3/AC-4**: Server-side customerId enforcement on all resource endpoints
5. **ID-1**: Wrap check-in in database transaction (atomic update)
6. **LG-1/LG-2**: Log failed logins to DB, add Slack security alerts
7. **AC-5**: Validate event-attendee linkage in staff mutations

### Medium-Term (Before Beta)
8. **MC-1**: Replace `'unsafe-inline'` CSP with nonce-based approach
9. **ID-2**: Server-side workflow step completion validation
10. **AU-2**: Move OTP rate limiting to database
11. **SC-1/SC-2**: Clean up dependency management

---

## External Code Review Fixes (March 2, 2026)

The following items were identified by an external code review and resolved:

| # | Category | Finding | Resolution |
|---|---|---|---|
| EXT-R1 | Performance | `getActiveJobsForConfig()` fetched all pending jobs then filtered in memory | Added `getPendingSyncJobsByConfig(configId)` to db-storage with proper `WHERE` clause |
| EXT-R2 | Code Quality | Duplicated `session.save` promisify pattern in two login flows | Extracted `saveSession()` and `regenerateSession()` helper functions in routes.ts |
| EXT-R3 | Performance | Excessive console logging on every 30-second sync scheduler poll cycle | Wrapped routine logs with `NODE_ENV !== 'production'` check; errors/retries/completions still log |
| EXT-R4 | Type Safety | `sanitizeAttendeeData` used `as any` cast due to loose generic constraint | Changed constraint to `Record<string, string \| undefined \| null>` with proper cast |
| EXT-R5 | Type Safety | `(req.session as any).userId` repeated in 3 locations | Created `express-session.d.ts` type augmentation; all session access now properly typed |
| EXT-R6 | Type Safety | `{ kioskPin: pin } as any` on `updateEvent` calls | Removed cast — `kioskPin` is already in `InsertEvent` via the events schema |
| EXT-R7 | Security | `CREDENTIAL_ENCRYPTION_KEY` fell back to `SESSION_SECRET` — different security domains | Removed fallback; now throws explicit error if `CREDENTIAL_ENCRYPTION_KEY` is not set |

**Not changed (by design):**
- `staleTime: Infinity` — Intentional. Mutations invalidate cache on changes; individual queries override staleTime where freshness is needed (e.g., printer lists).
- `sessionExpiredRedirectPending` flag — Standard debounce pattern preventing duplicate 401 redirects. Working as intended.

---

*This audit covers the OWASP Top 10:2025 categories. Findings should be validated against live application behavior during penetration testing.*
