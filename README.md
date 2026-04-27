# CheckinKit

Enterprise-grade event check-in and badge management platform. Multi-tenant SaaS built for event operations teams managing registration, on-site check-in, badge printing, and real-time sync with external event platforms.

---

## Overview

CheckinKit handles the full check-in lifecycle — from syncing attendee data from upstream registration platforms, to kiosk-based QR scanning at the door, to printing personalized badges on Zebra or PrintNode-connected printers. It's designed to work reliably in the unpredictable network conditions of live events, with an offline-first architecture that queues check-ins locally and syncs when connectivity is restored.

The platform is multi-tenant from the ground up: each customer account has complete data isolation, its own badge templates, printer configurations, integrations, and user roles.

---

## Key Features

**Check-in & Kiosk**
- QR code scanning via device camera (html5-qrcode)
- Kiosk mode with fullscreen lock and passcode exit
- Walk-in registration with outbound sync
- Group check-in (guests linked to primary attendee)
- Offline check-in with automatic sync queue
- Session-level check-in tracking with capacity and waitlist management

**Badge Printing**
- Drag-and-drop badge designer with custom fonts and merge fields
- Per-event template overrides by participant type
- PrintNode cloud printing integration
- Direct Zebra ZPL printing over WiFi/network
- Browser print fallback (iOS AirPrint, Android Mopria)
- 300/600 DPI canvas rendering

**Integrations**
- OAuth2 + API key integrations with external event platforms (Cvent, Eventbrite, etc.)
- Configurable sync schedules per data type (events, attendees, sessions)
- Inbound webhooks with HMAC signature verification
- Real-time check-in sync back to source platforms
- Incremental sync with cursor tracking
- Exponential backoff retry with dead-letter handling

**Multi-Tenant Architecture**
- Four-tier role hierarchy: Super Admin → Admin → Manager → Staff
- Complete data isolation by `customer_id` with cascade deletes
- Passcode-based temporary staff access (time-windowed, event-scoped)
- Super admin impersonation for support workflows

**Notifications**
- SMS via Twilio (check-in triggers, international support)
- Webhook notifications with HMAC signing
- Configurable per event and participant type

**Security**
- AES-256-GCM encryption for stored API credentials
- PKCE OAuth2 flow with state parameter CSRF protection
- Timing-safe token comparison
- OTP-based login with rate limiting
- Session regeneration on privilege escalation
- Input sanitization and Zod validation at all API boundaries
- Idle session timeout with configurable warning

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, TanStack Query, Wouter |
| UI | shadcn/ui, Tailwind CSS, Radix UI, Lucide |
| Offline | IndexedDB (idb), SyncOrchestrator |
| Backend | Node.js, Express.js |
| ORM | Drizzle ORM |
| Validation | Zod (schema-derived, single source of truth) |
| Database | PostgreSQL (Neon serverless) |
| Printing | PrintNode API, Zebra ZPL |
| SMS | Twilio |
| Build | Vite, esbuild, tsx |
| Container | Docker, Docker Compose |

---

## Architecture

```
checkmate-certain/
└── CheckinKit/
    ├── client/
    │   └── src/
    │       ├── components/        # React components
    │       │   ├── ui/            # shadcn/ui primitives
    │       │   ├── dashboard/     # Staff dashboard (tabs, dialogs, hooks)
    │       │   └── workflow/      # Check-in workflow steps
    │       ├── contexts/          # NavigationContext, FontContext
    │       ├── hooks/             # Custom hooks (offline, auth, printing, idle)
    │       ├── pages/             # Route-level page components
    │       ├── services/          # Client-side services (print, offline, kiosk)
    │       └── lib/               # Utilities, queryClient, API framework
    ├── server/
    │   ├── routes.ts              # Express API routes
    │   ├── auth.ts                # Auth middleware + role enforcement
    │   ├── db-storage.ts          # Drizzle ORM storage implementation
    │   ├── credential-manager.ts  # AES-256-GCM credential encryption
    │   └── services/
    │       ├── oauth2-service.ts  # OAuth2 token lifecycle
    │       ├── sync-orchestrator.ts
    │       ├── badge-template-resolver.ts
    │       ├── printnode.ts
    │       └── sms-service.ts
    ├── shared/
    │   └── schema.ts              # Drizzle schema + Zod types (shared client/server)
    ├── migrations/                # Drizzle migration files
    ├── scripts/                   # SQL seed and migration scripts
    ├── tests/                     # Scale and performance tests
    ├── Dockerfile
    └── docker-compose.yml
```

The schema in `shared/schema.ts` is the single source of truth — Drizzle table definitions drive both the database schema and Zod validation schemas via `drizzle-zod`, eliminating drift between layers.

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (or [Neon](https://neon.tech) serverless)
- PrintNode account (optional, for cloud printing)
- Twilio account (optional, for SMS)

### Installation

```bash
git clone https://github.com/bneuman4523/checkmate-certain.git
cd checkmate-certain/CheckinKit
npm install
```

### Environment Variables

Create a `.env` file in `CheckinKit/`:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/checkinkit

# Session
SESSION_SECRET=your-session-secret-min-32-chars

# Credential encryption (for stored API keys)
CREDENTIAL_ENCRYPTION_KEY=your-32-char-encryption-key

# Twilio (optional)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+15551234567

# PrintNode (optional)
PRINTNODE_API_KEY=your-printnode-key

# Claude AI (optional, for setup assistant, badge AI, feedback analysis)
ANTHROPIC_API_KEY=your-anthropic-key
```

### Database Setup

```bash
npm run db:push
```

### Development

```bash
npm run dev
```

Runs the Express server with Vite middleware for HMR. Available at `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

### Docker

```bash
docker-compose up --build
```

---

## Role Hierarchy

| Role | Scope | Capabilities |
|---|---|---|
| `super_admin` | Global | All accounts, system settings, impersonation |
| `admin` | Customer account | Full account management, users, integrations |
| `manager` | Customer account | Event management, reports |
| `staff` | Event | Check-in, badge printing |
| Temp Staff | Event (time-limited) | Check-in via passcode, no login required |

---

## Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](CheckinKit/ARCHITECTURE.md) | System design, data flow diagrams, DB schema |
| [SECURITY.md](CheckinKit/SECURITY.md) | Security model, credential handling, auth flows |
| [API_FRAMEWORK.md](CheckinKit/API_FRAMEWORK.md) | Integration framework reference |
| [TWILIO_SETUP_GUIDE.md](CheckinKit/TWILIO_SETUP_GUIDE.md) | SMS configuration |
| [docs/PrintNode-Setup-Guide.md](CheckinKit/docs/PrintNode-Setup-Guide.md) | PrintNode printer setup |
| [docs/Offline-Mode-Guide.md](CheckinKit/docs/Offline-Mode-Guide.md) | Offline-first behavior |
| [docs/SELF_HOSTING_GUIDE.md](CheckinKit/docs/SELF_HOSTING_GUIDE.md) | Self-hosting and AWS deployment |

---

## License

MIT
