# Per-Athlete Monthly Fee — Design

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation
**Extends:** [2026-06-24-platform-fee-billing-design.md](2026-06-24-platform-fee-billing-design.md)

## Problem

The platform fee's 4% revenue share is currently computed as
`active_athletes × 25.000 (flat) × 4%`. In reality athletes pay different
amounts (friends 23k, discounts 25/26k, others 28k). Payments are handled
manually on the coach's (admin) side and must NOT move into the mobile app. So
the 4% must be computed from a per-athlete monthly fee that the admin maintains
in the web panel.

The superadmin (developer) cannot fully verify the amounts the admin enters —
this is a trust-based contract. The design therefore adds accountability, not
enforcement: every fee change is logged, and the existing monthly snapshot
already freezes each closed month so past 4% cannot be altered retroactively.

## Decisions

- **Per-athlete fee** stored on `athlete_profiles.monthly_fee_ars`, defaulting to
  25.000 so existing athletes are unchanged. Editable by admin or superadmin in
  the web panel.
- **Gross revenue** = `SUM(monthly_fee_ars)` over active athletes (approved +
  active membership), replacing `count × flat`.
- **Change log** reuses the existing `admin_audit_log` table (type
  `athlete_fee_changed`, meta `{from, to}`) — no new table.
- **No mobile payment registration.** Manual payments stay off-app.
- `platform_fee_config.price_per_athlete_ars` is kept only as the documented
  default for reference; it no longer drives the gross calculation.

## Data model

Migration `backend/src/db/migrations/045_athlete_monthly_fee.sql`:

```sql
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS monthly_fee_ars NUMERIC(10,2) NOT NULL DEFAULT 25000;
```

Fee-change audit reuses `admin_audit_log` (migration 022) via the existing
`logAudit()` helper — `type='athlete_fee_changed'`, `actor=<admin email/id>`,
`target_id=<athlete id>`, `meta={from, to}`.

## Backend

- **`admin.service.getUser`**: add `ap.monthly_fee_ars` to the SELECT and
  `monthly_fee_ars: number | null` to `AdminUserRow`.
- **`admin.service.setAthleteMonthlyFee(athleteId, feeArs, actor)`**: read the
  old fee, update `athlete_profiles`, call `logAudit({ type:'athlete_fee_changed',
  actor, target_id: athleteId, meta:{ from, to } })`. Returns the new value.
- **Route** `PUT /admin/users/:id/monthly-fee` (requireAdmin), body
  `{ monthly_fee_ars: number }` (zod: positive). Calls `setAthleteMonthlyFee`
  with `actor = req.user.email ?? req.user.id`.
- **`platform-fee.service`**: replace `countActiveAthletes`-based gross with
  `getActiveAthleteRevenue(): Promise<{ count: number; grossArs: number }>` —
  `SELECT COUNT(*), COALESCE(SUM(ap.monthly_fee_ars),0)` joining
  `athlete_profiles`. `computeFee` takes `grossRevenueArs` directly (no longer
  `activeAthletes × pricePerAthleteArs`). Update `computeCurrent` and
  `snapshotMonth` accordingly. TestFlight behaviour (50% base, no share) is
  unchanged.
- **Route** `GET /platform-fee/fee-log` (requireAdmin) → recent
  `athlete_fee_changed` audit rows (athlete name, from, to, actor, at).

## Frontend

- **UserDetail** (`pages/admin/UserDetail.tsx`): add an editable "Cuota mensual
  (ARS)" field in the Suscripción tab, backed by a new hook
  `useSetMonthlyFee(id)` (PUT `/admin/users/:id/monthly-fee`, invalidates
  `['admin','user',id]` and `['platform-fee']`). Visible to admin + superadmin.
- **usePlatformFee**: drop `price_per_athlete_ars` from `PlatformFeeSummary`
  (gross is now authoritative); add `useFeeLog()` querying `/platform-fee/fee-log`.
- **PlatformFee page**: breakdown row shows "N atletas activos" → `gross_revenue_ars`
  (no `× price`). Add a superadmin-only "Cambios de cuota recientes" list from
  `useFeeLog`.

## Trust posture (explicit)

Not enforceable end-to-end while the admin owns the data and pays off-app.
Mitigations shipped: per-change audit log (who/when/from→to), existing monthly
snapshot locks closed months, superadmin sees the change feed to spot anomalies.
Full verification would require payments to flow through the app — explicitly
out of scope per the client.

## Out of scope

- Mobile/app payment registration.
- Athlete-facing display of their own cuota.
- Per-athlete plan tiers (single flat-per-athlete editable amount only).
- Auto-deriving new-athlete fee from config (column default 25.000 is used).
