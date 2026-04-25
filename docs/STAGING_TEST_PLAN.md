# Greet — Comprehensive Regression Test Plan

**Created:** 2026-04-25
**Purpose:** Full regression test suite for validating the Greet platform before any production deployment. Designed to be run by a tester (human or AI) against the staging environment.

**Environment:** AWS EC2 staging at `http://54.241.143.130:5000`

**Prerequisites:**
- Super admin account with access to all features
- At least 2 customer accounts (one basic, one premium)
- At least one event per account with attendees, sessions, badge templates, and workflow configured
- A partner user assigned to one account
- PrintNode printer connected (for print tests)
- ANTHROPIC_API_KEY set (for AI tests)

---

## 1. Authentication & Session Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Email/password login | Enter valid credentials at /login | Dashboard loads |
| 1.2 | OTP login (SMS) | Enter phone, receive code, verify | Dashboard loads |
| 1.3 | OTP login (email) | Enter email, receive code, verify | Dashboard loads |
| 1.4 | Wrong password | Enter wrong password | Error message, no lockout on first attempt |
| 1.5 | Wrong OTP | Enter wrong code 5 times | Locked out for 15 minutes |
| 1.6 | Forgot password | Click forgot password, enter email | Reset email sent |
| 1.7 | Password reset | Follow reset link, set new password | Can log in with new password |
| 1.8 | Set password from invite | Follow invite SMS link | Password set page loads |
| 1.9 | Session persistence | Login, close tab, reopen app | Still logged in |
| 1.10 | Session timeout | Leave idle 4+ hours | Warning dialog, then forced logout |
| 1.11 | Logout | Click logout | Redirected to login, session cleared |
| 1.12 | Auth fail-closed | (Dev) Simulate DB error during auth | Returns 500, blocks request |

## 2. Role-Based Access Control

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Super admin sees all accounts | Login as super admin | Accounts page shows all customers |
| 2.2 | Admin scoped to account | Login as admin | Only sees own account, no Accounts page |
| 2.3 | Manager access | Login as manager | Can manage events, no user management |
| 2.4 | Staff access | Login as staff | Limited to scanner, badges, check-in |
| 2.5 | Partner sees assigned accounts | Login as partner | Only assigned accounts visible |
| 2.6 | Partner cannot create accounts | Check accounts page as partner | No "Add Customer" button |
| 2.7 | Partner admin within account | Navigate into assigned account | Administration section visible |
| 2.8 | Partner blocked from unassigned | Access unassigned account URL directly | 403 error |
| 2.9 | Super admin impersonation | Select a customer from accounts | Data scoped to that customer |
| 2.10 | Cross-tenant isolation | Admin A tries to access Admin B URL | 403 error |

## 3. Customer Account Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | Create customer | Super admin creates new account | Account appears in list |
| 3.2 | Edit customer | Rename account, change contact email | Changes persist |
| 3.3 | Deactivate account | Deactivate a customer | Account greyed out, users can't login |
| 3.4 | Reactivate account | Reactivate deactivated customer | Account active again |
| 3.5 | Delete account | Delete a customer (confirm dialog) | Account and all data removed |
| 3.6 | License assignment | Set customer to Premium plan | Features update to premium tier |

## 4. User Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | Create user | Add new user with phone number | User created, appears in list |
| 4.2 | Send welcome SMS | Toggle "Send Welcome SMS" on create | SMS sent with login instructions |
| 4.3 | Edit user profile | Change name, phone, email | Changes persist |
| 4.4 | Self-edit profile | Edit own name and phone | Saves; role/customer locked |
| 4.5 | Change user role | Super admin changes user from staff to admin | Role updates, permissions change |
| 4.6 | Deactivate user | Toggle user inactive | User can't login |
| 4.7 | Set password for user | Admin sets password for another user | User can login with new password |
| 4.8 | Create partner user | Create user with Partner role | No customer assigned, account picker shown |
| 4.9 | Assign partner accounts | Select accounts in checkbox list | Assignments saved, partner sees them |
| 4.10 | Role display | Check user list | Correct role badges (Super Admin, Partner, Admin, Manager, Staff) |

## 5. Event Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Create event | Click Add Event, fill name + date | Event created |
| 5.2 | Edit event | Change event name and date | Changes persist |
| 5.3 | Delete event | Delete event with confirmation | Event removed |
| 5.4 | Duplicate event | Click Duplicate Event from dropdown | Copy created with all config, no attendees |
| 5.5 | Verify duplication | Open duplicated event | Workflow, badges, staff, notifications copied |
| 5.6 | Setup checklist | Open event overview | Checklist shows with correct completion status |
| 5.7 | Checklist deep links | Click each checklist item | Navigates to correct configuration page |
| 5.8 | Checklist edit buttons | Click "Edit" on configured items | Navigates to settings page |
| 5.9 | Event status tracking | Check event card | Status badge shows (active/upcoming/past) |
| 5.10 | Pin to favorites | Pin event from dropdown | Appears in sidebar favorites |
| 5.11 | Unpin from favorites | Right-click pinned event | Removed from favorites |

## 6. Attendee Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | View attendee list | Open event → Attendees | List loads with search |
| 6.2 | Search attendees | Type in search box | Results filter in real-time |
| 6.3 | CSV import | Upload CSV file | Attendees imported, count updates |
| 6.4 | Edit attendee | Click edit on an attendee | Form opens, changes save |
| 6.5 | Manual check-in | Click check-in button | Status changes, timestamp set |
| 6.6 | Revert check-in | Click revert on checked-in attendee | Status reverts, workflow data cleared |
| 6.7 | View custom fields | Open attendee with custom data | Custom fields display correctly |
| 6.8 | Registration status filter | Toggle status filters | List filters by status |
| 6.9 | Export CSV | Click export | CSV downloads with correct data |
| 6.10 | Export Excel | Click Excel export | XLSX downloads with formatting |

## 7. Check-In Operations

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | QR scan check-in | Scan valid QR code | Attendee checked in |
| 7.2 | Manual search check-in | Search by name, select, check in | Success |
| 7.3 | Already checked in | Scan same attendee again | "Already checked in" warning |
| 7.4 | Workflow check-in | Check in with workflow enabled | Steps shown before completion |
| 7.5 | Workflow questions | Answer buyer questions step | Responses saved |
| 7.6 | Workflow disclaimer | Accept disclaimer with signature | Signature captured |
| 7.7 | Workflow badge print | Complete badge print step | Badge prints |
| 7.8 | Group check-in | Scan order code | Group card, batch check-in |
| 7.9 | Group individual check-in | Select "Just me" from group | Single member checked in |
| 7.10 | Walk-in registration | Create walk-in from staff dashboard | New attendee created and checked in |

## 8. Session Management

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | Create session | Add session with name, time, capacity | Session created |
| 8.2 | Edit session | Change session details | Changes persist |
| 8.3 | Session check-in | Check attendee into session | Timestamp recorded |
| 8.4 | Session check-out | Check attendee out of session | Duration calculated |
| 8.5 | Capacity enforcement | Fill session to capacity | New registrations waitlisted |
| 8.6 | Waitlist promotion | Cancel a registration | Next waitlisted attendee promoted |
| 8.7 | Session kiosk | Launch session kiosk | Session check-in flow works |

## 9. Kiosk Mode

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Launch kiosk | Navigate to /kiosk/:customerId/:eventId | Welcome screen |
| 9.2 | QR scan | Scan from welcome screen | Check-in completes |
| 9.3 | Manual search | Switch to Type Info, enter name | Search works |
| 9.4 | Multiple matches | Search ambiguous name | Results step shows |
| 9.5 | Email verification | Trigger multi-match | Verify step with email input |
| 9.6 | Walk-in registration | Click "Not registered?" | Form appears, registration works |
| 9.7 | Group check-in | Scan order code | Group card appears |
| 9.8 | Workflow in kiosk | Check in with workflow | Steps shown before success |
| 9.9 | Print badge | Click "Print My Badge" | Print job sent |
| 9.10 | Skip print | Click "Skip" | Returns to welcome |
| 9.11 | Exit PIN dialog | Tap logo 5x or press ESC | PIN dialog appears |
| 9.12 | Correct PIN exit | Enter correct PIN | Kiosk exits |
| 9.13 | Wrong PIN | Enter wrong PIN | Error, stays in kiosk |
| 9.14 | PIN rate limiting | Wrong PIN 6 times | Locked out |
| 9.15 | Offline indicators | Disconnect network | Offline badge appears |
| 9.16 | Error recovery | Force event error | Error step with retry |
| 9.17 | Accessibility: labels | Inspect form inputs | All have associated labels |
| 9.18 | Accessibility: errors | Trigger error state | role="alert" on error messages |
| 9.19 | Accessibility: success | Complete check-in | role="status" on success message |

## 10. Badge Design & Printing

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 10.1 | Badge designer | Open badge editor | Canvas renders with merge fields |
| 10.2 | Drag merge fields | Move fields on canvas | Positions save |
| 10.3 | Change font/color | Edit template styling | Preview updates |
| 10.4 | Template preview | Preview badge with attendee data | Correct merge field values |
| 10.5 | Foldable badge | Select foldable layout | Front and back panels render |
| 10.6 | QR code config | Change QR embed type | QR renders with correct data |
| 10.7 | Per-type template mapping | Assign templates per attendee type | Correct template resolves per type |
| 10.8 | PrintNode print | Print via cloud printer | Job sent, success toast |
| 10.9 | Browser print | Print without PrintNode | Browser dialog opens |
| 10.10 | PDF download | Download badge as PDF | PDF renders correctly |
| 10.11 | Custom fonts | Upload TTF/WOFF font | Font available in template editor |
| 10.12 | Font on badge | Apply custom font to template | Renders with correct font |

## 11. Integration & Sync

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 11.1 | Connect integration | Set up OAuth or API key connection | Status shows "Connected" |
| 11.2 | Test connection | Click test connection | Success/failure feedback |
| 11.3 | Discover events | Browse events from platform | External events listed |
| 11.4 | Map event | Link external event to local event | Mapping saved |
| 11.5 | Initial sync | Run first sync | Attendees pulled in |
| 11.6 | Incremental sync | Modify data externally, re-sync | Changes reflected |
| 11.7 | Sync status display | Check Data Sync page | Status, timing, counts shown |
| 11.8 | Sync freeze | Freeze sync for event | No syncs occur |
| 11.9 | Real-time check-in push | Check in attendee | Status pushed to external platform |

## 12. Notifications

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 12.1 | Create notification rule | Add check-in trigger with webhook | Rule saved |
| 12.2 | Webhook fires | Check in matching attendee | Webhook POST sent |
| 12.3 | SMS notification | Configure SMS trigger | SMS sent on check-in |
| 12.4 | Email notification | Configure email trigger | Email sent on check-in |
| 12.5 | Participant type filter | Set rule for VIP only | Only fires for VIP check-ins |
| 12.6 | Name filter | Set rule for specific name | Only fires for matching name |

## 13. Feature Flags (Per-Account)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.1 | Features page | Open License & Features → Features | All features with descriptions |
| 13.2 | Toggle feature | Super admin toggles a switch | State persists on refresh |
| 13.3 | event_sync OFF | Disable event_sync | Integrations, Data Sync, Sync Insights hidden |
| 13.4 | event_sync ON | Re-enable event_sync | Sync UI reappears |
| 13.5 | group_checkin flag | Toggle per account | Group option appears/disappears |
| 13.6 | walkin_registration flag | Toggle per account | Walk-in button appears/disappears |
| 13.7 | Premium badge | Check feature with Premium tier | "Premium" badge shown |
| 13.8 | Coming Soon badge | Check unbuilt feature | "Coming Soon" badge shown |
| 13.9 | Non-super-admin view | Login as admin | Features visible, toggles disabled |

## 14. AI Features (Claude)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.1 | Setup assistant | Open event, launch assistant | Chat responds |
| 14.2 | Tool use | Ask assistant to set printer | Tool executes, setting applied |
| 14.3 | Badge AI chat | Open badge designer AI chat | Receives design suggestions |
| 14.4 | Feedback analysis | Open Feedback with entries | AI analysis renders |
| 14.5 | Feedback conversation | Submit feedback via widget | Conversational flow works |
| 14.6 | AI unavailable | Remove ANTHROPIC_API_KEY, restart | Graceful error, no crash |

## 15. Configuration Templates

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 15.1 | Create template from event | Open configured event, save as template | Template saved |
| 15.2 | Apply template to new event | Create event, apply configuration | Config applied (workflow, badges, staff) |
| 15.3 | Manual setup | Create event, choose manual setup | Minimal config applied |
| 15.4 | Copy from event | Create event, copy from existing | Config copied |
| 15.5 | Edit template | Modify saved template | Changes persist |
| 15.6 | Delete template | Delete a template | Removed from list |

## 16. Reports & Exports

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 16.1 | Event overview stats | Open event dashboard | Check-in count, progress charts render |
| 16.2 | Export attendee CSV | Click CSV export | Downloads with correct columns |
| 16.3 | Export attendee Excel | Click Excel export | Downloads with formatting |
| 16.4 | Timestamps in exports | Check exported timestamps | Event timezone applied with abbreviation |
| 16.5 | Session report | View session attendance report | Counts and durations correct |

## 17. Locations & Settings

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 17.1 | Create location | Add location with name | Location created |
| 17.2 | Assign location to event | Set event location | Timezone auto-fills |
| 17.3 | System settings | Super admin opens settings | Settings page loads |
| 17.4 | Audit log | Super admin opens audit log | Log entries display |
| 17.5 | Data retention policy | Set retention days for account | Policy saved |

## 18. Performance & Bundle

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 18.1 | Initial load size | Load /login, check Network tab | Main JS < 600KB gzipped |
| 18.2 | Lazy loading | Navigate to Dashboard | Recharts chunk loads on demand |
| 18.3 | Vendor chunks | Check Network tab | Separate chunks for recharts, qrcode, jspdf, radix-ui |
| 18.4 | Error boundary | (Dev) Force error in lazy page | "Something went wrong" with retry |
| 18.5 | No console errors | Navigate 5+ pages | No red errors in console |
| 18.6 | Rate limiter cleanup | (Dev) Check memory after 1hr | Rate limiter Maps not growing unbounded |

## 19. S3 Storage (if configured)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 19.1 | Upload image | Upload branding image | Stored in S3 |
| 19.2 | Serve image | Load page with uploaded image | Renders from S3 |
| 19.3 | Local fallback | Remove S3 vars, restart | Falls back to filesystem |

## 20. UI & Responsiveness

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 20.1 | Dark mode toggle | Click theme toggle | Theme switches, persists |
| 20.2 | Sidebar collapse | Click sidebar toggle | Collapses to icon-only |
| 20.3 | Mobile layout | Resize to 375px width | Layout adapts, no horizontal scroll |
| 20.4 | Tablet layout | Resize to 768px | Sidebar auto-collapses |
| 20.5 | Kiosk branding | Set custom branding on event | Kiosk header shows custom logo/colors |

---

## How to Run This Test Plan

### For Claude (Chrome Extension)
```
Please run through the Comprehensive Regression Test Plan at docs/STAGING_TEST_PLAN.md against the staging environment at http://54.241.143.130:5000.

For each test:
1. Navigate to the relevant page
2. Perform the steps described
3. Record PASS / FAIL / SKIP with notes
4. If FAIL, describe what happened vs what was expected
5. Screenshot any failures if possible

Skip tests requiring:
- External services not configured (PrintNode, Twilio, SendGrid)
- ANTHROPIC_API_KEY if not set
- S3 if not configured
- Integration OAuth if no provider available

Start with the Critical Path Smoke Test, then work through remaining sections.
```

### Critical Path Smoke Test (10 tests — run first)
1. **1.1** — Login works
2. **5.4** — Event copy works
3. **7.1** — QR check-in works
4. **9.1 + 9.2** — Kiosk launches and scans
5. **9.8** — Kiosk workflow works
6. **9.11** — Exit PIN dialog works
7. **10.4** — Badge preview renders
8. **13.3** — Feature flag hides sync UI
9. **2.5** — Partner sees correct accounts
10. **18.1** — Bundle size is correct

### Regression Focus Areas (per deploy)
After each deploy, prioritize tests in sections where code changed:
- **Kiosk changes** → Section 9 (all 19 tests)
- **Auth changes** → Sections 1 + 2
- **Badge changes** → Section 10
- **Sync changes** → Section 11
- **Schema changes** → Sections 6 + 10 + 16 (data integrity)
