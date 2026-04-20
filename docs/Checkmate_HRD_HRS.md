# Hardware Requirements Specification (HRS) & High-Level Requirements Document (HRD)

**Project:** Greet (Event Check-In & Badge Printing System)  
**Version:** 1.0.0  
**Date:** January 15, 2026

---

## 1. System Overview

Greet is an enterprise-grade event registration and check-in platform designed to replace legacy native mobile applications. The system provides seamless event management with offline-first capabilities, QR code scanning, badge printing, and robust API integrations with external ticketing platforms (Certain, etc.).

### Hosting Model

**Platform:** Replit Cloud (Managed PaaS)  
**Infrastructure Provider:** Google Cloud Platform (GCP)  
**Data Center Location:** United States

Greet operates as a fully managed cloud application on Replit's deployment infrastructure. **No on-premise hardware is required.** All compute, storage, networking, and scaling are handled by the platform.

### High-Level Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REPLIT CLOUD PLATFORM                        │
│                     (Google Cloud Platform - US)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐     ┌─────────────────────────────────────────────┐  │
│   │  Users   │────▶│  Load Balancer / WAF / TLS Termination      │  │
│   │ (HTTPS)  │     │  (Automatic - Platform Managed)             │  │
│   └──────────┘     └─────────────────────────────────────────────┘  │
│                                    │                                 │
│                                    ▼                                 │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              AUTOSCALE DEPLOYMENT CLUSTER                    │   │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │
│   │  │ Node.js │  │ Node.js │  │ Node.js │  │   ...   │        │   │
│   │  │Instance │  │Instance │  │Instance │  │(0 to N) │        │   │
│   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │   │
│   │           (Stateless - Horizontal Scaling)                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                          │                    │                      │
│              ┌───────────┘                    └───────────┐          │
│              ▼                                            ▼          │
│   ┌─────────────────────────┐          ┌─────────────────────────┐  │
│   │   PostgreSQL Database   │          │    Object Storage       │  │
│   │   (Neon Serverless)     │          │    (Google Cloud)       │  │
│   │   - Auto-scaling        │          │    - Badge Assets       │  │
│   │   - Point-in-time       │          │    - Event Images       │  │
│   │     Recovery            │          │    - Document Uploads   │  │
│   └─────────────────────────┘          └─────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Server Requirements (Compute)

### A. Application Nodes (Managed by Replit)

Greet uses **Autoscale Deployment** for optimal cost and performance.

| Component | Specification | Notes |
|-----------|---------------|-------|
| Runtime | Node.js 20 LTS | Express.js + TypeScript |
| Deployment Type | Autoscale | Scales 0 to N instances based on traffic |
| Instance Size | Configurable vCPU/RAM | Selected at deployment time |
| Scaling | Horizontal (Automatic) | Platform adds/removes instances as needed |
| Idle Behavior | Scales to Zero | No cost when no traffic |
| State | Stateless | All state persisted in PostgreSQL |
| Health Endpoint | `/api/health` | Platform monitors automatically |

**Key Characteristics:**
- **Immutable Deployments:** Each deployment is a fresh container image
- **Zero Downtime Deploys:** Rolling updates handled by platform
- **No SSH/Console Access:** Managed environment (security benefit)

### B. Database Server (Neon PostgreSQL)

Greet uses Replit's managed PostgreSQL 16 database powered by Neon.

| Component | Specification | Notes |
|-----------|---------------|-------|
| Engine | PostgreSQL 16 | Fully managed, serverless |
| Hosting | Neon (Replit-integrated) | Automatic connection pooling |
| Storage Limit | 10 GiB per database | Expandable upon request |
| Default Size | 33 MB baseline | Grows with data |
| Compute | Serverless/Auto-scaling | Active only when receiving queries |
| Idle Timeout | 5 minutes after last query | Resumes instantly on next request |
| Backups | Point-in-time Recovery | Platform managed |
| Connection | TLS/SSL Required | Via `DATABASE_URL` env var |

**Connection Credentials (Environment Variables):**
- `DATABASE_URL` - Full connection string
- `PGHOST` - Database hostname
- `PGUSER` - Database username  
- `PGPASSWORD` - Database password
- `PGDATABASE` - Database name
- `PGPORT` - Connection port

---

## 3. Storage Requirements

### A. Object Storage (Google Cloud Storage)

Stores badge assets, event images, customer logos, and document uploads.

| Attribute | Specification |
|-----------|---------------|
| Provider | Google Cloud Storage (via Replit App Storage) |
| Capacity | Unlimited (Pay-per-use) |
| Pricing | $0.026 per GiB/month storage |
| Data Transfer | $0.12 per GiB egress |
| Operations | $0.004 per 1,000 basic ops |
| Access Control | Bucket-level policies + signed URLs |
| CDN | Automatic edge caching for static assets |

**Storage Structure:**
```
/public/
  ├── customers/{customer_id}/
  │   ├── logo.png
  │   └── backgrounds/
  ├── templates/{template_id}/
  │   └── assets/
  └── fonts/
      └── custom/

/private/
  └── exports/
      └── {event_id}/
```

### B. Application Logs

| Attribute | Specification |
|-----------|---------------|
| Type | Platform-managed logging |
| Retention | 7 days (standard) |
| Access | Replit Dashboard or API |
| Format | Structured JSON (stdout/stderr) |

**Note:** No persistent local disk required. The application is stateless.

---

## 4. Network Requirements

### A. Connectivity & Ports

| Direction | Protocol | Port | Description |
|-----------|----------|------|-------------|
| Inbound | HTTPS | 443 | All public web traffic (TLS terminated at edge) |
| Internal | HTTP | 5000 | Application port (not publicly exposed) |
| Outbound | HTTPS | 443 | External APIs (Certain, Stripe, Twilio, etc.) |
| Outbound | TCP | 5432 | PostgreSQL connection (internal/encrypted) |

### B. TLS/SSL Configuration

| Attribute | Specification |
|-----------|---------------|
| Protocol | TLS 1.2+ (enforced) |
| Certificate | Automatic (Let's Encrypt via platform) |
| Custom Domain | Supported with DNS configuration |
| HSTS | Enabled by default |

### C. DNS Configuration (for Custom Domains)

To use a custom domain (e.g., `checkin.yourcompany.com`):

1. Add an **A Record** pointing to Replit's IP (provided in dashboard)
2. Add a **TXT Record** for domain verification
3. Wait for DNS propagation (up to 48 hours)

**Important:** Do not use Cloudflare proxy mode. Use DNS-only.

### D. Outbound API Dependencies

| Service | Purpose | Protocol |
|---------|---------|----------|
| Certain API | Event/Attendee sync | HTTPS/REST |
| Twilio | SMS notifications | HTTPS/REST |
| Resend | Email delivery | HTTPS/REST |
| PrintNode | Cloud printing | HTTPS/REST |
| OpenAI | AI badge assistant | HTTPS/REST |

---

## 5. Security & Compliance

### A. Platform Security (Replit/GCP)

| Certification | Status |
|---------------|--------|
| SOC 2 Type 2 | ✅ Compliant (GCP + Replit) |
| ISO 27001 | ✅ Compliant (GCP) |
| GDPR | ✅ Data processing in compliance |

### B. Data Encryption

| Layer | Method |
|-------|--------|
| In Transit | TLS 1.2+ (all connections) |
| At Rest (Database) | AES-256 (GCP-managed keys) |
| At Rest (Object Storage) | AES-256 (GCP-managed keys) |

### C. Authentication Architecture

Greet implements a dual authentication system:

**1. Replit Auth (Primary - Admin Users)**
- OpenID Connect (OIDC) via Replit identity service
- Session-based with PostgreSQL-backed session store
- `SameSite=Lax` cookies for OIDC redirect compatibility

**2. Email/Password (Standalone Users)**
- bcrypt-hashed passwords (cost factor 12)
- Session tokens stored in HttpOnly cookies
- Password reset via secure email links

### D. Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| Super Admin | Full system access, all customers |
| Admin | Full customer access, manage events/staff |
| Manager | Event management, limited settings |
| Staff | Check-in only, assigned events |

### E. Multi-Tenant Isolation

- **Strategy:** Row-level isolation via `customer_id` foreign keys
- **Enforcement:** API-level middleware validates tenant context
- **Cascade Deletes:** Complete data removal when tenants are deleted

### F. Secrets Management

| Secret Type | Storage Method |
|-------------|----------------|
| API Keys | Replit Secrets (encrypted at rest) |
| Database Credentials | Platform-injected environment variables |
| Integration Credentials | AES-256-GCM encrypted in database |
| OAuth Tokens | Encrypted with automatic refresh |

**Secrets are NEVER stored in source code or version control.**

### G. PCI-DSS Considerations

Greet does **not** process payment card data directly. If payment integration is added:
- Use Stripe Elements (client-side tokenization)
- Only store `stripe_customer_id` and `payment_method_token`
- Maintains **SAQ A** compliance

---

## 6. Client-Side Requirements

### A. Supported Devices

| Device Type | Support Level |
|-------------|---------------|
| Desktop/Laptop | Full support |
| Tablet (iPad, Android) | Full support (optimized for check-in) |
| Mobile Phone | Supported (responsive design) |

### B. Browser Requirements

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Edge | 90+ |
| Safari | 14+ |
| Firefox | 90+ |

**Note:** Internet Explorer is **NOT supported.**

### C. Display Requirements

| Attribute | Specification |
|-----------|---------------|
| Minimum Resolution | 1024 x 768 |
| Recommended | 1920 x 1080 |
| Touch Support | Required for tablet check-in |

### D. Network Requirements

| Attribute | Specification |
|-----------|---------------|
| Minimum | 4G / 5 Mbps broadband |
| Recommended | WiFi / 25+ Mbps |
| Offline | IndexedDB caching (limited offline check-in) |

---

## 7. Print System Requirements

Greet supports multiple badge printing methods:

### A. Print Methods by Platform

| Platform | Method | Prerequisites |
|----------|--------|---------------|
| Mac/Windows | Zebra Browser Print | Install desktop app from zebra.com |
| Android | Zebra Browser Print | Install app from Play Store |
| iOS/iPad | Network Print (IP:9100) | Configure printer IP in settings |
| All Platforms | PrintNode Cloud | PRINTNODE_API_KEY secret configured |
| All Platforms | Browser Print/PDF | Standard browser print dialog |

### B. Supported Printers

| Printer Model | Connection Type | DPI |
|---------------|-----------------|-----|
| Zebra ZD621 | USB, Network | 203 or 300 |
| Zebra ZD421 | USB, Network | 203 or 300 |
| Generic Thermal | Network (Port 9100) | Varies |

### C. Network Printer Setup

1. Printer must be on same network as device
2. Port 9100 must be open (outbound from device to printer)
3. Configure printer IP address in Greet settings

---

## 8. Infrastructure Comparison

### What Replit Manages vs. What You Manage

| Component | Managed By |
|-----------|------------|
| Physical Hardware | Replit/GCP |
| Operating System | Replit |
| Container Runtime | Replit |
| Load Balancing | Replit |
| TLS Certificates | Replit (auto-renewed) |
| Database Backups | Replit/Neon |
| Scaling | Replit (automatic) |
| WAF/DDoS Protection | Replit/GCP |
| Application Code | Your Team |
| Database Schema | Your Team |
| Secrets Configuration | Your Team |
| Custom Domain DNS | Your Team |
| Integration Credentials | Your Team |

---

## 9. Deployment Architecture

### A. Deployment Process

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Code Change   │────▶│  Replit Build   │────▶│  Deploy to      │
│   (Git Push)    │     │  (Automatic)    │     │  Production     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ Health Check  │
                        │   Passes      │
                        └───────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ Traffic Routed│
                        │ to New Version│
                        └───────────────┘
```

### B. Rollback Strategy

- **Automatic Checkpoints:** Platform creates checkpoints before each deployment
- **One-Click Rollback:** Revert code, database, and configuration atomically
- **No Manual Intervention Required:** Available through Replit dashboard

### C. Environment Configuration

| Environment | Purpose |
|-------------|---------|
| Development | Active development, live preview |
| Production | Public deployment, autoscaled |

**Environment Variables:**
- Secrets stored in Replit Secrets Manager
- Development and Production can have different values
- Never committed to source control

---

## 10. Monitoring & Observability

### A. Built-in Monitoring

| Feature | Description |
|---------|-------------|
| Deployment Logs | Real-time stdout/stderr streaming |
| Error Tracking | Automatic error capture in logs |
| Health Checks | Platform monitors `/api/health` endpoint |
| Usage Metrics | CPU, RAM, request counts in dashboard |

### B. Recommended Additions (Optional)

| Service | Purpose |
|---------|---------|
| Sentry | Error tracking with stack traces |
| LogTail/Papertrail | Log aggregation and search |
| Better Uptime | External uptime monitoring |

---

## 11. Disaster Recovery

### A. Data Protection

| Component | Recovery Method | RPO | RTO |
|-----------|-----------------|-----|-----|
| Database | Point-in-time recovery | ~1 min | < 5 min |
| Object Storage | GCS redundancy | 0 | Automatic |
| Application | Checkpoint rollback | 0 (code) | < 2 min |

**RPO** = Recovery Point Objective (max data loss)  
**RTO** = Recovery Time Objective (max downtime)

### B. Availability

| Component | SLA |
|-----------|-----|
| Replit Platform | 99.9% uptime target |
| GCP Infrastructure | 99.95%+ SLA |
| Neon Database | 99.95% SLA |

---

## 12. Cost Structure

### A. Billing Components

| Component | Billing Basis |
|-----------|---------------|
| Compute (Autoscale) | CPU-seconds + RAM-seconds |
| Database | Compute hours + Storage GiB |
| Object Storage | Storage GiB + Transfer GiB |
| Custom Domains | Included |

### B. Cost Optimization

- **Autoscale to Zero:** No compute costs during idle periods
- **Serverless Database:** Only billed when actively queried
- **Included in Replit Plans:** Development environment, collaboration, version control

---

## 13. IT/DevOps Responsibilities

### Your Team's Responsibilities:

1. **DNS Configuration**
   - Point custom domain to Replit
   - Maintain DNS records

2. **Secrets Management**
   - Provide API keys for integrations (Certain, Twilio, etc.)
   - Rotate credentials as needed

3. **Network Allowlisting (if required)**
   - Allow outbound HTTPS to: `*.replit.dev`, `*.replit.app`
   - Allow outbound to integration APIs

4. **Printer Network Configuration**
   - Ensure Zebra printers accessible on local network
   - Open port 9100 for network printing

5. **User Management**
   - Provision admin accounts
   - Manage role assignments

### Platform Handles:

- All infrastructure provisioning
- Patching and updates
- SSL certificate management
- Scaling and load balancing
- Database maintenance
- Backup management

---

## 14. Contact & Support

| Resource | Access |
|----------|--------|
| Replit Documentation | https://docs.replit.com |
| Replit Status Page | https://status.replit.com |
| Replit Support | Via dashboard (for paid plans) |
| Application Support | Internal IT/Development team |

---

## Appendix A: Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | React 18 + TypeScript |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS |
| State Management | TanStack Query |
| Routing | Wouter |
| Backend Runtime | Node.js 20 LTS |
| Backend Framework | Express.js |
| Database ORM | Drizzle ORM |
| Database | PostgreSQL 16 (Neon) |
| Object Storage | Google Cloud Storage |
| Authentication | Replit Auth (OIDC) + Email/Password |
| Build Tool | Vite |

---

## Appendix B: Environment Variables Reference

| Variable | Purpose | Required |
|----------|---------|----------|
| DATABASE_URL | PostgreSQL connection string | Yes (auto) |
| SESSION_SECRET | Session encryption key | Yes |
| RESEND_API_KEY | Email delivery | Yes |
| PRINTNODE_API_KEY | Cloud printing | Optional |
| TWILIO_ACCOUNT_SID | SMS notifications | Optional |
| TWILIO_AUTH_TOKEN | SMS notifications | Optional |
| TWILIO_PHONE_NUMBER | SMS sender number | Optional |

---

*Document generated for IT/DevOps planning. Replit platform specifications subject to change - refer to https://docs.replit.com for current details.*
