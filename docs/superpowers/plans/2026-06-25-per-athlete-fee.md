# Per-Athlete Monthly Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Compute the platform 4% from a per-athlete monthly fee the admin maintains in the web panel, with an audit log of changes.

**Architecture:** Add `athlete_profiles.monthly_fee_ars` (default 25000). Gross revenue = SUM of active athletes' fees. Fee changes logged via the existing `admin_audit_log`/`logAudit()`. Replace the flat `count × price` math with the summed gross.

**Tech Stack:** Node/Express/Postgres (pg, Zod, Jest+supertest); React 19, TanStack Query, Tailwind, Vitest.

## Global Constraints

- ESM: relative imports use `.js` extension in `.ts`. Prettier: 2-space, single quotes, semicolons, 80 cols, ES5 trailing commas.
- Roles: `requireAdmin` = admin OR superadmin; `requireSuperadmin` = superadmin only.
- Active athlete = `users.role='athlete'` AND `users.status='approved'` AND `(memberships.paid_until='infinity' OR paid_until > now())`.
- `pg` returns NUMERIC as string → wrap with `Number()` when mapping.
- API payloads snake_case.
- Test DB: default `postgres://postgres:postgres@localhost:5432/trfit_test` (running, migrated). jest.setup wires it — set no env. Run ONLY named test files (repo has unrelated WIP breakage elsewhere).
- `req.user` is `{ id, role }` (no email) — use `req.user.id` as the audit actor.
- `resetDatabase()` in `tests/integration/helpers/test-db.ts` already resets platform-fee tables; `createAthlete` fixture inserts athlete_profiles and an active membership, and athletes default to `status='approved'`.

---

### Task 1: monthly_fee_ars column + admin set route

**Files:**
- Create: `backend/src/db/migrations/045_athlete_monthly_fee.sql`
- Modify: `backend/src/services/admin.service.ts` (getUser SELECT + AdminUserRow + new `setAthleteMonthlyFee`)
- Modify: `backend/src/routes/admin.ts` (new route)
- Test: `backend/tests/integration/athlete-fee.test.ts`

**Interfaces:**
- Produces: `setAthleteMonthlyFee(athleteId: string, feeArs: number, actor: string): Promise<number>`; `AdminUserRow.monthly_fee_ars: number | null`; route `PUT /api/admin/users/:id/monthly-fee` body `{ monthly_fee_ars: number }`.

- [ ] **Step 1: Write the migration**

```sql
-- 045 — Per-athlete monthly fee (cuota). Drives the platform 4% revenue share.
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS monthly_fee_ars NUMERIC(10,2) NOT NULL DEFAULT 25000;
```

- [ ] **Step 2: Apply it to dev + test DBs**

Run: `cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/trfit_test npx tsx src/db/migrate.ts`
Expected: "Executed migration: 045_athlete_monthly_fee.sql".
(Dev DB on :5433 may be offline; that's fine — it applies on next app boot.)

- [ ] **Step 3: Write the failing test**

```ts
// backend/tests/integration/athlete-fee.test.ts
import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { getUser, setAthleteMonthlyFee } from '../../src/services/admin.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('athlete monthly fee', () => {
  it('defaults to 25000 and getUser returns it', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const u = await getUser(ath);
    expect(u?.monthly_fee_ars).toBe(25000);
  });

  it('setAthleteMonthlyFee updates and writes an audit row', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const v = await setAthleteMonthlyFee(ath, 28000, coach);
    expect(v).toBe(28000);
    expect((await getUser(ath))?.monthly_fee_ars).toBe(28000);
    const log = await pool.query(
      `SELECT meta FROM admin_audit_log
        WHERE type = 'athlete_fee_changed' AND target_id = $1`,
      [ath]
    );
    expect(log.rowCount).toBe(1);
    expect(Number(log.rows[0].meta.from)).toBe(25000);
    expect(Number(log.rows[0].meta.to)).toBe(28000);
  });

  it('PUT /admin/users/:id/monthly-fee updates (admin allowed)', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 23000 });
    expect(r.status).toBe(200);
    expect(r.body.monthly_fee_ars).toBe(23000);
  });

  it('rejects non-positive fee', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 0 });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run it (expect fail)**

Run: `cd backend && npx jest tests/integration/athlete-fee.test.ts`
Expected: FAIL — `setAthleteMonthlyFee` not exported / route 404.

- [ ] **Step 5: Extend `getUser` in `admin.service.ts`**

Add `monthly_fee_ars: number | null;` to the `AdminUserRow` interface. In the `getUser` SELECT, add `ap.monthly_fee_ars` to the column list (it already LEFT JOINs `athlete_profiles ap`):

```sql
  COALESCE(ap.name, cp.name) AS name,
  ap.monthly_fee_ars AS monthly_fee_ars,
```

If `getUser` maps/normalizes rows, ensure `monthly_fee_ars` is `Number(row.monthly_fee_ars)` when present (NUMERIC → string), else null. If it returns the raw row, add a `Number(...)` coercion in the mapping.

- [ ] **Step 6: Add `setAthleteMonthlyFee` to `admin.service.ts`**

Reuse the existing `logAudit` helper in this file.

```ts
export async function setAthleteMonthlyFee(
  athleteId: string,
  feeArs: number,
  actor: string
): Promise<number> {
  const prev = await pool.query<{ monthly_fee_ars: string }>(
    `SELECT monthly_fee_ars FROM athlete_profiles WHERE user_id = $1`,
    [athleteId]
  );
  if (!prev.rows[0]) throw new Error('athlete_not_found');
  const from = Number(prev.rows[0].monthly_fee_ars);
  await pool.query(
    `UPDATE athlete_profiles SET monthly_fee_ars = $1 WHERE user_id = $2`,
    [feeArs, athleteId]
  );
  await logAudit({
    type: 'athlete_fee_changed',
    actor,
    target: 'athlete',
    target_id: athleteId,
    meta: { from, to: feeArs },
  });
  return feeArs;
}
```

- [ ] **Step 7: Add the route in `admin.ts`**

Import `setAthleteMonthlyFee` alongside the existing admin.service imports. Add (near the other `/users/:id/...` routes; all are already behind `requireAuth, requireAdmin`):

```ts
const monthlyFeeBody = z.object({ monthly_fee_ars: z.number().positive() });

router.put('/users/:id/monthly-fee', async (req, res) => {
  const parsed = monthlyFeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const value = await setAthleteMonthlyFee(
    req.params.id,
    parsed.data.monthly_fee_ars,
    req.user!.id
  );
  res.json({ monthly_fee_ars: value });
});
```

- [ ] **Step 8: Run test (expect pass)**

Run: `cd backend && npx jest tests/integration/athlete-fee.test.ts`
Expected: PASS (4/4).

- [ ] **Step 9: Commit**

```bash
git add backend/src/db/migrations/045_athlete_monthly_fee.sql backend/src/services/admin.service.ts backend/src/routes/admin.ts backend/tests/integration/athlete-fee.test.ts
git commit -m "feat(billing): per-athlete monthly fee with audit log"
```

---

### Task 2: gross from summed fees + fee-log endpoint

Depends on Task 1's migration (column must exist).

**Files:**
- Modify: `backend/src/services/platform-fee.math.ts` (computeFee takes grossRevenueArs)
- Modify: `backend/src/services/platform-fee.service.ts` (getActiveAthleteRevenue; computeCurrent/snapshot; getFeeLog)
- Modify: `backend/src/routes/platform-fee.ts` (GET /fee-log)
- Modify: `backend/tests/unit/platform-fee.math.test.ts`
- Modify: `backend/tests/integration/platform-fee-service.test.ts`
- Modify: `backend/tests/integration/platform-fee.test.ts`

**Interfaces:**
- `computeFee(i: { baseFeeArs; grossRevenueArs; revenueSharePct; activeAthletes; testflight? }): FeeBreakdown` — `FeeBreakdown` drops `pricePerAthleteArs`, keeps `activeAthletes`, `grossRevenueArs`, `revenueSharePct`, `revenueShareArs`, `baseFeeArs`, `totalArs`.
- `getActiveAthleteRevenue(): Promise<{ count: number; grossArs: number }>`
- `getFeeLog(limit?): Promise<FeeLogRow[]>` where `FeeLogRow = { id; athlete_id; athlete_name: string|null; from_ars: number; to_ars: number; actor: string; created_at: string }`
- `PlatformFeeSummary` drops `price_per_athlete_ars`.

- [ ] **Step 1: Update the math test**

Replace the `computeFee` describe block's inputs to use `grossRevenueArs` directly:

```ts
describe('computeFee', () => {
  it('computes 4% share and total from gross', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 20,
      grossRevenueArs: 500000, revenueSharePct: 4,
    });
    expect(r.revenueShareArs).toBe(20000);
    expect(r.totalArs).toBe(125000);
  });

  it('handles zero gross (base fee only)', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 0,
      grossRevenueArs: 0, revenueSharePct: 4,
    });
    expect(r.revenueShareArs).toBe(0);
    expect(r.totalArs).toBe(105000);
  });

  it('testflight: halves base and drops the 4% share', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 20,
      grossRevenueArs: 500000, revenueSharePct: 4, testflight: true,
    });
    expect(r.baseFeeArs).toBe(52500);
    expect(r.revenueShareArs).toBe(0);
    expect(r.totalArs).toBe(52500);
    expect(r.grossRevenueArs).toBe(500000);
  });
});
```

- [ ] **Step 2: Run it (expect fail)**

Run: `cd backend && npx jest tests/unit/platform-fee.math.test.ts`
Expected: FAIL (type/shape mismatch — `grossRevenueArs` not an input yet).

- [ ] **Step 3: Update `computeFee` in `platform-fee.math.ts`**

```ts
export interface FeeInputs {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  testflight?: boolean;
}

export interface FeeBreakdown {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  revenueShareArs: number;
  totalArs: number;
}

export function computeFee(i: FeeInputs): FeeBreakdown {
  const testflight = i.testflight ?? false;
  const baseFeeArs = round2(testflight ? i.baseFeeArs * 0.5 : i.baseFeeArs);
  const grossRevenueArs = round2(i.grossRevenueArs);
  const revenueShareArs = testflight
    ? 0
    : round2((grossRevenueArs * i.revenueSharePct) / 100);
  const totalArs = round2(baseFeeArs + revenueShareArs);
  return {
    baseFeeArs,
    activeAthletes: i.activeAthletes,
    grossRevenueArs,
    revenueSharePct: i.revenueSharePct,
    revenueShareArs,
    totalArs,
  };
}
```

(Leave `computeAdjustedBase`, `addMonthsISO`, `isAdjustmentDue` unchanged.)

- [ ] **Step 4: Run math test (expect pass)**

Run: `cd backend && npx jest tests/unit/platform-fee.math.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `platform-fee.service.ts`**

Drop `price_per_athlete_ars` from `PlatformFeeSummary`. Replace `countActiveAthletes` with `getActiveAthleteRevenue`, and update `computeCurrent` + `snapshotMonth` to use the summed gross. Add `getFeeLog`. Keep `price_per_athlete_ars` on `PlatformFeeConfig` (still in the table, used as documented default).

Replace the `countActiveAthletes` function with:

```ts
export async function getActiveAthleteRevenue(): Promise<{
  count: number;
  grossArs: number;
}> {
  const r = await pool.query<{ n: number; gross: string }>(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(ap.monthly_fee_ars), 0) AS gross
       FROM users u
       JOIN athlete_profiles ap ON ap.user_id = u.id
       JOIN memberships m ON m.user_id = u.id
      WHERE u.role = 'athlete'
        AND u.status = 'approved'
        AND (m.paid_until = 'infinity' OR m.paid_until > now())`
  );
  return { count: Number(r.rows[0]?.n ?? 0), grossArs: Number(r.rows[0]?.gross ?? 0) };
}
```

In `PlatformFeeSummary`, remove the `price_per_athlete_ars` line. In `computeCurrent`:

```ts
export async function computeCurrent(
  todayISO?: string
): Promise<PlatformFeeSummary> {
  const cfg = await getConfig();
  const { count, grossArs } = await getActiveAthleteRevenue();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes: count,
    grossRevenueArs: grossArs,
    revenueSharePct: cfg.revenue_share_pct,
    testflight: cfg.phase === 'testflight',
  });
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return {
    base_fee_ars: fee.baseFeeArs,
    active_athletes: fee.activeAthletes,
    gross_revenue_ars: fee.grossRevenueArs,
    revenue_share_pct: fee.revenueSharePct,
    revenue_share_ars: fee.revenueShareArs,
    total_ars: fee.totalArs,
    next_adjustment_date: cfg.next_adjustment_date,
    adjustment_due: isAdjustmentDue(cfg.next_adjustment_date, today),
    phase: cfg.phase,
  };
}
```

In `snapshotMonth`, replace the fee computation and the INSERT's `price_per_athlete_ars` value. The history table still has a `price_per_athlete_ars` column (migration 043) — write the config default there to satisfy NOT NULL:

```ts
export async function snapshotMonth(periodISO: string): Promise<void> {
  const cfg = await getConfig();
  const { count, grossArs } = await getActiveAthleteRevenue();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes: count,
    grossRevenueArs: grossArs,
    revenueSharePct: cfg.revenue_share_pct,
    testflight: cfg.phase === 'testflight',
  });
  await pool.query(
    `INSERT INTO platform_fee_history
       (period, base_fee_ars, active_athletes, price_per_athlete_ars,
        gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars,
        usd_at_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (period) DO NOTHING`,
    [
      periodISO, fee.baseFeeArs, fee.activeAthletes, cfg.price_per_athlete_ars,
      fee.grossRevenueArs, fee.revenueSharePct, fee.revenueShareArs,
      fee.totalArs, cfg.reference_usd,
    ]
  );
}
```

Add `getFeeLog` (reads the audit table written by Task 1):

```ts
export interface FeeLogRow {
  id: string;
  athlete_id: string;
  athlete_name: string | null;
  from_ars: number;
  to_ars: number;
  actor: string;
  created_at: string;
}

export async function getFeeLog(limit = 50): Promise<FeeLogRow[]> {
  const r = await pool.query<{
    id: string;
    target_id: string;
    name: string | null;
    meta: { from?: number | string; to?: number | string } | null;
    actor: string;
    created_at: Date | string;
  }>(
    `SELECT l.id, l.target_id, l.actor, l.meta, l.created_at,
            ap.name
       FROM admin_audit_log l
       LEFT JOIN athlete_profiles ap ON ap.user_id = l.target_id
      WHERE l.type = 'athlete_fee_changed'
      ORDER BY l.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    athlete_id: row.target_id,
    athlete_name: row.name,
    from_ars: Number(row.meta?.from ?? 0),
    to_ars: Number(row.meta?.to ?? 0),
    actor: row.actor,
    created_at: new Date(row.created_at).toISOString(),
  }));
}
```

Remove the now-unused `countActiveAthletes` export if nothing else references it (grep first: `grep -rn countActiveAthletes backend/src backend/tests`). If other code uses it, keep it.

- [ ] **Step 6: Add the `/fee-log` route in `platform-fee.ts`**

Import `getFeeLog` and add (under the existing `requireAuth, requireAdmin` mount):

```ts
router.get('/fee-log', async (_req, res) => {
  res.json(await getFeeLog());
});
```

- [ ] **Step 7: Update the service + route integration tests**

In `tests/integration/platform-fee-service.test.ts`, the "computeCurrent applies base + 4% on gross" and "testflight" tests currently rely on flat 25000 — with the default fee also 25000 they still hold, but assertions that reference `price_per_athlete_ars` on the summary must be removed, and gross now comes from summed fees. Update the relevant tests:

```ts
  it('computeCurrent sums per-athlete fees for the 4%', async () => {
    const coach = await createAdmin();
    const a1 = await createAthlete(coach);
    const a2 = await createAthlete(coach);
    await setAthleteMonthlyFee(a1, 23000, coach);
    await setAthleteMonthlyFee(a2, 28000, coach);
    const s = await computeCurrent('2026-06-24');
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(51000);
    expect(s.revenue_share_ars).toBe(2040);
    expect(s.total_ars).toBe(107040);
  });
```

Import `setAthleteMonthlyFee` from `admin.service.js` at the top of that test file. Remove/adjust any existing assertion reading `s.price_per_athlete_ars`. In `tests/integration/platform-fee.test.ts`, remove assertions on `summary.price_per_athlete_ars` if present (the "admin can read" test asserts `base_fee_ars` and `total_ars` — keep those; with two default-25000 athletes gross=50000 so total stays 107000 — verify and keep). Add a fee-log route check:

```ts
  it('exposes the fee-change log to admin', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 26000 });
    const r = await request(app)
      .get('/api/platform-fee/fee-log')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body[0].to_ars).toBe(26000);
  });
```

- [ ] **Step 8: Run all platform-fee + athlete-fee backend suites**

Run: `cd backend && npx jest tests/unit/platform-fee.math.test.ts tests/integration/platform-fee-service.test.ts tests/integration/platform-fee.test.ts tests/integration/platform-fee-cron.test.ts tests/integration/athlete-fee.test.ts`
Expected: all PASS. Fix root causes if not (assertions here are correct).

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/platform-fee.math.ts backend/src/services/platform-fee.service.ts backend/src/routes/platform-fee.ts backend/tests/unit/platform-fee.math.test.ts backend/tests/integration/platform-fee-service.test.ts backend/tests/integration/platform-fee.test.ts
git commit -m "feat(billing): compute 4% from summed per-athlete fees"
```

---

### Task 3: Frontend — cuota editor, gross breakdown, fee log

**Files:**
- Create: `frontend/src/hooks/useSetMonthlyFee.ts`
- Modify: `frontend/src/hooks/usePlatformFee.ts` (drop `price_per_athlete_ars` from summary; add `useFeeLog`)
- Modify: `frontend/src/pages/admin/UserDetail.tsx` (cuota field in Suscripción tab)
- Modify: `frontend/src/pages/admin/PlatformFee.tsx` (gross breakdown; superadmin fee-log section)

**Interfaces:**
- `useSetMonthlyFee(id)` → mutation `(monthly_fee_ars: number)`, PUT `/admin/users/:id/monthly-fee`, invalidates `['admin','user',id]` and `['platform-fee']`.
- `useFeeLog()` → query `/platform-fee/fee-log`.

- [ ] **Step 1: Create `useSetMonthlyFee.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSetMonthlyFee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (monthly_fee_ars: number) => {
      const r = await api.put<{ monthly_fee_ars: number }>(
        `/admin/users/${id}/monthly-fee`,
        { monthly_fee_ars }
      );
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
      qc.invalidateQueries({ queryKey: ['platform-fee'] });
    },
  });
}
```

- [ ] **Step 2: Update `usePlatformFee.ts`**

Remove `price_per_athlete_ars` from the `PlatformFeeSummary` interface. Add a fee-log type + hook:

```ts
export interface FeeLogRow {
  id: string;
  athlete_id: string;
  athlete_name: string | null;
  from_ars: number;
  to_ars: number;
  actor: string;
  created_at: string;
}

export function useFeeLog() {
  return useQuery({
    queryKey: ['platform-fee', 'fee-log'],
    queryFn: async () => {
      const r = await api.get<FeeLogRow[]>('/platform-fee/fee-log');
      return r.data;
    },
  });
}
```

(`PlatformFeeConfig` keeps `price_per_athlete_ars`.)

- [ ] **Step 3: Update the PlatformFee breakdown**

In `frontend/src/pages/admin/PlatformFee.tsx`, the breakdown row currently reads
`{summary.active_athletes} atletas × {fmtARS(summary.price_per_athlete_ars)}` with
value `summary.gross_revenue_ars`. Replace the `<dt>` label so it no longer uses
`price_per_athlete_ars` (which no longer exists on the summary):

```tsx
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {summary.active_athletes} atletas activos (facturado)
            </dt>
            <dd className="tabular-nums">{fmtARS(summary.gross_revenue_ars)}</dd>
          </div>
```

- [ ] **Step 4: Add the superadmin fee-log section**

In the same file, import `useFeeLog` from the hook, call it at the top
(`const { data: feeLog } = useFeeLog();`), and render this block inside the
`{isSuper && ( ... )}` area (e.g. just after the ConfigEditor):

```tsx
      {isSuper && feeLog && feeLog.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 text-sm font-semibold">
            Cambios de cuota recientes
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-1">Alumno</th>
                <th className="py-1 text-right">De</th>
                <th className="py-1 text-right">A</th>
                <th className="py-1 text-right">Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {feeLog.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="py-1.5">{f.athlete_name ?? f.athlete_id.slice(0, 8)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtARS(f.from_ars)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtARS(f.to_ars)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {fmtShortDate(f.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

(`fmtShortDate` is already imported in this file.)

- [ ] **Step 5: Add the cuota editor in UserDetail**

In `frontend/src/pages/admin/UserDetail.tsx`:
1. Import the hook: `import { useSetMonthlyFee } from '@/hooks/useSetMonthlyFee';`
2. The `AdminUserRow` type the page consumes now includes `monthly_fee_ars: number | null` (backend Task 1). If the page has a local TS type for the user, add that field.
3. In the **Suscripción tab** (near the tier/price display, ~line 723), add an editable cuota field. Use local state seeded from `user.monthly_fee_ars ?? 25000`, the `useSetMonthlyFee(user.id)` mutation, and `toast` (already used in this file) for feedback:

```tsx
{/* Cuota mensual — drives the platform 4% */}
<div className="flex flex-col gap-1">
  <label className="text-xs text-muted-foreground">Cuota mensual (ARS)</label>
  <div className="flex items-center gap-2">
    <input
      type="number"
      value={cuota}
      onChange={(e) => setCuota(e.target.value)}
      className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
    />
    <button
      type="button"
      disabled={setFee.isPending}
      onClick={async () => {
        const v = Number(cuota);
        if (!v || v <= 0) { toast.error('Cuota inválida'); return; }
        try { await setFee.mutateAsync(v); toast.success('Cuota actualizada'); }
        catch { toast.error('No se pudo actualizar'); }
      }}
      className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      Guardar
    </button>
  </div>
</div>
```

Declare near the tab component's other hooks/state:
```tsx
const setFee = useSetMonthlyFee(user.id);
const [cuota, setCuota] = useState(String(user.monthly_fee_ars ?? 25000));
```
Place these consistently with how the existing SuscripcionTab receives `user` and declares state. If the tab is a separate component receiving `user` as a prop, declare them inside it.

- [ ] **Step 6: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no new type errors (pre-existing unrelated WIP errors may show — confirm none reference useSetMonthlyFee, useFeeLog, PlatformFee, or UserDetail's new code), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useSetMonthlyFee.ts frontend/src/hooks/usePlatformFee.ts frontend/src/pages/admin/PlatformFee.tsx frontend/src/pages/admin/UserDetail.tsx
git commit -m "feat(billing): per-athlete cuota editor and fee-change log UI"
```

---

## Self-Review

**Spec coverage:**
- `monthly_fee_ars` column (default 25000) → Task 1 Step 1.
- Admin sets per-athlete fee + audit via `logAudit` → Task 1 Steps 6–7.
- `getUser` exposes the fee → Task 1 Step 5.
- Gross = SUM of active athletes' fees → Task 2 Step 5 (`getActiveAthleteRevenue`).
- `computeFee` uses gross directly; TestFlight preserved → Task 2 Step 3.
- Fee-log endpoint (reuses admin_audit_log) → Task 2 Steps 5–6.
- Cuota editor in UserDetail → Task 3 Step 5.
- Gross breakdown + superadmin fee-log UI → Task 3 Steps 3–4.
- No mobile payment registration; trust mitigations (audit + existing snapshot lock) → satisfied by design, nothing added to mobile.

**Placeholder scan:** none — concrete code/commands throughout.

**Type consistency:** `computeFee` input/output updated in lockstep with callers (`computeCurrent`, `snapshotMonth`) and the math test. `PlatformFeeSummary` drops `price_per_athlete_ars` on both backend and frontend (Task 2 Step 5 + Task 3 Step 2); the PlatformFee page stops referencing it (Task 3 Step 3). `FeeLogRow` shape identical in service, route, and hook. `setAthleteMonthlyFee(id, fee, actor)` signature matches its route caller and test usage.
