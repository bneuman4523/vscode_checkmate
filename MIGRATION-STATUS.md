# Greet (Checkmate) Migration Status

**Prepared by:** Brad Neuman
**Date:** April 16, 2026

---

## Where We Are

Local development on VS Code is working. The latest code from the Replit repo has been pulled down and runs locally against a Docker Postgres database. Auth, server, and frontend all start cleanly.

## Current Repo Layout

| Repo | Purpose | Status |
|------|---------|--------|
| `bneuman4523/checkmate-certain` | Replit pushes here. Beta testers run from this. | Active — beta users depend on it |
| `bneuman4523/vscode_checkmate` | Local VS Code development | Active — has local dev config (Docker, .env, .vscode) |

## The Problem

Two repos means two sources of truth. If a bug comes in from beta testers, we'd need to fix it in both places. This doesn't scale and will cause drift.

## Recommended Path: One Repo

Consolidate to a single repo — most likely `checkmate-certain` since it has the full commit history.

**How it works:**
1. Brad develops locally in VS Code, pushes to `checkmate-certain`
2. Replit auto-deploys from that repo — beta testers stay unaffected
3. When Certain servers are ready, deploy from the same repo
4. `vscode_checkmate` gets archived or deleted

**What changes for beta testers:** Nothing. Replit keeps deploying from the same repo.

**What changes for Brad:** Local dev setup (`.vscode/`, `.env`, Docker config) lives in the repo but is gitignored. Development happens in VS Code instead of Replit's editor.

## What's Already Done (Local Setup)

- [x] VS Code launch config (F5 to start server with debugger)
- [x] Docker Compose for local Postgres
- [x] Local auth fallback (session-based, no Replit OIDC dependency)
- [x] Database driver auto-switches between local Postgres and Neon cloud
- [x] All dependencies resolved and server starts clean
- [x] Git credentials configured for GitHub

## Beta Customer Data Migration

5-6 beta customers are running real events on the Replit-hosted Neon database. Their data (accounts, events, check-ins, configurations) must carry over to Certain servers.

**Recommended approach: One-time pg_dump/pg_restore**
1. Schedule a cutover window (coordinate with beta customers — ideally not during a live event)
2. Freeze writes on Replit (maintenance mode or take it offline)
3. `pg_dump` the Neon database (full snapshot)
4. `pg_restore` into Certain's Postgres
5. Point DNS / app config to Certain servers
6. Verify data, notify customers, done

**What migrates:** Everything — customer accounts, event configs, attendee data, check-in history, badge templates, sessions, all of it. Postgres dump/restore is a full copy.

**What doesn't migrate:** `.env` secrets (Twilio keys, SendGrid, etc.) — those get set up fresh in Certain's environment config.

**Timeline consideration:** Do this when no beta customer has a live event in progress. A ~30 min maintenance window should be plenty for this data volume.

## Open Items to Discuss

1. **Repo consolidation** — which repo becomes the single source of truth?
2. **Certain server deployment** — CI/CD pipeline, hosting environment, timeline?
3. **Neon vs. self-hosted Postgres** — Replit uses Neon. Do Certain servers use their own Postgres?
4. **Environment secrets** — how are API keys (SendGrid, Twilio, PrintNode, Gemini) managed on Certain infra?
5. **Beta cutover plan** — when do beta testers move from Replit to Certain servers?
6. **Branch strategy** — `main` for production, feature branches for dev? Or something else?
