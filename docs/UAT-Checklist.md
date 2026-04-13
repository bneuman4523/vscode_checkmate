# Checkmate — UAT Validation Checklist

**Generated:** February 13, 2026
**Last Updated:** April 6, 2026
**Purpose:** Simple grid of all completed fixes and enhancements for alpha testers to validate during UAT.

> Please test each item and add your initials + date in the "Validated By" column once confirmed working.

### Status Legend

| Icon | Meaning |
|------|---------|
| ✅ | UAT Verified — Tester confirmed working |
| 🔔 Fixed — Pending UAT | Dev fix complete and deployed — awaiting first tester validation |
| 🔄 Awaiting UAT | Re-fixed after a failed UAT round — waiting for tester re-validation |
| ❌ FAIL | UAT failed — issue still present or new problem found |
| ⚠️ | Partial pass or needs recheck |

---

## Enhancements (Batch 1–3)

| # | Area | What Changed | How to Test | Validated By |
|---|------|-------------|-------------|--------------|
| 1 | UI | Dark mode support | Toggle dark mode in settings or system preferences; verify all pages render correctly | :white_check_mark: UAT Verified (Feb 20) |
| 2 | UI | Custom background images | Upload custom backgrounds for login, kiosk, and staff portal pages | :white_check_mark: UAT Verified (Feb 20) |
| 3 | Badges | Badge preview matches print output | Open badge preview and compare to printed badge — fonts, sizing, positions should match | :white_check_mark: UAT Verified (Feb 20) |
| 4 | Navigation | Responsive sidebar with mobile menu | Resize browser or use mobile device; sidebar should collapse with hamburger menu | :white_check_mark: UAT Verified (Feb 20) |
| 5 | Kiosk | QR code self-scan mode | Launch kiosk, scan a QR code — attendee should be found and checked in | :white_check_mark: UAT Verified (Feb 20) |
| 6 | Check-in | Staff managed scan mode | Use staff scan mode with device camera to check in an attendee | :x: FAIL — iPhone 15 rear camera issue |
| 7 | Notifications | Check-in notification rules | Configure a VIP alert rule, check in a matching attendee, verify SMS is triggered | :white_check_mark: UAT Verified (Feb 20) |
| 8 | Sessions | Session time tracking | Open session report and verify staff session durations display correctly | Not tested |
| 9 | System | Improved error messages | Trigger an error (e.g., invalid input) and verify a clear message is shown | :white_check_mark: UAT Verified (Feb 20) |
| 10 | Events | Event configuration templates | Create a reusable config template, apply it to a new event | :x: FAIL — No option to apply template when creating event |
| 11 | Printing | Multi-location printer management | Assign printers to locations; staff should only see printers for their location | N/A — Not applicable for now |
| 12 | Settings | Staff portal time drift fix | Save staff portal access times, reload page — times should not shift | :white_check_mark: UAT Verified (Feb 20) |
| 13 | Forms | Required field indicators | Check Add Attendee, Edit Attendee, Create Event — required fields should have red asterisks | :white_check_mark: UAT Verified (Feb 20) |
| 14 | Labels | "External ID" → "Reg Code" | Verify "Reg Code" appears everywhere (attendee list, forms, imports, exports) | :x: FAIL — Import template missing "Reg Code" column |
| 15 | Labels | "Participant Type" → "Attendee Type" | Verify "Attendee Type" appears everywhere in the UI | :x: FAIL — Export says "TYPE"; Badge Setup still says "Participant Type" |
| 16 | Attendees | Name display as "Last, First" | Open attendee list — names should show "Last, First" sorted by last name | :white_check_mark: UAT Verified (Feb 20) |
| 17 | Badges | Badge template name 50-char limit | Create a badge template — name input should show character counter and enforce 50-char max | :white_check_mark: UAT Verified (Feb 20) |
| 18 | Events | "Duplicate" menu item hidden | Right-click or open event card menu — "Duplicate" option should not appear | Not tested |
| 19 | Navigation | Favorites / Pinned Events | Pin an event from dashboard — it should appear in sidebar; unpin via right-click | :white_check_mark: UAT Verified (Feb 20) |
| 20 | Badges | Badge watermark persistence | Set watermark position/size/fit, reload page — settings should persist | :warning: Needs recheck — notes say "Ashley - Pass" but marked Fail |
| 21 | Dashboard | Collapsible Active Events section | Active events section should default to collapsed; expand/collapse preference should persist | Not tested |
| 22 | Kiosk | Exit Kiosk Mode button | Open kiosk — "Exit Kiosk Mode" button should be visible; requires PIN to exit | :white_check_mark: UAT Verified (Feb 20) |

---

## Bug Fixes (Batch 4 — Tester Feedback)

| # | Area | What Was Fixed | How to Test | Reported By | Validated By |
|---|------|---------------|-------------|-------------|--------------|
| 23 | Workflow | PDF download now updates check-in status | Complete workflow with "Download PDF & Complete Check-In" — status should change to Attended, badge marked printed | Bob, Rowell | Not tested |
| 24 | Badges | Decimal badge template sizes now work | Create a badge template with size 4.5 x 3 — should save without error | Rowell | :white_check_mark: UAT Verified (Feb 20) |
| 25 | Security | Passcode validation under 4 chars | Enter a 1–3 character passcode — should show error message in real time | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| 26 | Workflow | "Previous" button hidden on first step | Start a check-in workflow — first step should not show a "Previous" button | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| 27 | Settings | Duplicate "Check-in Notifications" header removed | Open event settings — only one "Check-in Notifications" header should appear | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| 28 | Badges | Deleted fonts removed from dropdown | Delete a custom font, then open badge template editor — deleted font should not appear | Rowell | Not tested |

---

## Bug Fixes (Ashley's Feedback)

| # | Area | What Was Fixed | How to Test | Validated By |
|---|------|---------------|-------------|--------------|
| A2 | Kiosk QR | Camera fallback for all devices | Launch kiosk scan on Mac/desktop — camera should activate and scan QR codes | :white_check_mark: UAT Verified (Feb 20) |
| A3 | Admin QR | Admin-side QR scan now works | Click QR scan button on admin side — camera should open and scan | :x: FAIL — iPhone 15 rear camera |
| A4 | Staff QR | Staff app QR scan now works | Open staff app scan — camera should detect and read QR codes | :x: FAIL — iPhone 15 rear camera |
| A5 | Check-in | No more auto-check-in on search | Search for an attendee in admin check-in — results list should appear, requiring explicit selection | :white_check_mark: UAT Verified (Feb 20) |
| A6 | Badges | Badge preview shows correct template | Open badge preview, select attendee type — correct template should display with resolution source shown | :x: FAIL — Still showing wrong template |
| A7 | Kiosk | Badge Assistant icon fully visible | Open kiosk — chatbot icon should be fully visible and clickable | :x: FAIL — Icon still cut off |
| A8 | Sessions | Session builder scrolling fixed | Open session builder with many fields — content should scroll, Save button should stay visible | :x: FAIL — Still can't scroll to Save |
| A10 | Kiosk | Kiosk uses configured cloud printers | Set up kiosk with PrintNode printer — should print silently without browser dialog | :white_check_mark: UAT Verified (Feb 20) |
| A11 | UI | Refresh button has visual feedback | Click refresh — icon should spin and a confirmation toast should appear | :white_check_mark: UAT Verified (Feb 20) |
| A13 | Forms | Phone number auto-formatting | Enter a phone number — should auto-format as +1 (555) 123-4567 | :white_check_mark: UAT Verified (Feb 20) |
| A15 | Import | CSV template download available | Open CSV import dialog — "Download CSV Template" link should be present | :white_check_mark: UAT Verified (Feb 20) |
| A16 | Navigation | Account name persists on page refresh | Open a page in a new tab — sidebar should show actual account name, not "Customer cust-xxxxx" | :white_check_mark: UAT Verified (Feb 20) |

---

## Bug Fixes (Full Tester Round — Feb 11+)

| # | Area | What Was Fixed | How to Test | Reported By | Validated By |
|---|------|---------------|-------------|-------------|--------------|
| B4 | Badges | Badge template delete shows clear error | Try deleting a template assigned to events — should show friendly error explaining it's in use | Jewell | Not tested |
| B6 | Signatures | Signature save during workflow fixed | Run check-in workflow with signature step — signature should save successfully | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| B7 | Integrations | Account code auto-used for Basic Auth | Set account code in Settings, open Integration auth — should show account code read-only | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| B8 | Notifications | VIP alert 403 error fixed | Create a VIP notification rule as admin or manager — should save without 403 | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| B10 | Events | Attendee count updates after sync | Run an integration sync — attendee count on event card should update immediately | Jewell | :bell: Awaiting UAT — Re-fixed Feb 20 |
| B11 | Badges | Badge template save error details shown | Trigger a validation error saving a template — should show specific field-level error | Jewell | :bell: Awaiting UAT — Re-fixed Feb 20 |
| B12 | Overview | Badge printed count updates correctly | Print a badge — overview page count should increment | Jewell | :bell: Awaiting UAT — Re-fixed Feb 20 |
| B14 | Settings | Event delete button now works | Delete an event (as admin) — should succeed or show clear error if foreign keys exist | Jewell | :white_check_mark: UAT Verified (Feb 20) |
| B15 | Users | Self-profile editing now works | Edit your own user profile (name, phone, email) — should save; role/customer fields should remain locked | Jewell | :white_check_mark: Partial — name/phone save, email stays locked (may be intentional) |
| B18 | Reports | Signatures render as images in reports | Open event report — signature column should show actual signature images, not base64 text | Marina | :white_check_mark: UAT Verified (Feb 20) |
| B19 | Reports | Export timestamps use event timezone | Export CSV or Excel — check-in times and signature times should match the event's timezone | Marina | :bell: Awaiting UAT — Re-fixed Feb 20 |
| B21 | Badges | Badge edit/delete works after save | Save a badge template, then edit or delete it — should work without errors | Marina | :warning: Partial — Templates OK, but badge on event cannot delete |
| B26 | Printing | Mobile print footer CSS improved | Print a badge on mobile — page margins should be minimized (note: browser headers are OS-controlled) | Dan | Not tested |

---

## Security Fixes

| # | Area | What Was Fixed | How to Test | Validated By |
|---|------|---------------|-------------|--------------|
| B28 | XSS | HTML/script injection blocked | Enter `<script>alert(1)</script>` as an attendee name — should display as plain text, not execute | :white_check_mark: UAT Verified (Feb 20) |
| B29 | Printing | "Print Badge" from menu now works | Click "Print Badge" from attendee row menu — should show "Preparing badge..." toast and open print dialog | :white_check_mark: UAT Verified (Feb 20) |
| B30 | Check-in | Search no longer auto-checks-in | Search in admin Check-in tab — should always show results list with explicit "Check In" button | :white_check_mark: UAT Verified (Feb 20) |
| B32 | Printing | Badge Printing page shows events | Open Badge Printing page — should list events (not "No events found") | Not tested |
| B33 | Events | Create event validates empty dates | Try creating an event without a date — should show validation error, dialog stays open | :white_check_mark: UAT Verified (Feb 20) |

---

## New Export Feature

| # | Area | What's New | How to Test | Validated By |
|---|------|-----------|-------------|--------------|
| NEW | Reports | Excel (XLSX) export with embedded signatures | Open event report, check "Include signatures," click Excel button — download should contain signature images in cells | :white_check_mark: UAT Verified (Feb 20) |
| NEW | Reports | CSV and Excel timestamps localized | Export either format — all date/time columns should reflect the event's timezone | :bell: Awaiting UAT — Re-fixed Feb 20 |

### Net New Suggestion Fixes (Feb 20)

| # | Area | What Changed | How to Test | Status |
|---|------|-------------|-------------|--------|
| S7 | Overview | Removed redundant Quick Actions card | Open event overview — no Quick Actions card; use tabs or sidebar instead | :bell: Awaiting UAT |
| S9 | Staff Access | Access Window labels clarified | Open Event Settings → Staff Access — labels show "Access Window Start/End" with date+time picker | :bell: Awaiting UAT |
| S14 | Navigation | Custom Fonts moved to left nav | Open account dashboard — Custom Fonts in left nav, no longer a card on dashboard | :bell: Awaiting UAT |
| S15 | Navigation | Integrations card removed from dashboard | Open account dashboard — Integrations only in left nav, not duplicated as a card | :bell: Awaiting UAT |
| S21 | Workflow | Validation errors near action button | In workflow, click Next without completing step — error appears directly above buttons | :bell: Awaiting UAT |
| S22 | Workflow | Disclaimer checkbox validation styling | In workflow disclaimer, click Next without checking box — red border + inline error on checkbox | :bell: Awaiting UAT |
| S24 | Attendee Edit | Attendee type shows event types | Open edit dialog for an attendee — Attendee Type dropdown shows types from this event | :bell: Awaiting UAT |
| S26 | Navigation | Fixed dual nav highlight | Navigate to sub-pages — only the correct nav item highlights, not Dashboard | :bell: Awaiting UAT |
| S28 | Breadcrumb | Home icon navigates properly | Click home icon in breadcrumbs from any page — returns to main dashboard | :bell: Awaiting UAT |
| S31 | User Menu | Name click shows dropdown | Click your name in sidebar footer — dropdown menu with profile info and Sign Out | :bell: Awaiting UAT |

---

---

## Beta Feedback (March 24, 2026)

| # | Area | Issue | How to Test | Status |
|---|------|-------|-------------|--------|
| D1 | Attendee List | No registration status filter — cancelled/test attendees clutter the list | Open attendee list — should be able to filter by registration status (Registered, Cancelled, etc.) | 🔔 Fixed — Pending UAT |
| D2 | Staff Settings | Access Window timezone unclear | Open Staff Access settings — timezone should be indicated on Access Window Start/End fields | 📋 Planned |
| D3 | Integration Sync | New sessions not appearing after "Initiate sync" | Add a session in the external platform, click Initiate Sync — session should appear within seconds | ✅ Resolved — Config issue, tested and confirmed |
| D4 | Check-in Workflow | Unclear when Disclaimer displays (event only vs also session check-in) | Check in to event, then to a session — verify when disclaimer appears | 📋 Planned |
| D5 | Kiosk Mode | "Security Error" when launching kiosk from admin login; staff kiosk works | Log in as admin, launch kiosk mode — should launch without security error | 🔔 Fixed — Pending UAT |
| D6 | Kiosk / Offline | Must click "Refresh Cache" every kiosk launch? | Launch kiosk mode — attendee data should auto-cache on launch without manual click; verify cache indicator shows ready | 🔔 Fixed — Pending UAT |
| D7 | QR Scan | Badge QR code returns "QR code not recognized" | Scan an attendee's printed badge QR code — should identify the attendee. Test with: Checkmate badge, external system badge, Certain QR code | 🔔 Fixed — Pending UAT |
| D8 | Check-in Workflow | Revert check-in now clears all workflow data (signature, questions, disclaimer, badge printed) | Revert a check-in, then re-check-in — all workflow steps should appear fresh, not pre-filled | 🔔 Fixed — Pending UAT |
| D9 | Badge Printing | No way to disable print step when pre-printing badges | Configure event for pre-printed badges — print step should be skippable or disableable | 📋 Planned |
| D10 | Attendee Data | Registration disappeared after making Checkmate settings changes | Register for event, modify settings — registration should persist in attendee list and review queue | ✅ Not a bug — User error |

---

**Total items: 81** | **Verified: 35** | **Fixed — Pending UAT: 20** | **Failed: 5** | **Partial/Recheck: 3** | **Not tested: 9** | **N/A: 2** | **Planned: 5**

_Last updated: April 6, 2026 — D6 (kiosk auto-cache on launch) fixed; added "Fixed — Pending UAT" status; updated D1, D5, D6, D7, D8 from beta feedback as fixed and awaiting tester validation._
