# CheckinKit (Greet) - System Architecture Overview

**Version:** 1.0  
**Date:** February 2026  
**Status:** Production-Ready (Alpha Testing Phase)

---

## Executive Summary

CheckinKit is an enterprise-grade event registration and check-in platform designed to replace legacy native mobile applications. The system provides seamless event management with offline-first capabilities, QR code scanning, badge printing across all platforms, and robust API integrations with external ticketing platforms like Certain.

**Key Differentiators:**
- **Offline-First Architecture**: Full functionality without internet connectivity
- **Cross-Platform Printing**: Works on iOS, Android, Windows, Mac - no app installation required
- **Multi-Tenant SaaS**: Complete data isolation with hierarchical access control
- **Real-Time Sync**: Bidirectional synchronization with external event platforms
- **Enterprise Security**: AES-256 encryption, OAuth2, role-based access control

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │  Admin Portal   │  │ Staff Dashboard │  │   Kiosk Mode    │          │
│  │  (Desktop/Web)  │  │ (Mobile/Tablet) │  │ (Self-Service)  │          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│           │                    │                    │                    │
│           └────────────────────┼────────────────────┘                    │
│                                │                                         │
│  ┌─────────────────────────────┴─────────────────────────────┐          │
│  │                    React + TypeScript                      │          │
│  │  TanStack Query │ Wouter │ shadcn/ui │ Tailwind CSS       │          │
│  │                                                            │          │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │          │
│  │  │  IndexedDB   │  │ Print Queue  │  │  Sync Queue  │     │          │
│  │  │ (Attendees)  │  │  (Offline)   │  │  (Offline)   │     │          │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │          │
│  └───────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐          │
│  │              Node.js + Express + TypeScript                │          │
│  │                                                            │          │
│  │  ┌──────────────────────────────────────────────────┐     │          │
│  │  │              Core Services                        │     │          │
│  │  ├──────────────────────────────────────────────────┤     │          │
│  │  │ • Sync Orchestrator (External Platform Sync)     │     │          │
│  │  │ • Credential Manager (AES-256-GCM Encryption)    │     │          │
│  │  │ • OAuth2 Service (Token Lifecycle Management)    │     │          │
│  │  │ • Badge Template Resolver (Multi-Tier Resolution)│     │          │
│  │  │ • Notification Service (SMS, Email, Webhooks)    │     │          │
│  │  │ • Print Service (PrintNode Cloud Integration)    │     │          │
│  │  └──────────────────────────────────────────────────┘     │          │
│  │                                                            │          │
│  │  ┌──────────────────────────────────────────────────┐     │          │
│  │  │              Data Access Layer                    │     │          │
│  │  │         Drizzle ORM (Type-Safe Queries)          │     │          │
│  │  └──────────────────────────────────────────────────┘     │          │
│  └───────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │   External APIs │     │  Notification   │
│    (Neon)       │     │                 │     │    Services     │
│                 │     │ • Certain       │     │                 │
│ • Customers     │     │ • OAuth2        │     │ • Twilio (SMS)  │
│ • Events        │     │ • Bearer Token  │     │ • Resend (Email)│
│ • Attendees     │     │                 │     │ • PrintNode     │
│ • Templates     │     └─────────────────┘     └─────────────────┘
│ • Sessions      │
│ • Audit Logs    │
└─────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI Component Framework |
| **TypeScript** | Type-Safe Development |
| **Vite** | Build Tool & Dev Server |
| **TanStack Query** | Server State Management |
| **Wouter** | Lightweight Routing |
| **shadcn/ui** | UI Component Library |
| **Tailwind CSS** | Utility-First Styling |
| **IndexedDB** | Offline Data Storage |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime Environment |
| **Express.js** | HTTP Server Framework |
| **TypeScript** | Type-Safe Development |
| **Drizzle ORM** | Database Access Layer |
| **Zod** | Runtime Validation |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **PostgreSQL (Neon)** | Serverless Database |
| **Replit** | Cloud Hosting Platform |
| **Twilio** | SMS Notifications |
| **Resend** | Email Delivery |
| **PrintNode** | Cloud Print Routing |

---

## Core Features

### 1. Multi-Tenant Architecture

**Hierarchical Access Control:**
```
Super Admin
    └── Customer Accounts
            └── Admins
                    └── Managers
                            └── Staff
```

**Data Isolation:**
- Complete tenant separation via `customer_id` foreign keys
- Row-level security on all data tables
- Cascade deletes for complete data removal

### 2. Offline-First Design

The system maintains full functionality without internet connectivity:

- **Auto-Caching**: Attendee data cached to IndexedDB on load
- **Offline Check-In**: Check-ins stored locally when offline
- **Sync Queue**: Automatic sync when connectivity restores
- **Print Queue**: Badges queued for printing when offline

### 3. Cross-Platform Badge Printing

| Platform | Method | Prerequisites |
|----------|--------|---------------|
| **iOS/iPad** | Network Print (IP:9100) | Printer on same network |
| **Android** | Zebra Browser Print | Zebra app from Play Store |
| **Mac** | Zebra Browser Print | Desktop app installed |
| **Windows** | Zebra Browser Print | Desktop app installed |
| **Any Device** | PrintNode Cloud | Internet + PrintNode client |

**Print Specifications:**
- 300/600 DPI high-quality canvas rendering
- Custom badge templates with merge fields
- QR code placement and sizing options
- PDF fallback for unsupported printers

### 4. External Platform Integration

**Supported Platforms:**
- Certain (OAuth2 + Basic Auth)
- Bearer Token (Generic)
- Additional providers can be added

**Integration Capabilities:**
- Automated event discovery
- Bidirectional attendee sync
- Real-time webhook notifications
- Session and registration sync

### 5. Check-In Workflow System

Configurable multi-step check-in process:

1. **Buyer Questions** - Custom surveys (single/multiple choice, text)
2. **Disclaimers** - Legal acknowledgments with optional signature capture
3. **Badge Review** - Attendee data verification before printing
4. **Badge Print** - One-touch printing to configured printer

### 6. Notification System

**Channels:**
- SMS via Twilio
- Email via Resend
- Webhooks to external systems

**Triggers:**
- Check-in events
- VIP arrivals
- Capacity alerts
- Custom rules by participant type

---

## Security Architecture

### Authentication Methods

| Method | Use Case | Security Features |
|--------|----------|-------------------|
| **SMS OTP** | Admin login | 6-digit code, 10-min expiry, rate limiting |
| **Email OTP** | Backup admin login | Same as SMS |
| **Passcode** | Staff access | SHA-256 hashed, time-window access |
| **OAuth2** | Platform integrations | PKCE, token rotation |

### Credential Security

- **Encryption**: AES-256-GCM for all stored credentials
- **Token Management**: Automatic refresh with secure storage
- **Audit Trail**: Complete logging of all access and changes
- **Rate Limiting**: 5 attempts per 15 minutes with lockout

### Data Protection

- No payment card data stored (PCI compliance)
- Environment variable references only for API keys
- HMAC verification for incoming webhooks
- Role-based access control on all endpoints

---

## Performance & Scalability

### Load Testing Results (Feb 2026)

| Metric | Result |
|--------|--------|
| **Throughput** | 1,015 check-ins/second |
| **Database P95 Latency** | 13ms |
| **Target Capacity** | 1,827x required for 1000 check-ins in 30 min |

### Scalability Features

- Serverless PostgreSQL (Neon) with auto-scaling
- Stateless API design for horizontal scaling
- Connection pooling for database efficiency
- CDN-ready static asset delivery

---

## Data Model (Key Entities)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Customers  │────<│   Events    │────<│  Attendees  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Templates  │     │  Sessions   │     │  Responses  │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Integrations│     │   Printers  │     │  Locations  │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Deployment Architecture

### Current Environment
- **Platform**: Replit (Cloud-hosted)
- **Database**: Neon PostgreSQL (Serverless)
- **Region**: US (configurable)

### Environment Configuration
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `SESSION_SECRET` | Session encryption |
| `CREDENTIAL_ENCRYPTION_KEY` | API credential encryption |
| `TWILIO_*` | SMS notification service |
| `RESEND_API_KEY` | Email delivery |
| `PRINTNODE_API_KEY` | Cloud printing (optional) |

---

## Operational Modes

### 1. Admin Portal
Full management interface for:
- Customer and event management
- Badge template design
- Integration configuration
- User and role management
- Reports and analytics

### 2. Staff Dashboard
Mobile-optimized check-in interface:
- QR code scanning
- Manual attendee search
- Badge printing
- Session check-in/out

### 3. Kiosk Mode
Self-service attendee station:
- Front-facing camera for self-scan
- PIN-protected exit
- Window locking for security
- Auto-recovery from errors

---

## Monitoring & Observability

### Logging
- Structured JSON logs
- Request/response timing
- Error tracking with stack traces
- Sync operation auditing

### Health Checks
- Database connectivity
- External API status
- Print service availability
- Queue depths

---

## Roadmap Highlights

### Completed (Jan-Feb 2026)
- Modular dashboard architecture
- OTP authentication system
- Configuration templates
- Session time tracking
- Check-in notification rules
- Load testing validation

### Upcoming
- Group check-in (batch processing)
- Dependency injection refactoring
- AI assistant for staff
- Balance due validation
- Additional platform integrations

---

## Contact & Support

For technical questions or support:
- Review the full developer documentation in `/docs/`
- Check the `replit.md` file for detailed implementation notes
- Access sync logs via the admin integration panel

---

*Document generated for internal architecture review. Contains proprietary system information.*
