# Route Security Matrix

Last Updated: 2026-03-04

This document catalogs every API route, its authentication/authorization requirements, and the rationale for each decision. All routes use Express middleware applied at the route level.

## Middleware Reference

| Middleware | Effect |
|---|---|
| `authMiddleware` | Global (app.use). Identifies logged-in users and populates `req.dbUser`. Does **not** block unauthenticated requests. |
| `requireAuth` | Blocks request with 401 if `req.dbUser` is not set (user not logged in). |
| `requireRole(roles)` | Blocks request with 403 if user's role is not in the allowed list. Implies `requireAuth`. |
| `staffAuth` | Validates staff Bearer token from temporary staff login. Used for `/api/staff/*` endpoints. |

## Role Hierarchy

| Role | Level | Access Scope |
|---|---|---|
| `super_admin` | Highest | All customers, all data, platform settings |
| `admin` | High | Own customer account, full configuration |
| `manager` | Medium | Own customer, event management, staff management |
| `staff` | Low | Operational access only (check-in, badge printing) |

---

## Route Groups

### 1. Authentication Routes (PUBLIC - No Auth Required)

These routes must remain public because they are used before a user has authenticated.

| Method | Route | Auth | Rationale |
|---|---|---|---|
| GET | `/api/auth/me` | None | Returns current user info or 401; used to check login status |
| POST | `/api/auth/login` | None | Email/password login endpoint |
| POST | `/api/auth/request-otp` | None | Request SMS/email OTP for login |
| POST | `/api/auth/verify-otp` | None | Verify OTP code to complete login |
| POST | `/api/auth/logout` | None | Destroy session |
| POST | `/api/auth/set-password-token` | None | Generate password setup token (invite flow) |
| GET | `/api/setup-password` | None | Render password setup page (invite flow) |
| GET | `/api/auth/verify-token/:token` | None | Verify invite/reset token validity |
| POST | `/api/auth/forgot-password` | None | Initiate password reset |
| POST | `/api/auth/reset-password` | None | Complete password reset with token |
| GET | `/api/integrations/oauth/callback` | None | External OAuth2 provider redirect target |
| POST | `/api/staff/events/:eventId/login` | None | Temporary staff PIN/code login |
| GET | `/api/staff/events/:eventId/status` | None | Check if temp staff access is available (pre-login) |
| GET | `/api/settings/login-background` | None | Serve login page background image |

### 2. Error Logging (PUBLIC - Limited Access)

| Method | Route | Auth | Rationale |
|---|---|---|---|
| POST | `/api/errors/log` | None | Client-side error reporting. Accepts arbitrary error data. Rate limiting recommended as future improvement. |

### 3. Events Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events` | `requireAuth` | All authenticated | List events for a customer |
| GET | `/api/events/all` | `requireAuth` | All authenticated | List all events (kiosk mode) |
| GET | `/api/events/:id/scoped` | `requireAuth` | All authenticated | Get event with customer verification |
| GET | `/api/events/:id` | `requireAuth` | All authenticated | Get single event |
| POST | `/api/events` | `requireAuth` | super_admin, admin, manager | Create event |
| PATCH | `/api/events/:id` | `requireAuth` | super_admin, admin, manager | Update event |
| DELETE | `/api/events/:id` | `requireAuth` | super_admin, admin, manager | Delete event (already had auth) |

### 4. Badge Templates Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/badge-templates` | `requireAuth` | All authenticated | List templates for customer |
| GET | `/api/badge-templates/:id` | `requireAuth` | All authenticated | Get single template |
| POST | `/api/badge-templates` | `requireAuth` | super_admin, admin, manager | Create template |
| PATCH | `/api/badge-templates/:id` | `requireAuth` | super_admin, admin, manager | Update template |
| DELETE | `/api/badge-templates/:id` | `requireAuth` | super_admin, admin, manager | Delete template |
| GET | `/api/events/:eventId/badge-templates` | `requireAuth` | All authenticated | Already had auth |

### 5. Badge Template Overrides Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/badge-template-overrides` | `requireAuth` | All authenticated | List overrides |
| GET | `/api/events/:eventId/badge-template-overrides/by-type/:participantType` | `requireAuth` | All authenticated | Get override by type |
| POST | `/api/events/:eventId/badge-template-overrides` | `requireAuth` | super_admin, admin, manager | Create override |
| PATCH | `/api/events/:eventId/badge-template-overrides/:id` | `requireAuth` | super_admin, admin, manager | Update override |
| DELETE | `/api/events/:eventId/badge-template-overrides/:id` | `requireAuth` | super_admin, admin, manager | Delete override |

### 6. Template Resolution Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/attendees/:attendeeId/resolve-template` | `requireAuth` | All authenticated | Resolve template for attendee |
| GET | `/api/events/:eventId/resolve-template/:participantType` | `requireAuth` | All authenticated | Resolve template for type |
| GET | `/api/events/:eventId/template-mappings` | `requireAuth` | All authenticated | View all template mappings |
| GET | `/api/events/:eventId/participant-types` | `requireAuth` | All authenticated | List distinct participant types |

### 7. Customer Integrations Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/integrations` | `requireAuth` | All authenticated | List integrations |
| GET | `/api/integrations/:id` | `requireAuth` | All authenticated | Get integration details |
| POST | `/api/integrations` | `requireAuth` | super_admin, admin, manager | Create integration |
| PATCH | `/api/integrations/:id` | `requireAuth` | super_admin, admin, manager | Update integration |
| DELETE | `/api/integrations/:id` | `requireAuth` | super_admin, admin, manager | Delete integration |
| POST | `/api/integrations/:id/duplicate` | `requireAuth` | super_admin, admin, manager | Duplicate integration |
| GET | `/api/integrations/:id/sync-logs` | `requireAuth` | All authenticated | View sync history |

### 8. Event Integrations Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/integrations` | `requireAuth` | All authenticated | List event integrations |
| POST | `/api/events/:eventId/integrations` | `requireAuth` | super_admin, admin, manager | Link integration to event |
| PATCH | `/api/events/:eventId/integrations/:id` | `requireAuth` | super_admin, admin, manager | Update event integration |
| DELETE | `/api/events/:eventId/integrations/:id` | `requireAuth` | super_admin, admin, manager | Remove event integration |

### 9. Integration Providers & Catalog Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/integration-providers` | `requireAuth` | All authenticated | List available providers |
| GET | `/api/integration-providers/:id` | `requireAuth` | All authenticated | Get provider details |
| GET | `/api/provider-catalog` | `requireAuth` | All authenticated | Get provider specs |
| GET | `/api/provider-catalog/:providerId` | `requireAuth` | All authenticated | Get single provider spec |

### 10. Endpoint Configuration Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/integrations/:integrationId/endpoints` | `requireAuth` | All authenticated | List endpoint configs |
| GET | `/api/integrations/:integrationId/endpoints/:dataType` | `requireAuth` | All authenticated | Get endpoint config |
| POST | `/api/integrations/:integrationId/endpoints` | `requireAuth` | super_admin, admin, manager | Create endpoint config |
| PATCH | `/api/integrations/:integrationId/endpoints/:configId` | `requireAuth` | super_admin, admin, manager | Update endpoint config |
| DELETE | `/api/integrations/:integrationId/endpoints/:configId` | `requireAuth` | super_admin, admin, manager | Delete endpoint config |

### 11. Event Code Mapping Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/integrations/:integrationId/event-mappings` | `requireAuth` | All authenticated | List event mappings |
| POST | `/api/integrations/:integrationId/event-mappings` | `requireAuth` | super_admin, admin, manager | Create event mapping |
| PATCH | `/api/integrations/:integrationId/event-mappings/:mappingId` | `requireAuth` | super_admin, admin, manager | Update event mapping |
| DELETE | `/api/integrations/:integrationId/event-mappings/:mappingId` | `requireAuth` | super_admin, admin, manager | Delete event mapping |

### 12. Session Code Mapping Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/event-mappings/:eventMappingId/session-mappings` | `requireAuth` | All authenticated | List session mappings |
| POST | `/api/event-mappings/:eventMappingId/session-mappings` | `requireAuth` | super_admin, admin, manager | Create session mapping |
| PATCH | `/api/session-mappings/:mappingId` | `requireAuth` | super_admin, admin, manager | Update session mapping |
| DELETE | `/api/session-mappings/:mappingId` | `requireAuth` | super_admin, admin, manager | Delete session mapping |

### 13. Integration Connection Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/integrations/:integrationId/connection` | `requireAuth` | All authenticated | Check connection status |
| POST | `/api/integrations/:integrationId/oauth/start` | `requireAuth` | super_admin, admin, manager | Start OAuth2 flow |
| POST | `/api/integrations/:integrationId/credentials` | `requireAuth` | super_admin, admin, manager | Store API credentials |
| POST | `/api/integrations/:integrationId/disconnect` | `requireAuth` | super_admin, admin, manager | Disconnect integration |
| POST | `/api/integrations/:integrationId/validate` | `requireAuth` | super_admin, admin, manager | Validate connection |
| POST | `/api/integrations/:integrationId/test-connection` | `requireAuth` | super_admin, admin, manager | Test API connection |
| POST | `/api/integrations/:integrationId/discover-events` | `requireAuth` | super_admin, admin, manager | Discover external events |
| POST | `/api/integrations/:integrationId/initial-sync` | `requireAuth` | super_admin, admin, manager | Run initial data sync |
| POST | `/api/integrations/:integrationId/refresh-token` | `requireAuth` | super_admin, admin, manager | Refresh OAuth2 token |

### 14. Sync Operations Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/sync-states` | `requireAuth` | All authenticated | View sync state |
| POST | `/api/events/:eventId/sync-states/initialize` | `requireAuth` | super_admin, admin, manager | Initialize sync states |
| PATCH | `/api/events/:eventId/sync-states/:dataType` | `requireAuth` | super_admin, admin, manager | Update sync state |
| POST | `/api/events/:eventId/sync/:dataType` | `requireAuth` | super_admin, admin, manager | Trigger manual sync |
| PATCH | `/api/integrations/:integrationId/sync-templates` | `requireAuth` | super_admin, admin, manager | Update sync templates |
| PATCH | `/api/integrations/:integrationId/default-sync-settings` | `requireAuth` | super_admin, admin, manager | Update default sync settings |
| POST | `/api/integrations/:integrationId/sync/attendees/outbound` | `requireAuth` + `requireRole` | super_admin, admin, manager | Push locally-created attendees (walk-ins, manual adds) to external platform. Validates integration + event belong to user's customer. Uses reverse field mappings. Updates `externalId` on success. |

### 15. Attendee Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/attendees` | `requireAuth` | All authenticated | List attendees |
| GET | `/api/attendees/:id` | `requireAuth` | All authenticated | Get single attendee |
| POST | `/api/attendees` | `requireAuth` | All authenticated | Create attendee (staff can add walk-ins) |
| PATCH | `/api/attendees/:id` | `requireAuth` | All authenticated | Update attendee (staff can edit during check-in) |
| DELETE | `/api/attendees/:id` | `requireAuth` | super_admin, admin, manager | Delete attendee |
| POST | `/api/attendees/:id/checkin` | `requireAuth` | All authenticated | Check in attendee (staff operation) |
| DELETE | `/api/attendees/:id/checkin` | `requireAuth` | All authenticated | Revert check-in |

### 16. Event Metadata Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/participant-types` | `requireAuth` | All authenticated | List participant types (filter dropdown) |
| GET | `/api/events/:eventId/companies` | `requireAuth` | All authenticated | List companies (filter dropdown) |

### 17. Printer Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/printers` | `requireAuth` | All authenticated | List printers |
| GET | `/api/printers/:id` | `requireAuth` | All authenticated | Get printer details |
| POST | `/api/printers` | `requireAuth` | All authenticated | Already had auth |
| PATCH | `/api/printers/:id` | `requireAuth` | All authenticated | Already had auth |
| DELETE | `/api/printers/:id` | `requireAuth` | All authenticated | Already had auth |

### 18. Session Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/events/:eventId/sessions` | `requireAuth` | All authenticated | List sessions |
| GET | `/api/sessions/:id` | `requireAuth` | All authenticated | Get single session |
| POST | `/api/events/:eventId/sessions` | `requireAuth` | super_admin, admin, manager | Create session |
| PATCH | `/api/sessions/:id` | `requireAuth` | super_admin, admin, manager | Update session |
| DELETE | `/api/sessions/:id` | `requireAuth` | super_admin, admin, manager | Delete session |

### 19. Session Registration Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/sessions/:sessionId/registrations` | `requireAuth` | All authenticated | List registrations |
| GET | `/api/sessions/:sessionId/registrations/:attendeeId` | `requireAuth` | All authenticated | Get registration status |
| POST | `/api/sessions/:sessionId/register` | `requireAuth` | All authenticated | Register attendee |
| DELETE | `/api/sessions/:sessionId/registrations/:attendeeId` | `requireAuth` | All authenticated | Cancel registration |
| GET | `/api/sessions/:sessionId/checkins` | `requireAuth` | All authenticated | List session check-ins |
| POST | `/api/sessions/:sessionId/checkin` | `requireAuth` | All authenticated | Check in to session |
| POST | `/api/sessions/:sessionId/checkout` | `requireAuth` | All authenticated | Check out of session |
| GET | `/api/sessions/:sessionId/status/:attendeeId` | `requireAuth` | All authenticated | Get attendee session status |

### 20. Font Management Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/customers/:customerId/fonts` | `requireAuth` | All authenticated | List custom fonts |
| GET | `/api/fonts/:fontId` | `requireAuth` | All authenticated | Get font details |
| POST | `/api/customers/:customerId/fonts` | `requireAuth` | super_admin, admin, manager | Upload custom font |
| PATCH | `/api/fonts/:fontId` | `requireAuth` | super_admin, admin, manager | Update font metadata |
| DELETE | `/api/fonts/:fontId` | `requireAuth` | super_admin, admin, manager | Delete font |
| GET | `/api/customers/:customerId/fonts/available` | `requireAuth` | All authenticated | List all available fonts |

### 21. File Upload Routes

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| POST | `/api/uploads/request-url` | `requireAuth` | All authenticated | Request presigned upload URL. Server-side validation: image types only, 5MB max. |

### 22. Badge AI Assistant Routes

All routes protected by `requireAuth` applied at the router level.

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| POST | `/api/badge-ai/chat` | `requireAuth` | All authenticated | AI badge assistance chat |
| POST | `/api/badge-ai/troubleshoot` | `requireAuth` | All authenticated | AI print troubleshooting |
| GET | `/api/badge-ai/suggestions/:eventId` | `requireAuth` | All authenticated | AI template suggestions |

### 23. Report Routes

All routes in `server/routes/reports.ts` — already had `requireAuth` before this audit.

| Method | Route | Auth | Roles | Rationale |
|---|---|---|---|---|
| GET | `/api/reports/events/:eventId` | `requireAuth` | All authenticated | Event report |
| GET | `/api/reports/events/:eventId/sessions/:sessionId` | `requireAuth` | All authenticated | Session report |
| GET | `/api/reports/sessions/:sessionId` | `requireAuth` | All authenticated | Standalone session report |
| GET | `/api/reports/events/:eventId/export` | `requireAuth` | All authenticated | Export event data |
| GET | `/api/reports/sessions/:sessionId/time-tracking` | `requireAuth` | All authenticated | Session time tracking |

### 24. Health Check Routes (PUBLIC)

These are infrastructure endpoints. No auth required.

| Method | Route | Auth | Rationale |
|---|---|---|---|
| GET | `/health` | None | Application health check |
| GET | `/ready` | None | Readiness probe (DB connectivity) |
| GET | `/live` | None | Liveness probe |

### 25. Staff Operational Routes (staffAuth)

These routes use Bearer token authentication from the temporary staff login flow.

| Method | Route | Auth | Rationale |
|---|---|---|---|
| GET | `/api/staff/session` | `staffAuth` | Get current staff session info (event, customer, settings incl. `allowWalkins`) |
| POST | `/api/staff/logout` | `staffAuth` | End staff session |
| GET | `/api/staff/attendees` | `staffAuth` | Search attendees for check-in |
| POST | `/api/staff/attendees` | `staffAuth` | Create walk-in attendee. Requires `allowWalkins` enabled in event `tempStaffSettings`. Logs `add_walkin` activity. |
| PATCH | `/api/staff/attendees/:attendeeId` | `staffAuth` | Update attendee details (firstName, lastName, company, title). Validates attendee belongs to event. |
| POST | `/api/staff/checkin` | `staffAuth` | Check in attendee (body: `{ attendeeId }`) |
| POST | `/api/staff/revert-checkin` | `staffAuth` | Revert attendee check-in (body: `{ attendeeId }`) |
| POST | `/api/staff/badge-printed` | `staffAuth` | Mark badge as printed for attendee |
| GET | `/api/staff/attendees/:attendeeId/resolve-template` | `staffAuth` | Resolve badge template for attendee |
| GET | `/api/staff/badge-templates` | `staffAuth` | List badge templates available for the event |
| GET | `/api/staff/workflow` | `staffAuth` | Get check-in workflow config |
| POST | `/api/staff/attendees/:attendeeId/workflow-responses` | `staffAuth` | Submit workflow responses |
| GET | `/api/staff/attendees/:attendeeId/signatures` | `staffAuth` | Get attendee signatures |
| POST | `/api/staff/attendees/:attendeeId/signatures` | `staffAuth` | Submit attendee signature |
| GET | `/api/staff/printers` | `staffAuth` | List configured printers for the event |
| GET | `/api/staff/printnode/printers` | `staffAuth` | List PrintNode cloud printers |
| GET | `/api/staff/printnode/status` | `staffAuth` | Check PrintNode connection status |
| POST | `/api/staff/printnode/print` | `staffAuth` | Send print job to PrintNode |
| POST | `/api/staff/printnode/test-print` | `staffAuth` | Send test print to PrintNode |
| POST | `/api/staff/network-print` | `staffAuth` | Send print job to network printer |
| POST | `/api/staff/test-printer` | `staffAuth` | Send test print to network printer |
| GET | `/api/staff/sessions` | `staffAuth` | List event sessions (if session tracking enabled) |
| GET | `/api/staff/sessions/:sessionId/registrations` | `staffAuth` | List session registrations |
| POST | `/api/staff/sessions/:sessionId/checkin` | `staffAuth` | Check in attendee to session |
| POST | `/api/staff/sessions/:sessionId/checkout` | `staffAuth` | Check out attendee from session |

---

## Summary Statistics

| Category | Count |
|---|---|
| Total API routes | ~255 |
| Protected with `requireAuth` | ~230 |
| Protected with `requireRole` | ~76 (configuration/mutation routes) |
| Protected with `staffAuth` | ~25 |
| Intentionally public | 17 (auth, OAuth callback, staff pre-login, login background, health checks) |
| Semi-public (rate limit recommended) | 1 (error logging) |

## UX Impact Assessment

| User Type | Impact | Details |
|---|---|---|
| **Super Admins** | None | Already authenticated via session. No new login steps. |
| **Admins** | None | Already authenticated via session. No new login steps. |
| **Managers** | None | Already authenticated via session. No new login steps. |
| **Staff** | None | Already authenticated via staff login (Bearer token) or session. |
| **Kiosk/Self-Service** | None | Kiosk devices authenticate as staff. Bearer token covers all operations. |
| **Attendees** | None | Never call API directly; interact through authenticated kiosk/staff UI. |
