# CheckinKit Integration Roadmap

## Completed Features

### Phase 1: Core Platform Integration (Completed - December 2025)

#### Multi-Tenant Architecture
- Row-level tenant isolation via customer_id foreign keys
- Role hierarchy: Super Admin → Customer Accounts → Admins → Managers → Staff
- Cascade deletes for complete tenant data removal

#### External Platform Integration (Certain)
- OAuth2 and Basic Auth credential management
- Test-before-connect workflow for credential validation
- Secure credential storage with AES-256-GCM encryption
- Support for multiple authentication types per platform

#### Automated Event Discovery
- Event sync from external platforms via configurable endpoints
- Account code and event code extraction for API routing
- Event upsert based on external ID matching
- Active event filtering from source platforms

#### Sequential Sync Orchestration
- Four-step sync pipeline: Events → Attendees → Sessions → Session Registrations
- Configurable delays between sync steps (default 3 seconds)
- Per-attendee endpoint iteration when {{attendeeExternalId}} template detected
- Robust error handling with per-step error tracking

#### Attendee Sync
- Full attendee data synchronization from external platforms
- Nested profile structure handling (Certain API format)
- External ID-based upsert for deduplication
- Email, name, organization, and registration type mapping

#### Sessions Sync
- Session data synchronization with full metadata
- Date parsing for platform-specific formats (MM/DD/YYYY HH:MM:SS)
- HTML entity decoding for session titles and descriptions
- Track name, color, venue, and type preservation
- External ID (instanceId) based upsert

#### Session Registrations Sync
- Nested sessions array handling (Certain format)
- Links attendees to sessions via external IDs
- Registration status tracking (Registered, Waitlisted)
- Bidirectional lookup: attendee by registrationCode, session by instanceId

### Database Schema
- Events table with accountCode and eventCode fields
- Attendees table with externalId for sync matching
- Sessions table with externalId, sessionCode, venue, track metadata
- Session registrations table linking sessions to attendees

---

## Future Roadmap

### Phase 2: Signal Integration for Smart Event Filtering

#### Overview
Integrate with Signal service to intelligently filter which events should be synced based on tagging rules, reducing noise and ensuring only check-in relevant events are processed.

#### Planned Workflow
1. Initial event GET response is sent to Signal service
2. Signal filters the event list based on the `check_in` tag variable
3. Signal returns filtered response to CheckinKit
4. CheckinKit uses the filtered response to upsert events in Step 1 of the sync pipeline

#### Benefits
- Reduces sync overhead by filtering irrelevant events at source
- Centralized tagging rules managed by Signal
- Cleaner event list focused on check-in operations
- Decoupled filtering logic from core sync orchestration

#### Status: Planned (Not Yet Designed)

---

### Phase 3: Webhook Event Processing

#### Overview
Complete the inbound webhook pipeline so external platforms can push real-time event, attendee, and order changes into CheckinKit instead of relying solely on polling-based sync.

#### Planned Work
- **Webhook configuration from database** — Load webhook secrets, signature headers, and active flags from the database instead of hard-coded config (`webhooks.ts`)
- **Credential manager integration** — Retrieve webhook signing secrets via the encrypted credential manager rather than environment variables
- **Webhook metadata tracking** — Record `lastTriggeredAt` and `totalReceived` counters on each webhook config after processing
- **Order handlers** — `order.placed`: trigger a sync job to fetch attendee data; `order.updated`: update existing attendee records
- **Attendee handlers** — `attendee.created`: insert new attendee record; `attendee.updated`: update existing attendee record
- **Event handlers** — `event.created`: auto-create event code mapping; `event.updated`: update event details
- **Sync orchestrator attendee storage** — Wire up `storeAttendee()` in the sync orchestrator to persist transformed attendees to the database (`sync-orchestrator.ts`)

#### Affected Files
- `server/routes/webhooks.ts` (8 items)
- `server/services/sync-orchestrator.ts` (1 item)

#### Status: Planned

---

### Phase 4: OAuth Token Lifecycle Management

#### Overview
Implement proactive OAuth2 token refresh so long-running integrations don't silently fail when access tokens expire.

#### Planned Work
- **Expiring token query** — Query the database for tokens expiring within the proactive refresh threshold instead of returning empty results (`token-refresh-worker.ts`)
- **OAuth2 config from database** — Load client ID, client secret, and token URL from the integration's stored credentials instead of placeholder values
- **Token metadata persistence** — Write refreshed token metadata (new access token, expiry, refresh token) back to the database after a successful refresh
- **Retry logic persistence** — Record retry attempts and next-retry timestamps in the database for failed refreshes with exponential backoff

#### Affected Files
- `server/workers/token-refresh-worker.ts` (4 items)

#### Status: Planned

---

### Phase 5: Notification Service

#### Overview
Complete the notification service so check-in events can trigger outbound webhooks, SMS messages, and emails with full audit logging.

#### Planned Work
- **Event date enrichment** — Populate event date from the events table in notification payloads instead of `undefined`
- **Credential manager for webhook secrets** — Retrieve webhook signing secrets via the encrypted credential manager
- **Notification audit logging** — Log all webhook, SMS, and email send outcomes (success/failure) to the `notification_logs` table for each delivery attempt
- **Email sending integration** — Connect to SendGrid or Resend to actually deliver email notifications (currently stubbed)
- **Notification configuration from database** — Query active notification configurations per event and customer from the database instead of mock data

#### Affected Files
- `server/services/notification-service.ts` (10 items)

#### Status: Planned

---

### Phase 6: PrintNode Multi-Tenant (Integrator Child Accounts)

#### Overview
Replace the single shared PrintNode API key with PrintNode's Integrator Account model so each customer gets their own isolated PrintNode child account. This eliminates credential sharing, enables self-service printer setup for customers, and scales to any number of accounts.

#### How It Works
PrintNode Integrator accounts can create isolated "child accounts" via API. Each child account has its own printers, computers, and print jobs — completely invisible to other children. The parent (Greet) controls everything through a single master API key plus a header that scopes each request to the correct child.

#### Planned Work
- **Integrator account upgrade** — Upgrade the existing PrintNode account to an Integrator plan ($60/month standard or $500/month large)
- **Automated child account provisioning** — When an account admin enables PrintNode in their settings, the app creates a PrintNode child account via `POST /account` using the customer's internal ID as `creatorRef`
- **Credential delivery** — After child account creation, display the PrintNode client download link and the customer's child account credentials so they can install the client on their machines
- **Scoped API calls** — Update `server/services/printnode.ts` to include `X-Child-Account-By-CreatorRef: {customerId}` on all PrintNode API calls, scoping printers and print jobs to the correct customer
- **Child account lifecycle** — Handle account deletion when a customer is removed or disables PrintNode; handle credential regeneration if needed
- **Schema updates** — Add `printNodeChildAccountId` and `printNodeEnabled` fields to the customers table to track provisioning status
- **Admin UI** — Add a PrintNode setup section in account settings showing: enable/disable toggle, child account status, client download link, and credentials display (shown once at creation)
- **Testing** — End-to-end test with physical printers: create child account, install PrintNode client with child credentials, verify printers appear scoped to that customer, submit print job, verify isolation between two customer accounts

#### Key Benefits
- Customers never see the master API key
- Each customer's printers are fully isolated
- Self-service setup: customer installs PrintNode client with their own credentials
- Scales to unlimited customers without credential management overhead
- Clean mapping via `creatorRef` using existing Greet customer IDs

#### Affected Files
- `server/services/printnode.ts`
- `server/routes.ts` (PrintNode endpoints)
- `shared/schema.ts` (customers table additions)
- Account settings UI (new PrintNode setup section)

#### Status: Planned — Required before GA

---

### Phase 7: Trend-Based Usage Forecasting & Upsell Alerts

#### Overview
Today's usage alerts only react to fixed % thresholds (75 / 90 / 100 / 110) of the prepaid attendee limit. They tell us where an account is *right now*, but they don't see the train coming. This phase adds forward-looking, contract-aware forecasting so the team gets a Slack ping the moment an account's burn rate suggests they'll exceed their plan **before** the contract end date — giving us weeks (not days) of upsell runway.

#### Current State (for reference)
- Daily worker `runDailyUsageCheck` runs once per day, snapshots usage, fires Slack alerts at fixed thresholds
- Snapshots stored in `attendee_usage_snapshots` (full daily history per account, already in place)
- Alerts stored in `usage_alerts` (one-shot per threshold per account, never re-fires)
- Slack channel: configured via `SLACK_USAGE_WEBHOOK_URL` env secret
- No contract-end awareness, no burn-rate calculation, no email fallback

#### Planned Work

**1. Burn-rate calculation**
- New helper `calculateBurnRate(customerId, windowDays = 14)` in `usage-tracking.ts`
- Reads from `attendee_usage_snapshots`, computes average new attendees per day across the window
- Returns `null` if fewer than 3 snapshots exist (not enough signal yet)

**2. Projected-overage detection**
- New function `checkProjectedOverage(customerId)` runs in the daily worker after the existing threshold check
- Formula: `currentTotal + (burnRate × daysUntilContractEnd) = projectedEndOfContractTotal`
- Skip projection if no `licenseEndDate`, no `prepaidAttendees`, or burn rate is null
- Trigger condition: projected total > prepaid limit AND days remaining ≥ 7 (no point alerting in the final week — they're already in upsell territory)
- Cooldown: re-evaluate weekly per account (don't spam daily on the same projection)

**3. New alert type — `projected_overage`**
- Add `projected_overage` to the alert-type enum in `usage_alerts` table (text column today, no schema change needed)
- Slack message format:
  > 📊 *Projected Overage* — {customerName} is at {currentTotal}/{limit} attendees today, burning ~{rate}/day. At this pace they'll hit {projectedTotal} by contract end ({endDate}) — projected **{overagePct}% over** their {planName} plan. Recommend upsell to {nextTier}.
- Includes account ID and a deep link to `/customers/{id}/license` for one-click drill-down

**4. Acceleration detection (optional, same pass)**
- Compare 7-day burn rate vs 30-day burn rate
- If 7-day is ≥ 2× the 30-day, fire a "📈 *Accelerating*" alert noting that registration just spiked
- Useful for catching mid-contract event launches that change the trajectory

**5. Email fallback**
- When a usage alert fires, also email the customer's `contactEmail` (the AM/CSM contact stored on the customers table)
- Uses existing Resend integration in `email-service.ts`
- Per-customer toggle `usageAlertsEmail` (default ON for premium accounts) — new boolean column on `customers`

**6. Contract-cycle reset**
- When `licenseStartDate` or `licenseEndDate` changes via the License Management PATCH endpoint, archive existing `usage_alerts` rows for that customer (set new column `archivedAt`) so the new contract period starts with a clean slate

**7. Forecast UI on the Usage tab**
- New "Forecast" card on `/customers/:id/license` Usage tab showing:
  - Current burn rate (attendees/day, 14-day window)
  - Projected total at contract end
  - Projected overage date (when they'll hit 100%)
  - Visual: small line chart of last 30 days of snapshots with a dashed projection line extending to `licenseEndDate`
- Color-coded: green (on track), amber (will exceed within 30 days of end), red (will exceed before end)

#### Affected Files
- `server/services/usage-tracking.ts` (burn rate, projection, new alert type, email send)
- `server/services/email-service.ts` (new template `usageAlert`)
- `server/routes.ts` (License PATCH endpoint: archive alerts on contract change; Usage endpoint: include forecast fields in response)
- `shared/schema.ts` (`customers.usageAlertsEmail` boolean; `usage_alerts.archivedAt` timestamp)
- `client/src/pages/LicenseManagement.tsx` (Forecast card on Usage tab)

---

#### 🔧 Dependencies & Setup Required (action items for you before build)

**1. Slack — dedicated alerts channel**
   - Decide on a channel name. Recommendation: `#greet-usage-alerts` (separate from `#greet-feedback` so AMs aren't drowning in feedback noise)
   - In Slack: **Apps → Incoming Webhooks → Add to Workspace → pick the channel → copy the webhook URL** (looks like `https://hooks.slack.com/services/T.../B.../xxx`)
   - Provide that webhook URL — it gets stored as the env secret **`SLACK_USAGE_WEBHOOK_URL`** (this secret name already exists in code; just needs a value)
   - Optional: provide the Slack channel ID (e.g. `C0123ABCDEF`) if you want clickable Slack permalinks in summaries — find it via Slack → right-click channel → View channel details → bottom of the About tab

**2. Email sender identity (already in place if Resend is configured)**
   - Confirm the "from" address you want usage alerts to come from (e.g. `usage-alerts@certain.com` or reuse the existing Greet system address)
   - Confirm a default reply-to address (probably your CS team distribution list)
   - Resend API key is already in env as `RESEND_API_KEY` ✅

**3. Recipient routing**
   - Confirm whether usage alert emails should go to:
     - (a) The customer's `contactEmail` already on the account (recommended — it's the AM/CSM contact)
     - (b) A central CS distribution list (e.g. `customer-success@certain.com`)
     - (c) Both
   - If (b) or (c), provide the distribution list address

**4. Plan-tier upgrade map (for the "Recommend upsell to {nextTier}" message)**
   - Confirm the recommended next-tier mapping. Default proposal:
     - Starter (1K) → Professional (5K)
     - Professional (5K) → Enterprise (20K)
     - Enterprise (20K) → Strategic (45K)
     - Strategic (45K) → "Contact for custom plan"

**5. Forecast tuning knobs (have a quick opinion ready)**
   - Burn rate window: **14 days** (default) — long enough to smooth daily noise, short enough to catch trend changes
   - Minimum days remaining to alert: **7** (don't alert in the last week — they're already over the line)
   - Acceleration threshold: **2×** (7-day rate vs 30-day rate)
   - Re-alert cooldown: **7 days** per account per alert type
   - These are all easily adjustable later — just need defaults to ship

#### Status: Planned — Scoped, awaiting Slack webhook + email recipient decisions before build

#### Estimated Build Time
- ~3–4 hours once dependencies above are provided
- Backend (burn rate, projection, alerts, email): ~2 hours
- Forecast UI card with chart: ~1.5 hours
- Testing with seeded snapshot data: ~30 min

---

### Phase 8: Attendee Change Tracking & Bidirectional Profile Sync

#### Overview
Today, sync is largely one-way: Certain → Greet for profile data, with only walk-in creation and check-in/walk-in status pushed back. When a staff member edits an attendee's name, company, or title from the badge preview or admin screens, the change stays local and Certain never learns about it. This phase closes that gap with full change tracking and real-time bidirectional sync, and extends scheduled syncs to pull in custom profile and registration questions that are tagged for Greet.

#### Planned Work

**1. Attendee change tracking (`updatedAt`)**
- Add `updated_at` timestamp column to the `attendees` table (default `now()`, auto-bumped on every row mutation)
- Update `db-storage.ts` `updateAttendee()` to set `updatedAt = now()` on every write
- Backfill existing rows with `updatedAt = createdAt` via one-time migration
- Surface "Last modified" in admin attendee detail views and the badge preview audit footer
- Optional: add lightweight `attendee_change_log` table capturing who/what/when for compliance and dispute resolution (field name, old value, new value, actor user id, source: `admin` | `badge-preview` | `kiosk` | `staff` | `sync`)

**2. Real-time outbound sync of profile edits to Certain**
- New service method `syncAttendeeUpdateToExternal(attendeeId, changedFields)` in `sync-orchestrator.ts`
- Trigger automatically from every `updateAttendee` call that mutates synced fields (name, company, title, custom fields), but only when the attendee has an `externalId` and the event's integration is configured for outbound sync
- New endpoint config slot `updateAttendee` (PATCH/PUT against `/registration/{externalId}` or equivalent) — discoverable per-integration alongside existing `createAttendee` / `pushAttendees`
- Field mapping reuses the existing inbound mapping in reverse; only changed fields are sent to minimize payload and reduce risk of clobbering Certain-side edits
- Conflict handling: log warnings if Certain returns 4xx; queue retry with exponential backoff; never block the local save
- Respect feature flag `outbound_profile_sync` (account-level, Premium-only)

**3. Tagged custom question ingestion during scheduled syncs**
- Extend Certain attendee sync to include profile and registration question responses tagged with `greet` or `checkmate` (label/tag-based filter applied at API request time when supported, otherwise client-side filter)
- Tag matching is case-insensitive and matches both legacy `checkmate` and new `greet` labels (transition window)
- Map tagged answers into the attendee's `customFields` JSON, keyed by question label (sanitized) — making them immediately available for badge merge fields
- Document the tagging convention in the Certain integration setup guide so event organizers know how to surface fields to Greet
- Optional UI: in event settings, show a "Synced custom fields (from tagged Certain questions)" panel listing detected fields per event after the next sync

#### Affected Files
- `shared/schema.ts` (attendees table: add `updatedAt`; new `attendee_change_log` table)
- `server/db-storage.ts` (updateAttendee + change-log writes)
- `server/services/sync-orchestrator.ts` (outbound update method + tagged question ingestion)
- `server/routes.ts` (wire change tracking into all attendee PATCH paths: admin, staff, badge preview, kiosk)
- `client/src/pages/AttendeeManagement.tsx`, badge preview components (display Last Modified)
- `client/src/pages/EventSettings.tsx` (synced custom fields panel)
- `docs/Certain-Integration-Setup.md` (document tagging convention)

#### Status: Planned — High Priority

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| Apr 2026 | 1.5 | Added Phase 7: Trend-based usage forecasting & upsell alerts (renumbered prior Phase 7 → Phase 8) |
| Apr 2026 | 1.4 | Added Phase 8: Attendee change tracking, real-time outbound profile sync to Certain, tagged custom question ingestion |
| Mar 2026 | 1.3 | Added Phase 6: PrintNode multi-tenant Integrator child accounts (pre-GA requirement) |
| Mar 2026 | 1.2 | Converted 23 TODO comments to PLANNED with roadmap references; added Phases 3–5 |
| Dec 2025 | 1.0 | Initial release with Certain integration, sequential sync, session registrations |
