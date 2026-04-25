# Staging Test Plan — Pre-Production Validation

**Created:** 2026-04-25
**Purpose:** Systematic test checklist for validating all recent changes before production deployment. Designed to be run by a tester (human or AI) against the staging environment.

**Environment:** AWS EC2 staging at `http://54.241.143.130:5000`
**Prerequisites:** At least one customer account with events, attendees, badge templates, and workflow configured.

---

## 1. Authentication & Authorization

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 1.1 | Login with email/password | Go to /login, enter valid credentials | Redirects to dashboard |
| 1.2 | Login with OTP (phone) | Enter phone number, receive code, verify | Redirects to dashboard |
| 1.3 | Failed login | Enter wrong password 3 times | Error message, not locked out immediately |
| 1.4 | Session timeout | Leave session idle for 4+ hours | Timeout warning dialog, then logout |
| 1.5 | Auth middleware fail-closed | (Dev only) Simulate DB error during auth | Returns 500, not silent pass-through |
| 1.6 | Partner role login | Log in as partner user | See assigned accounts only, not all accounts |
| 1.7 | Partner account switching | Click into an assigned account, then back | Navigation works, data scoped correctly |
| 1.8 | Super admin impersonation | Select a customer from accounts page | All data scoped to that customer |

## 2. Event Management

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 2.1 | Create event | Click Add Event, fill name + date | Event created, appears in list |
| 2.2 | Duplicate event | Click event dropdown → Duplicate Event | Dialog with editable name, creates copy |
| 2.3 | Verify copy includes config | Open duplicated event settings | Workflow, badges, staff settings, notifications all copied |
| 2.4 | Verify copy excludes data | Open duplicated event attendees | No attendees or sessions copied |
| 2.5 | Setup checklist deep links | Open event overview, expand checklist | Each item is clickable, navigates to correct page |
| 2.6 | Setup checklist edit buttons | Expand checklist for configured event | Configured items show "Edit" button that navigates correctly |

## 3. Check-In Flow (Staff Dashboard)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 3.1 | QR scan check-in | Scan a valid QR code | Attendee checked in, success feedback |
| 3.2 | Manual search check-in | Type attendee name, select, check in | Attendee checked in |
| 3.3 | Already checked in | Scan same attendee again | "Already checked in" warning |
| 3.4 | Revert check-in | Click revert on checked-in attendee | Status reverts, workflow data cleared |
| 3.5 | Workflow check-in | Check in attendee with workflow enabled | Workflow steps appear before check-in completes |
| 3.6 | Group check-in | Scan order code for multi-member group | Group card appears, select/check in members |

## 4. Kiosk Mode

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 4.1 | Launch kiosk | Navigate to /kiosk/:customerId/:eventId | Welcome screen appears |
| 4.2 | QR scan | Scan QR from welcome → scanning step | Attendee found and checked in |
| 4.3 | Manual search | Switch to Type Info tab, enter name | Search works, check-in completes |
| 4.4 | Multiple matches | Search a common name | Multiple Results step appears |
| 4.5 | Email verification | Trigger ambiguous match | Verify Your Identity step with email input |
| 4.6 | Walk-in registration | Click "Not registered? Sign up here" | Walk-in form appears, registration works |
| 4.7 | Group check-in in kiosk | Scan order code | Group check-in card appears |
| 4.8 | Workflow in kiosk | Check in attendee with workflow | Workflow steps shown before success |
| 4.9 | Badge print | Click "Print My Badge" on success | Print sent to configured printer |
| 4.10 | Skip print | Click "Skip (I have my badge)" | Returns to welcome screen |
| 4.11 | Exit PIN dialog | Tap logo 5 times (or press ESC) | PIN dialog appears |
| 4.12 | Exit with correct PIN | Enter correct PIN | Kiosk exits |
| 4.13 | Exit with wrong PIN | Enter wrong PIN | "Incorrect PIN" error |
| 4.14 | Offline indicators | Disconnect network | Offline badge appears, cached data works |
| 4.15 | Error recovery | Force event load error | Error step with "Try Again" button |

## 5. Badge Design & Printing

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 5.1 | Badge designer loads | Open Badges page for an event | Designer renders with merge fields |
| 5.2 | Template preview | Select a template, preview renders | Badge shows with correct layout |
| 5.3 | Foldable badge preview | Select foldable template | Front and back panels render |
| 5.4 | Print via PrintNode | Print badge with PrintNode printer | Job sent, success toast |
| 5.5 | Print via browser | Print badge without PrintNode | Browser print dialog opens |
| 5.6 | QR code on badge | Preview badge with QR enabled | QR code renders at configured position |
| 5.7 | Per-type template mapping | Set different templates per attendee type | Correct template used per type |

## 6. Feature Flags (Per-Account)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 6.1 | Features page renders | Go to License & Features → Features tab | All features listed with descriptions and badges |
| 6.2 | Toggle feature on/off | Toggle a feature switch (super admin) | Feature state persists on refresh |
| 6.3 | event_sync flag OFF | Disable event_sync for an account | Integrations nav, Data Sync tab, Sync Insights hidden |
| 6.4 | event_sync flag ON | Re-enable event_sync | All sync UI reappears |
| 6.5 | group_checkin flag | Toggle group_checkin per account | Group check-in option appears/disappears in kiosk |
| 6.6 | Non-super admin view | Log in as admin (not super admin) | Features show but toggles are disabled (badge only) |

## 7. Partner Role

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 7.1 | Create partner user | Super admin creates user with "Partner" role | User created with no customer assignment |
| 7.2 | Assign accounts | Select accounts in checkbox list | Assignments saved via API |
| 7.3 | Partner sees assigned only | Log in as partner | Only assigned accounts in account list |
| 7.4 | Partner can manage users | Navigate to user management within account | Can create/edit admin/manager/staff users |
| 7.5 | Partner cannot create accounts | Check accounts page | No "Add Customer" button |
| 7.6 | Partner sees admin section | Navigate into an account | Administration sidebar items visible |
| 7.7 | Partner does NOT see super admin items | Check sidebar at root level | No Mission Control, Error Report, Audit Log |

## 8. AI Features (Claude Integration)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 8.1 | Setup assistant | Open event, click assistant | Chat opens, responds to questions |
| 8.2 | Assistant tool use | Ask assistant to set event printer | Assistant calls tool, printer is set |
| 8.3 | Badge AI chat | Open badge designer, use AI chat | Receives design suggestions |
| 8.4 | Feedback analysis | Go to Feedback page with entries | AI analysis section renders (if ANTHROPIC_API_KEY set) |
| 8.5 | AI unavailable gracefully | Remove ANTHROPIC_API_KEY | AI features show "service unavailable" not crash |

## 9. Performance & Bundle

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 9.1 | Initial load size | Open /login, check Network tab | Main JS bundle under 600KB (gzipped ~155KB) |
| 9.2 | Lazy loading works | Navigate to Dashboard | Recharts chunk loads on demand |
| 9.3 | Page crash recovery | (Dev) Throw error in a lazy page | ErrorBoundary shows "Something went wrong" with retry |
| 9.4 | No console errors | Navigate through 5+ pages | No red errors in console |

## 10. Data Integrity

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 10.1 | Multi-tenant isolation | Log in as Account A admin | Cannot see Account B data |
| 10.2 | Event copy isolation | Duplicate event, verify no data leaks | Copy belongs to same customer, no cross-tenant data |
| 10.3 | Partner scope | Partner accesses unassigned account URL | 403 error |
| 10.4 | Kiosk PIN rate limiting | Enter wrong PIN 6 times | Locked out after 5 attempts |

## 11. S3 Storage (if configured)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 11.1 | Upload image | Upload branding image | File stored in S3, served at /objects/ URL |
| 11.2 | Serve image | Load page with uploaded image | Image renders from S3 |
| 11.3 | Fallback to local | Remove S3 env vars, restart | App uses local filesystem storage |

---

## How to Run This Test Plan

### For Claude (Chrome Extension)
Paste this prompt:
> "Please run through the Staging Test Plan at docs/STAGING_TEST_PLAN.md against the staging environment. For each test, navigate to the page, perform the steps, and record pass/fail with any notes. Skip tests that require env-specific config (S3, AI keys) if not configured."

### For Manual Testing
1. Start from test 1.1 and work through sequentially
2. Mark each test: PASS / FAIL / SKIP (with reason)
3. Log any unexpected behavior even if the test "passes"
4. Focus extra attention on sections 4 (Kiosk) and 6 (Feature Flags) — these had the most changes

### Critical Path (Minimum Smoke Test)
If time is limited, run these 10 tests:
1. 1.1 — Login works
2. 2.2 — Event copy works
3. 3.1 — QR check-in works
4. 4.1 + 4.2 — Kiosk launches and scans
5. 4.8 — Kiosk workflow works
6. 4.11 — Exit PIN dialog works
7. 5.2 — Badge preview renders
8. 6.3 — Feature flag hides sync UI
9. 7.3 — Partner sees correct accounts
10. 9.1 — Bundle size is correct
