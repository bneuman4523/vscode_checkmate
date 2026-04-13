# Checkmate — AWS Self-Hosted Migration Checklist

This document covers everything needed to move Checkmate from Replit to a standalone AWS deployment, including Docker containerization, infrastructure, security, and estimated costs.

---

## 1. Docker Containerization

### 1.1 Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 5000
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

**Key notes:**
- Multi-stage build keeps the final image small (~200MB vs ~1GB)
- `dumb-init` ensures proper signal handling (graceful shutdown)
- Runs as non-root `node` user for security
- Alpine base for minimal attack surface

### 1.2 .dockerignore

```
node_modules
dist
.git
*.md
.env
```

### 1.3 docker-compose.yml (for local development/testing)

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: checkmate
      POSTGRES_USER: checkmate
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U checkmate"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## 2. AWS Infrastructure Checklist

### 2.1 Networking & VPC

| Item | Details | Est. Cost |
|------|---------|-----------|
| VPC | 1 VPC with public + private subnets across 2 AZs | Free |
| Internet Gateway | For ALB in public subnets | Free |
| NAT Gateway | For app containers to reach internet (API calls to Twilio, OpenAI, etc.) | ~$35/mo |
| Security Groups | ALB: inbound 443 only; App: inbound from ALB only; DB: inbound from App only | Free |

### 2.2 Compute (Application)

| Item | Details | Est. Cost |
|------|---------|-----------|
| **Option A: ECS Fargate** (recommended) | Serverless containers, no server management | ~$35-60/mo |
| Task definition: 0.5 vCPU, 1GB RAM | Suitable for alpha/beta scale | |
| Auto-scaling: 1-3 tasks | Scale based on CPU/request count | |
| **Option B: EC2** | t3.medium (2 vCPU, 4GB RAM) | ~$30-40/mo |
| Requires OS patching, Docker install, process management | More maintenance | |

**Recommendation:** ECS Fargate — no servers to manage, pairs well with Docker, and your team already uses AWS.

### 2.3 Database

| Item | Details | Est. Cost |
|------|---------|-----------|
| RDS PostgreSQL | db.t3.micro (2 vCPU, 1GB RAM) — multi-AZ optional | $15-30/mo |
| Storage | 20GB gp3 with auto-scaling | $2-3/mo |
| Automated backups | 7-day retention (free with RDS) | Free |
| Encryption at rest | Enabled by default with AWS-managed keys | Free |
| **Alternative: Aurora Serverless v2** | Auto-scales, pauses when idle, higher availability | $30-80/mo |

**Important:** The app currently uses Neon Serverless PostgreSQL client (`@neondatabase/serverless`). For AWS you'd switch to a standard `pg` client (connection pooling via `pg-pool`) or keep Neon as an external service.

### 2.4 Load Balancer & SSL

| Item | Details | Est. Cost |
|------|---------|-----------|
| Application Load Balancer (ALB) | Terminates SSL, routes to ECS tasks | $18-25/mo |
| ACM Certificate | Free SSL/TLS certificate for your domain | Free |
| Health checks | ALB checks `/api/health` endpoint on app | Free |
| HTTPS redirect | Listener rule: redirect HTTP 80 → HTTPS 443 | Free |

### 2.5 DNS

| Item | Details | Est. Cost |
|------|---------|-----------|
| Route 53 Hosted Zone | DNS for your domain | $0.50/mo |
| A/AAAA Records | Alias to ALB | Free |
| Health checks (optional) | Route 53 health monitoring | $0.50/mo |

### 2.6 Object Storage (File Uploads, Badge Assets)

| Item | Details | Est. Cost |
|------|---------|-----------|
| S3 Bucket | Private bucket for uploads, badge images, fonts | $1-5/mo |
| S3 bucket policy | Block all public access; app accesses via IAM role | Free |
| CloudFront (optional) | CDN for serving badge assets/images faster | $1-5/mo |

**Code change required:** Replace Replit Object Storage SDK calls with AWS S3 SDK (`@aws-sdk/client-s3`). Affected files:
- `server/replit_integrations/object_storage/objectStorage.ts`
- `server/replit_integrations/object_storage/routes.ts`

### 2.7 Secrets Management

| Item | Details | Est. Cost |
|------|---------|-----------|
| AWS Secrets Manager | Store all application secrets | ~$4/mo |

**Secrets to migrate (10 total):**
| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | Express session signing |
| `CREDENTIAL_ENCRYPTION_KEY` | Integration credential encryption |
| `DATABASE_URL` | PostgreSQL connection string |
| `PRINTNODE_API_KEY` | Cloud printing service |
| `RESEND_API_KEY` | Email delivery (OTP, notifications) |
| `TWILIO_ACCOUNT_SID` | SMS authentication |
| `TWILIO_AUTH_TOKEN` | SMS authentication |
| `TWILIO_PHONE_NUMBER` | SMS sender number |
| `SLACK_FEEDBACK_WEBHOOK_URL` | Feedback alerts |
| `OPENAI_API_KEY` | AI badge assistant & feedback analysis |

Inject these as environment variables into ECS task definitions via Secrets Manager references.

### 2.8 Authentication Changes

| Item | Details | Cost |
|------|---------|------|
| Replace Replit Auth (OIDC) | Switch to your own identity provider | Varies |

**Options:**
- **AWS Cognito** — managed auth with OAuth2/OIDC ($0.0055/MAU after free tier of 50k)
- **Auth0** — third-party, easy setup (free tier up to 7,500 MAU)
- **Self-managed** — the app already has email/SMS OTP login; you could make that the primary auth and remove the Replit OIDC dependency entirely

The email OTP and SMS OTP flows (Resend + Twilio) work independently of Replit and will carry over as-is.

### 2.9 CI/CD Pipeline

| Item | Details | Est. Cost |
|------|---------|-----------|
| ECR (Container Registry) | Store Docker images | $1-2/mo |
| **Option A: GitHub Actions** | Build → push to ECR → deploy to ECS | Free (public repo) or included in GitHub plan |
| **Option B: AWS CodePipeline** | Source → Build → Deploy | ~$1/mo per pipeline |

**Recommended GitHub Actions workflow:**
1. On push to `main`: build Docker image
2. Push image to ECR
3. Update ECS service to use new image (rolling deployment)
4. Run database migrations (`npm run db:push`)

### 2.10 Monitoring & Logging

| Item | Details | Est. Cost |
|------|---------|-----------|
| CloudWatch Logs | Container stdout/stderr automatically captured by ECS | $3-5/mo |
| CloudWatch Alarms | CPU > 80%, error rate, unhealthy targets | Free (10 alarms) |
| CloudWatch Dashboards | Application metrics overview | $3/mo per dashboard |
| **Optional: X-Ray** | Distributed tracing for API calls | $5/mo |

### 2.11 Security & Compliance

| Item | Details | Est. Cost |
|------|---------|-----------|
| AWS WAF | Protect ALB against SQL injection, XSS, bad bots | $6/mo + $0.60/million requests |
| AWS Shield Standard | DDoS protection (included with ALB) | Free |
| IAM Roles | ECS task role (S3, Secrets Manager access); no access keys in code | Free |
| VPC Flow Logs | Network traffic logging for auditing | $1-3/mo |
| GuardDuty (optional) | Threat detection across AWS account | $4-8/mo |

---

## 3. Code Changes Required

| Change | Effort | Files Affected |
|--------|--------|----------------|
| Replace Replit Object Storage → S3 | 1-2 days | `server/replit_integrations/object_storage/*` |
| Replace Replit Auth OIDC → Cognito/Auth0/OTP-only | 1-3 days | `server/replitAuth.ts`, login flows |
| Update `DATABASE_URL` format (Neon → standard PG) | 1 hour | `server/db.ts`, drizzle config |
| Switch `@neondatabase/serverless` → `pg` pool | 2-4 hours | `server/db.ts`, `drizzle.config.ts` |
| Environment variable loading (Secrets Manager) | 2-4 hours | `server/index.ts` startup |
| Add `/api/health` endpoint for ALB health checks | 15 minutes | `server/routes.ts` |
| Update CORS origins for new domain | 15 minutes | `server/index.ts` |
| Update cookie `sameSite` / `secure` settings | 15 minutes | `server/replitAuth.ts` |

**Total estimated code migration effort: 3-5 days**

---

## 4. Monthly Cost Summary

| Category | Low Estimate | High Estimate |
|----------|-------------|---------------|
| ECS Fargate (compute) | $35 | $60 |
| RDS PostgreSQL | $17 | $33 |
| Application Load Balancer | $18 | $25 |
| NAT Gateway | $35 | $35 |
| S3 (object storage) | $1 | $5 |
| ECR (container registry) | $1 | $2 |
| Secrets Manager | $4 | $4 |
| Route 53 (DNS) | $1 | $1 |
| CloudWatch (logs + alarms) | $3 | $8 |
| WAF (optional) | $0 | $7 |
| **Total** | **~$115/mo** | **~$180/mo** |

*Costs assume alpha/beta scale (~100-500 concurrent users). Production scale with multi-AZ RDS, multiple Fargate tasks, and CloudFront would be $200-350/mo.*

---

## 5. Migration Order (Recommended)

1. **Create Docker image** — Dockerfile, build, test locally with docker-compose
2. **Provision AWS infrastructure** — VPC, subnets, security groups, RDS, S3, ALB
3. **Code changes** — S3 integration, database driver swap, auth provider swap
4. **Deploy to ECS** — Push image to ECR, create task definition, create ECS service
5. **DNS cutover** — Point your domain to the ALB
6. **Smoke test** — Full end-to-end test of login, check-in, badge printing, kiosk mode
7. **Monitor** — Watch CloudWatch logs for first 48 hours
8. **Decommission Replit deployment** — After confirmed stable

---

## 6. Key Differences from Replit

| Capability | Replit | AWS (Self-Hosted) |
|-----------|--------|-------------------|
| Deployment | One-click publish | CI/CD pipeline (GitHub Actions → ECR → ECS) |
| SSL certificates | Automatic | ACM + ALB configuration |
| Secrets | Built-in secrets UI | Secrets Manager + IAM policies |
| Database | Built-in Neon PG | RDS (you manage backups, scaling) |
| Object storage | Built-in SDK | S3 + SDK swap |
| Auth provider | Replit OIDC built-in | Cognito, Auth0, or OTP-only |
| Scaling | Automatic | Configure auto-scaling policies |
| OS/Runtime patching | Automatic | Your responsibility (Fargate minimizes this) |
| Rollback | Built-in checkpoints | ECS rolling deployments + RDS snapshots |
| Uptime monitoring | Built-in | CloudWatch + Route 53 health checks |
