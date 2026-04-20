# Feature Flags Design Context

**Source:** [Feature Flags: Transform Your Product Development Workflow](https://featureflagsbook.com/) by Ben Nadel (2024)
**Purpose:** Reference guide for implementing feature flags in Greet as we move from beta to GA. Covers both account-level and super-admin-level flag strategies.
**Added:** March 5, 2026

---

## Why Feature Flags

Feature flags decouple **deploying** code from **releasing** code. Code can be deployed to production in a dormant state behind a flag, then incrementally released to users through targeting rules. This eliminates the fear of deploying, enables graduated rollouts, and provides an instant kill-switch if something goes wrong — no redeployment needed.

Key transformation: instead of deploying and hoping, you deploy safely, target yourself first, then internal users, then 10%, 25%, 50%, 100% of customers. Almost all deployment risk is mitigated through this graduated rollout.

---

## Core Concepts

### Deploying vs. Releasing
- **Deploying** = pushing code to production (it may sit dormant)
- **Releasing** = exposing deployed code to users via flag targeting
- These are now independent actions controlled separately

### Feature Flag Components
- **Identifier**: Named key (e.g., `new-checkout-workflow`)
- **Type**: Boolean, string, number, JSON, etc.
- **Variants**: The distinct values a flag can return (e.g., `true`/`false`, or `"v1"`/`"v2"`/`"v3"`)
- **Targeting Rules**: Determine which variant a user receives based on context (user ID, email, role, account, percentile)
- **Rollout Strategy**: How broadly the flag is enabled (specific users → internal → % of all → everyone)

### Targeting
Targeting is deterministic — same rules + same inputs = same variant, always. Common targeting dimensions:
- User ID (allow-list specific users)
- User email domain (internal company users)
- Account/customer ID (specific tenants)
- User role (admin, staff, etc.)
- Percentile-based (modulo of user ID for consistent % rollout)
- Compound rules: AND/OR combinations of the above

### Graduated Rollout Pattern
1. Deploy dormant code behind flag
2. Enable for **your user ID** → test in production
3. Discover/fix bugs (still only your user)
4. Enable for **internal company users** → examine logs/metrics
5. Enable for **10%** of all users → monitor
6. Enable for **25%** → **50%** → **75%** → **100%**
7. Celebrate successful release
8. Remove the flag from code (cleanup)

---

## Types of Feature Flags

### By Lifespan
1. **Transient (Release) Flags**: Short-lived, used to safely deploy a feature. Removed from code once fully released. Boolean type is most common.
2. **Operational (Permanent) Flags**: Long-lived, used to control ongoing system behavior. Examples: rate limits, maintenance modes, premium feature gates.

### By Data Type
- **Boolean**: On/off — simplest and most common (maps directly to `if` statements)
- **String**: A/B testing variants, theme names, feature tier names
- **Number**: Numeric thresholds, limits, percentages
- **JSON**: Complex configurations, UI layouts, behavior bundles

---

## Greet-Specific Application

### Current Premium Feature Flags (Already Implemented)
Greet already has a basic feature flag system for premium features:
- Badge flip preview
- Giveaway tracking
- Controlled by super admins on a per-event basis

### Proposed Flag Levels for GA

#### 1. Platform-Level Flags (Super Admin Only)
- Control platform-wide features and behaviors
- Maintenance mode, new feature rollouts, A/B tests
- Examples: `platform:maintenance-mode`, `platform:new-dashboard-v2`, `platform:ai-feedback-analysis`

#### 2. Account-Level Flags (Per Customer/Tenant)
- Control feature availability per account
- Premium tier features, beta program access, custom limits
- Examples: `account:advanced-analytics`, `account:custom-branding`, `account:api-access`, `account:max-events`
- Managed by super admins, visible to account admins

#### 3. Event-Level Flags (Per Event)
- Control behavior for specific events
- Already partially implemented via event settings (allowWalkins, printPreviewOnCheckin, etc.)
- Examples: `event:self-checkin-kiosk`, `event:session-tracking`, `event:giveaway-enabled`

### Recommended Architecture

```
feature_flags table:
  id, key, type (boolean/string/number/json), default_variant,
  description, is_operational (transient vs permanent),
  created_at, updated_at

feature_flag_rules table:
  id, flag_id, priority, 
  target_type (platform/account/event/user),
  target_id (null for platform, customer_id, event_id, user_id),
  operator (equals/one_of/not_one_of/contains/percentage),
  value, variant,
  created_at

feature_flag_overrides table:
  id, flag_id, target_type, target_id, variant, 
  reason, created_by, expires_at
```

Evaluation order: User override → Event rule → Account rule → Platform rule → Default variant

### Server-Side Evaluation
- All flag evaluation happens server-side for security
- Client receives resolved variants via API (never raw rules)
- Cache flag state in memory, refresh on config change
- Include flag context in API responses where needed

### Client-Side Consumption (SPA Considerations)
- Since Greet is a React SPA, flag state can become stale during long sessions
- Options: poll for changes, use SSE/WebSocket for real-time updates, or refresh on navigation
- Staff dashboard sessions can be long (8+ hours) — need a refresh strategy
- Kiosk mode sessions are persistent — flags should auto-refresh periodically

---

## Key Principles from the Book

### Deploying is Not Releasing
Product releases and marketing releases should be independent. Ship continuously behind flags, then do a "razzle-dazzle marketing moment" when ready.

### Track Actions, Not Flag State
Don't track which variant a user is seeing. Track what users DO (actions, conversions, behaviors). Flags are transient; actions are permanent data.

### Hidden Costs to Consider
- Additional code complexity (branching logic spread across code + config)
- Harder to reason about behavior at a glance
- Stale flags become technical debt — need a cleanup lifecycle
- Testing surface area increases (must test all variant paths)

### Not Everything Should Be Flagged
- Database schema migrations are hard to flag
- Sometimes the cost of flagging exceeds the risk of deploying directly
- If the path forward isn't clear, it may not be a good match for flags

### Build vs. Buy
- Feature flags are "deceptively simple" — the rules engine, admin UI, real-time propagation, multi-environment support, and audit trails add up fast
- Consider: does building this give us a competitive advantage?
- For Greet: start simple (DB-backed boolean flags), evaluate vendors (LaunchDarkly, Flagsmith, Unleash) if complexity grows

### Ownership Boundaries
- Feature flag ownership should be clear — who created it, who maintains it, who cleans it up
- Stale flags (ones nobody owns) are dangerous technical debt

---

## Implementation Priorities (Post-Beta)

### Phase 1: Foundation
- [ ] Create `feature_flags` and `feature_flag_rules` tables
- [ ] Build server-side evaluation function: `evaluateFlag(flagKey, context)`
- [ ] Migrate existing premium feature toggles to the new system
- [ ] Super admin UI for managing flags

### Phase 2: Account-Level Targeting
- [ ] Account-level flag rules (enable features per customer)
- [ ] Account admin visibility (see which flags are active for their account)
- [ ] Audit trail for flag changes

### Phase 3: Advanced
- [ ] Percentage-based rollouts
- [ ] Flag expiration / auto-cleanup reminders
- [ ] Client-side flag refresh mechanism for SPAs
- [ ] Flag dependency tracking (flag A requires flag B)
