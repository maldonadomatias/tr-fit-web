# Platform Fee Billing — Design

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Problem

The developer (superadmin) bills the gym owner / coach (admin role, "Tato") a monthly
platform fee for running the TR-FIT app. Today this is tracked off-platform. We want a
section inside the admin dashboard where:

- The **admin** (Tato) sees, read-only, how much he owes for the current month.
- The **superadmin** (developer) configures the fee parameters and applies the quarterly
  fee-base adjustment.

This is a single-tenant deployment (one coach, many athletes). See
[2026-05-13-single-coach-owner-model-design.md](2026-05-13-single-coach-owner-model-design.md).

## Billing model

Fee charged to the admin each month:

```
active_athletes  = users.role = 'athlete'
                   AND users.status = 'approved'
                   AND membership active (paid_until > NOW(), with grace)
gross_revenue    = active_athletes * price_per_athlete_ars        (seed 25.000)
revenue_share    = gross_revenue * revenue_share_pct / 100        (seed 4%)
fee_total        = base_fee_ars + revenue_share
```

The active-athlete criterion matches the existing MRR query in
`backend/src/services/admin.service.ts:484`. The 4% is computed on the **gross**
(`active_athletes * price_per_athlete_ars`) — no Apple-commission netting (the original
proposal mentioned netting iOS revenue, but per-athlete payment platform is not tracked
today; explicitly out of scope).

### Quarterly base-fee adjustment

The base fee tracks the official USD (BNA vendedor). Every `adjustment_interval_months`
(seed 3) the superadmin enters the current dollar and confirms an adjustment:

```
new_base_fee   = base_fee_ars * (current_usd / reference_usd)
then:
  reference_usd        <- current_usd
  next_adjustment_date <- next_adjustment_date + interval months
  base_fee_ars         <- new_base_fee
```

The dollar is entered **manually** by the superadmin (no external API). The adjustment is
**not automatic**: the panel surfaces a banner when `next_adjustment_date` is reached, shows
the previewed new base fee, and the superadmin confirms before it is applied.

Seed values reflect the proposal (presupuesto-trfit-v2): base fee at dollar 1420, current
dollar 1500, first adjustment due 2026-10-01.

## Data model

New migration `backend/src/db/migrations/043_platform_fee.sql`. Names are prefixed
`platform_fee_*` to avoid collision with the existing `billing_settings` table (which holds
athlete-facing payment instructions — a different concept).

### `platform_fee_config` (single row, `id = 1` CHECK)

| column | type | seed | notes |
|---|---|---|---|
| id | INT PK CHECK (id=1) | 1 | |
| base_fee_ars | NUMERIC(12,2) | 105000 | current base fee |
| reference_usd | NUMERIC(12,2) | 1420 | dollar at which base_fee was last set |
| current_usd | NUMERIC(12,2) | 1500 | latest dollar entered (for adjustment preview) |
| price_per_athlete_ars | NUMERIC(12,2) | 25000 | flat, no plans |
| revenue_share_pct | NUMERIC(5,2) | 4 | |
| adjustment_interval_months | INT | 3 | |
| next_adjustment_date | DATE | 2026-10-01 | |
| updated_at | TIMESTAMPTZ | now() | |

### `platform_fee_history` (one row per snapshotted month)

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| period | DATE UNIQUE | first day of the month |
| base_fee_ars | NUMERIC(12,2) | base fee at snapshot |
| active_athletes | INT | |
| price_per_athlete_ars | NUMERIC(12,2) | |
| gross_revenue_ars | NUMERIC(14,2) | |
| revenue_share_pct | NUMERIC(5,2) | |
| revenue_share_ars | NUMERIC(14,2) | |
| total_ars | NUMERIC(14,2) | |
| usd_at_snapshot | NUMERIC(12,2) | reference_usd at snapshot |
| created_at | TIMESTAMPTZ | |

The current (not-yet-closed) month is computed live; past months come from history.

## Backend

New service `backend/src/services/platform-fee.service.ts`:

- `getConfig()` — read single-row config.
- `updateConfig(patch)` — superadmin edits config fields (price, pct, interval, dates).
- `countActiveAthletes()` — reuse the MRR active-athlete query.
- `computeCurrent()` — live calc for the current month: returns
  `{ base_fee_ars, active_athletes, price_per_athlete_ars, gross_revenue_ars,
     revenue_share_pct, revenue_share_ars, total_ars, next_adjustment_date,
     adjustment_due: boolean }`.
- `previewAdjustment(current_usd)` — returns the would-be `new_base_fee` without writing.
- `applyAdjustment(current_usd)` — superadmin confirms: recompute base, roll
  `reference_usd <- current_usd`, bump `next_adjustment_date += interval`. Atomic.
- `snapshotMonth(period)` — idempotent insert of a history row for a month (ON CONFLICT
  (period) DO NOTHING).
- `getHistory(limit?)` — list past snapshots, newest first.

New worker `backend/src/workers/platform-fee-cron.ts` — on the 1st of each month, snapshot
the just-closed month. Follows the pattern of
`backend/src/workers/membership-cron.ts`.

New routes file `backend/src/routes/platform-fee.ts`, registered in
`backend/src/app.ts`. All under `requireAuth`:

| method + path | role | purpose |
|---|---|---|
| GET `/platform-fee` | admin or superadmin | current month compute + config (config echo for superadmin context) + adjustment_due flag |
| GET `/platform-fee/history` | admin or superadmin | history rows |
| PUT `/platform-fee/config` | superadmin | edit config (price, pct, interval, base_fee, dates) |
| PUT `/platform-fee/dollar` | superadmin | set `current_usd` (no recompute) |
| POST `/platform-fee/adjust` | superadmin | body `{ current_usd }` → apply quarterly adjustment |

Reuse `requireAdmin` (admin OR superadmin) for reads; `requireSuperadmin` for writes.
Zod schemas in `backend/src/domain/schemas.ts`.

## Frontend

New page `frontend/src/pages/admin/PlatformFee.tsx`, linked from
`frontend/src/components/admin/Sidebar.tsx` under the "Panel" group, label
**"Facturación TR-FIT"**. New hook `frontend/src/hooks/usePlatformFee.ts`.

Layout:

- **Hero card:** total of the current month, with breakdown rows: base fee, active athletes
  × price, 4% share.
- **Adjustment banner:** shown when `adjustment_due` (or near `next_adjustment_date`).
  Admin sees an informational note; superadmin sees the dollar input + "Aplicar ajuste"
  button that previews the new base before confirming.
- **History:** table + simple line chart of `total_ars` per month (reuse existing chart
  components used on the admin Dashboard).
- **Config editor (superadmin only):** edit price per athlete, revenue share %, interval,
  next adjustment date, and current/reference dollar.

Admin sees everything read-only except nothing editable; superadmin sees the editor and
adjustment controls.

## Error handling

- Config is guaranteed single-row by the migration seed; service reads `id = 1` and errors
  loudly if missing.
- `applyAdjustment` / `updateConfig` validate positive numbers (Zod) and run in a
  transaction.
- Role gating enforced server-side; the frontend hides superadmin controls but the API is
  the source of truth.
- Snapshot is idempotent (unique `period`); re-running the cron is safe.

## Testing

- Unit `backend/tests/unit/platform-fee.service.test.ts`: `computeCurrent` math,
  `previewAdjustment` / `applyAdjustment` math (dollar ratio), interval date bump,
  snapshot idempotency.
- Integration `backend/tests/integration/platform-fee.test.ts`: route role gating (athlete
  forbidden, admin read-only, superadmin full), GET current, PUT config, POST adjust,
  history listing.

## Out of scope

- Apple/MercadoPago commission netting for the 4% base.
- Automatic dollar fetch from an external API.
- Fully automatic (unattended) quarterly adjustment.
- Per-athlete plan tiers for the share calc (flat 25.000 only).
- Add-on module fees (nutrition, store, etc. from the proposal).
