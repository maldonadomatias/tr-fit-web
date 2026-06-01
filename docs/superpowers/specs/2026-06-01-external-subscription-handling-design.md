# External subscription / membership handling — design

**Date:** 2026-06-01
**Status:** Design (not yet implemented)
**Scope:** `tr-fit-web` backend + admin dashboard only. **No mobile-app changes.**
**Related:** Part 1 reconcile (tier gating removed, `users.status` login gate
enforced) — see [account access model] and the existing dormant MercadoPago
infra (migration `016_subscriptions`, `mp.service`, `subscription.service`,
`/webhooks/mp`).

---

## 1. Background & goals

Subscriptions are handled **outside the app** to avoid app-store commissions.
The real-world flow is manual and relationship-driven:

> coach contacts athlete → athlete pays by bank transfer → admin enables the account

Part 1 already made `users.status` (`pending`/`approved`/`rejected`) the single
source of truth for *approval*, enforced at login. But approval is a one-time
on/off — it can't express **"paid through March, lapses April 1"**. This design
adds a **time-bound membership** layer so access can expire and be renewed,
without changing the app.

### Goals
- Record each membership period and the payments that fund it (date, amount,
  method, who recorded it).
- Make access **time-bound**: an athlete who stops paying loses access at a
  known date, automatically.
- Distinct, queryable lifecycle states: `active → expiring → expired →
  reactivated`, kept separate from `rejected`.
- One-action admin workflow: "register a payment" both logs the payment and
  (re)enables access.
- Proactive notifications (email) + an admin dashboard view of who is
  expiring/expired.
- Leave a clean seam for an eventual automated processor (MercadoPago) without
  building it now.

### Non-goals
- No automated payment collection (MercadoPago stays dormant).
- No mobile-app changes. The app contract is fixed: login reasons
  `not_approved` / `rejected` only.
- No per-tier pricing or feature gating (removed in Part 1).

---

## 2. Chosen approach (Approach A)

Two orthogonal axes gate access:

| Axis | Column / table | Meaning | Set by |
|------|----------------|---------|--------|
| **Approval** | `users.status` | "the coach trusts this person" | admin (approve/reject) |
| **Payment** | `memberships.status` + `paid_until` | "paid through date X" | register-payment action + cron |

**Login passes only if `users.status='approved'` AND the athlete has an active
membership (`now() <= paid_until`).**

This keeps the Part 1 approval gate intact and layers payment on top. A
`rejected` user and an `expired` user are different records with different admin
handling, notifications, and dashboard treatment — even though, per the app
constraint, both surface the same user-facing screen (§6).

Approaches B (single `users.status` enum with an added `expired`) and C (reuse
the MercadoPago `subscriptions` table for manual transfers) were considered and
rejected: B conflates approval with payment and can't cleanly model an
`expiring` grace window; C mixes manual and automated billing in one table. The
MercadoPago table is instead preserved untouched as the future seam (§8).

---

## 3. Data model

Two new tables. Migration `029_memberships.sql` (additive, non-destructive).

### 3.1 `memberships` — one current period per athlete

```sql
CREATE TABLE memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'expired'
                  CHECK (status IN ('active','expiring','expired','cancelled')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  paid_until    timestamptz,            -- access end; NULL = no active period
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memberships_paid_until ON memberships(paid_until);
CREATE INDEX idx_memberships_status ON memberships(status);
```

- One row per athlete (UNIQUE `user_id`); it tracks the *current* period.
  Historical periods are reconstructable from `payments`.
- `status` is **derived** from `paid_until` by the cron (§5); it is a cached,
  queryable view of the date, not an independent source of truth. `paid_until`
  is authoritative.

### 3.2 `payments` — immutable ledger

```sql
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_at       date NOT NULL,                  -- when the athlete paid
  amount        numeric(12,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'ARS',
  method        text NOT NULL DEFAULT 'transfer'
                  CHECK (method IN ('transfer','cash','mercadopago','other')),
  reference     text,                            -- transfer note / receipt id
  covers_until  timestamptz NOT NULL,           -- the paid_until this payment set
  recorded_by   uuid REFERENCES users(id),      -- admin who logged it
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
```

- Append-only. Each row records one payment and the `paid_until` it produced, so
  the period history is auditable.
- `method` already includes `mercadopago` so the future automated processor
  writes to the same ledger (§8).

### 3.3 Backfill — do not break existing approved athletes

Existing `approved` athletes have no membership row and must **not** lose access.
The migration backfills them with an open-ended active membership:

```sql
INSERT INTO memberships (user_id, status, started_at, paid_until)
SELECT id, 'active', now(), 'infinity'::timestamptz
FROM users
WHERE role = 'athlete' AND status = 'approved'
ON CONFLICT (user_id) DO NOTHING;
```

`paid_until = 'infinity'` means "active until an admin sets a real date" — the
gate treats `now() <= 'infinity'` as always active. Admins migrate athletes onto
real dates as they register the next payment. No existing athlete is locked out
on deploy.

---

## 4. Account lifecycle

```
                 register payment (admin)
   (no membership) ───────────────► active
        ▲                              │  cron: paid_until - now() <= GRACE_DAYS
        │ register payment             ▼
   cancelled ◄── admin cancels ──── expiring
        ▲                              │  cron: now() > paid_until
        │ register payment             ▼
        └────────────────────────── expired
                register payment (reactivation)
```

- **active** — `now() <= paid_until` and more than `GRACE_DAYS` (e.g. 7) remain.
- **expiring** — within `GRACE_DAYS` of `paid_until`. Still has access; triggers
  a renewal-reminder email. Surfaced in the admin dashboard.
- **expired** — `now() > paid_until`. **Access denied at login.** Triggers an
  expired email once.
- **cancelled** — admin explicitly ended it (e.g. athlete quit). Access denied.
  Distinct from expired so the dashboard can separate "lapsed, chase them" from
  "gone".
- **reactivated** — not a stored state; registering a payment on an
  expired/cancelled membership moves it back to `active` with a new `paid_until`.

`rejected` lives entirely on `users.status` and is independent of this machine.

---

## 5. Enforcement

### 5.1 Login gate (`auth.service.ts login()`)

Extend the existing gate. After the Part 1 checks:

```
invalid_credentials → email_not_verified → not_approved (status=pending)
  → rejected (status=rejected) → [NEW] payment gate
```

The payment gate (only reached when `status='approved'`):

```ts
// active iff now() <= paid_until (infinity counts as active)
const m = await getMembership(user.id);
const active = m && m.paid_until && m.paid_until > new Date();
if (!active) throw new LoginError('not_approved'); // see §6 for reason choice
```

Implemented as a single SQL join in the existing login `SELECT` (no extra round
trip): left-join `memberships` and compute `paid_until > now()`.

### 5.2 Daily cron (`src/workers/membership-cron.ts`)

New `node-cron` worker, registered in `index.ts` next to
`startNotificationCron()` / `startProgressionCron()`. Runs once daily
(e.g. 09:00 server time). Exposes `runMembershipTick(now)` for tests (mirrors
`runNotificationTick`).

Each tick, in one pass:
1. `expiring`: memberships where `active` and `paid_until` between `now()` and
   `now() + GRACE_DAYS` → set `status='expiring'`, send `membership_expiring`
   email (once — guarded by the existing `notification_log` dedupe pattern).
2. `expired`: memberships where `paid_until < now()` and `status != 'cancelled'`
   → set `status='expired'`, send `membership_expired` email (once).
3. `active`: memberships with `paid_until > now() + GRACE_DAYS` not already
   `active` (e.g. just renewed) → set `status='active'`.

The cron only **derives** `status` from `paid_until`; it never denies access on
its own (login recomputes from `paid_until`), so a missed tick can't wrongly
lock anyone out — it just delays the email and the dashboard label.

---

## 6. App-constraint: expired vs rejected reason

The app (`tr-fit-app/lib/auth.ts`) maps only `not_approved`→ACCOUNT_PENDING and
`rejected`→ACCOUNT_REJECTED; an unknown reason falls through to a generic error.
Since the app is fixed:

- **Login returns `reason: 'not_approved'` for an expired/cancelled account**,
  reusing the existing "Tu cuenta está pendiente de aprobación. Te avisamos por
  email cuando esté lista." screen — accurate enough for "renew to regain
  access," and the renewal email carries the real instruction.
- `rejected` keeps its own reason and screen.
- The **distinct** `expired`/`cancelled` state lives in `memberships.status`,
  consumed by the admin dashboard, cron, emails, and audit log.

If a dedicated expired screen is ever wanted, add `reason: 'expired'` server-side
and an `ACCOUNT_EXPIRED` handler in the app — an isolated, additive change. Out
of scope now.

---

## 7. Admin workflow

### 7.1 Register payment (the one action)

`POST /api/admin/users/:id/payments`

```jsonc
// body
{ "amount": 25000, "currency": "ARS", "method": "transfer",
  "paid_at": "2026-06-01", "reference": "transf #1234",
  "period_days": 30 }   // or explicit "covers_until": "<iso>"
```

In one transaction:
1. Insert a `payments` row.
2. Upsert the athlete's `memberships`: extend `paid_until` (from the later of
   current `paid_until` or `now()`, + `period_days`), set `status='active'`.
3. Ensure `users.status='approved'` (covers first enable **and** reactivation —
   one button approves and funds in a single step).
4. `logAudit({ type: 'payment_registered', severity: 'brand', ... })`.

This single endpoint replaces the manual-payment role of the existing
`PUT /api/admin/users/:id/subscription` (which writes tier+status to the MP
`subscriptions` table). That endpoint and `upsertManualSubscription` /
`cancelSubscription` are **deprecated** and removed once the dashboard switches
over — the tier concept they carry no longer gates anything.

### 7.2 Cancel membership

`POST /api/admin/users/:id/membership/cancel` → `status='cancelled'`,
`paid_until = now()`, audit `membership_cancelled`. Login blocks on next attempt.

### 7.3 Dashboard

The admin Users page gains a membership column/filter:
- Badge per athlete: active / expiring (N days left) / expired / cancelled /
  not approved / rejected.
- Filter "expiring soon" and "expired" lists (the chase list).
- Per-athlete payment history (from `payments`).
- The "Register payment" form (§7.1) on the user detail view.

Data source: a `membership_status` + `paid_until` field added to the existing
admin users list query (alongside the current `subscription_tier`, which is then
dropped from the UI).

---

## 8. Future-proofing — MercadoPago seam

Nothing here blocks automation later:
- The MercadoPago tables (`subscriptions`, `mp_webhook_log`), `mp.service`,
  `subscription.service`, and `/webhooks/mp` stay intact and dormant.
- When automation is switched on, the MP webhook handler simply **writes a
  `payments` row with `method='mercadopago'` and extends `memberships.paid_until`**
  — the same two operations the admin action performs. The login gate, cron,
  dashboard, and emails are payment-source-agnostic.
- No schema change is needed to adopt MercadoPago; only wiring the existing
  webhook into the membership-extension function.

---

## 9. Testing strategy (TDD)

Integration tests (Postgres `trfit_test`, existing harness):
- **migration-029**: tables exist, constraints, cascade delete, approved-athlete
  backfill produces an active `infinity` membership.
- **login payment gate**: approved + active → 200; approved + expired → 403
  `not_approved`; approved + `infinity` → 200; approved + no membership → 403;
  rejected still → 403 `rejected` (precedence preserved).
- **membership-cron** (`runMembershipTick` with injected `now`): active→expiring
  at the grace boundary; expiring→expired past `paid_until`; renewed→active;
  cancelled never auto-changes; emails sent once (dedupe).
- **register-payment endpoint**: inserts payment, extends `paid_until`, sets
  approved, audits; reactivates an expired athlete; non-admin → 403.
- **email templates**: `membership_expiring` / `membership_expired` render.

All new behavior gets a failing test first, per the repo's TDD practice.

---

## 10. Rollout / migration safety

1. Ship migration `029` (tables + backfill) — existing approved athletes get
   `infinity` memberships, so **no one loses access** on deploy.
2. Ship the login payment gate — inert for `infinity` memberships.
3. Ship the cron + emails + admin register-payment + dashboard.
4. Admins migrate athletes onto real `paid_until` dates as payments come in.
5. Remove the deprecated `PUT /users/:id/subscription` path once the dashboard
   uses register-payment.

Each step is independently reversible; the column/table additions are
non-destructive.

---

## 11. Open questions

- `GRACE_DAYS` value (proposed 7) and cron run hour — confirm with coach.
- Default `period_days` (proposed 30) — fixed, or always explicit per payment?
- Should `expiring` (still-has-access) athletes also appear to the coach via the
  existing WhatsApp support channel later? (Deferred — email + dashboard now.)
```
