# Penetration Test Guide — Greet

## Overview

This document outlines the recommended approach for conducting a penetration test against the Greet platform. It covers access levels, scoping, and preparation steps.

---

## Recommended Approach: Gray Box Testing

Give the pen test team a regular user account (not admin, not super admin). This is the most realistic and useful test because:

- They can test authenticated attack surfaces (session hijacking, privilege escalation, IDOR)
- They can attempt to access other tenants' data (multi-tenancy bypass)
- They can test role escalation (user → admin → super_admin)
- They still test the unauthenticated surface (login brute force, OTP bypass, public endpoints)

---

## What to Provide the Testing Team

1. **One standard user account** on a test/demo customer account (email + password login)
2. **The published app URL** (not the dev URL)
3. **A list of roles that exist**: `user`, `admin`, `super_admin`, `staff`
4. **Scope boundaries** (see below)

## What NOT to Provide

- No admin or super admin accounts (they should try to escalate on their own)
- No source code access (unless opting for white-box testing)
- No database credentials
- No API keys or secrets

---

## Scope Boundaries

### In Scope

- Published Greet application URL and all endpoints under it
- All API endpoints (`/api/*`)
- Authentication flows (Replit Auth, email/password, SMS OTP, email OTP)
- Staff/kiosk check-in interfaces
- Badge printing and PrintNode integration endpoints
- WebSocket connections
- File upload functionality

### Out of Scope

- Replit infrastructure (hosting platform itself)
- Neon PostgreSQL database (direct access)
- Third-party services: Twilio, Resend, PrintNode, OpenAI, Slack
- Denial-of-service attacks (rate limits are already in place)
- Social engineering against team members

---

## Access Levels Reference

| Level | What They Get | Best For | Cost |
|-------|--------------|----------|------|
| **Black box** | Just the URL, no account | External attacker simulation | Lower |
| **Gray box** (recommended) | URL + standard user account | Realistic insider/customer threat | Medium |
| **White box** | URL + account + source code | Most thorough, finds the most issues | Higher |

Gray box gives the best balance of realistic findings versus cost. Black box spends too much time on the login page. White box is more of a code audit than a pen test.

---

## Pre-Test Preparation

### Rate Limit Allowlisting

The application has rate limiting configured:

- **Global API**: 300 requests per 15 minutes per IP
- **Auth endpoints**: 15 requests per 15 minutes (login, OTP request, OTP verify)
- **OTP verification**: 5 failed attempts triggers 15-minute lockout

Before testing begins, temporarily allowlist the testing team's IP address(es) in the rate limiter configuration to prevent them from being blocked during active scanning.

### Test Account Setup

1. Create a dedicated test customer account (e.g., "PenTest Corp")
2. Create a standard user under that account with email/password login
3. Add some sample event data and attendees so there's content to test against
4. Ensure at least one other customer account exists with data (to test tenant isolation)

### Monitoring During Test

- Watch the error logging dashboard for unusual patterns
- Monitor the feedback monitoring Slack channel for alerts
- Review server logs for any unexpected behaviors
- Check database for any unauthorized data access attempts

---

## Existing Security Controls

The testing team should be aware these controls are in place (they'll encounter them during testing):

| Control | Details |
|---------|---------|
| Helmet security headers | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| Content Security Policy | Production CSP with upgrade-insecure-requests |
| Permissions-Policy | Restricts camera, microphone, geolocation, payment, USB, sensors |
| Rate limiting (global) | 300 req / 15 min per IP on all API endpoints |
| Rate limiting (auth) | 15 req / 15 min on login, OTP request, OTP verify |
| Session cookies | httpOnly, secure, sameSite=lax (production) |
| CORS | Scoped to application domains only |
| Request body limits | 2MB max on JSON and URL-encoded bodies |
| Multi-tenancy | Row-level isolation via customer_id on all data queries |
| Error responses | No stack traces exposed; generic error messages returned |

---

## After the Test

1. Request the full report with findings categorized by severity (Critical, High, Medium, Low, Informational)
2. Review each finding against this guide's "Existing Security Controls" to identify any that were already mitigated
3. Prioritize remediation: Critical and High first, Medium before next release, Low/Info as time permits
4. Re-test after remediation to confirm fixes
5. Update `PRODUCTION_READINESS_AUDIT.md` and `SECURITY_AUDIT_REPORT.md` with findings and resolutions

---

*Created: February 24, 2026*
*Status: Ready for use when testing team is engaged*
