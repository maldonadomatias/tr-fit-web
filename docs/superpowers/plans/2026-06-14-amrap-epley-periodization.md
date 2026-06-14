# AMRAP (Epley) + Periodization Resync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive a theoretical 1RM from a week-20 AMRAP set via the Epley formula (`1RM = peso × (1 + reps/30)`), and resync `periodization_config` to the updated 30-week script.

**Architecture:** A pure `epley.service.ts` computes the estimate. Week 20 becomes an AMRAP test (`is_amrap`) instead of a real 1RM test: the engine prescribes 85% of the RM10 with an `amrap` flag, the athlete posts `peso usado + reps` to `POST /athlete/amrap`, the backend stores the Epley result in `rm_tests(program_week=20)` reusing the existing RM unblock flow, and Block 3 (weeks 21–30, `rm_source=20`) consumes it. The progression gate that blocks on RM-test weeks is widened to also block on AMRAP weeks.

**Tech Stack:** Node 20, Express 4, TypeScript (ESM), PostgreSQL 15 (pg), Zod, Jest (ts-jest ESM).

**Spec:** `docs/superpowers/specs/2026-06-14-amrap-epley-periodization-design.md`

---

## File Structure

- **Create** `backend/src/services/epley.service.ts` — pure Epley estimator.
- **Create** `backend/tests/unit/epley.service.test.ts` — Epley unit tests.
- **Modify** `backend/src/services/progression-helpers.ts` — add `roundWeightForEquipment` (DRY rounding shared by pct/amrap branches).
- **Modify** `backend/tests/unit/progression-helpers.test.ts` — test `roundWeightForEquipment`.
- **Modify** `backend/src/domain/types.ts` — `PeriodizationConfig.is_amrap`, `SessionItem.flag` adds `'amrap'`.
- **Modify** `backend/src/services/engine.service.ts` — `is_amrap` branch; use `roundWeightForEquipment`.
- **Create** `backend/tests/unit/engine-amrap.test.ts` — week-20 engine branch.
- **Modify** `backend/src/services/progression.service.ts` — block gate `is_rm_test OR is_amrap`.
- **Modify** `backend/src/domain/schemas.ts` — `amrapPayload`.
- **Modify** `backend/tests/unit/onboarding-schema.test.ts` is NOT touched; **Create** `backend/tests/unit/amrap-schema.test.ts`.
- **Modify** `backend/src/services/rm.service.ts` — `recordRm` accepts optional amrap fields; add `recordAmrap`.
- **Create** `backend/tests/unit/rm-amrap.service.test.ts` — `recordAmrap` computes + stores + unblocks.
- **Modify** `backend/src/routes/athlete.ts` — `POST /athlete/amrap`.
- **Create** `backend/src/db/migrations/034_amrap_periodization.sql` — `is_amrap` column, `rm_tests` audit cols, targeted week UPDATEs.
- **Modify** `backend/src/seeds/port-periodization.ts` — source-of-truth map matches new script + `isAmrap`.
- **Create** `backend/tests/unit/periodization-seed.test.ts` — assert week values + flags.

---

## Task 1: Epley estimator (pure)

**Files:**
- Create: `backend/src/services/epley.service.ts`
- Test: `backend/tests/unit/epley.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { estimateEpley1RM } from '../../src/services/epley.service';

describe('estimateEpley1RM', () => {
  // peso × (1 + reps/30); barra/smith → roundToNearest25, else Math.round
  it.each([
    [100, 8, 'barra', 127.5],   // 126.67 → 127.5
    [100, 1, 'barra', 102.5],   // 103.33 → 102.5
    [100, 0, 'barra', 100],     // 0 reps → peso (1RM)
    [60, 10, 'maquina', 80],    // 80.0
    [62.5, 5, 'mancuerna', 73], // 72.9 → 73
    [80, 8, 'smith', 105],      // 101.3 → 100? check: 80*1.2667=101.33 → 100
  ])('%fkg × %f reps (%s) → %f', (w, r, eq, expected) => {
    expect(estimateEpley1RM(w, r, eq)).toBe(expected);
  });
});
```

Note: recompute `smith` row before committing — `80 × (1 + 8/30) = 101.33`, `roundToNearest25(101.33) = 100`. Fix the expected value to `100` if needed so the test reflects real output.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- epley.service`
Expected: FAIL — `Cannot find module '../../src/services/epley.service'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { roundToNearest25 } from './progression-helpers.js';

/**
 * Theoretical 1RM from an AMRAP set (Epley): peso × (1 + reps/30).
 * Rounds to the nearest 2.5 for barbell/smith, else to the nearest 1.
 */
export function estimateEpley1RM(
  weightUsed: number,
  reps: number,
  equipment: string,
): number {
  const raw = weightUsed * (1 + reps / 30);
  return equipment === 'barra' || equipment === 'smith'
    ? roundToNearest25(raw)
    : Math.round(raw);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- epley.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/epley.service.ts backend/tests/unit/epley.service.test.ts
git commit -m "feat: add Epley 1RM estimator"
```

---

## Task 2: Shared equipment rounding helper (DRY)

The weight-from-RM rounding (`barra/smith → roundToNearest25, else Math.round`) is duplicated in `engine.service.ts` (pct branch ~L129 and `applyOverride` ~L183). Extract it so the new AMRAP branch reuses it.

**Files:**
- Modify: `backend/src/services/progression-helpers.ts`
- Test: `backend/tests/unit/progression-helpers.test.ts`

- [ ] **Step 1: Write the failing test** (append to existing file)

```ts
import { roundWeightForEquipment } from '../../src/services/progression-helpers';

describe('roundWeightForEquipment', () => {
  it.each([
    [101.33, 'barra', 100],
    [126.67, 'smith', 127.5],
    [80.4, 'maquina', 80],
    [72.6, 'mancuerna', 73],
  ])('%f (%s) → %f', (v, eq, expected) => {
    expect(roundWeightForEquipment(v, eq)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- progression-helpers`
Expected: FAIL — `roundWeightForEquipment is not a function`.

- [ ] **Step 3: Implement** (add near `roundToNearest25` in `progression-helpers.ts`)

```ts
/** Round a computed weight per equipment: 2.5-step for barbell/smith, 1-step otherwise. */
export function roundWeightForEquipment(value: number, equipment: string): number {
  return equipment === 'barra' || equipment === 'smith'
    ? roundToNearest25(value)
    : Math.round(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- progression-helpers`
Expected: PASS.

- [ ] **Step 5: Refactor `engine.service.ts` to use it (no behavior change)**

In `backend/src/services/engine.service.ts`:
- Add to imports: `import { roundToNearest25, roundWeightForEquipment } from './progression-helpers.js';`
- Replace the pct branch rounding (currently):
```ts
const computed = rm * Number(cfg.principal_pct_rm);
const weight =
  exercise.equipment === 'barra' || exercise.equipment === 'smith'
    ? roundToNearest25(computed)
    : Math.round(computed);
```
with:
```ts
const weight = roundWeightForEquipment(rm * Number(cfg.principal_pct_rm), exercise.equipment);
```
- Replace the same pattern inside `applyOverride`:
```ts
suggested_value =
  exercise.equipment === 'barra' || exercise.equipment === 'smith'
    ? roundToNearest25(adjusted)
    : Math.round(adjusted);
```
with:
```ts
suggested_value = roundWeightForEquipment(adjusted, exercise.equipment);
```
Keep the `roundToNearest25` import only if still used elsewhere in the file; otherwise drop it.

- [ ] **Step 6: Run the full engine-related suites to verify no regression**

Run: `cd backend && npm test -- engine`
Expected: PASS (existing `engine-modality` still green).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/progression-helpers.ts backend/tests/unit/progression-helpers.test.ts backend/src/services/engine.service.ts
git commit -m "refactor: extract roundWeightForEquipment helper"
```

---

## Task 3: Types — `is_amrap` and `'amrap'` flag

**Files:**
- Modify: `backend/src/domain/types.ts`

- [ ] **Step 1: Edit `PeriodizationConfig`** — add field after `is_deload`:

```ts
export interface PeriodizationConfig {
  week_number: number;
  block_label: string;
  is_rm_test: boolean;
  is_deload: boolean;
  is_amrap: boolean;
  // ...rest unchanged
}
```

- [ ] **Step 2: Edit `SessionItem.flag`**:

```ts
  flag?: 'rm_test' | 'missing_rm' | 'amrap';
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (no consumer breaks; `is_amrap` is read in later tasks).

- [ ] **Step 4: Commit**

```bash
git add backend/src/domain/types.ts
git commit -m "feat: add is_amrap config and amrap session flag types"
```

---

## Task 4: Engine AMRAP branch

Week 20 has `pct_rm=0.85, rm_source=10, is_amrap=true, is_rm_test=false`. Prescribe 85% of RM10 with `flag:'amrap'`; if RM10 missing, `flag:'missing_rm'`. The branch must come **before** the generic `pct_rm` branch.

**Files:**
- Modify: `backend/src/services/engine.service.ts`
- Test: `backend/tests/unit/engine-amrap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

type Row = Record<string, unknown>;
const handlers: Array<(sql: string, p?: unknown[]) => { rows: Row[]; rowCount: number } | null> = [];
const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    for (const h of handlers) { const r = h(s, params); if (r) return r; }
    return { rows: [], rowCount: 0 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));
// resolveUnit hits the DB; stub it to a fixed unit.
jest.unstable_mockModule('../../src/services/equipment-units.service.js', () => ({
  resolveUnit: async () => 'kg',
}));
// No weekly overrides in this test.
jest.unstable_mockModule('../../src/services/weekly-overrides.service.js', () => ({
  applyOverridesToSlots: async (_a: string, _w: number, _d: number, slots: unknown[]) => slots,
}));

const { buildTodaySession } = await import('../../src/services/engine.service.js');

const WEEK20 = {
  week_number: 20, block_label: 'TESTEO RM', is_rm_test: false, is_deload: false,
  is_amrap: true, principal_series: 1, principal_reps: 'AMRAP', principal_descanso: '3 a 5 min',
  principal_pct_rm: 0.85, principal_rm_source: 10, principal_use_casilleros: false,
  accesorio_series: 3, accesorio_reps: '10 a 12', accesorio_descanso: '60 a 90 seg', notes: null,
};
const EX = {
  id: 7, name: 'Sentadilla', muscle_group: 'piernas', equipment: 'barra',
  movement_pattern: 'squat', is_principal: true, is_unilateral: false, level_min: 'principiante',
  contraindicated_for: [], default_increment_kg: 2.5, alternatives_ids: [],
  video_url: null, illustration_url: null, modality: 'reps', default_target: null,
};

function baseHandlers(rm10: number | null) {
  handlers.length = 0;
  handlers.push((s) => s.startsWith('SELECT current_week, rm_test_blocking')
    ? { rows: [{ current_week: 20, rm_test_blocking: false, active_skeleton_id: 'sk-1' }], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM periodization_config')
    ? { rows: [WEEK20], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM skeleton_slots')
    ? { rows: [{ id: 's1', skeleton_id: 'sk-1', day_of_week: 1, slot_index: 1, exercise_id: 7, role: 'principal', notes: null }], rowCount: 1 } : null);
  handlers.push((s) => s.startsWith('SELECT * FROM exercises')
    ? { rows: [EX], rowCount: 1 } : null);
  handlers.push((s) => s.includes('FROM athlete_exercise_weights')
    ? { rows: [], rowCount: 0 } : null);
  handlers.push((s) => s.includes('FROM rm_tests')
    ? { rows: rm10 === null ? [] : [{ exercise_id: 7, value_kg: String(rm10) }], rowCount: rm10 === null ? 0 : 1 } : null);
}

describe('buildTodaySession — week 20 AMRAP', () => {
  it('prescribes 85% of RM10 with amrap flag', async () => {
    baseHandlers(100); // RM10 = 100 → 85 → roundToNearest25(85)=85
    const items = await buildTodaySession('athlete-1', 1);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('amrap');
    expect(principal.suggested_value).toBe(85);
    expect(principal.reps).toBe('AMRAP');
  });

  it('flags missing_rm when RM10 absent', async () => {
    baseHandlers(null);
    const items = await buildTodaySession('athlete-1', 1);
    const principal = items.find((i) => i.role === 'principal')!;
    expect(principal.flag).toBe('missing_rm');
    expect(principal.suggested_value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- engine-amrap`
Expected: FAIL — first case returns `flag: undefined` (no amrap branch yet).

- [ ] **Step 3: Implement the branch** in `buildItem` (`engine.service.ts`), inside `else if (slot.role === 'principal')`, placed **before** the `else if (cfg.principal_pct_rm && cfg.principal_rm_source)` branch:

```ts
    if (cfg.is_rm_test) {
      item = baseItem(exercise, slot.role, slot.slot_index, null, unit,
        cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes, 'rm_test');
    } else if (cfg.is_amrap) {
      const rm = rmByEx.get(slot.exercise_id);
      if (!rm) {
        item = baseItem(exercise, slot.role, slot.slot_index, null, unit,
          cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes, 'missing_rm');
      } else {
        const weight = roundWeightForEquipment(rm * Number(cfg.principal_pct_rm), exercise.equipment);
        item = baseItem(exercise, slot.role, slot.slot_index, weight, unit,
          cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes, 'amrap');
      }
    } else if (cfg.principal_pct_rm && cfg.principal_rm_source) {
      // ...existing pct branch unchanged
```

Note: `rmByEx` is already populated whenever `cfg.principal_pct_rm && cfg.principal_rm_source` (week 20 satisfies both — verify the loader condition at L77 still triggers; it does). Update `baseItem`'s `flag` param type to include `'amrap'`:

```ts
function baseItem(
  ex: Exercise, role: SlotRole, slotIndex: number,
  weight: number | null, unit: 'kg' | 'ladrillos',
  series: number, reps: string, descanso: string,
  notes: string | null,
  flag?: 'rm_test' | 'missing_rm' | 'amrap',
): SessionItem {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- engine-amrap`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/engine.service.ts backend/tests/unit/engine-amrap.test.ts
git commit -m "feat: prescribe AMRAP set at 85% RM10 with amrap flag"
```

---

## Task 5: Progression gate blocks on AMRAP weeks

**Files:**
- Modify: `backend/src/services/progression.service.ts` (lines ~142–146)

- [ ] **Step 1: Edit the next-week config query + blocking calc**

Replace:
```ts
const nextCfg = await client.query<{ is_rm_test: boolean }>(
  `SELECT is_rm_test FROM periodization_config WHERE week_number = $1`,
  [toWeek],
);
const blocking = !!nextCfg.rows[0]?.is_rm_test;
```
with:
```ts
const nextCfg = await client.query<{ is_rm_test: boolean; is_amrap: boolean }>(
  `SELECT is_rm_test, is_amrap FROM periodization_config WHERE week_number = $1`,
  [toWeek],
);
const blocking = !!(nextCfg.rows[0]?.is_rm_test || nextCfg.rows[0]?.is_amrap);
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/progression.service.ts
git commit -m "feat: block progression on AMRAP test weeks"
```

---

## Task 6: `amrapPayload` schema

**Files:**
- Modify: `backend/src/domain/schemas.ts`
- Test: `backend/tests/unit/amrap-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { amrapPayload } from '../../src/domain/schemas';

describe('amrapPayload', () => {
  it('accepts valid input', () => {
    const r = amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 8 });
    expect(r.success).toBe(true);
  });
  it('rejects reps < 1', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 0 }).success).toBe(false);
  });
  it('rejects weight_used < 1', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 0, reps: 5 }).success).toBe(false);
  });
  it('rejects non-integer reps', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 8.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- amrap-schema`
Expected: FAIL — `amrapPayload` is not exported.

- [ ] **Step 3: Implement** (add after `rmPayload` in `schemas.ts`)

```ts
export const amrapPayload = z.object({
  exercise_id: z.number().int().positive(),
  weight_used: z.number().min(1).max(500),
  reps: z.number().int().min(1).max(100),
});
```
And add the type export near `RmPayload`:
```ts
export type AmrapPayload = z.infer<typeof amrapPayload>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- amrap-schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/schemas.ts backend/tests/unit/amrap-schema.test.ts
git commit -m "feat: add amrapPayload schema"
```

---

## Task 7: `recordAmrap` service

`recordRm` gains optional `amrapWeight`/`amrapReps` (stored in the new audit columns). `recordAmrap` resolves equipment, computes the Epley value, and delegates to `recordRm` with `week: 20`, reusing the unblock logic verbatim.

**Files:**
- Modify: `backend/src/services/rm.service.ts`
- Test: `backend/tests/unit/rm-amrap.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

const queries: Array<{ sql: string; params?: unknown[] }> = [];
const fakeClient = {
  async query(sql: string, params?: unknown[]) {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql: s, params });
    if (s.startsWith('SELECT equipment FROM exercises')) return { rows: [{ equipment: 'barra' }], rowCount: 1 };
    if (s.startsWith('INSERT INTO rm_tests')) return { rows: [{ id: 'rm-1' }], rowCount: 1 };
    if (s.startsWith('SELECT active_skeleton_id')) return { rows: [{ active_skeleton_id: null }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  release() {},
};
const fakePool = {
  async connect() { return fakeClient; },
  async query(sql: string) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT equipment FROM exercises')) return { rows: [{ equipment: 'barra' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));
jest.unstable_mockModule('../../src/services/equipment-units.service.js', () => ({
  resolveUnit: async () => 'kg',
}));

const { recordAmrap } = await import('../../src/services/rm.service.js');

beforeEach(() => { queries.length = 0; });

describe('recordAmrap', () => {
  it('computes Epley and stores it at week 20 with audit fields', async () => {
    // 100kg × 8 reps barra → 126.67 → roundToNearest25 → 127.5
    const out = await recordAmrap({ athleteId: 'a1', exerciseId: 7, weightUsed: 100, reps: 8 });
    expect(out.estimated1RM).toBe(127.5);
    const insert = queries.find((q) => q.sql.startsWith('INSERT INTO rm_tests'));
    expect(insert).toBeDefined();
    // params order: athlete, exercise, week(20), value_kg(127.5), unit, amrap_weight(100), amrap_reps(8)
    expect(insert!.params).toContain(20);
    expect(insert!.params).toContain(127.5);
    expect(insert!.params).toContain(100);
    expect(insert!.params).toContain(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- rm-amrap.service`
Expected: FAIL — `recordAmrap` not exported.

- [ ] **Step 3: Implement in `rm.service.ts`**

Add import at top:
```ts
import { estimateEpley1RM } from './epley.service.js';
```

Extend `RecordRmInput` and `recordRm` to accept optional amrap audit fields, and widen the INSERT. Replace the existing interface + INSERT:

```ts
export interface RecordRmInput {
  athleteId: string;
  exerciseId: number;
  valueKg: number;
  week: 10 | 20 | 30;
  amrapWeight?: number;
  amrapReps?: number;
}
```

In `recordRm`, change the INSERT to include the audit columns (NULL when not provided):
```ts
    const r = await client.query<{ id: string }>(
      `INSERT INTO rm_tests
         (athlete_id, exercise_id, program_week, value_kg, value, unit, amrap_weight, amrap_reps)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
       ON CONFLICT (athlete_id, exercise_id, program_week)
         DO UPDATE SET value_kg = EXCLUDED.value_kg,
                       value = EXCLUDED.value,
                       unit = EXCLUDED.unit,
                       amrap_weight = EXCLUDED.amrap_weight,
                       amrap_reps = EXCLUDED.amrap_reps,
                       tested_at = NOW()
       RETURNING id`,
      [input.athleteId, input.exerciseId, input.week, input.valueKg, unit,
       input.amrapWeight ?? null, input.amrapReps ?? null],
    );
```

Add `recordAmrap` at the end of the file:
```ts
export interface RecordAmrapInput {
  athleteId: string;
  exerciseId: number;
  weightUsed: number;
  reps: number;
}

/**
 * Records a week-20 AMRAP test: derives the theoretical 1RM via Epley and
 * stores it in rm_tests(program_week=20), reusing recordRm's unblock logic.
 */
export async function recordAmrap(
  input: RecordAmrapInput,
): Promise<{ rmId: string; estimated1RM: number }> {
  const exR = await pool.query<{ equipment: string }>(
    `SELECT equipment FROM exercises WHERE id = $1`,
    [input.exerciseId],
  );
  const equipment = exR.rows[0]?.equipment ?? 'barra';
  const estimated1RM = estimateEpley1RM(input.weightUsed, input.reps, equipment);
  const { rmId } = await recordRm({
    athleteId: input.athleteId,
    exerciseId: input.exerciseId,
    valueKg: estimated1RM,
    week: 20,
    amrapWeight: input.weightUsed,
    amrapReps: input.reps,
  });
  return { rmId, estimated1RM };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- rm-amrap.service`
Expected: PASS. (The test mocks `pool.query` for the equipment lookup and `pool.connect` for the transaction.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/rm.service.ts backend/tests/unit/rm-amrap.service.test.ts
git commit -m "feat: add recordAmrap deriving 1RM via Epley"
```

---

## Task 8: `POST /athlete/amrap` route

**Files:**
- Modify: `backend/src/routes/athlete.ts`

- [ ] **Step 1: Edit imports**

```ts
import { rmPayload, amrapPayload } from '../domain/schemas.js';
import { recordRm, recordAmrap } from '../services/rm.service.js';
```

- [ ] **Step 2: Add the route after the existing `/rm` handler**

```ts
router.post('/amrap', async (req, res) => {
  const parsed = amrapPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordAmrap({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    weightUsed: parsed.data.weight_used,
    reps: parsed.data.reps,
  });
  res.status(201).json(out); // { rmId, estimated1RM }
});
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/athlete.ts
git commit -m "feat: add POST /athlete/amrap endpoint"
```

---

## Task 9: Migration + seed resync

Add `is_amrap` to `periodization_config`, audit columns to `rm_tests`, and correct weeks 9/18/20/27 to the updated script (deload flags preserved). Update `port-periodization.ts` as the source of truth.

**Files:**
- Create: `backend/src/db/migrations/034_amrap_periodization.sql`
- Modify: `backend/src/seeds/port-periodization.ts`
- Test: `backend/tests/unit/periodization-seed.test.ts`

- [ ] **Step 1: Write the failing seed test**

Export the config map from the seed so it can be asserted. First add an export in `port-periodization.ts` (top of the map):
```ts
export const principal: Record<number, PrincipalCfg> = {
```
(change `const principal` → `export const principal`).

Then the test `backend/tests/unit/periodization-seed.test.ts`:
```ts
import { principal } from '../../src/seeds/port-periodization';

describe('periodization config — updated script', () => {
  it('week 9: 2×"2 a 3" @ 80% of RM30, deload preserved', () => {
    expect(principal[9]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 30, isDeload: true });
  });
  it('week 18: 2×"2 a 3" @ 80% of RM10, deload preserved', () => {
    expect(principal[18]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 10, isDeload: true });
  });
  it('week 20: AMRAP @ 85% of RM10, not an rm test', () => {
    expect(principal[20]).toMatchObject({ series: 1, reps: 'AMRAP', pct: 0.85, rmSource: 10, isAmrap: true });
    expect(principal[20].isRmTest ?? false).toBe(false);
  });
  it('week 27: 2×"2 a 3" @ 80% of RM20, deload preserved', () => {
    expect(principal[27]).toMatchObject({ series: 2, reps: '2 a 3', pct: 0.80, rmSource: 20, isDeload: true });
  });
  it('weeks 10 and 30 remain real RM tests', () => {
    expect(principal[10].isRmTest).toBe(true);
    expect(principal[30].isRmTest).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- periodization-seed`
Expected: FAIL — week 9/18/20/27 still hold old values; `isAmrap` undefined.

- [ ] **Step 3: Update `PrincipalCfg` and the map in `port-periodization.ts`**

Add to the interface:
```ts
interface PrincipalCfg {
  series: number;
  reps: string;
  descanso: string;
  pct?: number;
  rmSource?: 10 | 20 | 30;
  useCasilleros?: boolean;
  isRmTest?: boolean;
  isDeload?: boolean;
  isAmrap?: boolean;
}
```

Update the four diverging weeks (leave all others as-is):
```ts
  9:  { series: 2, reps: '2 a 3', descanso: '2 a 3 min', pct: 0.80, rmSource: 30, isDeload: true },
  18: { series: 2, reps: '2 a 3', descanso: '2 a 3 min', pct: 0.80, rmSource: 10, isDeload: true },
  20: { series: 1, reps: 'AMRAP', descanso: '3 a 5 min', pct: 0.85, rmSource: 10, isAmrap: true },
  27: { series: 2, reps: '2 a 3', descanso: '2 a 3 min', pct: 0.80, rmSource: 20, isDeload: true },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- periodization-seed`
Expected: PASS.

- [ ] **Step 5: Update the SQL generator** so future regens emit `is_amrap` and overwrite on conflict. In `port-periodization.ts`, edit `rowFor`:

- Add `const isAmrap = p.isAmrap ?? false;`
- Add `is_amrap` to the column list and `${isAmrap}` to VALUES (right after `is_deload`).
- Change the conflict clause from `ON CONFLICT (week_number) DO NOTHING;` to update the principal/flag columns (preserving `is_deload`, `block_label`, `accesorio_*`):
```ts
  ) ON CONFLICT (week_number) DO UPDATE SET
      principal_series = EXCLUDED.principal_series,
      principal_reps = EXCLUDED.principal_reps,
      principal_descanso = EXCLUDED.principal_descanso,
      principal_pct_rm = EXCLUDED.principal_pct_rm,
      principal_rm_source = EXCLUDED.principal_rm_source,
      principal_use_casilleros = EXCLUDED.principal_use_casilleros,
      is_rm_test = EXCLUDED.is_rm_test,
      is_amrap = EXCLUDED.is_amrap;`;
```

- [ ] **Step 6: Write migration `034_amrap_periodization.sql`** (hand-authored; targeted, idempotent):

```sql
-- AMRAP support: theoretical 1RM (Epley) at week 20, plus periodization resync.

ALTER TABLE periodization_config
  ADD COLUMN IF NOT EXISTS is_amrap BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rm_tests
  ADD COLUMN IF NOT EXISTS amrap_weight NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS amrap_reps INT;

-- Resync weeks that diverged from the updated 30-week script.
-- is_deload / block_label / accesorio_* are intentionally left untouched.
UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 30
WHERE week_number = 9;

UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 10
WHERE week_number = 18;

UPDATE periodization_config SET
  principal_series = 1, principal_reps = 'AMRAP', principal_descanso = '3 a 5 min',
  principal_pct_rm = 0.85, principal_rm_source = 10,
  is_rm_test = FALSE, is_amrap = TRUE
WHERE week_number = 20;

UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 20
WHERE week_number = 27;
```

- [ ] **Step 7: Run the migration against the dev/test DB**

Run: `cd backend && npm run db:migrate`
Expected: migration 034 applies cleanly; no errors. (If no DB is available in this environment, note it and rely on the seed test for coverage — the SQL is reviewed by hand.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/db/migrations/034_amrap_periodization.sql backend/src/seeds/port-periodization.ts backend/tests/unit/periodization-seed.test.ts
git commit -m "feat: add is_amrap + rm_tests audit cols and resync week 9/18/20/27"
```

---

## Task 10: Full suite + typecheck

- [ ] **Step 1: Typecheck the backend**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run new + adjacent suites**

Run: `cd backend && npm test -- epley.service progression-helpers engine amrap-schema rm-amrap.service periodization-seed`
Expected: all PASS.

- [ ] **Step 3: Run the full backend suite (note pre-existing failures)**

Run: `cd backend && npm test`
Expected: the 7 pre-existing env-dependent suites (OpenAI/Firebase) may fail as before; **no new failures** introduced by this work. Confirm the new suites are green.

- [ ] **Step 4: Final commit if anything outstanding**

```bash
git status   # should be clean
```

---

## Self-Review (completed)

- **Spec coverage:** Epley util → T1; resync → T9; types → T3; engine branch → T4; progression gate → T5; recording endpoint → T6/T7/T8; audit cols + migration → T9; tests → each task. All spec sections mapped.
- **Placeholder scan:** none — every code step shows full code; the one DB-availability caveat (T9 S7) has an explicit fallback.
- **Type consistency:** `is_amrap`/`'amrap'` flag/`roundWeightForEquipment`/`recordAmrap`/`estimateEpley1RM`/`amrapPayload` names consistent across tasks. `RecordRmInput` extended once (T7) and consumed by `recordAmrap`.
- **Note:** T1 Step 1 has a flagged arithmetic double-check (`smith` row) — recompute before committing the expected values.
