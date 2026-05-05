# Event-Level Badge Merge Field Overrides

## Overview

Badge templates are designed at the **account level** and shared across events. But each event may have different data requirements — registration questions, profile questions, and custom fields vary by event. Event-level merge field overrides solve this by letting admins customize which data fields appear on a badge **per event**, without duplicating or modifying the base template.

Think of it as CSS inheritance: the base template defines the layout (colors, fonts, images, positions), and the event override adds, removes, or swaps data fields on top.

---

## How It Works

### The Problem

An account has one "VIP Badge" template with fields: Name, Company, Title, QR Code.

- **Event A** needs to add "Dietary Restrictions" (a registration question tagged "Checkmate" in Certain)
- **Event B** needs to add "Session Preference" (a different registration question)
- **Event C** doesn't need any custom fields

Without overrides, you'd have to either:
- Create 3 separate templates (template sprawl)
- Use generic `customField_1` that means different things per event (confusing)

### The Solution

The base "VIP Badge" template stays as-is. At each event, admins click **"Customize Fields"** to create an override that only applies to that event:

```
Account Template (base)       → Name, Company, Title, QR Code
  └── Event A Override         → + cq_dietary_restrictions
  └── Event B Override         → + cq_session_preference
  └── Event C                  → (no override — uses base as-is)
```

---

## User Guide

### Adding Event-Specific Fields

1. Navigate to your event → **Badge Setup** tab
2. Find the template you want to customize
3. Click the **"Customize Fields"** button
4. The badge designer opens in **Event Override Mode**:
   - Base template fields appear **dimmed with a lock icon** — they can't be moved or edited
   - The info banner confirms you're in override mode
5. Use the **Add Field** dropdown to add event-specific fields:
   - Fields from synced questions tagged "Checkmate" or "Greet" appear automatically
   - Only questions with `displayOnBadge = true` are shown (configurable in Event Settings → Synced Questions)
6. Position and style the new field as needed
7. To remove a base field from this event, select it and click remove
8. Click **Save** — the override is stored on the event, not the template

### Removing Fields for an Event

If a base template has a field that doesn't apply to a specific event (e.g., "Order Code" on an event with no group registrations), you can remove it:

1. Open the badge designer in override mode
2. Click the base field you want to hide
3. Remove it — this adds it to the event's "remove" list
4. The field disappears from badges at this event only

### Resetting Overrides

To go back to the base template with no customizations:

- API: `DELETE /api/events/:eventId/merge-field-overrides/:templateId`
- Or remove all added fields and restore all removed fields in the designer

---

## How Overrides Are Applied

When a badge is printed or previewed, the system resolves the template in this order:

1. **Resolve base template** — picks the right template based on participant type (event override → customer default → "General" → any template)
2. **Apply merge field overrides** — if the event has overrides for this template ID:
   - **Remove**: filter out fields listed in the `remove` array
   - **Replace**: swap matching fields (keep position/style, change the data source)
   - **Add**: append new fields to the end of the merge field list
3. **Render badge** — the modified template (with overrides applied) is used for rendering

This happens server-side in the `BadgeTemplateResolver.applyMergeFieldOverrides()` method, so all print paths (admin, staff, kiosk, PrintNode, network print) get the correct fields automatically.

---

## Data Storage

Overrides are stored in the event's `badgeSettings` JSONB column — no new database tables required.

```json
{
  "badgeSettings": {
    "fontOverrides": { ... },
    "mergeFieldOverrides": {
      "template-id-abc": {
        "add": [
          {
            "field": "cq_dietary_restrictions",
            "label": "Dietary",
            "fontSize": 10,
            "position": { "x": 20, "y": 180 },
            "align": "left"
          }
        ],
        "remove": ["orderCode"],
        "replace": []
      }
    }
  }
}
```

### Override Operations

| Operation | What it does | Example |
|-----------|-------------|---------|
| **add** | Appends new fields to the badge | Add `cq_dietary_restrictions` for this event |
| **remove** | Hides base template fields | Hide `orderCode` (no group check-in at this event) |
| **replace** | Swaps a base field for a different one | Replace `customField_1` with `cq_session_preference`, keeping the same position |

---

## API Endpoints

### Get all overrides for an event

```
GET /api/events/:eventId/merge-field-overrides
```

Returns: `Record<templateId, { add?, remove?, replace? }>`

### Get overrides for a specific template

```
GET /api/events/:eventId/merge-field-overrides/:templateId
```

Returns: `{ add: [], remove: [], replace: [] }`

### Set overrides for a template

```
PUT /api/events/:eventId/merge-field-overrides/:templateId
Content-Type: application/json

{
  "add": [
    {
      "field": "cq_dietary_restrictions",
      "label": "Dietary",
      "fontSize": 10,
      "position": { "x": 20, "y": 180 },
      "align": "left"
    }
  ],
  "remove": ["orderCode"]
}
```

### Delete overrides for a template

```
DELETE /api/events/:eventId/merge-field-overrides/:templateId
```

Removes all overrides — badge reverts to the base template.

---

## Synced Questions Integration

Event-level overrides work hand-in-hand with synced questions from Certain:

1. **Profile questions** (account-wide, tagged "Checkmate" or "Greet") are available at both the base template and event level
2. **Registration questions** (per-event) are only available at the event level — this is the primary use case for overrides
3. Questions must have `displayOnBadge = true` to appear in the badge designer's field list (configurable in Event Settings → Synced Questions)
4. When an attendee is synced, their question responses are stored in `attendee.customFields` using the question's `mergeFieldKey` (e.g., `cq_dietary_restrictions`)
5. The badge render surface resolves these keys directly from `customFields`

### Field Key Naming

| Source | Key Format | Example |
|--------|-----------|---------|
| Built-in fields | Plain name | `firstName`, `company`, `externalId` |
| Synced questions | `cq_` prefix | `cq_dietary_restrictions`, `cq_session_preference` |
| Legacy (deprecated) | `customField_` prefix | `customField_1` — no longer available in the designer |

---

## Visual Design

### Event Override Mode in Badge Designer

When the designer opens in override mode:

- **Info banner** at the top: "Event Override Mode — You're customizing merge fields for this event only."
- **Base template fields**: rendered with a dashed border, dimmed opacity (60%), and a lock icon in the top-left corner. Cannot be dragged, clicked, or edited.
- **Event-specific fields**: rendered normally with full interactivity — drag to position, click to edit properties.
- **Available fields dropdown**: shows only fields relevant to this event (built-in + synced questions where `displayOnBadge = true`)

### In the Event Badge Setup

Each template card has a **"Customize Fields"** button (with a gear icon) below the font override selector. Clicking it opens the designer in override mode in a full-width dialog.

---

## Backward Compatibility

- **Existing templates**: continue to work identically. Overrides are opt-in per event.
- **Legacy `customField_1/2/3`**: removed from the available fields list in the designer. Existing templates that reference them continue to render correctly — the render engine still handles the `customField_` prefix. Over time, admins should replace them with synced question fields via overrides.
- **Events without overrides**: use the base template unchanged.
- **Templates without synced questions**: the designer shows only built-in fields. No synced questions appear until the Certain sync runs and questions are tagged.

---

## Architecture

### Files

| File | Role |
|------|------|
| `shared/schema.ts` | `events.badgeSettings.mergeFieldOverrides` type definition |
| `server/services/badge-template-resolver.ts` | `applyMergeFieldOverrides()` — server-side merge logic |
| `server/routes.ts` | CRUD API endpoints + wired into template resolution |
| `client/src/components/BadgeDesigner.tsx` | Event override mode, delta computation, locked field keys |
| `client/src/components/DraggableBadgeCanvas.tsx` | Locked field visuals (dashed border, lock icon, interaction blocked) |
| `client/src/components/EventBadgeSetup.tsx` | "Customize Fields" button and override dialog |
| `client/src/components/BadgeRenderSurface.tsx` | `cq_` prefix resolution in `getFieldValue()` |
| `client/src/services/print-orchestrator.ts` | `cq_` prefix resolution in print pipeline |

### Data Flow

```
Admin clicks "Customize Fields"
  → BadgeDesigner opens in eventOverrideMode
  → Base fields locked, event fields editable
  → Save computes delta (add/remove/replace)
  → PUT /api/events/:eventId/merge-field-overrides/:templateId
  → Stored in event.badgeSettings.mergeFieldOverrides

At print time:
  → BadgeTemplateResolver.resolveTemplateForAttendee()
  → Returns base template
  → applyMergeFieldOverrides(template, event.badgeSettings)
  → Returns modified template with event-specific fields
  → Badge renders with correct merge field values from attendee.customFields
```
