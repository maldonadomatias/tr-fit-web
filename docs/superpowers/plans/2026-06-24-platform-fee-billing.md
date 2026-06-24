# Platform Fee Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard section where the admin (Tato) sees his monthly platform fee owed to the developer, and the superadmin configures the fee and applies the quarterly USD-based adjustment.

**Architecture:** New single-row config table (`platform_fee_config`) + monthly snapshot table (`platform_fee_history`). Pure math helpers (unit-tested, no DB) drive a DB-backed service. New `/platform-fee` route group (reads for admin+superadmin, writes for superadmin only). A monthly cron snapshots the closed month. New React page in the admin shell, superadmin-only controls gated client-side and server-side.

**Tech Stack:** Node 20, Express 4, PostgreSQL 15 (pg), Zod, Jest + supertest (backend); React 19, React Router 7, TanStack Query, Tailwind 4, Vitest (frontend).

## Global Constraints

- Backend & frontend are ESM (`"type": "module"`): all relative imports use the `.js` extension even from `.ts` files.
- Prettier: semicolons, single quotes, 2-space indent, 80 print width, ES5 trailing commas.
- Roles: `athlete` | `admin` | `superadmin`. `requireAdmin` = admin OR superadmin; `requireSuperadmin` = superadmin only (`backend/src/middleware/role.ts`).
- Active athlete = `users.role='athlete'` AND `users.status='approved'` AND membership active (`memberships.paid_until = 'infinity' OR paid_until > now()`).
- All monetary values ARS. `pg` returns `NUMERIC` as a string — always wrap with `Number()` when mapping rows.
- API payloads use snake_case field names (matches existing routes).
- Seed values (from presupuesto-trfit-v2): base fee 105000 @ USD 1420, current USD 1500, price/athlete 25000, share 4%, interval 3 months, next adjustment 2026-10-01.
- Migrations: SQL files in `backend/src/db/migrations/NNN_*.sql`, applied via `npm run db:migrate`; tests apply them via `ensureMigrated()`.

---

### Task 1: Pure fee-math helpers

Pure functions, no DB, no `Date.now()` (today is injected) — fully unit-testable.

**Files:**
- Create: `backend/src/services/platform-fee.math.ts`
- Test: `backend/tests/unit/platform-fee.math.test.ts`

**Interfaces:**
- Produces:
  - `interface FeeInputs { baseFeeArs: number; activeAthletes: number; pricePerAthleteArs: number; revenueSharePct: number }`
  - `interface FeeBreakdown { baseFeeArs: number; activeAthletes: number; pricePerAthleteArs: number; grossRevenueArs: number; revenueSharePct: number; revenueShareArs: number; totalArs: number }`
  - `computeFee(i: FeeInputs): FeeBreakdown`
  - `computeAdjustedBase(baseFeeArs: number, currentUsd: number, referenceUsd: number): number`
  - `addMonthsISO(isoDate: string, months: number): string`
  - `isAdjustmentDue(nextAdjustmentDate: string, todayISO: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/unit/platform-fee.math.test.ts
import {
  computeFee, computeAdjustedBase, addMonthsISO, isAdjustmentDue,
} from '../../src/services/platform-fee.math.js';

describe('computeFee', () => {
  it('computes gross, 4% share and total', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 20,
      pricePerAthleteArs: 25000, revenueSharePct: 4,
    });
    expect(r.grossRevenueArs).toBe(500000);
    expect(r.revenueShareArs).toBe(20000);
    expect(r.totalArs).toBe(125000);
  });

  it('handles zero athletes (base fee only)', () => {
    const r = computeFee({
      baseFeeArs: 105000, activeAthletes: 0,
      pricePerAthleteArs: 25000, revenueSharePct: 4,
    });
    expect(r.grossRevenueArs).toBe(0);
    expect(r.revenueShareArs).toBe(0);
    expect(r.totalArs).toBe(105000);
  });
});

describe('computeAdjustedBase', () => {
  it('scales base by usd ratio, rounded to 2 decimals', () => {
    expect(computeAdjustedBase(105000, 1500, 1420)).toBe(110915.49);
  });
  it('throws when reference usd is not positive', () => {
    expect(() => computeAdjustedBase(105000, 1500, 0)).toThrow();
  });
});

describe('addMonthsISO', () => {
  it('adds months and rolls the year', () => {
    expect(addMonthsISO('2026-10-01', 3)).toBe('2027-01-01');
  });
});

describe('isAdjustmentDue', () => {
  it('true when next date is today or past', () => {
    expect(isAdjustmentDue('2026-10-01', '2026-10-01')).toBe(true);
    expect(isAdjustmentDue('2026-10-01', '2026-12-01')).toBe(true);
  });
  it('false when next date is in the future', () => {
    expect(isAdjustmentDue('2026-10-01', '2026-06-24')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/platform-fee.math.test.ts`
Expected: FAIL — "Cannot find module '../../src/services/platform-fee.math.js'".

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/platform-fee.math.ts
export interface FeeInputs {
  baseFeeArs: number;
  activeAthletes: number;
  pricePerAthleteArs: number;
  revenueSharePct: number;
}

export interface FeeBreakdown {
  baseFeeArs: number;
  activeAthletes: number;
  pricePerAthleteArs: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  revenueShareArs: number;
  totalArs: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeFee(i: FeeInputs): FeeBreakdown {
  const grossRevenueArs = round2(i.activeAthletes * i.pricePerAthleteArs);
  const revenueShareArs = round2((grossRevenueArs * i.revenueSharePct) / 100);
  const totalArs = round2(i.baseFeeArs + revenueShareArs);
  return {
    baseFeeArs: round2(i.baseFeeArs),
    activeAthletes: i.activeAthletes,
    pricePerAthleteArs: round2(i.pricePerAthleteArs),
    grossRevenueArs,
    revenueSharePct: i.revenueSharePct,
    revenueShareArs,
    totalArs,
  };
}

export function computeAdjustedBase(
  baseFeeArs: number,
  currentUsd: number,
  referenceUsd: number
): number {
  if (referenceUsd <= 0) throw new Error('referenceUsd must be > 0');
  return round2((baseFeeArs * currentUsd) / referenceUsd);
}

export function addMonthsISO(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function isAdjustmentDue(
  nextAdjustmentDate: string,
  todayISO: string
): boolean {
  return nextAdjustmentDate <= todayISO;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/platform-fee.math.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/platform-fee.math.ts backend/tests/unit/platform-fee.math.test.ts
git commit -m "feat(billing): platform fee math helpers"
```

---

### Task 2: Database migration (config + history tables)

**Files:**
- Create: `backend/src/db/migrations/043_platform_fee.sql`

**Interfaces:**
- Produces: tables `platform_fee_config` (single row id=1, seeded) and `platform_fee_history` (unique `period`).

- [ ] **Step 1: Write the migration**

```sql
-- 043 — Platform fee billed by the developer (superadmin) to the coach (admin).
-- Distinct from billing_settings (athlete-facing payment instructions).

CREATE TABLE IF NOT EXISTS platform_fee_config (
  id                         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_fee_ars               NUMERIC(12,2) NOT NULL,
  reference_usd              NUMERIC(12,2) NOT NULL,
  current_usd                NUMERIC(12,2) NOT NULL,
  price_per_athlete_ars      NUMERIC(12,2) NOT NULL,
  revenue_share_pct          NUMERIC(5,2)  NOT NULL,
  adjustment_interval_months INT           NOT NULL DEFAULT 3,
  next_adjustment_date       DATE          NOT NULL,
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO platform_fee_config
  (id, base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
   revenue_share_pct, adjustment_interval_months, next_adjustment_date)
VALUES
  (1, 105000, 1420, 1500, 25000, 4, 3, '2026-10-01')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_fee_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period                DATE NOT NULL UNIQUE,
  base_fee_ars          NUMERIC(12,2) NOT NULL,
  active_athletes       INT NOT NULL,
  price_per_athlete_ars NUMERIC(12,2) NOT NULL,
  gross_revenue_ars     NUMERIC(14,2) NOT NULL,
  revenue_share_pct     NUMERIC(5,2)  NOT NULL,
  revenue_share_ars     NUMERIC(14,2) NOT NULL,
  total_ars             NUMERIC(14,2) NOT NULL,
  usd_at_snapshot       NUMERIC(12,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> Note: `gen_random_uuid()` is already used by earlier migrations (pgcrypto/pg15 built-in) — no extension step needed; verify it resolves when you run migrate.

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run db:migrate`
Expected: completes without error; `043_platform_fee.sql` applied.

- [ ] **Step 3: Verify the seed row**

Run: `cd backend && npm run db:migrate` again (idempotent) then verify with psql or a one-off query that `SELECT base_fee_ars, next_adjustment_date FROM platform_fee_config WHERE id=1` returns `105000.00, 2026-10-01`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/043_platform_fee.sql
git commit -m "feat(billing): platform fee config + history tables"
```

---

### Task 3: Platform fee service (DB)

DB-backed service composed from Task 1 helpers. Tested as integration (real DB) following the `tests/integration` pattern (`ensureMigrated` / `resetDatabase` / `closePool`, fixtures `createAthlete` / `createSuperadmin`).

**Files:**
- Create: `backend/src/services/platform-fee.service.ts`
- Test: `backend/tests/integration/platform-fee-service.test.ts`

**Interfaces:**
- Consumes: `computeFee`, `computeAdjustedBase`, `addMonthsISO`, `isAdjustmentDue` (Task 1); `platform_fee_config`, `platform_fee_history`, `users`, `memberships` (Task 2 + existing).
- Produces:
  - `interface PlatformFeeConfig { base_fee_ars: number; reference_usd: number; current_usd: number; price_per_athlete_ars: number; revenue_share_pct: number; adjustment_interval_months: number; next_adjustment_date: string; updated_at: string }`
  - `interface PlatformFeeSummary { base_fee_ars: number; active_athletes: number; price_per_athlete_ars: number; gross_revenue_ars: number; revenue_share_pct: number; revenue_share_ars: number; total_ars: number; next_adjustment_date: string; adjustment_due: boolean }`
  - `interface PlatformFeeHistoryRow { period: string; base_fee_ars: number; active_athletes: number; price_per_athlete_ars: number; gross_revenue_ars: number; revenue_share_pct: number; revenue_share_ars: number; total_ars: number; usd_at_snapshot: number; created_at: string }`
  - `interface UpdateConfigInput { base_fee_ars?: number; reference_usd?: number; current_usd?: number; price_per_athlete_ars?: number; revenue_share_pct?: number; adjustment_interval_months?: number; next_adjustment_date?: string }`
  - `getConfig(): Promise<PlatformFeeConfig>`
  - `updateConfig(input: UpdateConfigInput): Promise<PlatformFeeConfig>`
  - `countActiveAthletes(): Promise<number>`
  - `computeCurrent(todayISO?: string): Promise<PlatformFeeSummary>`
  - `previewAdjustment(currentUsd: number): Promise<{ new_base_fee_ars: number }>`
  - `applyAdjustment(currentUsd: number): Promise<PlatformFeeConfig>`
  - `snapshotMonth(periodISO: string): Promise<void>`
  - `getHistory(limit?: number): Promise<PlatformFeeHistoryRow[]>`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/integration/platform-fee-service.test.ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete, setMembership } from './helpers/fixtures.js';
import {
  getConfig, updateConfig, countActiveAthletes, computeCurrent,
  previewAdjustment, applyAdjustment, snapshotMonth, getHistory,
} from '../../src/services/platform-fee.service.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('platform fee service', () => {
  it('getConfig returns the seeded row', async () => {
    const c = await getConfig();
    expect(c.base_fee_ars).toBe(105000);
    expect(c.reference_usd).toBe(1420);
    expect(c.next_adjustment_date).toBe('2026-10-01');
  });

  it('countActiveAthletes counts only approved athletes with active membership', async () => {
    const coach = await createAdmin();
    await createAthlete(coach); // active membership (infinity) via fixture
    await createAthlete(coach);
    const expired = await createAthlete(coach);
    await setMembership(expired, '2000-01-01T00:00:00.000Z', 'expired');
    expect(await countActiveAthletes()).toBe(2);
  });

  it('computeCurrent applies base + 4% on gross', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await createAthlete(coach);
    const s = await computeCurrent('2026-06-24');
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(50000);
    expect(s.revenue_share_ars).toBe(2000);
    expect(s.total_ars).toBe(107000);
    expect(s.adjustment_due).toBe(false);
  });

  it('computeCurrent flags adjustment_due when the date has arrived', async () => {
    const s = await computeCurrent('2026-10-01');
    expect(s.adjustment_due).toBe(true);
  });

  it('previewAdjustment does not mutate config', async () => {
    const p = await previewAdjustment(1500);
    expect(p.new_base_fee_ars).toBe(110915.49);
    expect((await getConfig()).base_fee_ars).toBe(105000);
  });

  it('applyAdjustment scales base, rolls reference usd and bumps the date', async () => {
    const c = await applyAdjustment(1500);
    expect(c.base_fee_ars).toBe(110915.49);
    expect(c.reference_usd).toBe(1500);
    expect(c.current_usd).toBe(1500);
    expect(c.next_adjustment_date).toBe('2027-01-01');
  });

  it('updateConfig patches whitelisted fields only', async () => {
    const c = await updateConfig({ price_per_athlete_ars: 30000, revenue_share_pct: 5 });
    expect(c.price_per_athlete_ars).toBe(30000);
    expect(c.revenue_share_pct).toBe(5);
    expect(c.base_fee_ars).toBe(105000);
  });

  it('snapshotMonth is idempotent per period', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await snapshotMonth('2026-05-01');
    await snapshotMonth('2026-05-01');
    const h = await getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].period).toBe('2026-05-01');
    expect(h[0].total_ars).toBe(106000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/platform-fee-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```ts
// backend/src/services/platform-fee.service.ts
import pool from '../db/connect.js';
import {
  computeFee, computeAdjustedBase, addMonthsISO, isAdjustmentDue,
} from './platform-fee.math.js';

export interface PlatformFeeConfig {
  base_fee_ars: number;
  reference_usd: number;
  current_usd: number;
  price_per_athlete_ars: number;
  revenue_share_pct: number;
  adjustment_interval_months: number;
  next_adjustment_date: string;
  updated_at: string;
}

export interface PlatformFeeSummary {
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  next_adjustment_date: string;
  adjustment_due: boolean;
}

export interface PlatformFeeHistoryRow {
  period: string;
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  usd_at_snapshot: number;
  created_at: string;
}

export interface UpdateConfigInput {
  base_fee_ars?: number;
  reference_usd?: number;
  current_usd?: number;
  price_per_athlete_ars?: number;
  revenue_share_pct?: number;
  adjustment_interval_months?: number;
  next_adjustment_date?: string;
}

interface ConfigRow {
  base_fee_ars: string;
  reference_usd: string;
  current_usd: string;
  price_per_athlete_ars: string;
  revenue_share_pct: string;
  adjustment_interval_months: number;
  next_adjustment_date: Date | string;
  updated_at: Date | string;
}

const toISODate = (d: Date | string): string =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

function mapConfig(r: ConfigRow): PlatformFeeConfig {
  return {
    base_fee_ars: Number(r.base_fee_ars),
    reference_usd: Number(r.reference_usd),
    current_usd: Number(r.current_usd),
    price_per_athlete_ars: Number(r.price_per_athlete_ars),
    revenue_share_pct: Number(r.revenue_share_pct),
    adjustment_interval_months: Number(r.adjustment_interval_months),
    next_adjustment_date: toISODate(r.next_adjustment_date),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

const CONFIG_COLS = `base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
  revenue_share_pct, adjustment_interval_months, next_adjustment_date, updated_at`;

export async function getConfig(): Promise<PlatformFeeConfig> {
  const r = await pool.query<ConfigRow>(
    `SELECT ${CONFIG_COLS} FROM platform_fee_config WHERE id = 1`
  );
  if (!r.rows[0]) throw new Error('platform_fee_config row missing');
  return mapConfig(r.rows[0]);
}

export async function countActiveAthletes(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM users u
       JOIN memberships m ON m.user_id = u.id
      WHERE u.role = 'athlete'
        AND u.status = 'approved'
        AND (m.paid_until = 'infinity' OR m.paid_until > now())`
  );
  return Number(r.rows[0]?.n ?? 0);
}

const UPDATABLE = [
  'base_fee_ars', 'reference_usd', 'current_usd', 'price_per_athlete_ars',
  'revenue_share_pct', 'adjustment_interval_months', 'next_adjustment_date',
] as const;

export async function updateConfig(
  input: UpdateConfigInput
): Promise<PlatformFeeConfig> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of UPDATABLE) {
    const v = (input as Record<string, unknown>)[f];
    if (f in input && v !== undefined) {
      vals.push(v);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return getConfig();
  await pool.query(
    `UPDATE platform_fee_config SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`,
    vals
  );
  return getConfig();
}

export async function computeCurrent(
  todayISO?: string
): Promise<PlatformFeeSummary> {
  const cfg = await getConfig();
  const activeAthletes = await countActiveAthletes();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes,
    pricePerAthleteArs: cfg.price_per_athlete_ars,
    revenueSharePct: cfg.revenue_share_pct,
  });
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return {
    base_fee_ars: fee.baseFeeArs,
    active_athletes: fee.activeAthletes,
    price_per_athlete_ars: fee.pricePerAthleteArs,
    gross_revenue_ars: fee.grossRevenueArs,
    revenue_share_pct: fee.revenueSharePct,
    revenue_share_ars: fee.revenueShareArs,
    total_ars: fee.totalArs,
    next_adjustment_date: cfg.next_adjustment_date,
    adjustment_due: isAdjustmentDue(cfg.next_adjustment_date, today),
  };
}

export async function previewAdjustment(
  currentUsd: number
): Promise<{ new_base_fee_ars: number }> {
  const cfg = await getConfig();
  return {
    new_base_fee_ars: computeAdjustedBase(
      cfg.base_fee_ars,
      currentUsd,
      cfg.reference_usd
    ),
  };
}

export async function applyAdjustment(
  currentUsd: number
): Promise<PlatformFeeConfig> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<ConfigRow>(
      `SELECT ${CONFIG_COLS} FROM platform_fee_config WHERE id = 1 FOR UPDATE`
    );
    if (!r.rows[0]) throw new Error('platform_fee_config row missing');
    const cfg = mapConfig(r.rows[0]);
    const newBase = computeAdjustedBase(
      cfg.base_fee_ars,
      currentUsd,
      cfg.reference_usd
    );
    const nextDate = addMonthsISO(
      cfg.next_adjustment_date,
      cfg.adjustment_interval_months
    );
    await client.query(
      `UPDATE platform_fee_config
          SET base_fee_ars = $1, reference_usd = $2, current_usd = $2,
              next_adjustment_date = $3, updated_at = now()
        WHERE id = 1`,
      [newBase, currentUsd, nextDate]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getConfig();
}

export async function snapshotMonth(periodISO: string): Promise<void> {
  const cfg = await getConfig();
  const activeAthletes = await countActiveAthletes();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes,
    pricePerAthleteArs: cfg.price_per_athlete_ars,
    revenueSharePct: cfg.revenue_share_pct,
  });
  await pool.query(
    `INSERT INTO platform_fee_history
       (period, base_fee_ars, active_athletes, price_per_athlete_ars,
        gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars,
        usd_at_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (period) DO NOTHING`,
    [
      periodISO, fee.baseFeeArs, fee.activeAthletes, fee.pricePerAthleteArs,
      fee.grossRevenueArs, fee.revenueSharePct, fee.revenueShareArs,
      fee.totalArs, cfg.reference_usd,
    ]
  );
}

interface HistoryRow {
  period: Date | string;
  base_fee_ars: string;
  active_athletes: number;
  price_per_athlete_ars: string;
  gross_revenue_ars: string;
  revenue_share_pct: string;
  revenue_share_ars: string;
  total_ars: string;
  usd_at_snapshot: string;
  created_at: Date | string;
}

export async function getHistory(limit = 24): Promise<PlatformFeeHistoryRow[]> {
  const r = await pool.query<HistoryRow>(
    `SELECT period, base_fee_ars, active_athletes, price_per_athlete_ars,
            gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars,
            usd_at_snapshot, created_at
       FROM platform_fee_history
      ORDER BY period DESC
      LIMIT $1`,
    [limit]
  );
  return r.rows.map((row) => ({
    period: toISODate(row.period),
    base_fee_ars: Number(row.base_fee_ars),
    active_athletes: Number(row.active_athletes),
    price_per_athlete_ars: Number(row.price_per_athlete_ars),
    gross_revenue_ars: Number(row.gross_revenue_ars),
    revenue_share_pct: Number(row.revenue_share_pct),
    revenue_share_ars: Number(row.revenue_share_ars),
    total_ars: Number(row.total_ars),
    usd_at_snapshot: Number(row.usd_at_snapshot),
    created_at: new Date(row.created_at).toISOString(),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/platform-fee-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/platform-fee.service.ts backend/tests/integration/platform-fee-service.test.ts
git commit -m "feat(billing): platform fee service"
```

---

### Task 4: Routes + role gating

**Files:**
- Create: `backend/src/routes/platform-fee.ts`
- Modify: `backend/src/routes/index.ts` (register `/platform-fee`)
- Test: `backend/tests/integration/platform-fee.test.ts`

**Interfaces:**
- Consumes: service from Task 3; `requireAuth`, `requireAdmin`, `requireSuperadmin`; `signToken` (tests).
- Produces routes (all under `requireAuth, requireAdmin`):
  - `GET /api/platform-fee` → `{ summary, config }`
  - `GET /api/platform-fee/history` → `PlatformFeeHistoryRow[]`
  - `PUT /api/platform-fee/config` (superadmin) → `PlatformFeeConfig`
  - `PUT /api/platform-fee/dollar` (superadmin) body `{ current_usd }` → `PlatformFeeConfig`
  - `POST /api/platform-fee/adjust` (superadmin) body `{ current_usd }` → `{ config, applied }`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/integration/platform-fee.test.ts
import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createSuperadmin, createAthlete } from './helpers/fixtures.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('platform-fee routes', () => {
  it('rejects athletes', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: ath, role: 'athlete' });
    const r = await request(app)
      .get('/api/platform-fee')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('admin can read the current summary', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .get('/api/platform-fee')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.summary.active_athletes).toBe(1);
    expect(r.body.summary.total_ars).toBe(106000);
    expect(r.body.config.base_fee_ars).toBe(105000);
  });

  it('admin cannot edit config', async () => {
    const coach = await createAdmin();
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ price_per_athlete_ars: 30000 });
    expect(r.status).toBe(403);
  });

  it('superadmin edits config and applies adjustment', async () => {
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });

    const upd = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ price_per_athlete_ars: 30000 });
    expect(upd.status).toBe(200);
    expect(upd.body.price_per_athlete_ars).toBe(30000);

    const adj = await request(app)
      .post('/api/platform-fee/adjust')
      .set('Authorization', `Bearer ${tok}`)
      .send({ current_usd: 1500 });
    expect(adj.status).toBe(200);
    expect(adj.body.config.reference_usd).toBe(1500);
    expect(adj.body.config.next_adjustment_date).toBe('2027-01-01');
  });

  it('rejects invalid adjust payload', async () => {
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });
    const r = await request(app)
      .post('/api/platform-fee/adjust')
      .set('Authorization', `Bearer ${tok}`)
      .send({ current_usd: -5 });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/platform-fee.test.ts`
Expected: FAIL — 404s (route not registered).

- [ ] **Step 3: Write the router**

```ts
// backend/src/routes/platform-fee.ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, requireSuperadmin } from '../middleware/role.js';
import {
  getConfig, updateConfig, computeCurrent, getHistory,
  previewAdjustment, applyAdjustment,
} from '../services/platform-fee.service.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const [summary, config] = await Promise.all([computeCurrent(), getConfig()]);
  res.json({ summary, config });
});

router.get('/history', async (_req, res) => {
  res.json(await getHistory());
});

const configBody = z.object({
  base_fee_ars: z.number().nonnegative().optional(),
  reference_usd: z.number().positive().optional(),
  current_usd: z.number().positive().optional(),
  price_per_athlete_ars: z.number().nonnegative().optional(),
  revenue_share_pct: z.number().min(0).max(100).optional(),
  adjustment_interval_months: z.number().int().positive().optional(),
  next_adjustment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

router.put('/config', requireSuperadmin, async (req, res) => {
  const parsed = configBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  res.json(await updateConfig(parsed.data));
});

const dollarBody = z.object({ current_usd: z.number().positive() });

router.put('/dollar', requireSuperadmin, async (req, res) => {
  const parsed = dollarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  res.json(await updateConfig({ current_usd: parsed.data.current_usd }));
});

router.post('/adjust', requireSuperadmin, async (req, res) => {
  const parsed = dollarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const applied = await previewAdjustment(parsed.data.current_usd);
  const config = await applyAdjustment(parsed.data.current_usd);
  res.json({ config, applied });
});

export default router;
```

- [ ] **Step 4: Register the router**

In `backend/src/routes/index.ts`, add the import alongside the others and mount it:

```ts
import platformFee from './platform-fee.js';
```

```ts
router.use('/platform-fee', platformFee);
```

(Place the `router.use('/platform-fee', platformFee);` line before `router.use('/admin', admin);`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/platform-fee.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/platform-fee.ts backend/src/routes/index.ts backend/tests/integration/platform-fee.test.ts
git commit -m "feat(billing): platform fee routes"
```

---

### Task 5: Monthly snapshot cron

**Files:**
- Create: `backend/src/workers/platform-fee-cron.ts`
- Modify: `backend/src/index.ts` (start the cron)
- Test: `backend/tests/integration/platform-fee-cron.test.ts`

**Interfaces:**
- Consumes: `snapshotMonth`, `getHistory` (Task 3).
- Produces:
  - `previousMonthPeriod(todayISO: string): string`
  - `runPlatformFeeTick(todayISO?: string): Promise<void>`
  - `startPlatformFeeCron(): void`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/integration/platform-fee-cron.test.ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { getHistory } from '../../src/services/platform-fee.service.js';
import {
  previousMonthPeriod, runPlatformFeeTick,
} from '../../src/workers/platform-fee-cron.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('platform fee cron', () => {
  it('previousMonthPeriod returns the first of the prior month', () => {
    expect(previousMonthPeriod('2026-07-01')).toBe('2026-06-01');
    expect(previousMonthPeriod('2026-01-15')).toBe('2025-12-01');
  });

  it('runPlatformFeeTick snapshots the closed month once', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await runPlatformFeeTick('2026-07-01');
    await runPlatformFeeTick('2026-07-01');
    const h = await getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].period).toBe('2026-06-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/platform-fee-cron.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the worker**

```ts
// backend/src/workers/platform-fee-cron.ts
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { snapshotMonth } from '../services/platform-fee.service.js';

/** First day (YYYY-MM-01, UTC) of the month before todayISO. */
export function previousMonthPeriod(todayISO: string): string {
  const [y, m] = todayISO.split('-').map(Number);
  // m is 1-based; m-2 is the previous month's 0-based index.
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

export async function runPlatformFeeTick(todayISO?: string): Promise<void> {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const period = previousMonthPeriod(today);
  await snapshotMonth(period);
  logger.info({ period }, 'platform fee snapshot complete');
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startPlatformFeeCron(): void {
  if (task) return;
  // 1st of each month at 06:00 server time — snapshot the month that just closed.
  task = cron.schedule('0 6 1 * *', () => {
    runPlatformFeeTick().catch((e) =>
      logger.error({ err: e }, 'platform fee cron failed')
    );
  });
  logger.info('platform fee cron scheduled');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/platform-fee-cron.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the cron into startup**

In `backend/src/index.ts`, add the import and start it inside the existing `if (process.env.NODE_ENV !== 'test')` block:

```ts
import { startPlatformFeeCron } from './workers/platform-fee-cron.js';
```

```ts
  startPlatformFeeCron();
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/workers/platform-fee-cron.ts backend/src/index.ts backend/tests/integration/platform-fee-cron.test.ts
git commit -m "feat(billing): monthly platform fee snapshot cron"
```

---

### Task 6: Frontend data hook

**Files:**
- Create: `frontend/src/hooks/usePlatformFee.ts`

**Interfaces:**
- Consumes: `api` (`@/lib/api`), TanStack Query.
- Produces:
  - types `PlatformFeeSummary`, `PlatformFeeConfig`, `PlatformFeeHistoryRow` (snake_case, mirror the API)
  - `usePlatformFee()` → query of `{ summary, config }`
  - `usePlatformFeeHistory()` → query of `PlatformFeeHistoryRow[]`
  - `useUpdatePlatformFeeConfig()` → mutation `(patch: Partial<PlatformFeeConfig>)`
  - `useApplyAdjustment()` → mutation `(current_usd: number)`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/hooks/usePlatformFee.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlatformFeeSummary {
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  next_adjustment_date: string;
  adjustment_due: boolean;
}

export interface PlatformFeeConfig {
  base_fee_ars: number;
  reference_usd: number;
  current_usd: number;
  price_per_athlete_ars: number;
  revenue_share_pct: number;
  adjustment_interval_months: number;
  next_adjustment_date: string;
  updated_at: string;
}

export interface PlatformFeeHistoryRow {
  period: string;
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  usd_at_snapshot: number;
  created_at: string;
}

export function usePlatformFee() {
  return useQuery({
    queryKey: ['platform-fee'],
    queryFn: async () => {
      const r = await api.get<{
        summary: PlatformFeeSummary;
        config: PlatformFeeConfig;
      }>('/platform-fee');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}

export function usePlatformFeeHistory() {
  return useQuery({
    queryKey: ['platform-fee', 'history'],
    queryFn: async () => {
      const r = await api.get<PlatformFeeHistoryRow[]>('/platform-fee/history');
      return r.data;
    },
  });
}

export function useUpdatePlatformFeeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PlatformFeeConfig>) => {
      const r = await api.put<PlatformFeeConfig>('/platform-fee/config', patch);
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-fee'] }),
  });
}

export function useApplyAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (current_usd: number) => {
      const r = await api.post<{
        config: PlatformFeeConfig;
        applied: { new_base_fee_ars: number };
      }>('/platform-fee/adjust', { current_usd });
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-fee'] }),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePlatformFee.ts
git commit -m "feat(billing): platform fee data hook"
```

---

### Task 7: Frontend page, route, and sidebar link

**Files:**
- Create: `frontend/src/pages/admin/PlatformFee.tsx`
- Modify: `frontend/src/App.tsx` (import + route `/admin/platform-fee`)
- Modify: `frontend/src/components/admin/Sidebar.tsx` (link under "Panel")

**Interfaces:**
- Consumes: Task 6 hooks; `useAuth` (`@/hooks/useAuth`), `fmtARS`/`fmtShortDate` (`@/lib/format`), `Sparkline` (`@/components/admin/Sparkline`), `toast` (`sonner`).

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/pages/admin/PlatformFee.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { fmtARS, fmtShortDate } from '@/lib/format';
import { Sparkline } from '@/components/admin/Sparkline';
import {
  usePlatformFee,
  usePlatformFeeHistory,
  useUpdatePlatformFeeConfig,
  useApplyAdjustment,
} from '@/hooks/usePlatformFee';

export default function PlatformFee() {
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const { data, isLoading } = usePlatformFee();
  const { data: history } = usePlatformFeeHistory();
  const updateConfig = useUpdatePlatformFeeConfig();
  const applyAdjustment = useApplyAdjustment();

  const [usdInput, setUsdInput] = useState('');

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  }

  const { summary, config } = data;

  async function onApply() {
    const usd = Number(usdInput);
    if (!usd || usd <= 0) {
      toast.error('Ingresá un dólar válido');
      return;
    }
    const newBase = (config.base_fee_ars * usd) / config.reference_usd;
    const ok = window.confirm(
      `Nuevo fee base: ${fmtARS(Math.round(newBase))} (dólar ${usd}). ¿Aplicar?`
    );
    if (!ok) return;
    try {
      await applyAdjustment.mutateAsync(usd);
      setUsdInput('');
      toast.success('Ajuste aplicado');
    } catch {
      toast.error('No se pudo aplicar el ajuste');
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-bold">Facturación TR-FIT</h1>
        <p className="text-sm text-muted-foreground">
          Lo que se abona por el servicio este mes.
        </p>
      </div>

      {/* Hero total */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Total del mes
        </div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums">
          {fmtARS(summary.total_ars)}
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Fee base</dt>
            <dd className="tabular-nums">{fmtARS(summary.base_fee_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {summary.active_athletes} atletas × {fmtARS(summary.price_per_athlete_ars)}
            </dt>
            <dd className="tabular-nums">{fmtARS(summary.gross_revenue_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {summary.revenue_share_pct}% sobre facturación
            </dt>
            <dd className="tabular-nums">{fmtARS(summary.revenue_share_ars)}</dd>
          </div>
        </dl>
      </div>

      {/* Adjustment banner */}
      <div
        className={
          'rounded-lg border p-4 text-sm ' +
          (summary.adjustment_due
            ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/30'
            : 'border-border bg-card')
        }
      >
        <div className="font-semibold">
          {summary.adjustment_due
            ? 'Ajuste trimestral disponible'
            : 'Próximo ajuste'}
        </div>
        <div className="text-muted-foreground">
          Fecha: {fmtShortDate(summary.next_adjustment_date)} · dólar de
          referencia actual: {config.reference_usd}
        </div>

        {isSuper && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-xs text-muted-foreground">
              Dólar BNA vendedor
              <input
                type="number"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder={String(config.current_usd)}
                className="mt-1 h-9 w-32 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
              />
            </label>
            <button
              type="button"
              onClick={onApply}
              disabled={applyAdjustment.isPending}
              className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Aplicar ajuste
            </button>
          </div>
        )}
      </div>

      {/* Superadmin config editor */}
      {isSuper && (
        <ConfigEditor
          config={config}
          onSave={async (patch) => {
            try {
              await updateConfig.mutateAsync(patch);
              toast.success('Configuración guardada');
            } catch {
              toast.error('No se pudo guardar');
            }
          }}
          saving={updateConfig.isPending}
        />
      )}

      {/* History */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Historial mensual</div>
          {history && history.length >= 2 && (
            <Sparkline
              data={[...history].reverse().map((h) => h.total_ars)}
              className="text-brand"
            />
          )}
        </div>
        {!history || history.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Todavía no hay meses cerrados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-1">Mes</th>
                <th className="py-1 text-right">Atletas</th>
                <th className="py-1 text-right">Fee base</th>
                <th className="py-1 text-right">4%</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.period} className="border-t border-border">
                  <td className="py-1.5">{fmtShortDate(h.period)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {h.active_athletes}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtARS(h.base_fee_ars)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtARS(h.revenue_share_ars)}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {fmtARS(h.total_ars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ConfigEditor({
  config,
  onSave,
  saving,
}: {
  config: {
    price_per_athlete_ars: number;
    revenue_share_pct: number;
    adjustment_interval_months: number;
    next_adjustment_date: string;
    base_fee_ars: number;
  };
  onSave: (patch: Record<string, number | string>) => void;
  saving: boolean;
}) {
  const [price, setPrice] = useState(String(config.price_per_athlete_ars));
  const [pct, setPct] = useState(String(config.revenue_share_pct));
  const [base, setBase] = useState(String(config.base_fee_ars));
  const [interval, setInterval] = useState(
    String(config.adjustment_interval_months)
  );
  const [nextDate, setNextDate] = useState(config.next_adjustment_date);

  const field =
    'mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm tabular-nums';

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold">Configuración (superadmin)</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-muted-foreground">
          Fee base (ARS)
          <input
            type="number"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Precio por atleta (ARS)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          % sobre facturación
          <input
            type="number"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Intervalo de ajuste (meses)
          <input
            type="number"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Próximo ajuste (YYYY-MM-DD)
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() =>
          onSave({
            base_fee_ars: Number(base),
            price_per_athlete_ars: Number(price),
            revenue_share_pct: Number(pct),
            adjustment_interval_months: Number(interval),
            next_adjustment_date: nextDate,
          })
        }
        disabled={saving}
        className="mt-4 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Guardar
      </button>
    </div>
  );
}
```

> Verify `useAuth` exposes `user.role` (it does — used in `Sidebar.tsx`) and that `toast` imports from `sonner`. If the project re-exports toast elsewhere, match the existing import used by other pages.

- [ ] **Step 2: Add the route**

In `frontend/src/App.tsx`, add the import beside the other admin page imports:

```tsx
import AdminPlatformFee from '@/pages/admin/PlatformFee';
```

And add the route inside the admin `<Routes>` block (next to `/admin/billing`):

```tsx
<Route path="/admin/platform-fee" element={<AdminPlatformFee />} />
```

- [ ] **Step 3: Add the sidebar link**

In `frontend/src/components/admin/Sidebar.tsx`, import the `Receipt` icon from `lucide-react` (add to the existing import block):

```tsx
  Receipt,
```

Add this item to the `'Panel'` group's `items` array (after `activity`):

```tsx
        {
          key: 'platform-fee',
          label: 'Facturación TR-FIT',
          icon: Receipt,
          to: '/admin/platform-fee',
        },
```

- [ ] **Step 4: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run the app (`npm run start:dev` from root). As superadmin, open `/admin/platform-fee`: total = `fee base + 4% × (atletas × 25.000)`; edit config saves; "Aplicar ajuste" with dólar 1500 previews the new base and updates `next_adjustment_date` to `2027-01-01`. Log in as a plain `admin` and confirm the config editor and adjust input are hidden.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/PlatformFee.tsx frontend/src/App.tsx frontend/src/components/admin/Sidebar.tsx
git commit -m "feat(billing): platform fee dashboard page"
```

---

## Self-Review

**Spec coverage:**
- Billing model (base + 4% gross) → Task 1 (`computeFee`) + Task 3 (`computeCurrent`).
- Quarterly adjustment (manual USD, confirm-before-apply) → Task 1 (`computeAdjustedBase`/`addMonthsISO`) + Task 3 (`previewAdjustment`/`applyAdjustment`) + Task 4 (`POST /adjust`) + Task 7 (confirm dialog).
- `platform_fee_config` + `platform_fee_history` tables with seed → Task 2.
- Active-athlete criterion (approved + membership active) → Task 3 (`countActiveAthletes`).
- Routes with admin-read / superadmin-write gating → Task 4.
- Monthly snapshot cron (idempotent) → Task 5.
- Frontend page (hero, breakdown, banner, history, superadmin editor) → Tasks 6–7.
- Role-gated UI (admin read-only, superadmin controls) → Task 7 (`isSuper`) + Task 4 (server enforcement).
- Out of scope (Apple netting, USD API, auto-adjust, tiers, add-ons) → not implemented, as specified.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** API summary/config/history are snake_case end-to-end; pure helpers (`FeeBreakdown`) are camelCase and only used inside `platform-fee.service.ts`, which maps to snake_case in `computeCurrent`. Hook types mirror the API exactly. `signToken({ id, role })` matches the existing usage in `tests/integration/admin-user-status.test.ts`.
