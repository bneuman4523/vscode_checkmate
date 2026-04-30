# Greet: Infrastructure & DevOps Requirements

**Project:** Event Check-In & Badge Printing System
**Version:** 2.0.0 | **Date:** April 28, 2026
**Stack:** Node.js 20 LTS, PostgreSQL 16 (Amazon RDS), AWS Cloud
**Environment:** Staging → Production

---

## 1. Architecture & Hosting Model

Greet is an offline-first, cloud-native application hosted on AWS infrastructure managed by the Certain DevOps team.

- **Infrastructure:** Amazon Web Services (AWS) — US-West-2 (Oregon) region, with failover capability to US-East-1.
- **On-Premise Requirements:** None; the system is fully cloud-managed.
- **Scaling Strategy:** Containerized, stateless horizontal autoscaling via ECS Fargate (0 to N tasks).

### System Topology

```
                         ┌─────────────┐
     Internet ──────────▶│  Route 53   │
                         │  (DNS)      │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │  AWS WAF    │
                         │  + Shield   │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │     ALB     │──── ACM TLS Certificate
                         │  (HTTPS)    │
                         └──────┬──────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
        ┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
        │  ECS Task   │  │  ECS Task  │  │  ECS Task   │
        │  (Fargate)  │  │  (Fargate) │  │  (Worker)   │
        │  Web Server │  │  Web Server│  │  Sync Only  │
        └──────┬──────┘  └─────┬──────┘  └──────┬──────┘
               │               │                │
               └───────────────┼────────────────┘
                               │
                        ┌──────▼──────┐     ┌──────────────┐
                        │  Amazon RDS │     │  Amazon S3   │
                        │ PostgreSQL  │     │  (Assets)    │
                        │  (Private)  │     └──────────────┘
                        └─────────────┘
```

Traffic flows through Route 53 DNS to an Application Load Balancer with AWS WAF protection. TLS is terminated at the ALB using an ACM-managed certificate. Application containers run on ECS Fargate in private subnets. Data is persisted in Amazon RDS PostgreSQL, and static assets (badge templates, uploaded images, fonts) are stored in Amazon S3.

---

## 2. Core Server & Database Specs

### Application Nodes (ECS Fargate)

| Component | Specification | DevOps Note |
|-----------|--------------|-------------|
| Runtime | Node.js 20 LTS | Express.js + TypeScript |
| Container Image | Multi-stage Alpine build (~200 MB) | Stored in Amazon ECR |
| Scaling | ECS Service Auto Scaling (2–8 tasks) | CPU, memory, and request-count triggers |
| Deployments | ECS rolling update | Zero-downtime; automated rollback on health check failure |
| Health Check | `GET /ready` (DB connectivity) | ALB target group health check, 30s interval |
| Process Manager | `dumb-init` (in-container) | Proper signal handling for graceful shutdown |
| Task Size (Staging) | 1 vCPU / 2 GB RAM | Suitable for staging workloads |
| Task Size (Production) | 2 vCPU / 4 GB RAM | Handles large syncs and concurrent badge rendering |

### Database (Amazon RDS PostgreSQL)

| Component | Specification | DevOps Note |
|-----------|--------------|-------------|
| Engine | PostgreSQL 16 | Managed by AWS RDS |
| Instance (Staging) | db.t3.small (2 vCPU, 2 GB RAM) | Single-AZ acceptable for staging |
| Instance (Production) | db.t3.medium+ (2 vCPU, 4 GB RAM) | Multi-AZ for high availability |
| Storage | 20 GB gp3 with auto-scaling | Expandable to 100 GB+ |
| Encryption at Rest | AES-256 via AWS KMS (enabled by default) | AWS-managed or customer-managed keys |
| Encryption in Transit | TLS/SSL required on all connections | Enforced via `rds.force_ssl` parameter |
| Automated Backups | 7-day retention, daily snapshots | Point-in-time recovery enabled |
| Connection Pooling | Application-level via `pg.Pool` (25 connections/instance) | No Neon serverless; standard PostgreSQL wire protocol |
| Max Connections | 200 (RDS parameter group) | Supports 4 instances x 25 pool + sync overhead + headroom |

---

## 3. Security & Compliance

Greet implements enterprise-grade security protocols at every layer of the stack.

### Compliance & Certifications

| Framework | Coverage |
|-----------|----------|
| SOC 2 Type II | AWS infrastructure |
| ISO 27001 | AWS infrastructure |
| HIPAA Eligible | AWS services used are HIPAA-eligible |
| PCI DSS Level 1 | AWS infrastructure (card data not stored by Greet) |

### Encryption

| Layer | Standard | Implementation |
|-------|----------|----------------|
| Data at Rest (Database) | AES-256 | AWS KMS-managed encryption on RDS storage, snapshots, and replicas |
| Data at Rest (Object Storage) | AES-256 | S3 server-side encryption (SSE-S3 or SSE-KMS) |
| Data at Rest (Secrets) | AES-256 | AWS Secrets Manager with automatic rotation support |
| Data in Transit (External) | TLS 1.2+ | ALB terminates TLS with ACM-managed certificate |
| Data in Transit (Internal) | TLS 1.2+ | RDS connections require SSL; inter-service traffic stays within VPC |
| Application-Level | AES-256-GCM | Integration credentials encrypted with app-managed key before DB storage |
| Password Hashing | bcrypt (cost 10) | Staff and admin credentials |

### Authentication Architecture

| User Type | Auth Method | Session Storage |
|-----------|-------------|-----------------|
| Admin Users | Email/SMS OTP (Resend + Twilio) | PostgreSQL (`auth_sessions` table) |
| Staff Users | Event-scoped credentials (bcrypt-hashed) | PostgreSQL with configurable TTL |
| API Integrations | API key + HMAC signature | Validated per-request |

- **No third-party identity provider dependency.** OTP-based authentication is self-contained using Resend (email) and Twilio (SMS).
- Session cookies: `Secure`, `HttpOnly`, `SameSite=Lax` in production.
- Admin idle timeout: 4 hours. Staff idle timeout: 8 hours. Configurable.

### Tenant Isolation

- Row-level isolation via `customer_id` enforced through API middleware on every request.
- Super-admin impersonation requires explicit header + role validation.
- Partner accounts scoped to assigned customer IDs only.

### Application Security Controls

| Control | Implementation |
|---------|---------------|
| Rate Limiting | 300 req/15 min (general API), 15 req/15 min (login), 5 req/15 min (OTP) |
| Brute Force Protection | Account lockout after 5 failed OTP/login attempts |
| Input Validation | Server-side validation on all API endpoints via Zod schemas |
| CORS | Restricted to configured origin domains |
| Security Headers | Helmet.js middleware (CSP, X-Frame-Options, HSTS, etc.) |
| Dependency Scanning | npm audit in CI/CD pipeline |
| Pen Test Mode | `PEN_TEST_MODE` flag relaxes rate limits for authorized security scanning only; **must be disabled in production** |

---

## 4. Networking & Integration

### VPC Architecture

| Component | Configuration |
|-----------|--------------|
| VPC | 1 VPC, CIDR 10.0.0.0/16 |
| Public Subnets | 2 (across 2 AZs) — ALB, NAT Gateway |
| Private Subnets | 2 (across 2 AZs) — ECS tasks, RDS |
| NAT Gateway | Enables outbound internet for containers (API calls to Twilio, Anthropic, PrintNode, Certain) |
| Internet Gateway | Inbound traffic to ALB only |

### Security Groups

| Group | Inbound | Outbound |
|-------|---------|----------|
| ALB | 443 (HTTPS) from 0.0.0.0/0 | ECS tasks on port 5000 |
| ECS Tasks | 5000 from ALB SG only | 443 (HTTPS) outbound for external APIs; 5432 to RDS SG |
| RDS | 5432 from ECS SG only | None (no outbound required) |

### External Integration Endpoints

| Service | Direction | Protocol | Purpose |
|---------|-----------|----------|---------|
| Certain Event API | Outbound | HTTPS (443) | Attendee, session, and registration data sync |
| Twilio | Outbound | HTTPS (443) | SMS OTP authentication + check-in notifications |
| Resend | Outbound | HTTPS (443) | Email OTP delivery |
| PrintNode | Outbound | HTTPS (443) | Cloud printing API |
| Anthropic Claude API | Outbound | HTTPS (443) | AI badge assistant and feedback analysis |
| Slack Webhooks | Outbound | HTTPS (443) | Feedback alert notifications |

### Printer Network Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 9100 | TCP | Direct network printing to Zebra printers (venue LAN) |
| N/A | USB/Local | Zebra Browser Print (client-side, desktop app required) |
| 443 | HTTPS | PrintNode cloud printing (no local network requirements) |

### DNS & Domain Configuration

| Record | Type | Target |
|--------|------|--------|
| `greet.certain.com` (or chosen subdomain) | A (Alias) | Application Load Balancer |
| ACM Validation | CNAME | Required for SSL certificate provisioning |

- SSL/TLS certificate managed by AWS Certificate Manager (ACM) — auto-renewing.
- Do **not** proxy through Cloudflare; use DNS-only mode if Cloudflare is in the DNS chain.

---

## 5. Printing Infrastructure

Greet supports hybrid printing models to accommodate different hardware and venue configurations:

| Method | Platform Support | Requirement | Network Dependency |
|--------|-----------------|-------------|-------------------|
| Zebra Browser Print | Windows, Mac, Android | Zebra Browser Print desktop app installed | Local USB or LAN |
| Network Print | iOS / iPadOS / Any | Printer IP reachable on Port 9100 | Venue LAN |
| Cloud Print (PrintNode) | All Platforms | PrintNode API key + PrintNode client on print host | Internet only |

### Compatible Hardware

| Printer | Connection | Resolution | Status |
|---------|-----------|------------|--------|
| Zebra ZD621 | USB / Network | 203 or 300 DPI | Primary recommended |
| Zebra ZD421 | USB / Network | 203 or 300 DPI | Budget alternative |

---

## 6. Object Storage (Amazon S3)

| Item | Configuration |
|------|--------------|
| Bucket | Private; `Block All Public Access` enabled |
| Contents | Badge templates, uploaded images, headshot photos, font files |
| Access | ECS task IAM role (no access keys in application code) |
| Encryption | SSE-S3 (AES-256) or SSE-KMS |
| Versioning | Enabled (protects against accidental overwrites) |
| Lifecycle Policy | Archive objects older than 90 days to S3 Glacier (optional) |
| CloudFront CDN | Optional — recommended for serving badge assets with low latency at large events |

---

## 7. Secrets Management

All application secrets are stored in AWS Secrets Manager and injected as environment variables into ECS task definitions. No secrets are stored in code, config files, or container images.

| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | Express session signing key |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for integration credential encryption |
| `DATABASE_URL` | RDS PostgreSQL connection string |
| `PRINTNODE_API_KEY` | Cloud printing service |
| `RESEND_API_KEY` | Email delivery (OTP, notifications) |
| `TWILIO_ACCOUNT_SID` | SMS service account |
| `TWILIO_AUTH_TOKEN` | SMS service authentication |
| `TWILIO_PHONE_NUMBER` | SMS sender number |
| `SLACK_FEEDBACK_WEBHOOK_URL` | Feedback alert channel |
| `ANTHROPIC_API_KEY` | AI badge assistant & feedback analysis (Claude API) |

**Rotation Policy:** API keys and tokens should be rotated quarterly. Database credentials can leverage Secrets Manager automatic rotation.

---

## 8. CI/CD Pipeline

| Stage | Service | Details |
|-------|---------|---------|
| Source | GitHub | Push to `main` triggers pipeline |
| Build | GitHub Actions | Multi-stage Docker build |
| Image Registry | Amazon ECR | Private repository, image scanning enabled |
| Deploy | ECS Rolling Update | New task definition revision → ECS service update |
| Migrations | Post-deploy step | `npm run db:push` (Drizzle ORM schema sync) |
| Rollback | ECS | Automatic rollback if new tasks fail health checks |

### Deployment Flow

```
git push main
    → GitHub Actions: build + test
    → Docker build → push to ECR
    → Update ECS task definition
    → ECS deploys new tasks (rolling)
    → ALB health check validates /ready
    → Old tasks drain and stop
```

---

## 9. Monitoring & Logging

| Capability | Service | Configuration |
|-----------|---------|---------------|
| Container Logs | CloudWatch Logs | stdout/stderr auto-captured from ECS tasks |
| Alarms | CloudWatch Alarms | CPU > 70%, memory > 80%, 5xx > 1%, unhealthy targets |
| Dashboards | CloudWatch Dashboards | Application metrics overview |
| Network Audit | VPC Flow Logs | Traffic logging for security auditing |
| Threat Detection | GuardDuty | Anomaly detection across AWS account (recommended) |
| Distributed Tracing | AWS X-Ray (optional) | Request tracing across services |

### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /ready` | Readiness (DB connectivity) | `200 {"ready":true}` or `503 {"ready":false}` |
| `GET /health` | Quick liveness | `200 OK` |
| `GET /live` | Liveness probe | `200 {"alive":true}` |

**ALB Health Check Config:** Path `/ready`, interval 30s, timeout 10s, healthy threshold 2, unhealthy threshold 3.

---

## 10. DevOps Responsibility Matrix

| Task | Managed By |
|------|-----------|
| AWS Infrastructure (VPC, ALB, ECS, RDS) | Certain DevOps |
| OS/Runtime Patching | AWS (Fargate manages container host OS) |
| Container Image Updates | Certain DevOps (Node.js base image updates in CI) |
| SSL/TLS Certificate Lifecycle | AWS ACM (auto-renewing) |
| Database Backups & Maintenance | AWS RDS (automated) + Certain DevOps (monitoring) |
| Database Failover (Multi-AZ) | AWS RDS (automatic) |
| DNS & Custom Domain Config | Certain IT / DevOps |
| Secrets & API Key Rotation | Certain IT / DevOps |
| WAF Rule Management | Certain DevOps / Security |
| Application Deployments | CI/CD Pipeline (GitHub Actions → ECS) |
| Autoscaling Policy Tuning | Certain DevOps |
| Local Printer Network Setup | On-site IT / Event Staff |
| Security Scanning & Pen Testing | Certain Security Team |

---

## 11. Estimated Monthly Cost (Staging)

| Category | Estimate |
|----------|---------|
| ECS Fargate (2 tasks, 1 vCPU / 2 GB) | $35–60 |
| RDS PostgreSQL (db.t3.small, single-AZ) | $15–25 |
| Application Load Balancer | $18–25 |
| NAT Gateway | $35 |
| S3 (object storage) | $1–5 |
| ECR (container registry) | $1–2 |
| Secrets Manager (10 secrets) | $4 |
| Route 53 (DNS) | $1 |
| CloudWatch (logs + alarms) | $3–8 |
| WAF | $6–7 |
| **Staging Total** | **~$120–175/mo** |

*Production with Multi-AZ RDS, 4+ Fargate tasks, CloudFront CDN, and GuardDuty: estimated $250–400/mo.*

---

## Companion Documents

| Document | Purpose |
|----------|---------|
| `AWS-Migration-Checklist.md` | Step-by-step infrastructure setup, Docker config, and code changes required |
| `AWS-Capacity-Planning-Guide.md` | Runtime specs, connection pool tuning, autoscaling thresholds, and bottleneck analysis |

---

*Prepared by Brad Neuman | Certain, Inc. | April 2026*
