# Greet Licensing & Monetization Architecture

**Version:** 1.0  
**Date:** April 15, 2026  
**Status:** Design — Not Yet Implemented

---

## 1. Overview

Every Greet account (customer) will be assigned a **License Type** at creation time. The license determines which features are available and, for Premium accounts, how attendee usage is tracked and reported. This architecture is designed to:

- Gate features cleanly at the account level using the existing feature flag infrastructure
- Track attendee consumption for Premium accounts against prepaid thresholds
- Alert Customer Success via Slack when accounts approach their prepaid limits
- Require zero changes to existing event, attendee, or check-in flows

---

## 2. License Structure

### 2.1 License Types

| License Type | Description |
|-------------|-------------|
| **Basic** | Standard feature set. No attendee tracking or usage reporting. |
| **Premium** | Full feature set with a prepaid attendee allocation and usage monitoring. |

### 2.2 Premium Licensing Plans

Premium accounts must select a plan that defines their prepaid attendee allocation:

| Plan | Prepaid Attendees | Target Customer |
|------|-------------------|-----------------|
| Starter | 1,000 | Small events / evaluation |
| Professional | 5,000 | Mid-market |
| Enterprise | 20,000 | Large-scale operations |
| Strategic | 45,000 | Global / multi-event portfolios |

These allocations are **guidance for the Pro Services team** — they determine when Slack alerts fire for upsell conversations. They are not hard limits that block functionality.

---

## 3. Database Schema Changes

### 3.1 New Columns on `customers` Table

```
licenseType        text        "basic" | "premium"       default "basic"
licensePlan        text        "starter" | "professional" | "enterprise" | "strategic"   nullable (null for basic)
prepaidAttendees   integer     1000 | 5000 | 20000 | 45000   nullable (null for basic)
licenseStartDate   timestamp   when the license was activated
licenseNotes       text        free-text notes for pro services team   nullable
```

### 3.2 New Table: `attendee_usage_snapshots`

Tracks periodic attendee counts per account for historical reporting and trend analysis.

```
id                 text        primary key
customerId         text        FK → customers.id
snapshotDate       date        the date of the snapshot
totalAttendees     integer     total attendees across all events
activeAttendees    integer     attendees in active/upcoming events only
eventCount         integer     number of events at snapshot time
createdAt          timestamp   auto
```

A background worker takes a daily snapshot. This enables:
- Trend charts (growing, stable, declining usage)
- Predictive alerts ("at current rate, this account will hit their limit by X date")
- Historical reporting for renewal conversations

### 3.3 New Table: `usage_alerts`

Tracks when alerts were sent to avoid duplicate notifications.

```
id                 text        primary key
customerId         text        FK → customers.id
alertType          text        "approaching_limit" | "exceeded_limit" | "trend_warning"
threshold          integer     the percentage that triggered it (75, 90, 100, etc.)
attendeeCount      integer     count at time of alert
prepaidLimit       integer     the prepaid limit at time of alert
message            text        the alert message sent
slackMessageId     text        Slack message ID for threading   nullable
sentAt             timestamp   when the alert was sent
```

---

## 4. Feature Flag Mapping

The existing `feature_flags` table already supports account-level scope. When an account is created with a license type, the system auto-provisions flags based on the tier.

### 4.1 Feature Flag Definitions

Each feature below maps to a flag key. On account creation, the system creates account-scoped entries in `feature_flags` with the correct `enabled` state.

| Category | Feature | Flag Key | Basic | Premium |
|----------|---------|----------|-------|---------|
| **Administration** | Configuration Templates | `config_templates` | ON | ON |
| | Offline Check-In | `offline_checkin` | ON | ON |
| | Offline Badge Printing | `offline_badge_print` | ON | ON |
| | Customer Account Management | `account_management` | OFF | ON |
| | Full Audit Trail | `audit_trail` | OFF | ON |
| | OWASP Security Compliance | `security_compliance` | OFF | ON |
| | Multi-Account Access | `multi_account_access` | OFF | OFF (Coming Soon) |
| | GDPR/CCPA Data Privacy | `data_privacy_controls` | OFF | OFF (Coming Soon) |
| **Analytics** | Event Dashboard | `event_dashboard` | ON | ON |
| | Exportable Reports | `exportable_reports` | ON | ON |
| | Cross-Account Analytics | `cross_account_analytics` | OFF | ON |
| | Account Dashboard | `account_dashboard` | OFF | ON |
| | Real-Time Activity Monitor | `activity_monitor` | OFF | ON |
| **Attendee Management** | Attendee List | `attendee_list` | ON | ON |
| | QR Code Check-In | `qr_checkin` | ON | ON |
| | Manual Check-In | `manual_checkin` | ON | ON |
| | Walk-In Registration | `walkin_registration` | ON | ON |
| | Offline Check-In + Sync | `offline_sync` | ON | ON |
| | Real-Time Search | `realtime_search` | ON | ON |
| | Status Filtering | `status_filtering` | ON | ON |
| | Check-In Reversal | `checkin_reversal` | ON | ON |
| | Real-Time Stats | `realtime_stats` | ON | ON |
| | Duplicate Detection | `duplicate_detection` | ON | ON |
| | Custom Data Fields | `custom_data_fields` | ON | ON |
| | Duplicate Prevention | `duplicate_prevention` | ON | ON |
| | Session Tracking | `session_tracking` | OFF | ON |
| | Session Check-In/Out | `session_checkin` | OFF | ON |
| | Waitlist Management | `waitlist_management` | OFF | ON |
| | Session Kiosk | `session_kiosk` | OFF | ON |
| | Group Check-In | `group_checkin` | OFF | ON |
| | Custom Workflow | `custom_workflow` | OFF | ON |
| | Digital Signature | `digital_signature` | OFF | ON |
| | Canceled Blocking | `canceled_blocking` | OFF | ON |
| | Session Capacity | `session_capacity` | OFF | ON |
| | Balance Due Block | `balance_due_block` | OFF | OFF (Coming Soon) |
| **Badge Design** | Dynamic Merge Fields | `badge_merge_fields` | ON | ON |
| | Image Elements | `badge_images` | ON | ON |
| | Pre-Designed Templates | `badge_predesigned` | ON | ON |
| | Drag-and-Drop Designer | `badge_designer` | ON | ON |
| | Template by Type | `badge_type_mapping` | ON | ON |
| | Wireless Printing | `wireless_printing` | ON | ON |
| | Zebra USB | `zebra_usb` | ON | ON |
| | Two-Sided Printing | `two_sided_printing` | ON | ON |
| | Duplicate Print Prevention | `duplicate_print_prevention` | ON | ON |
| | Offline Print Queue | `offline_print_queue` | ON | ON |
| | Custom Font Upload | `custom_fonts` | OFF | ON |
| | Auto-Sizing Text | `auto_size_text` | OFF | ON |
| | Foldable Badge Support | `foldable_badges` | OFF | ON |
| | Back Panel Printing | `back_panel_printing` | OFF | ON |
| | 3D Badge Preview | `badge_flip_preview` | OFF | ON |
| | AI Badge Design | `ai_badge_design` | OFF | ON |
| | Remote Cloud Printing | `cloud_printing` | OFF | ON |
| | High-Res Rendering | `high_res_rendering` | OFF | ON |
| | PDF Badge Export | `pdf_badge_export` | OFF | ON |
| | Bulk Badge Printing | `bulk_badge_print` | OFF | ON |
| | Custom Templates | `custom_templates_unlimited` | OFF (limit 3) | ON (unlimited) |
| **Event Management** | Create & Edit Events | `event_crud` | ON | ON |
| | Location & Timezone | `location_timezone` | ON | ON |
| | Multi-Event per Account | `multi_event` | ON | ON |
| | Event Status Tracking | `event_status` | ON | ON |
| | Reusable Config Templates | `reusable_config` | ON | ON |
| | Attendee Type Categorization | `attendee_types` | ON | ON |
| **Feedback** | AI Sentiment Analysis | `ai_sentiment` | OFF | ON |
| | AI Feedback + Slack Alerts | `ai_feedback_slack` | OFF | ON |
| | Staff Internal Messaging | `staff_messaging` | OFF | OFF (Coming Soon) |
| **Giveaways** | Prize & Raffle Management | `prize_management` | OFF | ON |
| | Winner Lifecycle Tracking | `winner_tracking` | OFF | ON |
| | Per-Event Giveaways | `per_event_giveaways` | OFF | OFF (Coming Soon) |
| **Integrations** | CSV Import/Export | `csv_import_export` | ON | ON |
| | Auto Event Discovery | `auto_event_discovery` | ON | ON |
| | Two-Way Sync | `two_way_sync` | ON | ON |
| | Walk-In Sync | `walkin_sync` | ON | ON |
| | Field Mapping | `field_mapping` | OFF | ON |
| | Standalone Check-In Mode | `standalone_mode` | OFF | ON |
| | Per-Event Sync Pause | `sync_pause` | OFF | ON |
| | Third-Party Integration | `third_party_integration` | OFF | ON |
| | Status Push to External | `status_push_external` | OFF | OFF (Coming Soon) |
| | Per-Account Printer Isolation | `printer_isolation` | OFF | OFF (Coming Soon) |
| | Advanced Sync Engine | `advanced_sync` | OFF | OFF (Coming Soon) |
| **Kiosk** | Self-Service Kiosk (Event) | `kiosk_event` | ON | ON |
| | Kiosk Launcher | `kiosk_launcher` | ON | ON |
| | PIN-Protected Exit | `kiosk_pin_exit` | ON | ON |
| | Duplicate Handling | `kiosk_duplicate_handling` | ON | ON |
| | Session Kiosk | `kiosk_session` | OFF | ON |
| **Notifications** | SMS Notifications | `sms_notifications` | ON | ON |
| | Email Notifications | `email_notifications` | ON | ON |
| | Custom Notification Rules | `custom_notification_rules` | OFF | ON |
| | Slack Alerts | `slack_alerts` | OFF | ON |
| | Configurable Triggers | `configurable_triggers` | OFF | ON |
| | Custom Content w/ Data | `custom_notification_content` | OFF | ON |
| | Inbound Webhooks | `inbound_webhooks` | OFF | OFF (Coming Soon) |
| | Notification Audit Log | `notification_audit_log` | OFF | OFF (Coming Soon) |

### 4.2 Flag Provisioning Logic

On account creation:

```
if licenseType === "basic":
    create account-scoped feature_flags for every key above
    set enabled = true for Basic ON items
    set enabled = false for everything else

if licenseType === "premium":
    create account-scoped feature_flags for every key above
    set enabled = true for all Premium ON items
    set enabled = false for "Coming Soon" items only
```

Super admins can override individual flags per account via Mission Control (already built). This allows:
- Trialing a premium feature for a basic account
- Disabling a feature for a specific account due to contractual terms
- Early access for strategic accounts

---

## 5. Attendee Usage Tracking (Premium Only)

### 5.1 Daily Snapshot Worker

A new background worker (similar to the existing data retention worker pattern) runs once daily:

1. For each Premium account, count total attendees across all events
2. Insert a row into `attendee_usage_snapshots`
3. Check if current count has crossed any alert thresholds
4. Send Slack alerts as needed

### 5.2 Alert Thresholds

| Threshold | Alert Type | Slack Message |
|-----------|-----------|---------------|
| 75% of prepaid | `approaching_limit` | "{Account} has used {count} of {limit} prepaid attendees (75%). Time to start the upsell conversation." |
| 90% of prepaid | `approaching_limit` | "{Account} is at {count} of {limit} prepaid attendees (90%). Upsell is urgent." |
| 100% of prepaid | `exceeded_limit` | "{Account} has exceeded their prepaid limit: {count} of {limit} attendees. Immediate outreach needed." |
| 110%+ of prepaid | `exceeded_limit` | "{Account} is significantly over limit: {count} of {limit} ({pct}%). Priority follow-up required." |

Additional **trend-based alerts** (using snapshot history):
- "At current growth rate, {Account} will hit their limit in approximately {days} days"
- Triggered when a linear projection crosses the limit within the next 30 days

### 5.3 Alert Deduplication

Each threshold fires once per account per billing period. The `usage_alerts` table prevents repeat sends. When a new license period starts (annual renewal), alerts reset.

### 5.4 Slack Channel

Usage alerts are sent to a dedicated Slack channel (e.g., `#checkmate-usage-alerts`) separate from the feedback alerts channel. This requires a new environment secret: `SLACK_USAGE_WEBHOOK_URL`.

---

## 6. Account Creation Workflow Changes

### 6.1 Updated Create Account Dialog

The existing "Add Customer" dialog gains new fields:

**Step 1 — Account Details** (existing)
- Organization Name
- Admin Email
- API Base URL (optional)

**Step 2 — License Configuration** (new)
- **License Type**: Radio group — Basic / Premium
- If **Basic** selected:
  - Note: "Standard features will be enabled. Premium features can be trialed individually via Mission Control."
  - Done — proceed to create
- If **Premium** selected:
  - **Licensing Plan**: Select — Starter / Professional / Enterprise / Strategic
  - Shows prepaid attendee count as a note (e.g., "5,000 prepaid attendees")
  - **License Start Date**: Date picker (defaults to today)
  - **License Notes**: Free text for pro services context
  - Done — proceed to create

### 6.2 Backend Flow

```
POST /api/customers
  → Create customer record with license fields
  → Call provisionFeatureFlags(customerId, licenseType)
  → If premium: initialize attendee tracking
  → Return customer + license info
```

The `provisionFeatureFlags` function:
1. Reads the flag mapping (Section 4.1 above)
2. Bulk-inserts account-scoped `feature_flags` entries
3. Returns the count of flags provisioned

---

## 7. Usage Reporting

### 7.1 Account License Card

A new card on the account dashboard (visible to super admins and account admins) showing:
- License Type + Plan
- Prepaid attendees vs current usage (progress bar)
- Trend chart (last 30 days from snapshots)
- Days until projected limit hit (if trending toward it)

### 7.2 Super Admin License Overview

A new section in Mission Control showing all accounts with:
- Account name, license type, plan
- Current attendee count vs prepaid limit
- Usage percentage (color-coded: green < 75%, yellow 75-90%, red > 90%)
- Last alert sent date
- Quick action: "Send Reminder" or "Upgrade Plan"

### 7.3 Exportable Usage Report

CSV/Excel export from Mission Control with:
- Account, license type, plan, prepaid limit
- Current attendees, percentage used
- Growth rate (attendees/month)
- Projected limit date
- Alert history

---

## 8. UI Feature Gating Pattern

### 8.1 Current Pattern (Global Flags)

```tsx
const { betaFeedback } = useFeatureFlags();
if (!betaFeedback) return null;
```

### 8.2 New Pattern (Account-Scoped Flags)

The `/api/settings/feature-flags` endpoint will be extended to merge account-scoped flags when a customer context is present:

```
GET /api/settings/feature-flags
  → Global flags (platform-level)
  → + Account-scoped flags for the current user's customerId (or impersonated account)
  → Account flags override global flags when present
```

Frontend consumption stays the same — `useFeatureFlags()` returns the merged result. Components don't need to know whether a flag is global or account-scoped.

For features with limits (like "Custom Templates: up to 3"), the flag value can carry metadata:

```json
{
  "custom_templates_unlimited": false,
  "custom_templates_limit": 3
}
```

### 8.3 Upgrade Prompt Pattern

When a gated feature is encountered, instead of hiding it completely, show a locked state:

```
┌──────────────────────────────────┐
│  🔒  Custom Workflow             │
│  Available with Premium license  │
│  [Contact Us to Upgrade]         │
└──────────────────────────────────┘
```

This is better than hiding features entirely because:
- Users know what's available at the next tier
- It creates natural upsell moments
- Admins can make the case to upgrade internally

---

## 9. Migration Path for Existing Accounts

All existing accounts will be migrated to **Premium / Enterprise** by default (they already have all features enabled). The migration:

1. Set `licenseType = 'premium'`, `licensePlan = 'enterprise'`, `prepaidAttendees = 20000` for all existing accounts
2. Provision feature flags with all Premium ON
3. Take initial usage snapshot
4. No disruption — all features remain enabled

---

## 10. Implementation Phases

### Phase 1: Schema + Account Creation (Foundation)
- Add license columns to customers table
- Update account creation dialog with license selection
- Build `provisionFeatureFlags()` function
- Provision flags on account creation

### Phase 2: Feature Gating (Visibility)
- Extend `/api/settings/feature-flags` to merge account-scoped flags
- Update `useFeatureFlags` hook if needed
- Add gate checks to Premium-only UI areas (progressive — start with the most visible features)

### Phase 3: Usage Tracking (Monitoring)
- Create `attendee_usage_snapshots` table
- Build daily snapshot worker
- Create `usage_alerts` table
- Build Slack alert integration
- Add usage card to account dashboard

### Phase 4: Reporting (Visibility for CS team)
- License overview in Mission Control
- Trend charts on account dashboard
- Exportable usage report
- Projected limit calculations

### Phase 5: Upgrade Prompts (Revenue)
- Locked-state UI pattern for gated features
- "Contact Us" or "Request Upgrade" flow
- Upgrade request notifications to CS team via Slack

---

## 11. Environment Secrets Required

| Secret | Purpose |
|--------|---------|
| `SLACK_USAGE_WEBHOOK_URL` | Webhook for the usage alerts Slack channel |

---

## 12. Files Impacted

| Area | Files |
|------|-------|
| Schema | `shared/schema.ts` — customers table + new tables |
| Account Creation | `server/routes.ts` — POST /api/customers |
| Account Creation UI | `client/src/components/CustomerManagement.tsx` |
| Feature Flags | `server/routes.ts` — GET /api/settings/feature-flags |
| Feature Flags | `client/src/hooks/useFeatureFlags.ts` |
| Usage Worker | `server/services/usage-tracking.ts` (new) |
| Slack Alerts | `server/services/slack-usage.ts` (new) |
| Mission Control | `client/src/pages/MissionControl.tsx` |
| Account Dashboard | `client/src/pages/CustomerDashboard.tsx` |

---

**Total new flag keys: ~75** | **New DB tables: 2** | **New columns on customers: 5** | **New background worker: 1** | **New Slack integration: 1**
