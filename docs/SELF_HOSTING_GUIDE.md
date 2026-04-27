# Greet Self-Hosting Guide

This guide walks through deploying Greet on your own infrastructure using Docker.

---

## Prerequisites

Before you begin, make sure the host machine has:

- **Docker** (version 20.10 or later) — [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** (version 2.0 or later, included with Docker Desktop)
- **Git** to clone the repository
- A domain name with DNS pointing to your server (for production)
- An SSL certificate (or a reverse proxy like nginx/Caddy that handles HTTPS)

---

## Step 1: Get the Code

```bash
git clone https://github.com/bneuman4523/checkmate-certain.git
cd checkmate-certain/CheckinKit
```

---

## Step 2: Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in the required values:

### Required Variables (app will not start without these)

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `SESSION_SECRET` | Signs session cookies | `openssl rand -base64 32` |
| `CREDENTIAL_ENCRYPTION_KEY` | Encrypts integration API keys (AES-256-GCM) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Database password | Choose a strong password |

### Authentication (need at least one for login to work)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account ID (for SMS login) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number (e.g., +15551234567) |
| `RESEND_API_KEY` | Resend API key (for email login) |

### Email Notifications (SendGrid)

SendGrid is used for **all transactional email** including:
- Email OTP login codes
- Password setup and reset emails
- **Beta feedback reply notifications** — when an admin replies to a user's feedback item, the user receives an email notification

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | **Required for any email functionality.** API key from your SendGrid account. Without this, email OTP login, password resets, and feedback reply notifications are all disabled. |
| `EMAIL_FROM` | Sender email address (default: `noreply@checkinkit.com`). Must be a verified sender in your SendGrid account. |

**SendGrid Setup Steps:**
1. Create a SendGrid account at https://sendgrid.com
2. Verify your sender domain or single sender email under Settings → Sender Authentication
3. Create an API key under Settings → API Keys (use "Restricted Access" with only "Mail Send" permission)
4. Set `SENDGRID_API_KEY` and `EMAIL_FROM` in your `.env` file
5. The `EMAIL_FROM` address must match a verified sender in SendGrid or emails will be rejected

**Package dependency:** `@sendgrid/mail` is listed in `package.json` and installed automatically during `docker compose build`. No manual installation needed.

### Optional Services

| Variable | Description |
|----------|-------------|
| `PRINTNODE_API_KEY` | Cloud printing via PrintNode |
| `ANTHROPIC_API_KEY` | AI features: setup assistant, badge AI, feedback analysis (Claude) |
| `SLACK_FEEDBACK_WEBHOOK_URL` | Slack alerts for feedback |

### Deployment Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | 5000 | Port exposed on the host machine |
| `DB_PORT` | 5432 | PostgreSQL port (only needed for direct DB access) |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |
| `ALLOWED_ORIGIN` | (none) | Your app's public URL for CORS (e.g., https://checkin.yourcompany.com) |

---

## Step 3: Start the Database

```bash
docker compose up db -d
```

This starts PostgreSQL 16 in the background. Data is stored in a Docker volume (`postgres_data`) so it persists across restarts.

Verify the database is running:

```bash
docker compose ps
```

You should see `checkmate-db` with status `Up (healthy)`.

---

## Step 4: Run Database Migrations

This creates all the tables Greet needs. You only need to run this once on initial setup, and again after code updates that include schema changes:

```bash
docker compose --profile migrate run --rm migrate
```

You should see output showing tables being created. The `--rm` flag removes the migration container after it finishes.

---

## Step 5: Start the Application

```bash
docker compose up app -d
```

Verify everything is running:

```bash
docker compose ps
```

You should see both `checkmate-db` and `checkmate-app` with status `Up (healthy)`.

Test the health check:

```bash
curl http://localhost:5000/health
```

Should return `OK`.

---

## Step 6: Set Up HTTPS (Production)

Greet should always run behind HTTPS in production. The simplest approach is using **Caddy** as a reverse proxy (it handles SSL certificates automatically):

### Option A: Caddy (easiest)

Install Caddy on the host, then create `/etc/caddy/Caddyfile`:

```
checkin.yourcompany.com {
    reverse_proxy localhost:5000
}
```

Start Caddy:

```bash
sudo systemctl start caddy
```

Caddy automatically obtains and renews SSL certificates from Let's Encrypt.

### Option B: nginx

Install nginx, then create a config at `/etc/nginx/sites-available/checkmate`:

```nginx
server {
    listen 443 ssl;
    server_name checkin.yourcompany.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name checkin.yourcompany.com;
    return 301 https://$server_name$request_uri;
}
```

Enable it and restart nginx:

```bash
sudo ln -s /etc/nginx/sites-available/checkmate /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Common Operations

### View application logs

```bash
docker compose logs -f app
```

### View database logs

```bash
docker compose logs -f db
```

### Restart the application

```bash
docker compose restart app
```

### Stop everything

```bash
docker compose down
```

### Stop everything and delete the database

```bash
docker compose down -v
```

**Warning:** The `-v` flag deletes the database volume and all data. Only use this if you want a completely fresh start.

### Rebuild after code changes

```bash
git pull
docker compose build app
docker compose --profile migrate run --rm migrate
docker compose up app -d
```

### Back up the database

```bash
docker compose exec db pg_dump -U checkmate checkmate > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore a database backup

```bash
docker compose exec -T db psql -U checkmate checkmate < backup_20260311_120000.sql
```

---

## Architecture Overview

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────┴──────┐
                    │ Caddy/nginx │  ← SSL termination
                    │  (port 443) │
                    └──────┬──────┘
                           │ HTTP
                    ┌──────┴──────┐
                    │  Greet  │  ← Node.js app
                    │  (port 5000)│
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ PostgreSQL  │  ← Database
                    │  (port 5432)│
                    └─────────────┘
```

The Dockerfile uses a multi-stage build:
1. **deps** — Installs all npm packages
2. **builder** — Compiles the React frontend (Vite) and Node.js backend (esbuild)
3. **runner** — Minimal production image with only compiled code and production dependencies, running as a non-root user

---

## Troubleshooting

### App won't start — "SESSION_SECRET" or "CREDENTIAL_ENCRYPTION_KEY" errors
Make sure these are set in your `.env` file. See Step 2 for how to generate them.

### Can't log in — no SMS or email received
You need at least one authentication provider configured. Set either the Twilio variables (for SMS login) or `RESEND_API_KEY` (for email login).

### Migration fails — connection refused
Make sure the database is running and healthy before running migrations:
```bash
docker compose up db -d
docker compose ps  # Wait until db shows "healthy"
docker compose --profile migrate run --rm migrate
```

### Port 5000 already in use
Change `APP_PORT` in your `.env` file:
```
APP_PORT=8080
```

### Health check failing
Check the application logs for errors:
```bash
docker compose logs app --tail 50
```

### Database connection issues after restart
The app waits for the database to be healthy before starting (via `depends_on` + healthcheck). If the database is slow to start, the app will retry automatically.

---

## System Requirements

### Minimum (small events, < 500 attendees)
- 1 CPU core
- 1 GB RAM
- 10 GB disk

### Recommended (medium events, 500-5,000 attendees)
- 2 CPU cores
- 2 GB RAM
- 20 GB disk

### Large scale (5,000+ attendees, multiple concurrent events)
- 4+ CPU cores
- 4+ GB RAM
- 50+ GB disk
- Consider a managed PostgreSQL service (AWS RDS, Google Cloud SQL)
