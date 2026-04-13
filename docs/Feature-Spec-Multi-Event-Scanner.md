# Feature Spec: Multi-Event Scanner (Briefing Center Mode)

## Status: Future Release — Not Yet Scheduled

---

## Problem

In briefing centers running multiple concurrent events, staff currently need to know which event an attendee belongs to and use the corresponding staff check-in endpoint. This creates friction when attendees from different events arrive at a shared entrance or registration desk.

---

## Solution

A new "Universal Scanner" page that searches across multiple active events simultaneously. Staff scan a QR code, the system finds the attendee across all grouped events, and checks them into the correct event automatically.

---

## User Flow

1. Staff opens the Multi-Event Scanner page
2. Staff selects which events to include (or a pre-defined venue/briefing center group)
3. Staff scans an attendee's QR code
4. System searches across all selected events for a matching attendee
5. Match found → attendee is checked into their specific event, result displayed (name, event, status)
6. No match → clear error message indicating the person isn't registered in any active event

---

## Design Decisions Needed

### 1. Event Grouping
**Option A**: Staff manually selects which events to scan across (simpler to build)
**Option B**: Introduce a "venue" or "briefing center" grouping concept where events are pre-assigned (cleaner UX, more setup)

**Recommendation**: Start with Option A (manual multi-select) and add grouping later if needed.

### 2. Multi-Event Registrations
If an attendee is registered for multiple concurrent events:
- Show a picker letting staff choose which event to check into
- Or check into all events simultaneously (with confirmation)

### 3. Badge Printing
After cross-event lookup, badge printing should pull the correct template for the attendee's specific event. Each event may have different badge designs, so the template resolution must be event-aware.

### 4. Staff Access Model
Current staff endpoints are scoped to a single event. This feature needs broader access:
- **Option A**: Account-level staff role that can access multiple events
- **Option B**: Staff member granted access to a list of specific events
- **Option C**: Temporary "briefing center session" that bundles event access

---

## Offline Support

### Online Mode
Works immediately — scan triggers an API call that searches across events server-side.

### Offline Mode
Requires a pre-cache step:
1. Staff taps "Prepare for Offline" on the Multi-Event Scanner page
2. System downloads all attendee lists, badge templates, and event configs for the selected events
3. Data stored in IndexedDB, indexed by eventId (schema already supports this)
4. Scans search across locally cached attendee data
5. Check-ins queue in the sync queue and replay when connectivity returns

**Important**: If staff only pre-cached some events, scanning an attendee from an un-cached event will fail offline. The UI should clearly show which events are cached and ready.

### Existing Infrastructure That Supports This
- IndexedDB `attendees` store already indexes by `eventId` — supports multi-event storage
- `syncQueue` store already handles offline action replay
- `kiosk-precache-service.ts` already implements bulk event pre-caching (can be extended)
- `offline-checkin-service.ts` already handles offline check-in + sync

---

## Technical Approach

### New Components Needed
- **Page**: `/staff/multi-scan` or `/staff/briefing-center` — new React page
- **API endpoint**: `POST /api/staff/multi-event/scan` — accepts QR code, searches across specified events
- **API endpoint**: `GET /api/staff/multi-event/events` — lists events available for multi-scan (filtered by staff access)
- **Offline search**: Client-side cross-event attendee lookup in IndexedDB

### Database Changes
- Possibly a `venue_groups` or `event_groups` table if implementing Option B for event grouping
- No schema changes needed for Option A (manual selection)

### Estimated Effort
- **Phase 1 (Online only, manual event selection)**: 3-4 days
- **Phase 2 (Offline support with pre-cache)**: 2-3 days
- **Phase 3 (Venue grouping concept)**: 2-3 days

---

## Premium Feature Flag

This should be gated behind a feature flag (`multiEventScanner` or `briefingCenterMode`) controlled by super admins, consistent with the existing premium feature pattern.

---

*Created: February 24, 2026*
*Author: Development Team*
