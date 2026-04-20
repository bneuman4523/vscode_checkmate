# Greet — AWS Deployment Configuration

## Docker Build

```bash
docker build -t greet-app .
```

- **Base image:** node:20-alpine
- **Internal port:** 5000
- **Health check:** GET /health
- **Entry point:** node dist/index.js

## Required Environment Variables

### Critical (app will not start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/greet` |
| `SESSION_SECRET` | Session signing key (min 32 chars) | `openssl rand -hex 32` |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Server port (default: 5000) | `5000` |

### Email (SendGrid)

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key for transactional email |
| `EMAIL_FROM` | Sender email address (e.g. `noreply@certain.com`) |

### SMS (Twilio)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Outbound SMS number |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio messaging service SID (optional, alternative to phone number) |

### Printing

| Variable | Description |
|----------|-------------|
| `PRINTNODE_API_KEY` | PrintNode API key for cloud badge printing |

### AI Features

| Variable | Description |
|----------|-------------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Google Gemini API key (setup assistant, badge AI, feedback analysis) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini API base URL (optional, for proxy/custom endpoints) |

### Security

| Variable | Description |
|----------|-------------|
| `CREDENTIAL_ENCRYPTION_KEY` | 32-byte base64 key for encrypting OAuth credentials at rest |

### Monitoring (Optional)

| Variable | Description |
|----------|-------------|
| `SLACK_FEEDBACK_WEBHOOK_URL` | Slack webhook for user feedback notifications |
| `SLACK_USAGE_WEBHOOK_URL` | Slack webhook for usage/billing alerts |
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` (default: `info`) |

### Feature Flags (Optional)

| Variable | Description |
|----------|-------------|
| `PEN_TEST_MODE` | Set `true` to relax rate limits for security scanning |

## NOT Needed on AWS

These are Replit-specific and should NOT be set:

| Variable | Why |
|----------|-----|
| `REPL_ID` | Triggers Replit OIDC auth — omit for standard session auth |
| `REPLIT_DOMAINS` | Replit CORS domains — not applicable |
| `REPLIT_DEV_DOMAIN` | Replit dev domain — not applicable |
| `ISSUER_URL` | Replit OIDC issuer — not applicable |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Replit object storage — not applicable |
| `PRIVATE_OBJECT_DIR` | Replit object storage — not applicable |

## Database

- **Engine:** PostgreSQL 16+
- **Recommended:** AWS RDS or Aurora PostgreSQL
- **Schema push:** Run after first deploy: `npx drizzle-kit push` (or include in CI/CD pipeline)
- **Connection:** Standard `pg` driver (NOT Neon WebSocket) — auto-detected from DATABASE_URL

## File Storage

- Currently uses local filesystem fallback (`uploads/` directory)
- For production: recommend migrating to **AWS S3** (not yet implemented)
- The uploads directory must be persistent (EFS mount or S3 migration)

## Bamboo Build Steps

1. `git clone https://github.com/bneuman4523/vscode_checkmate.git`
2. `cd vscode_checkmate && git checkout main`
3. `docker build -t <ECR_REPO_URL>:${bamboo.buildNumber} .`
4. `docker push <ECR_REPO_URL>:${bamboo.buildNumber}`

## Post-Deploy

1. Run database migration: `npx drizzle-kit push` (first deploy and after schema changes)
2. Verify health: `curl https://<hostname>/health`
