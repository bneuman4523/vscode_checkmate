# Checkmate Enterprise Deployment Architecture

**Version:** 1.0  
**Date:** February 2026  
**Classification:** Internal Technical Documentation  
**Audience:** DevOps, Infrastructure, Security Teams

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure Architecture](#2-infrastructure-architecture)
3. [Application Architecture](#3-application-architecture)
4. [Data Architecture](#4-data-architecture)
5. [Security Architecture](#5-security-architecture)
6. [Scalability & Performance](#6-scalability--performance)
7. [High Availability & Disaster Recovery](#7-high-availability--disaster-recovery)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Environment Management](#10-environment-management)
11. [Network Architecture](#11-network-architecture)
12. [Compliance & Governance](#12-compliance--governance)
13. [Operational Runbooks](#13-operational-runbooks)

---

## 1. System Overview

### 1.1 Purpose

Checkmate is a multi-tenant SaaS platform for event registration and check-in, designed to replace legacy native mobile applications. The system handles real-time attendee check-in, badge printing, and bidirectional synchronization with external event management platforms.

### 1.2 Key Characteristics

| Characteristic | Description |
|---------------|-------------|
| **Architecture Style** | Monolithic with service-oriented internal structure |
| **Deployment Model** | Cloud-native SaaS (single-tenant deployment optional) |
| **Data Residency** | Configurable per deployment region |
| **Availability Target** | 99.9% uptime during event hours |
| **Recovery Time Objective (RTO)** | < 15 minutes |
| **Recovery Point Objective (RPO)** | < 5 minutes |

### 1.3 Technology Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  React 18 │ TypeScript │ Vite │ TanStack Query │ Tailwind   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  Node.js 20 │ Express.js │ TypeScript │ Zod Validation      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│  PostgreSQL 15 │ Drizzle ORM │ Connection Pooling           │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                 EXTERNAL INTEGRATIONS                        │
│  Certain API │ Twilio │ Resend │ PrintNode │ OAuth2         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure Architecture

### 2.1 Current Deployment (Replit)

```
┌─────────────────────────────────────────────────────────────────┐
│                        REPLIT PLATFORM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 APPLICATION CONTAINER                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │   Vite      │  │  Express    │  │  Static     │      │    │
│  │  │   Build     │  │  Server     │  │  Assets     │      │    │
│  │  │   (Dev)     │  │  :5000      │  │  /dist      │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SECRETS MANAGER                       │    │
│  │  DATABASE_URL │ SESSION_SECRET │ CREDENTIAL_ENCRYPTION   │    │
│  │  TWILIO_* │ RESEND_API_KEY │ PRINTNODE_API_KEY          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ TLS 1.3
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEON POSTGRESQL (Serverless)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Primary   │  │   Read      │  │   Point-in  │              │
│  │   Database  │  │   Replicas  │  │   Time      │              │
│  │             │  │   (Auto)    │  │   Recovery  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Enterprise Deployment (Cloud-Agnostic)

For enterprise deployments requiring dedicated infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│                      LOAD BALANCER (L7)                          │
│              TLS Termination │ WAF │ Rate Limiting               │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   App Node 1    │ │   App Node 2    │ │   App Node N    │
│   ┌─────────┐   │ │   ┌─────────┐   │ │   ┌─────────┐   │
│   │ Express │   │ │   │ Express │   │ │   │ Express │   │
│   │ :5000   │   │ │   │ :5000   │   │ │   │ :5000   │   │
│   └─────────┘   │ │   └─────────┘   │ │   └─────────┘   │
│   Container/VM  │ │   Container/VM  │ │   Container/VM  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE CLUSTER                              │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │     PRIMARY     │───────▶│    REPLICA 1    │                 │
│  │   (Read/Write)  │        │   (Read Only)   │                 │
│  └─────────────────┘        └─────────────────┘                 │
│           │                                                      │
│           └────────────────▶┌─────────────────┐                 │
│                             │    REPLICA 2    │                 │
│                             │   (Read Only)   │                 │
│                             └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Infrastructure Requirements

#### Compute Resources

| Component | Minimum | Recommended | High-Volume Events |
|-----------|---------|-------------|-------------------|
| **CPU** | 2 vCPU | 4 vCPU | 8+ vCPU |
| **Memory** | 4 GB | 8 GB | 16+ GB |
| **Storage** | 20 GB SSD | 50 GB SSD | 100+ GB SSD |
| **Instances** | 1 | 2-3 | 4+ with auto-scaling |

#### Database Resources

| Tier | Connections | Storage | IOPS | Use Case |
|------|------------|---------|------|----------|
| **Development** | 25 | 10 GB | 1,000 | Testing |
| **Production** | 100 | 50 GB | 3,000 | Standard events |
| **Enterprise** | 500+ | 200+ GB | 10,000+ | High-volume |

---

## 3. Application Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                       │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Admin Portal   │ Staff Dashboard │    Kiosk Mode               │
│  (Desktop Web)  │ (Mobile/Tablet) │  (Self-Service)             │
└────────┬────────┴────────┬────────┴────────────┬────────────────┘
         │                 │                      │
         │            REST API (HTTPS)            │
         │                 │                      │
┌────────▼─────────────────▼──────────────────────▼────────────────┐
│                      EXPRESS.JS SERVER                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    MIDDLEWARE LAYER                          │ │
│  │  CORS │ Rate Limiting │ Auth │ Request Logging │ Error      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Routes    │  │   Routes    │  │   Routes    │              │
│  │   /api/*    │  │  /api/staff │  │ /api/admin  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────▼────────────────▼────────────────▼──────┐              │
│  │                 SERVICE LAYER                  │              │
│  ├───────────────────────────────────────────────┤              │
│  │  ┌─────────────────┐  ┌─────────────────┐     │              │
│  │  │ SyncOrchestrator│  │CredentialManager│     │              │
│  │  │ - Event sync    │  │ - AES-256-GCM   │     │              │
│  │  │ - Attendee sync │  │ - Key rotation  │     │              │
│  │  │ - Session sync  │  │ - Token refresh │     │              │
│  │  └─────────────────┘  └─────────────────┘     │              │
│  │                                                │              │
│  │  ┌─────────────────┐  ┌─────────────────┐     │              │
│  │  │ BadgeTemplate   │  │ Notification    │     │              │
│  │  │ Resolver        │  │ Service         │     │              │
│  │  │ - Multi-tier    │  │ - SMS (Twilio)  │     │              │
│  │  │ - Type mapping  │  │ - Email (Resend)│     │              │
│  │  └─────────────────┘  └─────────────────┘     │              │
│  │                                                │              │
│  │  ┌─────────────────┐  ┌─────────────────┐     │              │
│  │  │ OAuth2 Service  │  │ Print Service   │     │              │
│  │  │ - PKCE flow     │  │ - PrintNode API │     │              │
│  │  │ - Token mgmt    │  │ - Direct IP     │     │              │
│  │  └─────────────────┘  └─────────────────┘     │              │
│  └───────────────────────────────────────────────┘              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    DATA ACCESS LAYER                         │ │
│  │              Drizzle ORM │ Connection Pooling                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Request Flow

```
Client Request
      │
      ▼
┌─────────────────┐
│  TLS Termination │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Rate Limiter  │──── 429 Too Many Requests
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  CORS Validation│──── 403 Forbidden
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authentication  │──── 401 Unauthorized
│  - JWT/Session  │
│  - Staff Auth   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authorization   │──── 403 Forbidden
│  - Role check   │
│  - Tenant check │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Request Handler │
│  - Validation   │──── 400 Bad Request
│  - Processing   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Service Layer   │
│  - Business     │──── 500 Internal Error
│    Logic        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Data Layer      │
│  - Drizzle ORM  │
│  - PostgreSQL   │
└────────┬────────┘
         │
         ▼
   200 OK Response
```

### 3.3 API Endpoint Categories

| Category | Base Path | Auth Required | Rate Limit |
|----------|-----------|---------------|------------|
| Public | `/api/settings/*` | No | 100/min |
| Admin | `/api/*` | Session + Role | 1000/min |
| Staff | `/api/staff/*` | Staff JWT | 500/min |
| Integrations | `/api/integrations/*` | Admin | 100/min |
| Webhooks | `/api/webhooks/*` | HMAC | 1000/min |

---

## 4. Data Architecture

### 4.1 Database Schema Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT ISOLATION                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   customers     │──────────────────────────────────────────────┐
│   (tenant root) │                                              │
└────────┬────────┘                                              │
         │                                                        │
    ┌────┴────┬──────────────┬──────────────┬──────────────┐     │
    ▼         ▼              ▼              ▼              ▼     │
┌───────┐ ┌───────┐    ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│events │ │printers│    │templates │  │locations │  │integrations│
└───┬───┘ └───────┘    └──────────┘  └──────────┘  └─────┬─────┘│
    │                                                     │      │
    ├─────────────────────────┬───────────────────────────┘      │
    ▼                         ▼                                   │
┌───────────┐           ┌──────────────┐                         │
│ attendees │           │ sync_states  │                         │
└─────┬─────┘           └──────────────┘                         │
      │                                                           │
      ├──────────────┬──────────────┬──────────────┐             │
      ▼              ▼              ▼              ▼             │
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│responses │  │signatures│  │sessions  │  │activity  │          │
│          │  │          │  │registr.  │  │logs      │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘          │
                                                                  │
└─────────────────────────────────────────────────────────────────┘
                    All tables scoped by customer_id
```

### 4.2 Key Tables

| Table | Purpose | Estimated Rows | Indexes |
|-------|---------|----------------|---------|
| `customers` | Tenant accounts | 100s | PK |
| `events` | Event definitions | 1,000s | customer_id, external_id |
| `attendees` | Event attendees | 100,000s+ | event_id, external_id, email, order_code |
| `badge_templates` | Badge designs | 1,000s | customer_id |
| `customer_integrations` | API connections | 100s | customer_id |
| `temp_staff_sessions` | Active staff logins | 1,000s | event_id, expires_at |
| `temp_staff_activity_logs` | Audit trail | 1,000,000s+ | session_id, created_at |

### 4.3 Data Retention Policy

| Data Type | Retention | Archive Strategy |
|-----------|-----------|------------------|
| Customer accounts | Indefinite | N/A |
| Events | 2 years after end date | Cold storage |
| Attendees | 1 year after event | Anonymize or delete |
| Activity logs | 90 days | Aggregate then delete |
| Sync logs | 30 days | Delete |
| Session tokens | 24 hours | Auto-expire |

### 4.4 Backup Strategy

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| **Full snapshot** | Daily | 30 days | Cross-region |
| **Point-in-time** | Continuous (WAL) | 7 days | Same region |
| **Cold archive** | Monthly | 1 year | Glacier/Archive |

---

## 5. Security Architecture

### 5.1 Authentication Mechanisms

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOWS                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ADMIN LOGIN (OTP)                                               │
│                                                                  │
│  User ──▶ Enter Phone/Email ──▶ Request OTP ──▶ Receive Code    │
│                                      │                           │
│                                      ▼                           │
│                              ┌──────────────┐                   │
│                              │  Rate Limit  │                   │
│                              │  5/15 min    │                   │
│                              └──────┬───────┘                   │
│                                     │                            │
│                                     ▼                            │
│                              ┌──────────────┐                   │
│                              │ OTP Generated│                   │
│                              │ - 6 digits   │                   │
│                              │ - bcrypt hash│                   │
│                              │ - 10min TTL  │                   │
│                              └──────┬───────┘                   │
│                                     │                            │
│  User ──▶ Enter OTP ──▶ Verify ──▶ Session Created              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  STAFF LOGIN (Passcode)                                          │
│                                                                  │
│  Staff ──▶ Enter Passcode ──▶ Validate ──▶ JWT Issued           │
│                                   │                              │
│                                   ▼                              │
│                            ┌─────────────┐                      │
│                            │ SHA-256     │                      │
│                            │ Comparison  │                      │
│                            └──────┬──────┘                      │
│                                   │                              │
│                                   ▼                              │
│                            ┌─────────────┐                      │
│                            │ Time Window │                      │
│                            │ Validation  │                      │
│                            └──────┬──────┘                      │
│                                   │                              │
│                                   ▼                              │
│                            ┌─────────────┐                      │
│                            │ JWT Token   │                      │
│                            │ - 12hr max  │                      │
│                            │ - Event ID  │                      │
│                            └─────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  INTEGRATION AUTH (OAuth2 + PKCE)                                │
│                                                                  │
│  Admin ──▶ Connect ──▶ OAuth2 Flow ──▶ Tokens Stored            │
│                            │                                     │
│                            ▼                                     │
│                     ┌─────────────┐                             │
│                     │ Auth Code   │                             │
│                     │ + PKCE      │                             │
│                     │ Verifier    │                             │
│                     └──────┬──────┘                             │
│                            │                                     │
│                            ▼                                     │
│                     ┌─────────────┐                             │
│                     │ AES-256-GCM │                             │
│                     │ Encrypted   │                             │
│                     │ Token Store │                             │
│                     └─────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Authorization Matrix

| Resource | Super Admin | Admin | Manager | Staff |
|----------|-------------|-------|---------|-------|
| Customer CRUD | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ (own customer) | ❌ | ❌ |
| Integration CRUD | ✅ | ✅ | ❌ | ❌ |
| Event Configuration | ✅ | ✅ | ✅ | ❌ |
| Check-in Operations | ✅ | ✅ | ✅ | ✅ |
| View Reports | ✅ | ✅ | ✅ | ❌ |
| Attendee Data Export | ✅ | ✅ | ❌ | ❌ |

### 5.3 Encryption Standards

| Data Type | At Rest | In Transit | Key Management |
|-----------|---------|------------|----------------|
| Database | AES-256 (Neon) | TLS 1.3 | Provider managed |
| API Credentials | AES-256-GCM | TLS 1.3 | CREDENTIAL_ENCRYPTION_KEY |
| Session Data | N/A (DB) | TLS 1.3 | SESSION_SECRET |
| Passwords/OTP | bcrypt (12 rounds) | TLS 1.3 | N/A |
| OAuth Tokens | AES-256-GCM | TLS 1.3 | Auto-rotation |

### 5.4 Security Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
Referrer-Policy: strict-origin-when-cross-origin
```

### 5.5 Rate Limiting

| Endpoint Category | Limit | Window | Response |
|------------------|-------|--------|----------|
| OTP Request | 5 | 15 min | 429 + lockout |
| OTP Verify | 5 | 15 min | 429 + lockout |
| API General | 1000 | 1 min | 429 |
| Staff Endpoints | 500 | 1 min | 429 |
| Webhook Ingress | 1000 | 1 min | 429 |

---

## 6. Scalability & Performance

### 6.1 Load Testing Results

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Check-ins/second | 1,015 | 50 | ✅ 20x headroom |
| DB P95 Latency | 13ms | <100ms | ✅ |
| API Response P95 | <200ms | <500ms | ✅ |
| Concurrent Users | 500+ | 100 | ✅ |

### 6.2 Scaling Strategy

#### Horizontal Scaling (Stateless)

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │ Node 1  │         │ Node 2  │         │ Node N  │
    │         │         │         │         │         │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    │  (Shared State) │
                    └─────────────────┘
```

**Scaling Triggers:**
- CPU > 70% for 5 minutes → Add instance
- Memory > 80% for 5 minutes → Add instance
- Response time P95 > 500ms → Add instance

#### Database Scaling

| Level | Strategy | When to Apply |
|-------|----------|---------------|
| 1 | Connection pooling | Always |
| 2 | Read replicas | >100 concurrent users |
| 3 | Vertical scaling | >500 concurrent users |
| 4 | Sharding by tenant | >1M attendees |

### 6.3 Caching Strategy

| Cache Layer | Technology | TTL | Invalidation |
|-------------|------------|-----|--------------|
| Client (Browser) | IndexedDB | Session | Manual refresh |
| API Response | TanStack Query | 30s-5min | Mutation-based |
| Session | PostgreSQL | 24h | Expiry |
| Static Assets | CDN | 1 year | Versioned URLs |

---

## 7. High Availability & Disaster Recovery

### 7.1 Availability Zones

```
┌─────────────────────────────────────────────────────────────────┐
│                         REGION (Primary)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │      AZ-A       │     │      AZ-B       │                    │
│  │  ┌───────────┐  │     │  ┌───────────┐  │                    │
│  │  │  App (1)  │  │     │  │  App (2)  │  │                    │
│  │  └───────────┘  │     │  └───────────┘  │                    │
│  │  ┌───────────┐  │     │  ┌───────────┐  │                    │
│  │  │  DB Primary│ │────▶│  │ DB Replica│  │                    │
│  │  └───────────┘  │     │  └───────────┘  │                    │
│  └─────────────────┘     └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Async Replication
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       REGION (DR/Secondary)                      │
│  ┌─────────────────┐                                            │
│  │ Standby DB      │                                            │
│  │ (Warm standby)  │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Failure Scenarios

| Scenario | Detection | Automatic Recovery | Manual Steps |
|----------|-----------|-------------------|--------------|
| App instance failure | Health check (30s) | LB removes instance | None |
| Database primary failure | Connection timeout | Failover to replica | Promote replica |
| Region failure | DNS health check | Traffic to DR region | Verify data sync |
| Integration API down | API errors | Circuit breaker | Notify admin |

### 7.3 Recovery Procedures

#### Database Recovery

```
1. Point-in-Time Recovery (RPO < 5 min):
   - Identify target timestamp
   - Initiate Neon branch from backup
   - Verify data integrity
   - Update connection string
   - Restart application

2. Full Restore (RPO < 24 hours):
   - Download latest snapshot
   - Restore to new instance
   - Apply WAL logs if available
   - Update DNS/connection
```

### 7.4 Backup Verification

| Test Type | Frequency | Success Criteria |
|-----------|-----------|------------------|
| Backup completion | Daily | No errors in logs |
| Restore test | Monthly | Data integrity verified |
| DR failover drill | Quarterly | RTO < 15 minutes achieved |

---

## 8. Monitoring & Observability

### 8.1 Metrics Collection

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Metrics   │  │    Logs     │  │   Traces    │              │
│  │  (Counters, │  │ (Structured │  │ (Request    │              │
│  │   Gauges)   │  │    JSON)    │  │   Spans)    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                       │
│                   ┌─────────────┐                               │
│                   │  Dashboard  │                               │
│                   │  & Alerts   │                               │
│                   └─────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Key Metrics

| Category | Metric | Alert Threshold |
|----------|--------|-----------------|
| **Availability** | Uptime % | < 99.9% |
| **Performance** | API P95 latency | > 500ms |
| **Performance** | DB query P95 | > 100ms |
| **Saturation** | CPU utilization | > 80% |
| **Saturation** | Memory utilization | > 85% |
| **Saturation** | DB connections | > 80% of max |
| **Errors** | 5xx error rate | > 1% |
| **Errors** | Failed check-ins | > 0.1% |
| **Business** | Check-ins/hour | Deviation > 50% |
| **Security** | Failed logins | > 10/min |

### 8.3 Log Format

```json
{
  "timestamp": "2026-02-02T10:30:00.000Z",
  "level": "info",
  "service": "checkmate-api",
  "traceId": "abc123",
  "customerId": "cust-xxx",
  "eventId": "evt-yyy",
  "userId": "user-zzz",
  "action": "attendee.checkin",
  "attendeeId": "att-aaa",
  "latencyMs": 45,
  "status": "success"
}
```

### 8.4 Alerting Rules

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|--------------|
| Service Down | No heartbeat 1 min | Critical | PagerDuty + Slack |
| High Error Rate | 5xx > 5% for 5 min | Critical | PagerDuty + Slack |
| Slow Response | P95 > 1s for 10 min | Warning | Slack |
| DB Connection Pool | > 90% used | Warning | Slack |
| Disk Space | > 90% used | Warning | Email |
| Certificate Expiry | < 30 days | Warning | Email |

---

## 9. CI/CD Pipeline

### 9.1 Pipeline Stages

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   Code   │───▶│   Build  │───▶│   Test   │───▶│  Deploy  │
│   Push   │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │
                     ▼               ▼               ▼
               ┌──────────┐   ┌──────────┐   ┌──────────┐
               │ TypeScript│   │ Unit     │   │ Staging  │
               │ Compile   │   │ Tests    │   │          │
               │ Lint      │   │ Integr.  │   │ Prod     │
               │ Bundle    │   │ Tests    │   │ (Manual) │
               └──────────┘   └──────────┘   └──────────┘
```

### 9.2 Quality Gates

| Stage | Checks | Failure Action |
|-------|--------|----------------|
| **Build** | TypeScript compilation, ESLint | Block merge |
| **Test** | Unit tests > 80% coverage | Block merge |
| **Security** | Dependency vulnerability scan | Block if critical |
| **Deploy Staging** | Smoke tests | Block production |
| **Deploy Production** | Health checks | Auto-rollback |

### 9.3 Deployment Strategy

| Environment | Strategy | Rollback Time |
|-------------|----------|---------------|
| Development | Direct deploy | N/A |
| Staging | Blue-green | Immediate |
| Production | Rolling update | < 5 minutes |

---

## 10. Environment Management

### 10.1 Environment Configuration

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `LOG_LEVEL` | debug | info | info |
| `DATABASE_URL` | Dev DB | Staging DB | Prod DB |
| `SESSION_SECRET` | Dev secret | Staging secret | Prod secret |
| `CREDENTIAL_ENCRYPTION_KEY` | Dev key | Staging key | Prod key |

### 10.2 Secret Management

| Secret | Rotation | Access |
|--------|----------|--------|
| `SESSION_SECRET` | 90 days | App only |
| `CREDENTIAL_ENCRYPTION_KEY` | Annual | App only |
| `TWILIO_AUTH_TOKEN` | As needed | App only |
| `RESEND_API_KEY` | As needed | App only |
| `PRINTNODE_API_KEY` | As needed | App only |

### 10.3 Environment Promotion

```
Development ──▶ Staging ──▶ Production
     │              │            │
     │              │            │
 Auto-deploy    Manual       Manual
 on merge      approval     approval
               + smoke      + change
               tests        window
```

---

## 11. Network Architecture

### 11.1 Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                     ┌───────▼───────┐
                     │     CDN       │
                     │ (Static Assets)│
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │     WAF       │
                     │ (Web App FW)  │
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │ Load Balancer │
                     │  (TLS Term)   │
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼─────┐
       │  App Zone   │ │  App Zone  │ │ App Zone │
       │  (Private)  │ │  (Private) │ │ (Private)│
       └──────┬──────┘ └─────┬──────┘ └────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                     ┌───────▼───────┐
                     │   Database    │
                     │   (Private)   │
                     └───────────────┘
```

### 11.2 Firewall Rules

| Source | Destination | Port | Protocol | Action |
|--------|-------------|------|----------|--------|
| Internet | Load Balancer | 443 | HTTPS | Allow |
| Load Balancer | App Nodes | 5000 | HTTP | Allow |
| App Nodes | Database | 5432 | PostgreSQL | Allow |
| App Nodes | Twilio API | 443 | HTTPS | Allow |
| App Nodes | Resend API | 443 | HTTPS | Allow |
| App Nodes | PrintNode API | 443 | HTTPS | Allow |
| App Nodes | Certain API | 443 | HTTPS | Allow |

### 11.3 External Dependencies

| Service | Endpoint | Failover |
|---------|----------|----------|
| Neon PostgreSQL | `*.neon.tech` | Provider managed |
| Twilio SMS | `api.twilio.com` | Retry + queue |
| Resend Email | `api.resend.com` | Retry + fallback |
| PrintNode | `api.printnode.com` | Offline queue |
| Certain | Customer-specific | Circuit breaker |

---

## 12. Compliance & Governance

### 12.1 Data Privacy

| Requirement | Implementation |
|-------------|----------------|
| Data minimization | Only required PII collected |
| Right to erasure | Cascade delete on tenant removal |
| Data portability | CSV export functionality |
| Consent tracking | Workflow signature capture |
| Audit trail | Activity logs with retention |

### 12.2 Security Controls

| Control | Implementation | Verification |
|---------|----------------|--------------|
| Access control | RBAC with role hierarchy | Quarterly review |
| Authentication | MFA via OTP | Continuous |
| Encryption at rest | AES-256 | Provider audit |
| Encryption in transit | TLS 1.3 | Certificate monitoring |
| Vulnerability management | Dependency scanning | Weekly |
| Incident response | Runbook procedures | Quarterly drill |

### 12.3 Audit Logging

All security-relevant actions are logged:

- Authentication attempts (success/failure)
- Authorization failures
- Data access (read/write/delete)
- Configuration changes
- Integration credential changes

---

## 13. Operational Runbooks

### 13.1 Incident Response

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Alert Triggered                                                 │
│        │                                                         │
│        ▼                                                         │
│  ┌─────────────┐                                                │
│  │  Triage     │ ◀── Severity assignment                        │
│  │  (5 min)    │     (P1/P2/P3/P4)                              │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  Escalate   │ ◀── P1: Immediate                              │
│  │  if needed  │     P2: 15 min                                 │
│  └──────┬──────┘     P3: 1 hour                                 │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │ Investigate │ ◀── Check logs, metrics, traces                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  Mitigate   │ ◀── Rollback, scale, restart                   │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  Resolve    │ ◀── Root cause fix                             │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  Postmortem │ ◀── Document & prevent recurrence              │
│  └─────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Common Operations

| Operation | Command/Procedure | Impact |
|-----------|-------------------|--------|
| Restart application | Workflow restart | ~30s downtime |
| Database migration | `npm run db:push` | Schema update |
| Clear session cache | Restart app | Users re-authenticate |
| Rotate secrets | Update env vars + restart | Brief service interrupt |
| Scale instances | Platform auto-scale or manual | None if gradual |

### 13.3 Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/` | Application alive | 200 + HTML |
| `/api/settings/login-background` | API alive | 200 + JSON |

---

## Appendix A: Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session encryption key (min 32 chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256 key for API credentials |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio authentication token |
| `TWILIO_PHONE_NUMBER` | Yes | SMS sender number (E.164) |
| `RESEND_API_KEY` | Yes | Resend email service key |
| `PRINTNODE_API_KEY` | No | PrintNode cloud printing key |
| `NODE_ENV` | No | Environment (production/staging/development) |

---

## Appendix B: API Reference Summary

See full API documentation for detailed endpoint specifications.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/otp/request` | Request OTP code |
| POST | `/api/auth/otp/verify` | Verify OTP and create session |
| GET | `/api/customers` | List customers (super admin) |
| GET | `/api/events` | List events for customer |
| GET | `/api/events/:id/attendees` | List event attendees |
| POST | `/api/staff/login` | Staff passcode login |
| POST | `/api/staff/attendees/:id/checkin` | Check in attendee |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | DevOps Team | Initial release |

---

*This document contains confidential technical architecture information. Distribution restricted to authorized personnel.*
