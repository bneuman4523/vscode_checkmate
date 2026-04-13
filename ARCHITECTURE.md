# CheckinKit — Architecture Document

> **Purpose of this document:** This file serves two roles simultaneously. The first half is a structural reference — what exists, how it is organized, and how data flows through the system. The second half is an intent and enforcement document — *why* things are built the way they are, which patterns must never be changed, and a code review checklist for both humans and AI agents. When adding new code, read both halves. When making an architectural change, update this document in the same PR.

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Multi-Tenant Architecture](#multi-tenant-architecture)
4. [Database Schema](#database-schema)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Feature Architecture](#feature-architecture)
7. [Security Model](#security-model)
8. [Architectural Intent — The Why](#architectural-intent--the-why)
9. [Patterns That Are Intentional — Do Not Fix These](#patterns-that-are-intentional--do-not-fix-these)
10. [Known Technical Debt](#known-technical-debt)
11. [Code Review Checklist](#code-review-checklist)

---

## System Overview

CheckinKit is a multi-tenant event check-in and badge management platform. It allows event organizers (customers) to configure check-in kiosks, manage attendee registrations, print badges via PrintNode, and track session attendance in real time. It runs as a hosted SaaS product serving multiple customers from a single deployment, with complete data isolation between tenants.

**Primary personas:**
- **Event staff** — check attendees in via the staff dashboard, scan QR codes, add walk-ins
- **Kiosk operators** — self-service attendee check-in at unattended tablet stations
- **Customer admins** — configure events, manage badge templates, connect printers, manage integrations
- **Super admins** — cross-tenant platform administration (Certain internal)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ Admin Panel │ │ Kiosk Mode  │ │ Staff       │ │ Badge Designer          ││
│  │ (Dashboard) │ │ (Self-Svc)  │ │ (Check-in)  │ │ (Drag & Drop)           ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────────┘│
│                              ↓ TanStack Query                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                         IndexedDB (Offline Cache)                        ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓ REST API
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (Express.js)                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                              API Routes                                  ││
│  │  /api/customers  /api/events  /api/attendees  /api/integrations         ││
│  │  /api/badge-templates  /api/sessions  /api/assistant                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────────────┐│
│  │ Badge Template │  │ Notification   │  │ API Integration Framework        ││
│  │ Resolver       │  │ Service        │  │ (OAuth2, Sync, Webhooks)         ││
│  └────────────────┘  └────────────────┘  └──────────────────────────────────┘│
│                                      │                                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │              Storage Layer — IStorage interface (Drizzle ORM)            ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database (Neon)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Purpose | Why chosen |
|------------|---------|------------|
| React 18 | UI Framework | Component model suits the multi-surface app (admin, kiosk, staff) |
| TypeScript | Type Safety | End-to-end types from schema to component props |
| TanStack Query | Data Fetching & Caching | Handles real-time feel without WebSockets; optimistic updates for check-in |
| Wouter | Client-side Routing | Lighter than React Router; sufficient for routing complexity |
| Shadcn UI | Component Library | Copied into repo — not a dependency — allows full customization without upstream breakage |
| Tailwind CSS | Styling | Consistent design tokens without CSS drift |
| IndexedDB (idb) | Offline Storage | Check-in must work when connectivity drops mid-event |
| Lucide Icons | Iconography | Consistent icon set matched to shadcn/ui |

### Backend
| Technology | Purpose | Why chosen |
|------------|---------|------------|
| Node.js | Runtime | Shared TypeScript types with frontend via /shared |
| Express.js | HTTP Server | Intentionally thin — routing logic is custom enough that a heavy framework adds abstraction without benefit |
| Drizzle ORM | Database Operations | Raw SQL escape hatches for complex multi-tenant queries; schema is single source of truth |
| Zod | Schema Validation | Auto-derived from Drizzle schema via drizzle-zod — no manual type/validator drift |
| Twilio | SMS Notifications | E.164 phone validation enforced at schema level for compatibility |
| OpenAI | AI Assistant | Conversational setup assistant with function calling |

### Database
| Technology | Purpose |
|------------|---------|
| PostgreSQL (Neon) | Primary Database |
| Drizzle Kit | Migrations |

---

## Multi-Tenant Architecture

### ⚠️ The Most Important Architectural Rule

**Every database query that touches customer data MUST be scoped by `customer_id` at the query layer, not the application layer.**

This is a security boundary, not a coding convention.

- You cannot fetch records and then filter by `customer_id` in JavaScript. The `WHERE customer_id = ?` clause must be in the SQL.
- Every route that handles customer data receives `customer_id` from the authenticated session — never from a URL parameter or request body.
- Any new table that holds customer-specific data MUST have a `customer_id` column, and every query against it MUST include that scope.
- A mistake here doesn't expose one record — it exposes an entire customer's event data to another tenant.

### Role Hierarchy

```
┌──────────────────────────────────────────────────────────────────┐
│                         SUPER ADMIN                              │
│  - Global access across all customer accounts                    │
│  - User management at root level                                 │
│  - No customer_id (NULL)                                         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      CUSTOMER ACCOUNTS                           │
│  - Complete data isolation via customer_id                       │
│  - Own badge templates, printers, integrations                   │
│  - Multiple events per account                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ↓                 ↓                 ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│      ADMIN       │ │     MANAGER      │ │      STAFF       │
│ Full account     │ │ Event management │ │ Check-in only    │
│ management       │ │ privileges       │ │ privileges       │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                                                    │
                                                    ↓
                                          ┌──────────────────┐
                                          │   TEMP STAFF     │
                                          │ Passcode-based   │
                                          │ Time-limited     │
                                          │ Event-specific   │
                                          └──────────────────┘
```

### Super Admin Impersonation
The `x-impersonate-customer` header enables super admin impersonation of a customer context. This header is only honoured when the authenticated user has the `super_admin` role. **Any change to this check requires a security review.**

### Data Isolation
All data is scoped by `customer_id` with cascade deletes:
- **customers** → Parent tenant entity
- **users** → NULL customer_id for super_admin
- **events** → Belongs to customer
- **attendees** → Belongs to event (inherits customer scope)
- **badge_templates** → Belongs to customer
- **printers** → Belongs to customer
- **integrations** → Belongs to customer

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐
│    customers    │
│─────────────────│
│ id (PK)         │
│ name            │
│ contactEmail    │
│ status          │
└────────┬────────┘
         │
         │ 1:N
         ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │    users     │  │   events     │  │ badge_       │  │ customer_          │ │
│  │──────────────│  │──────────────│  │ templates    │  │ integrations       │ │
│  │ id (PK)      │  │ id (PK)      │  │──────────────│  │────────────────────│ │
│  │ customerId   │  │ customerId   │  │ id (PK)      │  │ id (PK)            │ │
│  │ email        │  │ name         │  │ customerId   │  │ customerId         │ │
│  │ role         │  │ eventDate    │  │ name         │  │ providerId         │ │
│  └──────────────┘  │ tempStaff-  │  │ mergeFields  │  │ endpoints          │ │
│                    │ Settings    │  │ fontFamily   │  │ rateLimitPolicy    │ │
│                    └──────┬──────┘  └──────────────┘  └────────────────────┘ │
│                           │                                                   │
└───────────────────────────┼───────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ↓                  ↓                  ↓
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  attendees   │  │    sessions      │  │ event_badge_     │
│──────────────│  │──────────────────│  │ template_        │
│ id (PK)      │  │ id (PK)          │  │ overrides        │
│ eventId (FK) │  │ eventId (FK)     │  │──────────────────│
│ firstName    │  │ name             │  │ id (PK)          │
│ lastName     │  │ capacity         │  │ eventId (FK)     │
│ email        │  │ restrictTo-      │  │ participantType  │
│ participant- │  │ Registered       │  │ badgeTemplateId  │
│ Type         │  └────────┬─────────┘  └──────────────────┘
│ checkedIn    │           │
│ badgePrinted │           ↓
└──────────────┘  ┌──────────────────┐
                  │ session_         │
                  │ registrations    │
                  │──────────────────│
                  │ sessionId (FK)   │
                  │ attendeeId (FK)  │
                  │ status           │
                  │ waitlistPosition │
                  └──────────────────┘
```

### Complete Table Reference

#### Core Tables
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **customers** | Top-level tenant accounts | id, name, contactEmail, status | Parent of all scoped data |
| **users** | System users with roles | id, customerId, email, role | → customers (NULL for super_admin) |

#### Event Management
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **events** | Event instances | id, customerId, name, eventDate, tempStaffSettings | → customers |
| **attendees** | Event participants | id, eventId, firstName, lastName, email, participantType, checkedIn | → events |
| **sessions** | Breakout sessions | id, eventId, name, capacity, restrictToRegistered | → events |
| **session_registrations** | Session signup tracking | sessionId, attendeeId, status, waitlistPosition | → sessions, attendees |
| **session_checkins** | Session attendance log | sessionId, attendeeId, action, timestamp | → sessions, attendees |
| **check_in_log** | Event check-in audit | attendeeId, eventId, checkedInBy, timestamp | → attendees, events |

#### Badge System
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **badge_templates** | Badge designs | id, customerId, name, fontFamily, mergeFields, qrCodeConfig | → customers |
| **event_badge_template_overrides** | Per-event template mappings | eventId, participantType, badgeTemplateId | → events, badge_templates |
| **custom_fonts** | Uploaded font files | id, customerId, fontFamily, fontData | → customers |
| **printers** | Printer configurations | id, customerId, connectionType, ipAddress | → customers |

#### Temporary Staff
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **temp_staff_sessions** | Active temp staff logins | id, eventId, staffName, token, expiresAt | → events |
| **temp_staff_activity_log** | Temp staff action audit | sessionId, eventId, action, targetId | → temp_staff_sessions, events |

#### Integration Framework
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **integration_providers** | Supported platforms | id, name, authType, oauth2Config | Standalone catalog |
| **customer_integrations** | Customer's API connections | id, customerId, providerId, endpoints | → customers, integration_providers |
| **integration_connections** | Connection state tracking | id, integrationId, connectionStatus | → customer_integrations |
| **stored_credentials** | Encrypted API credentials | connectionId, encryptedValue, expiresAt | → integration_connections |
| **oauth2_tokens** | OAuth token metadata | integrationId, connectionId, expiresAt | → customer_integrations |
| **event_integrations** | Event-specific sync config | eventId, integrationId, variables | → events, customer_integrations |
| **sync_jobs** | Background sync queue | integrationId, status, processedRecords | → customer_integrations |
| **webhook_configurations** | Inbound webhook receivers | integrationId, eventType, url | → customer_integrations |

#### Notifications
| Table | Purpose | Key Fields | Relationships |
|-------|---------|------------|---------------|
| **notification_configurations** | Alert settings | customerId, eventId, triggerEvent, channels | → customers, events |
| **notification_logs** | Sent notification audit | configurationId, channel, status | → notification_configurations |

---

## Data Flow Diagrams

### 1. Badge Template Resolution

```
Input: eventId + participantType (e.g., "VIP", "Speaker")

Step 1: Check Event Overrides
  event_badge_template_overrides WHERE eventId AND participantType
  Found? → Return (path = 'event_override')
       ↓ Not found
Step 2: Check Customer Defaults
  badge_templates WHERE customerId AND participantType matches
  Found? → Return (path = 'customer_default')
       ↓ Not found
Step 3: Fallback to General
  badge_templates WHERE customerId AND participantType = 'General'
  Found? → Return (path = 'general_fallback')
       ↓ Not found
Step 4: Any Available Template
  First badge_template for customer
  Return (path = 'any_template') or (path = 'none')
```

### 2. Temp Staff Check-in Flow

```
POST /api/temp-staff/login {eventId, passcode, staffName}
  1. Check event.tempStaffSettings.enabled
  2. Verify time window (startTime < now < endTime)
  3. Compare SHA-256 hash of passcode
  4. Create temp_staff_sessions record with token
  5. Log 'login' to temp_staff_activity_log
  → Returns: {token, expiresAt}

POST /api/temp-staff/checkin {attendeeId}
  Header: X-Temp-Staff-Token: {token}
  1. Update attendees SET checkedIn=true, checkedInAt=now
  2. Insert check_in_log record
  3. Log 'checkin' to temp_staff_activity_log
  4. If printPreviewOnCheckin: resolve badge template → return for print
  5. Trigger notification_configurations if configured
```

### 3. Session Management & Waitlist

```
Registration logic:
  IF current count < capacity  → status = 'registered'
  ELSE IF allowWaitlist        → status = 'waitlisted', assign position
  ELSE                         → reject

Waitlist promotion (when registered attendee cancels):
  1. Set registration status = 'cancelled'
  2. Find waitlisted registration with lowest position
  3. Update to status = 'registered', set promotedAt
  4. Reorder remaining waitlist positions
```

### 4. API Integration Sync Flow

```
SETUP:    integration_providers → customer_integrations → integration_connections

SCHEDULE: integration_endpoint_configs
          - dataType: 'events' | 'attendees' | 'sessions'
          - syncIntervalSeconds: 60 (onsite) to 86400 (daily)

EXECUTE:  sync_jobs
          - priority: 1-10 (manual > scheduled)
          - status: pending → running → completed/failed
          - Exponential retry with backoff
          - Dead letter after maxAttempts

MAP:      event_code_mappings / session_code_mappings
          - Maps external IDs to internal records
          - Tracks sync cursor for incremental updates
```

---

## Feature Architecture

### Offline-First Design

```
IndexedDB stores: attendees (cached) | templates (cached) | events (cached) | sync_queue (pending)

Sync Strategy:
  1. All reads served from IndexedDB first
  2. Background sync updates cache from server
  3. Offline actions queued in sync_queue
  4. When online, queue is processed in order
  5. Conflict resolution: last-write-wins, server authority

Offline capabilities: view attendees, perform check-ins (queued),
                      view badge templates, print badges (browser print)
```

### Badge Printing Pipeline

```
BadgeTemplate (mergeFields, fontFamily, qrCodeConfig)
       ↓
BadgeRenderSurface — Canvas at 300/600 DPI
  - Font loading via FontContext
  - QR code generation from config
  - Merge field substitution from attendee data
       ↓
Print Strategy:
  iOS AirPrint | Android IPP/Mopria | Windows Native | PDF Fallback
       ↓
Printer Connections:
  PrintNode API | WiFi (IP + port) | Bluetooth (device ID) | Native dialog
```

### Notification System

```
Triggers: check_in | badge_printed

notification_configurations (customerId/eventId scoped)
  - participantTypeFilter (optional)
  - Channels: Webhook (HMAC signed) | SMS (Twilio) | Email (SendGrid/Resend)
       ↓
notification_logs
  - channel, recipient, payload
  - status: sent | failed | pending
  - errorMessage for debugging
```

---

## Security Model

### Authentication Layers

| Layer | Method | Scope | Notes |
|-------|--------|-------|-------|
| Super Admin | Replit OIDC (OAuth) | Global | Active when REPL_ID env var is set |
| Admin/Manager/Staff | Email/password session | Customer-scoped | Production path |
| Temp Staff | Passcode + time window | Event-scoped | SHA-256 hashed, 12hr max |
| Kiosk | URL-scoped session | Event + customer | Separate session space from staff |

**Session hardening — do not remove:**
- `saveSession()` and `regenerateSession()` are promisified — session operations are always awaited. This prevents race conditions that can cause auth bypass.
- Session is regenerated on every privilege change. This prevents session fixation.

### Required Security Patterns on Every Route

These are non-negotiable. A PR that adds a route without these patterns should not merge.

```typescript
// 1. Sanitize all HTML from user input — default-deny tag policy
sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })

// 2. Validate password complexity at creation and change
validatePasswordComplexity(password) // throws if requirements not met

// 3. Timing-safe comparison for ANY secret (tokens, PINs, API keys)
import { timingSafeEqual } from 'crypto'
// Never use === to compare secrets — leaks timing information

// 4. Allowlist-filter all attendee writes
sanitizeAttendeeData(data) // strips fields not in explicit allowlist
```

### Credential Storage Security

```
stored_credentials:
  - AES-256-GCM encryption
  - Each value has its own IV (never reused)
  - Auth tag stored alongside ciphertext (detects tampering)
  - Key loaded from CREDENTIAL_ENCRYPTION_KEY env var (required at startup)
  - Never exposed to frontend

oauth2_tokens:
  - Token references only (not actual tokens in this table)
  - PKCE for all authorization code flows
  - State parameter for CSRF protection
  - Proactive renewal 5 minutes before expiry
  - refreshLocks Map prevents concurrent refresh races

Temp staff:
  - SHA-256 hashed passcodes (never stored plain)
  - JWT-like tokens, 12-hour max expiry
  - Full activity audit trail

Webhooks:
  - HMAC signature verification
  - Secret stored as reference only
```

### Data Protection
- **PCI Compliance:** No payment information stored
- **Minimal PII:** Only badge-relevant attendee data retained
- **Cascade Deletes:** Customer deletion removes all associated data
- **Soft Deletes:** Attendee records use `deleted_at` — event audit trails are a customer expectation

---

## Architectural Intent — The Why

This section explains the reasoning behind decisions that might otherwise look over-engineered, inconsistent, or like candidates for "simplification." Before refactoring any of these patterns, read this section.

### Why IStorage exists with only one implementation
`db-storage.ts` implements the `IStorage` interface even though there is currently only one implementation. This exists for testability (the entire data layer can be swapped in tests without touching routes) and future flexibility (read-replica split, caching layer, different database). Do not collapse the interface into a direct Drizzle usage in routes.

### Why drizzle-zod derived schemas
TypeScript types (`$inferSelect`) and Zod validators (`createInsertSchema`) are both derived from the Drizzle schema. They serve different layers — DB types vs API validation — and are not redundant. Do not replace either with manually written equivalents. The moment you do, the schema, the type, and the validator can drift independently.

### Why session operations are promisified
`saveSession()` and `regenerateSession()` are wrapped as promises and always awaited. Express session callbacks are not guaranteed to complete before the response is sent in older patterns. The promisification fixes a class of race conditions that can cause session state to be silently lost, which in an auth context means privilege escalation or authentication bypass.

### Why E.164 phone format is enforced in the schema
Phone numbers are validated against `/^\+[1-9]\d{1,14}$/` at insert time. This is a Twilio SMS compatibility requirement — Twilio rejects numbers that are not E.164 formatted. Do not relax this constraint without verifying Twilio's current requirements.

### Why proactive OAuth2 token renewal at 5 minutes
Tokens are renewed before expiry, not on demand. On-demand renewal means the first request after expiry fails with a 401, which during a live event causes a visible error to staff. The 5-minute window ensures renewal happens during background idle time, not while a staff member is mid-check-in.

### Why kiosk sessions are separate from staff sessions
Kiosk sessions are scoped to a specific event and customer via URL parameters and do not share session space with staff sessions. Mixing them would allow a kiosk session to potentially read or write staff-level data. The separation is a security boundary.

### Why `IdleTimeoutGuard` exists in the client shell
Kiosk deployments are on unattended tablets in public spaces. Without a session timeout, a staff member who accidentally navigated to the admin panel on a kiosk screen would leave admin access open to anyone who walked up. The timeout is a security requirement, not a UX convenience. Do not increase the timeout or remove the guard without a security review.

---

## Patterns That Are Intentional — Do Not Fix These

| Pattern | Why it looks wrong | Why it must stay |
|---------|-------------------|-----------------|
| `IStorage` interface with one impl | Looks over-engineered | Testability + future flexibility |
| Promisified session methods | Looks verbose | Prevents auth race conditions |
| drizzle-zod AND TypeScript types | Looks redundant | Different layers, different contracts |
| `timingSafeEqual` for 4-digit PIN | Looks unnecessary | Timing attacks work on short secrets too |
| `customer_id` on every query | Looks repetitive | It is a security boundary |
| REPL_ID auth bypass | Looks like a backdoor | Dev-only, gated by env var presence |
| `sanitizeAttendeeData` allowlist | Looks excessive | Prevents mass-assignment vulnerabilities |

---

## Known Technical Debt (as of March 2026)

These are confirmed issues observed in the live application:

1. **Session descriptions render raw HTML** — The Sessions tab on the staff dashboard displays literal `<ul> <li id="R159" class="activityCard"...` markup. Session descriptions from external imports need a strip-HTML pass before display. Fix: `import { sanitizeHtml } from 'sanitize-html'` and strip all tags before rendering the description field.

2. **Nameless attendee rows** — Walk-in or incomplete records show only a registration type with no name. Needs a display fallback: "(Walk-in — incomplete record)" in muted text at the component level.

3. **Printer display names are raw machine hostnames** — PrintNode returns hostnames like `EPSON_CW_C4000u BNEUMAN-MBA`. A display-name field on the printers table, with a friendly-name prompt during printer setup, would fix this.

4. **Badge template names are not enforced non-empty** — Unnamed templates appear in the template selector as just "Type: VIP" with no name. Block empty-name templates at the insert layer.

5. **Staff dashboard lacks check-in progress rate** — The stat card shows count but not percentage or pace. Low-effort, high-value addition.

6. **Sessions list has no search** — 133 sessions with no filter or search input. Identical to the search pattern already on the Attendees tab.

---

## Code Review Checklist

Use this checklist for every PR that touches server-side code. An AI reviewer should treat a "yes" on questions 1–7 as a merge blocker unless explicitly justified.

1. Does any new route touch customer data without `customer_id` scoping **at the query level**?
2. Does any new user-input path bypass `sanitizeHtml()` or `sanitizeAttendeeData()`?
3. Does any new credential or token get stored without going through `credentialManager.encrypt()`?
4. Does any new OAuth2 flow omit PKCE?
5. Does any secret comparison use `===` instead of `timingSafeEqual`?
6. Does any new database access bypass the `IStorage` interface?
7. Does any new table that holds customer data lack a `customer_id` column and scoped queries?
8. If a new architectural pattern is introduced, is this document updated in the same PR?

---

## File Structure

```
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                         # Shadcn components (copied, not imported)
│   │   │   ├── AppSidebar.tsx              # Navigation sidebar
│   │   │   ├── BadgeRenderSurface.tsx      # Canvas badge rendering
│   │   │   ├── AssistantDrawer.tsx         # AI setup assistant chat panel
│   │   │   ├── SetupCompletenessCard.tsx   # Event readiness dashboard card
│   │   │   └── EventBadgeTemplateMappings.tsx
│   │   ├── contexts/
│   │   │   ├── NavigationContext.tsx       # Hierarchical nav state
│   │   │   └── FontContext.tsx             # Font loading management
│   │   ├── hooks/
│   │   │   └── useAssistant.ts             # Streaming assistant hook
│   │   ├── pages/
│   │   │   ├── StaffDashboard.tsx
│   │   │   ├── EventSettings.tsx
│   │   │   └── ...
│   │   └── lib/
│   │       └── queryClient.ts              # TanStack Query setup
├── server/
│   ├── routes.ts                           # Express API routes
│   ├── db-storage.ts                       # IStorage implementation (Drizzle)
│   ├── auth.ts                             # Dual auth strategies
│   ├── credential-manager.ts              # AES-256-GCM encryption
│   ├── assistant/
│   │   ├── tools.ts                        # OpenAI function definitions
│   │   ├── system-prompt.ts               # Dynamic context builder
│   │   ├── tool-executor.ts               # Executes tool calls via IStorage
│   │   └── setup-checker.ts               # Event completeness logic
│   └── services/
│       ├── oauth2-service.ts              # PKCE OAuth2 with refresh locks
│       └── badge-template-resolver.ts    # Template resolution logic
├── shared/
│   └── schema.ts                          # Drizzle schema — single source of truth
└── ARCHITECTURE.md                        # This document
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256 key for credential storage |
| `SESSION_SECRET` | Yes | Express session signing |
| `OPENAI_API_KEY` | Yes | AI setup assistant |
| `REPL_ID` | Dev only | Activates Replit OIDC auth strategy |
| `PRINTNODE_API_KEY` | If printing | Badge printing via PrintNode |
| `TWILIO_ACCOUNT_SID` | If SMS | Twilio SMS notifications |
| `TWILIO_AUTH_TOKEN` | If SMS | Twilio auth |
| `HUBSPOT_CLIENT_ID` | If HubSpot | OAuth2 client ID |
| `SALESFORCE_CLIENT_ID` | If Salesforce | OAuth2 client ID |

The server performs a startup check for all `Required` variables and will not boot without them. This is intentional — a misconfigured deployment should fail loudly at startup, not silently at runtime.

---

*Document version: 2.0 — merged March 2026*
*Combines original EventFlow structural reference (Dec 2024) with CheckinKit architectural intent layer*