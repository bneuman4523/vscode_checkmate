# Greet Beta Feedback Tracker

**Project Start:** February 2, 2026
**Last Updated:** April 13, 2026

This is the single source of truth for all feedback — alpha, beta, partner, and security testing combined. Both dev and production reference this document.

> **Testers:** All items marked 🔔 have been fixed and deployed. Please validate and add your initials + date to the "Validated" column.

### Status Legend

| Icon | Meaning |
|------|---------|
| ✅ Verified | Tester confirmed working |
| 🔔 Pending UAT | Dev fix deployed — awaiting tester validation |
| ⏳ In Progress | Currently being worked on |
| 📋 Planned | Documented and scheduled |
| 🔜 Deferred | Low priority — future consideration |
| ⚠️ Partial | Needs recheck or partially resolved |
| ❌ FAIL | UAT failed — issue still present |

---

## 1. Verified & Complete (✅)

Items confirmed working by testers or resolved with no remaining action.

| # | Area | Description | Resolved | Validated |
|---|------|-------------|----------|-----------|
| 1 | UI | Dark mode with system preference detection and manual toggle | Feb 3 | ✅ Feb 20 |
| 2 | UI | Custom background images for login, kiosk, and staff portal | Feb 3 | ✅ Feb 20 |
| 3 | Badges | Badge preview matches printed output (fonts, sizing, positions) | Feb 3 | ✅ Feb 20 |
| 4 | Navigation | Collapsible sidebar with mobile hamburger menu | Feb 3 | ✅ Feb 20 |
| 5 | Kiosk | QR code self-scan mode for attendee self-service check-in | Feb 3 | ✅ Feb 20 |
| 7 | Notifications | Configurable SMS alerts for specific attendee types (e.g., VIP arrives) | Feb 3 | ✅ Feb 20 |
| 9 | System | Comprehensive error logging and display throughout the app | Feb 3 | ✅ Feb 20 |
| 12 | Settings | Fixed timezone bug where UTC staff access times shifted on save | Feb 5 | ✅ Feb 20 |
| 13 | Forms | Red asterisks on all required fields in attendee, event, and printer forms | Feb 5 | ✅ Feb 20 |
| 16 | Attendees | Name display as "Last, First" sorted alphabetically by last name | Feb 5 | ✅ Feb 20 |
| 17 | Badges | Badge template name 50-char limit with live counter | Feb 5 | ✅ Feb 20 |
| 19 | Navigation | Favorites / Pinned Events — pin events to sidebar, per-user persistence | Feb 7 | ✅ Feb 20 |
| 22 | Kiosk | "Exit Kiosk Mode" button with PIN-protected exit | Feb 7 | ✅ Feb 20 |
| 24 | Badges | Decimal badge template sizes (e.g., 4.5 x 3) now work | Feb 11 | ✅ Feb 20 |
| 25 | Security | Passcode validation — real-time error for less than 4 characters | Feb 11 | ✅ Feb 20 |
| 26 | Workflow | "Previous" button hidden on first workflow step | Feb 11 | ✅ Feb 20 |
| 27 | Settings | Removed duplicate "Check-in Notifications" header | Feb 11 | ✅ Feb 20 |
| A2 | Kiosk QR | Smart camera fallback — tries preferred mode, alternate, then device ID | Feb 10 | ✅ Feb 20 |
| A5 | Check-in | Search shows results list for selection — no auto-check-in | Feb 10 | ✅ Feb 20 |
| A9 | Kiosk | Confirmation screen shows email, company, reg code for identity verification | Feb 23 | ✅ |
| A10 | Kiosk | Kiosk uses configured PrintNode/Zebra printers with silent printing | Feb 10 | ✅ Feb 20 |
| A11 | UI | Refresh button has spinning animation + toast notification | Feb 10 | ✅ Feb 20 |
| A13 | Forms | Phone number auto-formats as +1 (555) 123-4567; stored as E.164 | Feb 10 | ✅ Feb 20 |
| A15 | Import | "Download CSV Template" link in import dialog with sample data | Feb 10 | ✅ Feb 20 |
| A16 | Navigation | Account name persists correctly on page refresh (no "Customer cust-xxx") | Feb 10 | ✅ Feb 20 |
| B2 | Sidebar | Collapse toggle works correctly with cookie persistence | Feb 13 | ✅ |
| B3 | Import | "Position" and "Job Position" headers mapped to "Title" in CSV parser | Feb 11 | ✅ |
| B5 | Check-in | Admin workflow completion now checks `checkedIn` status correctly | Feb 13 | ✅ |
| B6 | Signatures | Signature save during workflow fixed — staff can resume workflows | Feb 13 | ✅ Feb 20 |
| B7 | Integrations | Account code auto-used for Basic Auth; read-only on Auth tab | Feb 11 | ✅ Feb 20 |
| B8 | Notifications | VIP alert 403 error fixed — super_admin role now included | Feb 11 | ✅ Feb 20 |
| B9 | Sync | Pagination limit increased from 5 to 1000 pages; page size configurable | Feb 13 | ✅ |
| B13 | Workflow | Disclaimer bypass fixed — agreement always required regardless of navigation | Feb 13 | ✅ |
| B14 | Settings | Event delete button works with role-based access and FK error messages | Feb 11 | ✅ Feb 20 |
| B16 | Notifications | VIP alert SMS now sent from staff check-in route (was missing) | Feb 13 | ✅ |
| B17 | Integrations | Copy icon works in iframe/non-secure contexts via clipboard fallback | Feb 13 | ✅ |
| B18 | Reports | Signatures render as inline images in UI, Excel embeds in cells | Feb 12 | ✅ Feb 20 |
| B20 | Sessions | Session creation 400 error fixed — date string-to-Date conversion added | Feb 13 | ✅ |
| B22 | Settings | "Event Settings" option added to card and list view dropdown menus | Feb 13 | ✅ |
| B23 | Kiosk | Kiosk search uses partial/fuzzy matching for improved attendee lookup | Feb 13 | ✅ |
| B24 | Workflow | Workflow questions fixed — answerType/questionType mismatch resolved | Feb 13 | ✅ |
| B25 | Kiosk | Persistent error after mode toggle fixed — cleanup effect clears state | Feb 13 | ✅ |
| B27 | Navigation | "Back to Dashboard" navigation for non-super-admin users | Feb 13 | ✅ |
| B28 | Security | Stored XSS blocked — server-side HTML entity escaping on all attendee routes | Feb 12 | ✅ Feb 20 |
| B29 | Printing | "Print Badge" from menu shows toast feedback and works correctly | Feb 12 | ✅ Feb 20 |
| B30 | Check-in | Admin check-in search always shows results list with explicit button | Feb 12 | ✅ Feb 20 |
| B31 | Kiosk | "Launch Kiosk Mode" shows error when no event selected instead of failing silently | Feb 13 | ✅ |
| B33 | Events | Create event validates empty dates — dialog stays open with error | Feb 12 | ✅ Feb 20 |
| B35 | Settings | Settings button on event cards now works (same fix as B22) | Feb 13 | ✅ |
| C1 | Printing | Badge template printing corrected — graphic/image now included | Feb 19 | ✅ |
| C3 | Badges | "Custom Position (Drag)" added for QR code with snap guides | Feb 19 | ✅ |
| C4 | Badges | "Free" alignment option for full X+Y drag positioning of text fields | Feb 19 | ✅ |
| C5 | Badges | Mobile-friendly stepper controls replace numeric inputs (44px touch targets) | Feb 19 | ✅ |
| C6 | Attendees | Attendee type required on create; badge mapping warnings for unassigned types | Feb 23 | ✅ |
| C8 | Kiosk | Event-level kiosk PIN — set once, shared across all devices | Feb 19 | ✅ |
| S6 | Labels | Separate "Reg Code" and "Order Code" columns in attendee table | Feb 5 | ✅ |
| S7 | Overview | Removed redundant Quick Actions card | Feb 20 | ✅ |
| S8 | Settings | Staff Access consolidated into single section in Event Settings | Feb 5 | ✅ |
| S9 | Settings | Access Window labels clarified with date+time picker | Feb 20 | ✅ |
| S10 | Badges | "Type Assignment Summary" renamed to "Badge Assignments at a Glance" | Feb 13 | ✅ |
| S13 | Printing | PrintNode refresh button shows success toast | Feb 19 | ✅ |
| S14 | Navigation | Custom Fonts moved to left nav under account menu | Feb 20 | ✅ |
| S15 | Navigation | Integrations card removed from dashboard (left nav only) | Feb 20 | ✅ |
| S29 | Badges | QR code fully draggable with snap guides | Feb 19 | ✅ |
| S31 | User Menu | Name click shows dropdown with profile info and Sign Out | Feb 20 | ✅ |
| S32 | Check-in | Distinct sound feedback for check-in, revert, and errors | — | ✅ Already built |
| S34 | Badges | Full drag-and-drop field positioning with snap-to-grid guides | — | ✅ Already built |
| S39 | Walk-ins | Kiosk and staff walk-in registration with PIN protection and external sync | Mar 2026 | ✅ |
| D2 | Settings | Timezone displayed on Access Window Start/End fields in staff settings | Apr 2026 | ✅ Apr 2026 |
| D3 | Sync | Session sync confirmed working — was configuration issue | — | ✅ Config issue |
| D10 | Attendees | Registration disappearing — confirmed user error, not a bug | — | ✅ Not a bug |
| AMI-1 | Sync | Session sync 400 error (date format) — fixed server-side date formatting | Mar 30 | ✅ Resolved |
| AMI-2 | Sync | Certain event with Greet tag not appearing — resolved (config/tag setup) | Mar 25 | ✅ Resolved |
| AMI-3 | Auth | New user (Stephen) not receiving OTP code — tested and confirmed working | Mar 24 | ✅ Resolved |
| AMI-4 | Sessions | Staff QR scan into session failing ("Session Check-In Failed") — now working | Mar 31 | ✅ Resolved |

---

## 2. Fixed — Pending UAT (🔔)

Dev fix complete and deployed. Testers: please validate.

### Bug Fixes

| # | Area | What Was Fixed | How to Test | Validated |
|---|------|---------------|-------------|-----------|
| 10 | Events | Config template auto-opens modal after creating a new event | Create new event → Apply Configuration Modal should open automatically | |
| 14 | Labels | "External ID" → "Reg Code" across entire UI including CSV import template | Check attendee list, forms, imports, exports — all say "Reg Code" | |
| 15 | Labels | "Participant Type" → "Attendee Type" across entire UI including exports | Check attendee list, badge setup, exports — all say "Attendee Type" | |
| 20 | Badges | Badge watermark position, size, and fit controls persist on reload | Set watermark position/size/fit, reload page — should persist | ⚠️ Needs recheck |
| A6 | Badges | Badge preview shows correct template — mappings use actual event attendee types | Open badge preview, select attendee type — correct template displays | |
| A7 | Kiosk | Badge Assistant icon fully visible — compact mode with smaller button | Open kiosk — chatbot icon fully visible and clickable | |
| A8 | Sessions | Session builder scrolling — form scrolls, Save button stays fixed at bottom | Open session builder with many fields — Save button always visible | |
| B4 | Badges | Badge template delete shows friendly error when template is assigned to events | Try deleting a template in use — should show clear "in use" error | |
| B10 | Events | Attendee count updates after sync — queries invalidated post-sync | Run integration sync — attendee count on event card updates immediately | |
| B11 | Badges | Badge template save shows specific field-level validation errors | Trigger validation error saving template — shows specific error details | |
| B12 | Overview | Badge printed count auto-refreshes every 30 seconds | Print a badge — overview page count should update within 30s | |
| B15 | Users | Self-profile editing works for name, phone, email; role/customer locked | Edit your own profile — name/phone/email save; role stays locked | |
| B19 | Reports | Export timestamps use event timezone with timezone abbreviation (PST, EST) | Export CSV or Excel — times should match event timezone | |
| B21 | Badges | Badge edit/delete works after initial save | Save a badge template, then edit or delete it — should work | ⚠️ Partial |
| D1 | Attendees | Registration status filter — toggle buttons for Invited/Registered/Attended | Open attendee list — status filter buttons visible, filtering works | |
| D5 | Kiosk | Kiosk launch from admin no longer shows "Security Error" | Log in as admin, launch kiosk mode — should launch without errors | |
| D6 | Kiosk | Kiosk auto-caches attendee data on launch; manual refresh still available | Launch kiosk mode — data caches automatically, no manual click needed | |
| D7 | QR Scan | Universal QR parser — supports JSON, URL, Certain `code`, delimited, plain ID/email | Scan badge QR code (any format) — attendee should be identified | |
| D8 | Workflow | Revert check-in clears all workflow data (signature, questions, disclaimer, badge) | Revert check-in, re-check-in — all workflow steps appear fresh | |

### Enhancement Fixes

| # | Area | What Changed | How to Test | Validated |
|---|------|-------------|-------------|-----------|
| S21 | Workflow | Validation errors display directly above action buttons | In workflow, skip a step — error appears above buttons, not at top | |
| S22 | Workflow | Disclaimer checkbox shows red border + inline error when unchecked | Click Next without checking disclaimer — red outline and error text | |
| S24 | Attendees | Attendee type dropdown shows types from current event data | Open edit dialog — Attendee Type shows this event's actual types | |
| S26 | Navigation | Fixed dual nav highlight — only correct item highlights | Navigate to sub-pages — only the matching nav item highlights | |
| S28 | Navigation | Home icon clears context and returns to main dashboard | Click home icon from any page — returns to main dashboard | |
| AMI-5 | Settings | Settings edit discoverability — "How do these settings get edited once set up?" | Verify settings are editable from event settings page after initial setup | |

### Not Yet Tested (Need Validation)

| # | Area | What Was Fixed | How to Test | Validated |
|---|------|---------------|-------------|-----------|
| 8 | Sessions | Staff session time tracking display | Open session report — staff session durations display correctly | |
| 18 | Events | "Duplicate" menu item hidden until feature is built | Open event card menu — "Duplicate" should not appear | |
| 21 | Dashboard | Collapsible Active Events section with preference persistence | Active events defaults collapsed; expand/collapse persists | |
| 23 | Workflow | PDF download updates check-in status to "Attended" and marks badge printed | Complete workflow with "Download PDF" — status changes, badge marked | |
| 28 | Badges | Deleted custom fonts removed from badge template dropdown | Delete a font, open badge editor — deleted font should not appear | |
| B26 | Printing | Mobile print footer CSS improved (browser headers are OS-controlled) | Print badge on mobile — margins minimized where possible | |
| B32 | Printing | Badge Printing page shows events correctly | Open Badge Printing page — events should be listed | |

---

## 3. Open Bugs (❌)

Known issues that still need fixing.

| # | Area | Issue | Severity | Notes |
|---|------|-------|----------|-------|
| C2 | QR Scan | Admin QR check-in via scanner not working on iPad (possibly attendee type related) | 🟠 Major | Needs re-test after QR parser updates |

### Resolved (moved from Open Bugs)
| # | Area | Resolution | Date |
|---|------|-----------|------|
| 6/A3/A4 | QR Scan | Fixed — increased QR code size to min 1" + quiet zone for iPhone 15 rear camera (commit 3e6b08a) | 2026-04-24 |

---

## 4. Planned (📋)

Documented and scheduled for implementation.

| # | Area | Description | Priority |
|---|------|-------------|----------|
| D4 | Workflow | Document/clarify when Disclaimer step displays (event only vs session check-in) | Medium |
| D9 | Printing | Option to disable badge print step for pre-printed badge events | Medium |

---

## 5. Planned Features (Spec'd)

### Batch Badge Print & Export
**Priority:** Medium

Select multiple attendees → "Print Badges" dialog with two options:
- **Send to Printer:** Individual badges to PrintNode/Zebra with progress bar
- **Export to PDF:** Multi-page PDF download (one badge per page)

Scaling: Up to 200 badges client-side (jsPDF), 200+ server-side (PDFKit streaming).

### Event Copy
**Priority:** Medium

Copy event configuration (name, integration link, badge assignments, printer, staff settings, workflow, notifications, location). Does NOT copy attendees, check-in data, sync state, or date.

### CSV Import Column Mapping UI
**Priority:** Medium

Interactive mapping screen when CSV headers don't match expected fields. Column preview, drag-and-drop mapping, save mappings for reuse.

### Group Check-in
**Priority:** Medium
**Status:** Feature flag + event toggle + UI built; pending full testing

Account-level feature flag (`group_checkin`) + event toggle (`allowGroupCheckin`). Scan one QR → see all attendees in the group → check in all at once or individually.

### Advanced QR Code Scanning
**Priority:** Medium
**Status:** Partially built

Badge templates support 4 QR encoding modes (externalId, simple, json, custom). Universal QR parser built and deployed. Still needed: simple format parser with separator config, custom format support, workflow pre-fill from scanned data, QR data size guardrails in Badge Designer.

### Balance Due Validation
**Priority:** Medium

Prevent badge printing for attendees with outstanding balance. Requires integration with Certain's financial data.

### International Phone Number Support
**Priority:** Medium

Twilio account needs international number configuration + app testing to confirm delivery.

---

## 6. Deferred (🔜)

Low priority — for future consideration.

| # | Area | Suggestion | Notes |
|---|------|------------|-------|
| A12 | Notifications | Notification name filter autocomplete from attendee list | Free text can cause mismatches |
| A14 | Sessions | Review where session creation/editing lives in the UI | UX/IA review needed |
| S1 | Attendees | Column sorting in attendee list | Sortable column headers |
| S2 | Check-in | Quick filter for checked-in vs not checked in | Filter toggle for check-in status |
| S4 | Notifications | Tooltip explaining name filter matching logic | Helper text |
| S5 | Check-in | Bulk check-in for selected attendees | Requires batch action UI + audit logging |
| S16 | Navigation | Left nav width reduction | Standard width; can be collapsed |
| S17 | Kiosk | Re-enter fullscreen after print dialog | Browser exits fullscreen on print by design |
| S20 | Notifications | Country code as separate field in phone input | Requires phone input redesign |
| S25 | Notifications | VIP Alerts as standalone section | Currently under Event Settings |
| S27 | Navigation | Click-outside-to-close for expanded sidebar | Sidebar has collapse toggle |
| S30 | Workflow | Branching options for workflow questions | Requires workflow engine redesign |
| S33 | Check-in | Show full attendee list vs search-only for check-in | UX review for large events |
| S35 | Badges | More fields: Profile Picture | Reg Code and Order Code done; picture deferred |
| S36 | Badges | Custom indicators/stickers on badges (fast-track, access level) | New element type with conditional logic |
| S38 | Help | Context-aware help chat (currently badge-scoped only) | Page-level KB routing needed |
| C7 | Kiosk | iPad Safari accessible from kiosk (can open new tabs) | Recommend iPad Guided Access for lockdown |
| C9 | Kiosk | Fast check-in mode — print badge immediately on QR scan | Speed mode for high-volume events |
| C10 | Check-in | QR confirmation hard to see on iPad landscape | Works fine on laptop and iPad portrait |

---

## 7. Known Limitations

| Issue | Notes |
|-------|-------|
| B1 | QR scan from PDF on monitor unreliable (screen glare/resolution) — recommend printing QR codes |
| B34 | HTML5 date picker unusable in headless environment — works in standard browsers |
| B26 | Mobile browser print headers/footers controlled by OS — cannot be removed programmatically |
| C7 | iPad Safari kiosk mode — browser tabs still accessible; use Guided Access for full lockdown |

---

## 8. Positive Feedback

| Tester | What They Liked |
|--------|----------------|
| Bob | Help FAQs — "Super helpful!" |
| Bob | Dark Mode — "Love it!" |
| Alex | QR scan, workflow config, reports export, check-in via search all worked well |
| Peggy | Badge printing worked on HP via Bluetooth; reports accurate and quick export |
| Peggy | "Glad you added the help chat feature!" |
| Corie | "I really liked the workflow for Staff Checkin, this will play well with client" |
| Peach | "Love that we could add fonts!!!" |

---

**Total items: 110** | **Verified: 67** | **Pending UAT: 27** | **Open bugs: 2** | **Planned: 2** | **Deferred: 19** | **Planned features: 6**

_Last updated: April 14, 2026 — Added 5 AMI account feedback items from production (AMI-1 through AMI-5). Four resolved (session sync, tag setup, OTP, session QR scan), one pending UAT (settings edit discoverability)._
