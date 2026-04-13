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
PrintNode Integrator accounts can create isolated "child accounts" via API. Each child account has its own printers, computers, and print jobs — completely invisible to other children. The parent (Checkmate) controls everything through a single master API key plus a header that scopes each request to the correct child.

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
- Clean mapping via `creatorRef` using existing Checkmate customer IDs

#### Affected Files
- `server/services/printnode.ts`
- `server/routes.ts` (PrintNode endpoints)
- `shared/schema.ts` (customers table additions)
- Account settings UI (new PrintNode setup section)

#### Status: Planned — Required before GA

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| Mar 2026 | 1.3 | Added Phase 6: PrintNode multi-tenant Integrator child accounts (pre-GA requirement) |
| Mar 2026 | 1.2 | Converted 23 TODO comments to PLANNED with roadmap references; added Phases 3–5 |
| Dec 2025 | 1.0 | Initial release with Certain integration, sequential sync, session registrations |
