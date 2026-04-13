# Multi-Account User Access — Design Document

**Status**: Planning (not yet implemented)  
**Primary Use Case**: Service partners who manage multiple client accounts  
**Created**: 2026-03-19

---

## Problem

Currently, each user (`users` table) has a single `customerId` column binding them to one account. Service partners — such as setup teams or AV vendors — need to access multiple client accounts using a single login. Today, this requires creating separate user records per account, which means multiple logins and no unified identity.

## Goals

1. A user can be associated with multiple accounts, each with its own role
2. Super admins can search for any user and link them to additional accounts
3. On login, multi-account users pick which account to work in
4. Users can switch accounts from the nav without re-authenticating
5. All existing single-account users continue working with zero migration friction
6. Tenant isolation remains strict — a user can only see data for their active account

---

## Database Changes

### New Table: `user_account_memberships`

```
user_account_memberships
├── id            TEXT (PK)
├── userId        TEXT (FK → users.id, ON DELETE CASCADE)
├── customerId    TEXT (FK → customers.id, ON DELETE CASCADE)
├── role          TEXT (admin | manager | staff)
├── isDefault     BOOLEAN (default false) — the account to auto-select on login if only one
├── addedBy       TEXT (FK → users.id) — super admin who created the link
├── createdAt     TIMESTAMP
└── UNIQUE(userId, customerId)
```

### Migration Path for `users.customerId`

- **Keep `users.customerId`** as the user's "primary" account for backward compatibility
- When the multi-account feature is active, the auth layer uses the membership table instead
- Single-account users (no memberships) continue using `users.customerId` as-is
- A background migration can optionally seed a membership row for every existing user to normalize the data, but is not required for launch

---

## Auth / Session Flow

### Login

1. User authenticates (OTP, email/password, Replit Auth — unchanged)
2. Auth middleware looks up `user_account_memberships` for the user
3. **Single account (0 or 1 memberships)**: Auto-select, proceed normally (current behavior)
4. **Multiple accounts**: Redirect to account picker page
5. Selected `customerId` is stored in `req.session.activeCustomerId`

### Session

- `req.session.activeCustomerId` overrides `req.dbUser.customerId` when present
- `getEffectiveCustomerId()` already exists in `auth.ts` — extend it to check `session.activeCustomerId` first
- All existing tenant-scoped queries continue using `getEffectiveCustomerId()` without modification

### Account Switch

- `POST /api/auth/switch-account` — accepts `{ customerId }`, validates membership, updates session
- No re-authentication required — just a session update + page reload on the client
- Audit log entry for each switch: `account_switch` action

---

## API Endpoints

### Super Admin — User Account Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users/search?q=` | Search users by name/email (super admin only) |
| `GET` | `/api/admin/users/:userId/accounts` | List account memberships for a user |
| `POST` | `/api/admin/users/:userId/accounts` | Add account membership `{ customerId, role }` |
| `PATCH` | `/api/admin/users/:userId/accounts/:membershipId` | Update role on a membership |
| `DELETE` | `/api/admin/users/:userId/accounts/:membershipId` | Remove account access |

### User — Self-Service

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/my-accounts` | List accounts the current user can access |
| `POST` | `/api/auth/switch-account` | Switch active account `{ customerId }` |

---

## Client-Side Changes

### Account Picker (post-login)

- Simple card list showing account names with logos/icons
- Only shown when user has 2+ account memberships
- Selecting an account calls `POST /api/auth/switch-account` and redirects to dashboard

### Account Switcher (nav bar)

- Dropdown in the existing top/side nav area (where the account name is shown)
- Shows current account name with a chevron
- Dropdown lists all accounts with a check mark on the active one
- Clicking another account calls `POST /api/auth/switch-account` and triggers a full page reload to reset all cached data
- Only rendered for users with 2+ accounts — single-account users see the current static account name

### Super Admin UI

- New section in existing user management: "Account Access" card
- Search for users, view their memberships, add/remove accounts
- Role selector per membership (admin / manager / staff)

---

## Security Considerations

1. **Membership validation on every switch**: `POST /api/auth/switch-account` must verify the user actually has a membership for the requested `customerId`
2. **Role scoping**: The user's role may differ per account (admin on Account A, staff on Account B) — the active role comes from the membership, not `users.role`
3. **Audit trail**: Every account switch logged with timestamp, userId, from/to customerId
4. **Super admin bypass**: Super admins already have cross-tenant access via impersonation header — multi-account is for non-super-admin users
5. **Session invalidation**: If a membership is removed while the user has that account active, the next auth middleware check should detect the stale membership and force re-selection

---

## Implementation Phases

### Phase 1: Database + API (backend)
- Create `user_account_memberships` table
- Build super admin CRUD endpoints for managing memberships
- Add `GET /api/auth/my-accounts` and `POST /api/auth/switch-account`
- Extend `getEffectiveCustomerId()` to check `session.activeCustomerId` + membership validation

### Phase 2: Account Picker + Switcher (frontend)
- Post-login account picker page
- Nav bar account switcher dropdown
- Invalidate TanStack Query cache on account switch

### Phase 3: Super Admin UI
- Account access management card in user detail/edit view
- User search + membership CRUD interface

---

## Non-Goals (Deferred)

- Cross-account data views (seeing all accounts' events on one dashboard)
- Account-level API keys or service accounts
- Delegated admin — an admin on Account A managing Account B's users
- Bulk membership management (CSV import of user-account links)
