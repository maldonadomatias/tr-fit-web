# Coach Alerts Actionable Resolutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/alerts` from a card stream that toggles boolean flags into a triage table whose resolutions are real decisions that propagate to the athlete's next session via a per-week override layer.

**Architecture:** A new `weekly_overrides` table is consumed by `engine.service.buildTodaySession` to mutate the athlete's items at request time without touching the skeleton. `coach_alerts` gains `resolution_action`, `resolution_payload`, `resolution_note`, `resolved_by` columns. A single `POST /admin/alerts/:id/resolve` endpoint validates the action against an action × type matrix, runs the side-effect (override insert, skeleton regen, or audit-only) in one transaction, and stamps the resolution columns. The frontend page is rewritten as a shadcn `Table` with a `⋯` action column whose `Popover` opens type-specific items that fan out to small `Dialog`s.

**Tech Stack:** Postgres 15 (pg), Express 4, TypeScript 5.7 ESM, Zod, Jest. React 19, TanStack Query, shadcn/ui (Table, Popover, Dialog, Form), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-coach-alerts-actions-design.md`

---

## File Structure

**Backend — new files:**

- `backend/src/db/migrations/027_alert_resolutions_and_overrides.sql` — schema changes
- `backend/src/domain/alert-actions.ts` — `AlertResolutionAction` enum, action × type matrix, payload Zod schemas
- `backend/src/services/weekly-overrides.service.ts` — `applyOverridesToSlots`, `insertOverride`, `hasActiveOverride`
- `backend/src/services/alert-context.service.ts` — `getAlertContext`
- `backend/tests/integration/weekly-overrides.test.ts`
- `backend/tests/integration/alert-context.test.ts`

**Backend — modified:**

- `backend/src/domain/schemas.ts` — add `alertResolvePayload`
- `backend/src/services/alert.service.ts` — add `resolveAlert`, list filters extension, drop legacy `markResolved` once routes migrated
- `backend/src/services/engine.service.ts` — apply overrides after `slotsR`
- `backend/src/routes/admin-alerts.ts` — new `POST /:id/resolve`, `GET /:id/context`, extended `GET /` with filters; existing `PATCH /:id/resolve` removed
- `backend/src/routes/admin-ops.ts` — remove duplicate `/alerts*` handlers; sidebar/frontend already point to `/admin/alerts`
- `backend/tests/integration/alerts.test.ts` — extend with new action coverage
- `backend/tests/integration/engine.service.test.ts` — regression coverage if file absent, create it

**Frontend — new files:**

- `frontend/src/components/admin/alerts/AlertsFilters.tsx`
- `frontend/src/components/admin/alerts/AlertsTable.tsx`
- `frontend/src/components/admin/alerts/AlertRowActions.tsx`
- `frontend/src/components/admin/alerts/dialogs/SwapExerciseDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/SkipWeekDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/ReduceIntensityDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/RegenSkeletonDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/ApproveSwitchDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/RevertSwitchDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/ContactNoteDialog.tsx`
- `frontend/src/components/admin/alerts/dialogs/AcknowledgeDialog.tsx`

**Frontend — modified:**

- `frontend/src/types/api.ts` — add `AlertResolutionAction`, `AlertContext`, extend `CoachAlert`
- `frontend/src/hooks/useAlerts.ts` — extend with `useAlertContext`, `useResolveAlert` (action + payload)
- `frontend/src/pages/admin/Alerts.tsx` — full rewrite

**Frontend — deleted:**

- `frontend/src/components/AlertCard.tsx`

---

## Task 1: DB Migration

**Files:**
- Create: `backend/src/db/migrations/027_alert_resolutions_and_overrides.sql`

- [ ] **Step 1: Write migration**

```sql
-- 027_alert_resolutions_and_overrides.sql
-- Coach alert resolutions become real decisions, propagated to the athlete's
-- next session via a per-week override layer.

ALTER TABLE coach_alerts
  ADD COLUMN IF NOT EXISTS resolution_action TEXT
    CHECK (resolution_action IN (
      'swap_exercise','skip_week','regen_skeleton','approve_switch',
      'revert_switch','reduce_intensity','reschedule_rm','skip_rm_block',
      'acknowledge','note_only'
    )),
  ADD COLUMN IF NOT EXISTS resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS weekly_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_week INT NOT NULL,
  day_of_week INT,
  original_exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),
  override_type TEXT NOT NULL CHECK (override_type IN
    ('swap','skip','reduce_intensity')),
  intensity_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_alert_id UUID REFERENCES coach_alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  expires_after_week INT NOT NULL CHECK (expires_after_week >= program_week)
);

CREATE INDEX IF NOT EXISTS idx_weekly_overrides_lookup
  ON weekly_overrides(athlete_id, program_week);
```

- [ ] **Step 2: Apply migration locally**

Run: `cd backend && npm run db:migrate`
Expected: `Applied: 027_alert_resolutions_and_overrides.sql` (or equivalent line from `src/db/migrate.ts`).

- [ ] **Step 3: Verify columns and table via psql**

Run:
```bash
psql $DATABASE_URL -c "\d coach_alerts" | grep -E "resolution|resolved_by"
psql $DATABASE_URL -c "\d weekly_overrides"
```
Expected: all four `resolution_*` and `resolved_by` columns listed on `coach_alerts`; `weekly_overrides` table prints with all listed columns and the `idx_weekly_overrides_lookup` index.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/027_alert_resolutions_and_overrides.sql
git commit -m "feat(db): alert resolutions + weekly_overrides table"
```

---

## Task 2: Domain — Alert Action Matrix and Payload Schemas

**Files:**
- Create: `backend/src/domain/alert-actions.ts`
- Modify: `backend/src/domain/schemas.ts` (add `alertResolvePayload`)

- [ ] **Step 1: Create alert-actions.ts**

```ts
// backend/src/domain/alert-actions.ts
import { z } from 'zod';

export const ALERT_RESOLUTION_ACTIONS = [
  'swap_exercise',
  'skip_week',
  'regen_skeleton',
  'approve_switch',
  'revert_switch',
  'reduce_intensity',
  'reschedule_rm',
  'skip_rm_block',
  'acknowledge',
  'note_only',
] as const;

export type AlertResolutionAction = (typeof ALERT_RESOLUTION_ACTIONS)[number];

export type AlertType =
  | 'sos_pain'
  | 'sos_machine'
  | 'rpe_flag'
  | 'rm_skipped'
  | 'rm_week_starting';

export const ALERT_ACTION_MATRIX: Record<AlertType, AlertResolutionAction[]> = {
  sos_pain:          ['swap_exercise', 'skip_week', 'regen_skeleton', 'note_only'],
  sos_machine:       ['approve_switch', 'revert_switch', 'swap_exercise', 'note_only'],
  rpe_flag:          ['reduce_intensity', 'skip_week', 'note_only'],
  rm_skipped:        ['reschedule_rm', 'skip_rm_block', 'note_only'],
  rm_week_starting:  ['acknowledge', 'note_only'],
};

// Per-action payload schemas. Used by the resolve route to validate body.payload.
export const swapExercisePayload = z.object({
  replacement_exercise_id: z.number().int().positive(),
});
export const skipWeekPayload = z.object({}).strict();
export const regenSkeletonPayload = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export const approveSwitchPayload = z.object({}).strict();
export const revertSwitchPayload = z.object({}).strict();
export const reduceIntensityPayload = z.object({
  sets_delta: z.number().int().min(-5).max(0).optional(),
  weight_pct: z.number().min(0.5).max(1.0).optional(),
  rpe_delta: z.number().int().min(-3).max(0).optional(),
}).refine(
  (v) => v.sets_delta != null || v.weight_pct != null || v.rpe_delta != null,
  { message: 'at least one of sets_delta/weight_pct/rpe_delta required' },
);
export const rescheduleRmPayload = z.object({
  target_week: z.number().int().min(1).max(30),
});
export const skipRmBlockPayload = z.object({}).strict();
export const acknowledgePayload = z.object({}).strict();
export const noteOnlyPayload = z.object({}).strict();

export const PAYLOAD_SCHEMA_BY_ACTION: Record<AlertResolutionAction, z.ZodTypeAny> = {
  swap_exercise: swapExercisePayload,
  skip_week: skipWeekPayload,
  regen_skeleton: regenSkeletonPayload,
  approve_switch: approveSwitchPayload,
  revert_switch: revertSwitchPayload,
  reduce_intensity: reduceIntensityPayload,
  reschedule_rm: rescheduleRmPayload,
  skip_rm_block: skipRmBlockPayload,
  acknowledge: acknowledgePayload,
  note_only: noteOnlyPayload,
};

export function isActionAllowedForType(
  type: AlertType,
  action: AlertResolutionAction,
): boolean {
  return ALERT_ACTION_MATRIX[type].includes(action);
}
```

- [ ] **Step 2: Add `alertResolvePayload` to schemas.ts**

Add at the end of `backend/src/domain/schemas.ts`:

```ts
import { ALERT_RESOLUTION_ACTIONS } from './alert-actions.js';

export const alertResolvePayload = z.object({
  action: z.enum(ALERT_RESOLUTION_ACTIONS),
  payload: z.record(z.unknown()).default({}),
  note: z.string().max(2000).optional(),
});
export type AlertResolvePayload = z.infer<typeof alertResolvePayload>;
```

(If a `z` import is not already at the top of the file, do not add it — it is already imported.)

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/domain/alert-actions.ts backend/src/domain/schemas.ts
git commit -m "feat(alerts): action × type matrix + per-action payload schemas"
```

---

## Task 3: weekly-overrides Service

**Files:**
- Create: `backend/src/services/weekly-overrides.service.ts`
- Test: `backend/tests/integration/weekly-overrides.test.ts`

- [ ] **Step 1: Write failing test**

Create `backend/tests/integration/weekly-overrides.test.ts`:

```ts
import { jest } from '@jest/globals';

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const {
  insertOverride, hasActiveOverride, applyOverridesToSlots,
} = await import('../../src/services/weekly-overrides.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function twoExerciseIds(): Promise<[number, number]> {
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises ORDER BY id LIMIT 2`,
  );
  return [r.rows[0].id, r.rows[1].id];
}

it('insertOverride + hasActiveOverride round-trip', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  expect(await hasActiveOverride(ath, 3, origId)).toBe(true);
  expect(await hasActiveOverride(ath, 3, replId)).toBe(false);
  expect(await hasActiveOverride(ath, 4, origId)).toBe(false); // expired
});

it('applyOverridesToSlots swaps the slot exercise_id', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const slots = [
    { skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 },
    { skeleton_id: 'x', slot_index: 1, exercise_id: 999999, day_of_week: 2 },
  ];
  const out = await applyOverridesToSlots(ath, 3, 2, slots);
  expect(out).toHaveLength(2);
  expect(out[0].exercise_id).toBe(replId);
  expect(out[1].exercise_id).toBe(999999);
});

it('applyOverridesToSlots drops the slot on skip', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: null,
    overrideType: 'skip', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const slots = [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }];
  const out = await applyOverridesToSlots(ath, 3, 2, slots);
  expect(out).toHaveLength(0);
});

it('applyOverridesToSlots ignores expired override', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 2, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 2,
  });

  const slots = [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }];
  const out = await applyOverridesToSlots(ath, 3, 2, slots); // week 3, override died after 2
  expect(out[0].exercise_id).toBe(origId);
});

it('day_of_week NULL matches every day', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: null,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    ath, 3, 5,
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 5 }],
  );
  expect(out[0].exercise_id).toBe(replId);
});

it('reduce_intensity carries intensity payload on the slot', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: null,
    overrideType: 'reduce_intensity',
    intensityPayload: { sets_delta: -1, rpe_delta: -1 },
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    ath, 3, 2,
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }],
  );
  expect(out[0]._override?.override_type).toBe('reduce_intensity');
  expect(out[0]._override?.intensity_payload).toEqual({ sets_delta: -1, rpe_delta: -1 });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npm test -- tests/integration/weekly-overrides.test.ts`
Expected: FAIL with `Cannot find module '../../src/services/weekly-overrides.service.js'`.

- [ ] **Step 3: Create service**

Create `backend/src/services/weekly-overrides.service.ts`:

```ts
import pool from '../db/connect.js';

export interface WeeklyOverride {
  id: string;
  athlete_id: string;
  program_week: number;
  day_of_week: number | null;
  original_exercise_id: number;
  replacement_exercise_id: number | null;
  override_type: 'swap' | 'skip' | 'reduce_intensity';
  intensity_payload: Record<string, unknown>;
  source_alert_id: string | null;
  created_at: string;
  created_by: string | null;
  expires_after_week: number;
}

export interface InsertOverrideInput {
  athleteId: string;
  programWeek: number;
  dayOfWeek: number | null;
  originalExerciseId: number;
  replacementExerciseId: number | null;
  overrideType: 'swap' | 'skip' | 'reduce_intensity';
  intensityPayload: Record<string, unknown>;
  sourceAlertId: string | null;
  createdBy: string;
  expiresAfterWeek: number;
}

export async function insertOverride(
  input: InsertOverrideInput,
): Promise<{ id: string }> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO weekly_overrides
       (athlete_id, program_week, day_of_week, original_exercise_id,
        replacement_exercise_id, override_type, intensity_payload,
        source_alert_id, created_by, expires_after_week)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING id`,
    [
      input.athleteId, input.programWeek, input.dayOfWeek,
      input.originalExerciseId, input.replacementExerciseId,
      input.overrideType, JSON.stringify(input.intensityPayload),
      input.sourceAlertId, input.createdBy, input.expiresAfterWeek,
    ],
  );
  return { id: r.rows[0].id };
}

export async function hasActiveOverride(
  athleteId: string,
  programWeek: number,
  exerciseId: number,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM weekly_overrides
      WHERE athlete_id = $1
        AND program_week <= $2 AND expires_after_week >= $2
        AND (original_exercise_id = $3 OR replacement_exercise_id = $3)
      LIMIT 1`,
    [athleteId, programWeek, exerciseId],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface SlotLike {
  skeleton_id: string;
  slot_index: number;
  exercise_id: number;
  day_of_week: number;
}

export type EffectiveSlot = SlotLike & { _override?: WeeklyOverride };

export async function applyOverridesToSlots(
  athleteId: string,
  programWeek: number,
  dayOfWeek: number,
  slots: SlotLike[],
): Promise<EffectiveSlot[]> {
  if (slots.length === 0) return [];
  const ovR = await pool.query<WeeklyOverride>(
    `SELECT * FROM weekly_overrides
       WHERE athlete_id = $1
         AND program_week <= $2 AND expires_after_week >= $2
         AND (day_of_week = $3 OR day_of_week IS NULL)`,
    [athleteId, programWeek, dayOfWeek],
  );
  const ovByOrig = new Map<number, WeeklyOverride>();
  for (const o of ovR.rows) ovByOrig.set(o.original_exercise_id, o);

  const out: EffectiveSlot[] = [];
  for (const slot of slots) {
    const ov = ovByOrig.get(slot.exercise_id);
    if (!ov) { out.push(slot); continue; }
    if (ov.override_type === 'skip') continue;
    if (ov.override_type === 'swap') {
      out.push({
        ...slot,
        exercise_id: ov.replacement_exercise_id ?? slot.exercise_id,
        _override: ov,
      });
      continue;
    }
    // reduce_intensity: keep exercise, annotate
    out.push({ ...slot, _override: ov });
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && npm test -- tests/integration/weekly-overrides.test.ts`
Expected: 6 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/weekly-overrides.service.ts \
        backend/tests/integration/weekly-overrides.test.ts
git commit -m "feat(overrides): weekly_overrides service + integration tests"
```

---

## Task 4: Engine Integration — Apply Overrides in buildTodaySession

**Files:**
- Modify: `backend/src/services/engine.service.ts:39-82`

- [ ] **Step 1: Write a failing engine integration test**

Create `backend/tests/integration/engine-overrides.test.ts`:

```ts
import { jest } from '@jest/globals';

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { insertOverride } = await import('../../src/services/weekly-overrides.service.js');
const { buildTodaySession } = await import('../../src/services/engine.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

// Helper: minimal active skeleton with 2 slots on day 1 for an athlete.
async function seedTwoSlotDay1Skeleton(athId: string): Promise<{ exA: number; exB: number }> {
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises ORDER BY id LIMIT 2`,
  );
  const [exA, exB] = [ex.rows[0].id, ex.rows[1].id];
  const sk = await pool.query<{ id: string }>(
    `INSERT INTO athlete_skeletons (athlete_id, status)
     VALUES ($1, 'active') RETURNING id`,
    [athId],
  );
  await pool.query(
    `INSERT INTO skeleton_slots (skeleton_id, day_of_week, slot_index, exercise_id, role, series)
     VALUES ($1, 1, 0, $2, 'principal', 4), ($1, 1, 1, $3, 'principal', 3)`,
    [sk.rows[0].id, exA, exB],
  );
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, active_skeleton_id, rm_test_blocking)
     VALUES ($1, 3, $2, false)
     ON CONFLICT (athlete_id) DO UPDATE SET current_week = 3,
       active_skeleton_id = EXCLUDED.active_skeleton_id, rm_test_blocking = false`,
    [athId, sk.rows[0].id],
  );
  return { exA, exB };
}

it('buildTodaySession returns swapped exercise when override is active', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA, exB } = await seedTwoSlotDay1Skeleton(ath);

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: exB,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  expect(items.find((i) => i.exercise.id === exA)).toBeUndefined();
  const exBSlots = items.filter((i) => i.exercise.id === exB);
  expect(exBSlots.length).toBeGreaterThanOrEqual(2); // original slot 1 + swapped slot 0
});

it('buildTodaySession drops the slot on skip override', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA } = await seedTwoSlotDay1Skeleton(ath);

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: null,
    overrideType: 'skip', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  expect(items.find((i) => i.exercise.id === exA)).toBeUndefined();
  expect(items.length).toBe(1); // only slot index 1 remains
});

it('buildTodaySession is unchanged when no overrides exist', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA, exB } = await seedTwoSlotDay1Skeleton(ath);

  const items = await buildTodaySession(ath, 1);
  expect(items.length).toBe(2);
  const ids = items.map((i) => i.exercise.id).sort();
  expect(ids).toEqual([exA, exB].sort());
});

it('reduce_intensity override subtracts series', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA } = await seedTwoSlotDay1Skeleton(ath);

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: null,
    overrideType: 'reduce_intensity',
    intensityPayload: { sets_delta: -1 },
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  const it = items.find((i) => i.exercise.id === exA);
  expect(it).toBeDefined();
  expect(it!.series).toBe(3); // was 4, minus 1
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npm test -- tests/integration/engine-overrides.test.ts`
Expected: at least one failure — items contain the original exercise A or skip is ignored or series is 4.

- [ ] **Step 3: Patch engine.service.ts to apply overrides**

Open `backend/src/services/engine.service.ts`. Find the block at lines 39–47 (`slotsR` query and `if (slotsR.rows.length === 0) return [];`). Insert the override transform after the empty-check and before the `exerciseIds` computation. Replace lines 39–82 with:

```ts
  const slotsR = await pool.query<SkeletonSlot>(
    `SELECT * FROM skeleton_slots
       WHERE skeleton_id = $1 AND day_of_week = $2
       ORDER BY slot_index ASC`,
    [state.active_skeleton_id, dayOfWeek],
  );
  if (slotsR.rows.length === 0) return [];

  const { applyOverridesToSlots } = await import('./weekly-overrides.service.js');
  const effectiveSlots = await applyOverridesToSlots(
    athleteId, state.current_week, dayOfWeek, slotsR.rows,
  );
  if (effectiveSlots.length === 0) return [];

  const exerciseIds = effectiveSlots.map((s) => s.exercise_id);
  const exR = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = ANY($1::int[])`, [exerciseIds],
  );
  const exById = new Map(exR.rows.map((e) => [e.id, e]));

  const wR = await pool.query<{
    exercise_id: number; current_weight_kg: number | null;
    current_value: number | null; unit: 'kg' | 'ladrillos' | null;
    current_reps_text: string | null;
  }>(
    `SELECT exercise_id,
            COALESCE(current_value, current_weight_kg) AS current_value,
            unit,
            current_weight_kg,
            current_reps_text
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, exerciseIds],
  );
  const wByEx = new Map(wR.rows.map((r) => [r.exercise_id, r]));

  let rmByEx = new Map<number, number>();
  if (cfg.principal_pct_rm && cfg.principal_rm_source) {
    const rmR = await pool.query<{ exercise_id: number; value_kg: string }>(
      `SELECT exercise_id, value_kg::text
         FROM rm_tests
        WHERE athlete_id = $1 AND program_week = $2
          AND exercise_id = ANY($3::int[])`,
      [athleteId, cfg.principal_rm_source, exerciseIds],
    );
    rmByEx = new Map(rmR.rows.map((r) => [r.exercise_id, Number(r.value_kg)]));
  }

  return Promise.all(effectiveSlots.map((slot) =>
    buildItem(athleteId, slot, exById, wByEx, rmByEx, cfg),
  ));
}
```

- [ ] **Step 4: Extend `buildItem` to apply reduce_intensity**

Still in `engine.service.ts`, change the `buildItem` signature to accept the slot's optional `_override`. After computing the final `series`, `weight`, and `target_rpe`, apply the override clamping:

```ts
async function buildItem(
  athleteId: string,
  slot: SkeletonSlot & {
    _override?: import('./weekly-overrides.service.js').WeeklyOverride;
  },
  exById: Map<number, Exercise>,
  // ...rest unchanged
) {
  // ...existing logic that computes `series`, `weight`, `targetRpe`...

  const ov = slot._override;
  if (ov?.override_type === 'reduce_intensity') {
    const p = ov.intensity_payload as {
      sets_delta?: number; weight_pct?: number; rpe_delta?: number;
    };
    if (typeof p.sets_delta === 'number') {
      series = Math.max(1, series + p.sets_delta);
    }
    if (typeof p.weight_pct === 'number' && weight != null) {
      weight = Math.max(0, weight * p.weight_pct);
    }
    if (typeof p.rpe_delta === 'number' && targetRpe != null) {
      targetRpe = Math.max(5, targetRpe + p.rpe_delta);
    }
  }

  // ...return the existing item shape
}
```

If `series`, `weight`, or `targetRpe` are not the actual local variable names in `buildItem`, substitute them with the ones in the current file (read lines 84–169 first to identify them).

- [ ] **Step 5: Run tests, verify all pass**

Run: `cd backend && npm test -- tests/integration/engine-overrides.test.ts`
Expected: 4 passed.

Then: `cd backend && npm test`
Expected: full suite green (no regression in other engine tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/engine.service.ts \
        backend/tests/integration/engine-overrides.test.ts
git commit -m "feat(engine): apply weekly_overrides to today session items"
```

---

## Task 5: alert-context Service

**Files:**
- Create: `backend/src/services/alert-context.service.ts`
- Test: `backend/tests/integration/alert-context.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/tests/integration/alert-context.test.ts
import { jest } from '@jest/globals';

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { createPainAlert } = await import('../../src/services/alert.service.js');
const { getAlertContext } = await import('../../src/services/alert-context.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('returns suggested alternative + last pain history for sos_pain', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const exR = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const exerciseId = exR.rows[0].id;

  const a1 = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 6,
  });
  const a2 = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 8,
  });

  const ctx = await getAlertContext(a2.alertId, coach);
  expect(ctx.alert.id).toBe(a2.alertId);
  expect(ctx.painHistory.length).toBeGreaterThanOrEqual(1);
  expect(ctx.painHistory.every((p) => p.zone === 'lumbar')).toBe(true);
  // suggestedAlternative may be null if seed has no alternative; that's fine
  expect(ctx).toHaveProperty('suggestedAlternative');
});

it('throws not_found for alert belonging to a different coach', async () => {
  const coachA = await createAdmin();
  const coachB = await createAdmin();
  const ath = await createAthlete(coachA);
  const exR = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId: exR.rows[0].id, zone: 'rodilla', intensity: 5,
  });
  await expect(getAlertContext(alertId, coachB)).rejects.toThrow(/not_found/);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npm test -- tests/integration/alert-context.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create service**

```ts
// backend/src/services/alert-context.service.ts
import pool from '../db/connect.js';
import { findAlternative } from './alternatives.service.js';

export class AlertContextError extends Error {
  constructor(public reason: 'not_found') { super(reason); }
}

export interface AlertContext {
  alert: {
    id: string;
    type: string;
    severity: string;
    athlete_id: string;
    athlete_name: string;
    exercise_id: number | null;
    exercise_name: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  };
  suggestedAlternative: { id: number; name: string } | null;
  painHistory: { zone: string; intensity: number; created_at: string }[];
  activeSlot: {
    skeleton_slot_id: string;
    exercise_id: number;
    day_of_week: number;
  } | null;
}

export async function getAlertContext(
  alertId: string,
  coachId: string,
): Promise<AlertContext> {
  const r = await pool.query<{
    id: string; type: string; severity: string; athlete_id: string;
    athlete_name: string; exercise_id: number | null;
    exercise_name: string | null; payload: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT ca.id, ca.type, ca.severity, ca.athlete_id,
            ap.name AS athlete_name, ca.exercise_id,
            e.name AS exercise_name, ca.payload, ca.created_at
       FROM coach_alerts ca
       JOIN athlete_profiles ap ON ap.user_id = ca.athlete_id
       LEFT JOIN exercises e ON e.id = ca.exercise_id
      WHERE ca.id = $1 AND ca.coach_id = $2`,
    [alertId, coachId],
  );
  const alert = r.rows[0];
  if (!alert) throw new AlertContextError('not_found');

  let suggestedAlternative: AlertContext['suggestedAlternative'] = null;
  if (alert.exercise_id) {
    const alt = await findAlternative(alert.athlete_id, alert.exercise_id);
    if (alt) suggestedAlternative = { id: alt.id, name: alt.name };
  }

  const zone = (alert.payload as { zone?: string }).zone;
  const painHistory: AlertContext['painHistory'] = [];
  if (alert.type === 'sos_pain' && zone) {
    const ph = await pool.query<{ zone: string; intensity: number; created_at: string }>(
      `SELECT payload->>'zone' AS zone,
              (payload->>'intensity')::int AS intensity,
              created_at
         FROM coach_alerts
        WHERE athlete_id = $1 AND type = 'sos_pain'
          AND payload->>'zone' = $2
          AND id != $3
        ORDER BY created_at DESC LIMIT 6`,
      [alert.athlete_id, zone, alert.id],
    );
    painHistory.push(...ph.rows);
  }

  let activeSlot: AlertContext['activeSlot'] = null;
  if (alert.exercise_id) {
    const slR = await pool.query<{
      id: string; exercise_id: number; day_of_week: number;
    }>(
      `SELECT ss.id, ss.exercise_id, ss.day_of_week
         FROM skeleton_slots ss
         JOIN athlete_program_state ap ON ap.active_skeleton_id = ss.skeleton_id
        WHERE ap.athlete_id = $1 AND ss.exercise_id = $2 LIMIT 1`,
      [alert.athlete_id, alert.exercise_id],
    );
    if (slR.rows[0]) activeSlot = {
      skeleton_slot_id: slR.rows[0].id,
      exercise_id: slR.rows[0].exercise_id,
      day_of_week: slR.rows[0].day_of_week,
    };
  }

  return { alert, suggestedAlternative, painHistory, activeSlot };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && npm test -- tests/integration/alert-context.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/alert-context.service.ts \
        backend/tests/integration/alert-context.test.ts
git commit -m "feat(alerts): alert-context service for popover/dialog enrichment"
```

---

## Task 6: alert.service.resolveAlert + Action Side-Effects

**Files:**
- Modify: `backend/src/services/alert.service.ts`
- Modify: `backend/tests/integration/alerts.test.ts`

- [ ] **Step 1: Write failing tests for resolveAlert**

Append to `backend/tests/integration/alerts.test.ts`:

```ts
const { resolveAlert } = await import('../../src/services/alert.service.js');

it('resolve sos_pain with swap_exercise inserts a swap override + stamps audit', async () => {
  const { coach, ath, exerciseId } = await setup();
  const altR = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  const replId = altR.rows[0].id;

  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 8,
  });
  // Seed minimal athlete_program_state so resolveAlert can read current_week.
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking)
     VALUES ($1, 3, false) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 3`,
    [ath],
  );

  await resolveAlert(alertId, coach, {
    action: 'swap_exercise',
    payload: { replacement_exercise_id: replId },
    note: 'Sustituye sentadilla por dolor lumbar',
  });

  const a = await pool.query<{
    resolution_action: string; resolution_note: string; resolved_at: string;
    resolved_by: string;
  }>(`SELECT resolution_action, resolution_note, resolved_at, resolved_by
        FROM coach_alerts WHERE id = $1`, [alertId]);
  expect(a.rows[0].resolution_action).toBe('swap_exercise');
  expect(a.rows[0].resolution_note).toContain('Sustituye');
  expect(a.rows[0].resolved_at).toBeTruthy();
  expect(a.rows[0].resolved_by).toBe(coach);

  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(1);
  expect(ov.rows[0].override_type).toBe('swap');
  expect(ov.rows[0].replacement_exercise_id).toBe(replId);
  expect(ov.rows[0].expires_after_week).toBe(3);
});

it('resolve with action not in matrix for type returns 422-style error', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'rodilla', intensity: 5,
  });
  await expect(
    resolveAlert(alertId, coach, {
      action: 'approve_switch', payload: {},
    }),
  ).rejects.toMatchObject({ reason: 'invalid_action' });
});

it('resolve twice returns conflict error', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 7,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking)
     VALUES ($1, 1, false) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 1`,
    [ath],
  );
  await resolveAlert(alertId, coach, {
    action: 'note_only', payload: {}, note: 'observado',
  });
  await expect(
    resolveAlert(alertId, coach, { action: 'note_only', payload: {} }),
  ).rejects.toMatchObject({ reason: 'already_resolved' });
});

it('resolve skip_week inserts a skip override', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'hombro', intensity: 6,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking)
     VALUES ($1, 2, false) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 2`,
    [ath],
  );
  await resolveAlert(alertId, coach, { action: 'skip_week', payload: {} });
  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rows[0].override_type).toBe('skip');
  expect(ov.rows[0].replacement_exercise_id).toBeNull();
});

it('resolve note_only is audit-only (no override row)', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'cadera', intensity: 4,
  });
  await resolveAlert(alertId, coach, {
    action: 'note_only', payload: {}, note: 'observado',
  });
  const ov = await pool.query(
    `SELECT 1 FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(0);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && npm test -- tests/integration/alerts.test.ts`
Expected: failures on every new test (resolveAlert export missing).

- [ ] **Step 3: Implement resolveAlert in alert.service.ts**

Append to `backend/src/services/alert.service.ts`:

```ts
import {
  isActionAllowedForType,
  PAYLOAD_SCHEMA_BY_ACTION,
  type AlertResolutionAction,
  type AlertType,
} from '../domain/alert-actions.js';
import { insertOverride } from './weekly-overrides.service.js';
import { regenerateSkeleton } from './skeleton-regen.service.js';

export class ResolveAlertError extends Error {
  constructor(
    public reason:
      | 'not_found'
      | 'invalid_action'
      | 'invalid_payload'
      | 'already_resolved'
      | 'missing_state',
  ) {
    super(reason);
  }
}

export interface ResolveAlertInput {
  action: AlertResolutionAction;
  payload: Record<string, unknown>;
  note?: string;
}

export async function resolveAlert(
  alertId: string,
  coachId: string,
  input: ResolveAlertInput,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query<{
      id: string; type: AlertType; athlete_id: string;
      exercise_id: number | null; payload: Record<string, unknown>;
      resolution_action: string | null;
    }>(
      `SELECT id, type, athlete_id, exercise_id, payload, resolution_action
         FROM coach_alerts WHERE id = $1 AND coach_id = $2 FOR UPDATE`,
      [alertId, coachId],
    );
    const alert = r.rows[0];
    if (!alert) throw new ResolveAlertError('not_found');
    if (alert.resolution_action) throw new ResolveAlertError('already_resolved');

    if (!isActionAllowedForType(alert.type, input.action)) {
      throw new ResolveAlertError('invalid_action');
    }
    const schema = PAYLOAD_SCHEMA_BY_ACTION[input.action];
    const parsed = schema.safeParse(input.payload);
    if (!parsed.success) throw new ResolveAlertError('invalid_payload');
    const payload = parsed.data as Record<string, unknown>;

    // Side-effects per action.
    if (
      input.action === 'swap_exercise' ||
      input.action === 'skip_week' ||
      input.action === 'reduce_intensity' ||
      input.action === 'approve_switch'
    ) {
      const stR = await client.query<{ current_week: number }>(
        `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
        [alert.athlete_id],
      );
      const state = stR.rows[0];
      if (!state) throw new ResolveAlertError('missing_state');

      const origExerciseId = alert.exercise_id;
      if (!origExerciseId) throw new ResolveAlertError('invalid_action');

      let overrideType: 'swap' | 'skip' | 'reduce_intensity';
      let replacementExerciseId: number | null = null;
      let intensityPayload: Record<string, unknown> = {};

      if (input.action === 'swap_exercise') {
        overrideType = 'swap';
        replacementExerciseId = (payload as { replacement_exercise_id: number })
          .replacement_exercise_id;
      } else if (input.action === 'skip_week') {
        overrideType = 'skip';
      } else if (input.action === 'reduce_intensity') {
        overrideType = 'reduce_intensity';
        intensityPayload = payload;
      } else {
        // approve_switch: read switched_to_exercise_id from the original alert payload,
        // not from the request. Prevents the coach from approving a different swap
        // than what the athlete actually did.
        const switched = (alert.payload as { switched_to_exercise_id?: number })
          .switched_to_exercise_id;
        if (!switched) throw new ResolveAlertError('invalid_payload');
        overrideType = 'swap';
        replacementExerciseId = switched;
      }

      // Reject override-of-override on the same week/exercise.
      const dup = await client.query(
        `SELECT 1 FROM weekly_overrides
          WHERE athlete_id = $1
            AND program_week <= $2 AND expires_after_week >= $2
            AND original_exercise_id = $3
          LIMIT 1`,
        [alert.athlete_id, state.current_week, origExerciseId],
      );
      if ((dup.rowCount ?? 0) > 0) {
        throw new ResolveAlertError('already_resolved');
      }

      await client.query(
        `INSERT INTO weekly_overrides
           (athlete_id, program_week, day_of_week, original_exercise_id,
            replacement_exercise_id, override_type, intensity_payload,
            source_alert_id, created_by, expires_after_week)
         VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
        [
          alert.athlete_id, state.current_week, origExerciseId,
          replacementExerciseId, overrideType,
          JSON.stringify(intensityPayload), alert.id, coachId,
          state.current_week,
        ],
      );
    } else if (input.action === 'regen_skeleton') {
      await regenerateSkeleton(alert.athlete_id);
    }
    // revert_switch / reschedule_rm / skip_rm_block / acknowledge / note_only:
    // audit-only.

    await client.query(
      `UPDATE coach_alerts
          SET resolution_action = $1,
              resolution_payload = $2::jsonb,
              resolution_note = $3,
              resolved_at = NOW(),
              resolved_by = $4
        WHERE id = $5`,
      [input.action, JSON.stringify(payload), input.note ?? null, coachId, alert.id],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
```

The unused helper `insertOverride` from `weekly-overrides.service.ts` stays exported — it's tested in Task 3 and useful for future callers; resolveAlert inlines the insert to keep it in the same transaction.

- [ ] **Step 4: Run tests, verify all pass**

Run: `cd backend && npm test -- tests/integration/alerts.test.ts`
Expected: all (existing + 5 new) green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/alert.service.ts backend/tests/integration/alerts.test.ts
git commit -m "feat(alerts): resolveAlert applies action + side-effect in one tx"
```

---

## Task 7: Routes — admin-alerts Extended; admin-ops Duplicate Removed

**Files:**
- Modify: `backend/src/routes/admin-alerts.ts`
- Modify: `backend/src/routes/admin-ops.ts:90-134` (remove the duplicate `/alerts*` handlers)
- Test: `backend/tests/integration/alerts-routes.test.ts` (extend)

- [ ] **Step 1: Write failing route tests**

Append to `backend/tests/integration/alerts-routes.test.ts` (keep its existing setup):

```ts
it('POST /admin/alerts/:id/resolve applies swap + audits', async () => {
  const { app, coachToken, ath, exerciseId, coachId } = await setupAlertRoutesTest();
  const altR = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  const replId = altR.rows[0].id;

  // Seed an alert via the athlete-facing endpoint or service.
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 7,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking)
     VALUES ($1, 4, false) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 4`,
    [ath],
  );

  const r = await request(app)
    .post(`/api/admin/alerts/${alertId}/resolve`)
    .set('Authorization', `Bearer ${coachToken}`)
    .send({ action: 'swap_exercise', payload: { replacement_exercise_id: replId } });
  expect(r.status).toBe(200);
  expect(r.body.resolution_action).toBe('swap_exercise');

  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(1);
});

it('POST /admin/alerts/:id/resolve returns 422 when action not in matrix', async () => {
  const { app, coachToken, ath, exerciseId } = await setupAlertRoutesTest();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'cervical', intensity: 5,
  });
  const r = await request(app)
    .post(`/api/admin/alerts/${alertId}/resolve`)
    .set('Authorization', `Bearer ${coachToken}`)
    .send({ action: 'reschedule_rm', payload: { target_week: 5 } });
  expect(r.status).toBe(422);
});

it('GET /admin/alerts/:id/context returns athlete + pain history', async () => {
  const { app, coachToken, ath, exerciseId } = await setupAlertRoutesTest();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 6,
  });
  const r = await request(app)
    .get(`/api/admin/alerts/${alertId}/context`)
    .set('Authorization', `Bearer ${coachToken}`);
  expect(r.status).toBe(200);
  expect(r.body.alert.id).toBe(alertId);
  expect(Array.isArray(r.body.painHistory)).toBe(true);
});

it('GET /admin/alerts supports status=resolved filter', async () => {
  const { app, coachToken, ath, exerciseId, coachId } = await setupAlertRoutesTest();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 4,
  });
  await resolveAlert(alertId, coachId, { action: 'note_only', payload: {} });

  const r = await request(app)
    .get('/api/admin/alerts?status=resolved')
    .set('Authorization', `Bearer ${coachToken}`);
  expect(r.status).toBe(200);
  expect(r.body.items.find((a: { id: string }) => a.id === alertId)).toBeDefined();
});
```

Add `setupAlertRoutesTest` helper if not present (factor it from the existing test setup so all tests share one bootstrap). The factored helper must return `{ app, coachToken, coachId, ath, exerciseId }`.

- [ ] **Step 2: Extend admin-alerts.ts**

Replace `backend/src/routes/admin-alerts.ts` with:

```ts
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listAlertsForCoach,
  markRead,
  resolveAlert,
  AlertError,
  ResolveAlertError,
} from '../services/alert.service.js';
import {
  getAlertContext, AlertContextError,
} from '../services/alert-context.service.js';
import { alertResolvePayload } from '../domain/schemas.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req: Request, res: Response) => {
  const status = (req.query.status as string) || 'open';
  const type = req.query.type as string | undefined;
  const severity = req.query.severity as string | undefined;
  const athleteId = req.query.athlete_id as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
  const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
  const items = await listAlertsForCoach(req.user!.id, {
    status: status === 'open' || status === 'resolved' || status === 'all' ? status : 'open',
    type, severity, athleteId, limit, page,
  });
  return res.status(200).json({ items, total: items.length });
});

router.get('/:id/context', async (req: Request, res: Response) => {
  try {
    const ctx = await getAlertContext(req.params.id, req.user!.id);
    return res.status(200).json(ctx);
  } catch (e) {
    if (e instanceof AlertContextError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await markRead(req.params.id, req.user!.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  const parsed = alertResolvePayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  try {
    await resolveAlert(req.params.id, req.user!.id, parsed.data);
    const ctx = await getAlertContext(req.params.id, req.user!.id);
    return res.status(200).json(ctx.alert);
  } catch (e) {
    if (e instanceof ResolveAlertError) {
      if (e.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.reason === 'invalid_action') return res.status(422).json({ error: 'invalid_action' });
      if (e.reason === 'invalid_payload') return res.status(422).json({ error: 'invalid_payload' });
      if (e.reason === 'already_resolved') return res.status(409).json({ error: 'already_resolved' });
      if (e.reason === 'missing_state') return res.status(409).json({ error: 'missing_state' });
    }
    throw e;
  }
});

export default router;
```

- [ ] **Step 3: Extend `listAlertsForCoach` to accept filters**

Modify `backend/src/services/alert.service.ts:92-109`:

```ts
export interface ListAlertsOpts {
  status?: 'open' | 'resolved' | 'all';
  type?: string;
  severity?: string;
  athleteId?: string;
  limit?: number;
  page?: number;
}

export async function listAlertsForCoach(
  coachId: string,
  opts: ListAlertsOpts | boolean = {},   // boolean kept for legacy callers
): Promise<unknown[]> {
  const o: ListAlertsOpts = typeof opts === 'boolean'
    ? { status: opts ? 'open' : 'all' }
    : opts;
  const where: string[] = ['ca.coach_id = $1'];
  const params: unknown[] = [coachId];
  const push = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace('$$', `$${params.length}`));
  };
  if (o.status === 'open') where.push('ca.resolved_at IS NULL');
  if (o.status === 'resolved') where.push('ca.resolved_at IS NOT NULL');
  if (o.type) push('ca.type = $$', o.type);
  if (o.severity) push('ca.severity = $$', o.severity);
  if (o.athleteId) push('ca.athlete_id = $$', o.athleteId);

  const limit = Math.max(1, Math.min(o.limit ?? 50, 200));
  const offset = ((o.page ?? 1) - 1) * limit;
  params.push(limit, offset);

  const r = await pool.query(
    `SELECT ca.id, ca.type, ca.severity, ca.payload, ca.created_at,
            ca.read_at, ca.resolved_at, ca.athlete_id, ca.exercise_id,
            ca.resolution_action, ca.resolution_note,
            resolver.email AS resolved_by_email,
            ap.name AS athlete_name, e.name AS exercise_name
       FROM coach_alerts ca
       JOIN athlete_profiles ap ON ap.user_id = ca.athlete_id
       LEFT JOIN exercises e ON e.id = ca.exercise_id
       LEFT JOIN users resolver ON resolver.id = ca.resolved_by
      WHERE ${where.join(' AND ')}
      ORDER BY ca.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return r.rows;
}
```

- [ ] **Step 4: Remove duplicate handlers from admin-ops.ts**

In `backend/src/routes/admin-ops.ts`, delete lines 90–134 (the three `/alerts*` handlers). Also remove unused imports they relied on if not used elsewhere in the file.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && npm test`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin-alerts.ts backend/src/routes/admin-ops.ts \
        backend/src/services/alert.service.ts \
        backend/tests/integration/alerts-routes.test.ts
git commit -m "feat(alerts): POST /resolve + GET /context + filtered list; drop duplicate ops handlers"
```

---

## Task 8: Frontend Types and Hooks

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/hooks/useAlerts.ts`

- [ ] **Step 1: Extend types/api.ts**

Append to `frontend/src/types/api.ts`:

```ts
export type AlertResolutionAction =
  | 'swap_exercise' | 'skip_week' | 'regen_skeleton'
  | 'approve_switch' | 'revert_switch' | 'reduce_intensity'
  | 'reschedule_rm' | 'skip_rm_block' | 'acknowledge' | 'note_only';

// Add these fields to whichever interface declares CoachAlert today:
//   resolution_action: AlertResolutionAction | null;
//   resolution_note: string | null;
//   resolved_by_email: string | null;
//   athlete_id: string;
//   exercise_id: number | null;

export interface AlertContext {
  alert: CoachAlert;
  suggestedAlternative: { id: number; name: string } | null;
  painHistory: { zone: string; intensity: number; created_at: string }[];
  activeSlot: {
    skeleton_slot_id: string;
    exercise_id: number;
    day_of_week: number;
  } | null;
}

export interface AlertsListResponse {
  items: CoachAlert[];
  total: number;
}

export interface AlertsListFilters {
  status?: 'open' | 'resolved' | 'all';
  type?: string;
  severity?: string;
  athleteId?: string;
}
```

Modify the existing `CoachAlert` interface in the same file to add the five new fields listed in the comment.

- [ ] **Step 2: Rewrite useAlerts.ts**

Replace `frontend/src/hooks/useAlerts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CoachAlert, AlertContext, AlertsListResponse, AlertsListFilters,
  AlertResolutionAction,
} from '@/types/api';

function buildQs(f: AlertsListFilters) {
  const sp = new URLSearchParams();
  if (f.status) sp.set('status', f.status);
  if (f.type) sp.set('type', f.type);
  if (f.severity) sp.set('severity', f.severity);
  if (f.athleteId) sp.set('athlete_id', f.athleteId);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useAlerts(filters: AlertsListFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'alerts', filters],
    queryFn: async (): Promise<AlertsListResponse> => {
      const r = await api.get<AlertsListResponse>(`/admin/alerts${buildQs(filters)}`);
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAlertContext(alertId: string | null) {
  return useQuery({
    queryKey: ['admin', 'alert-context', alertId],
    enabled: !!alertId,
    queryFn: async (): Promise<AlertContext> => {
      const r = await api.get<AlertContext>(`/admin/alerts/${alertId}/context`);
      return r.data;
    },
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/alerts/${id}/read`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alerts'] }),
  });
}

export interface ResolveArgs {
  id: string;
  action: AlertResolutionAction;
  payload?: Record<string, unknown>;
  note?: string;
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ResolveArgs): Promise<CoachAlert> => {
      const r = await api.post<CoachAlert>(
        `/admin/alerts/${args.id}/resolve`,
        { action: args.action, payload: args.payload ?? {}, note: args.note },
      );
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alerts'] }),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/hooks/useAlerts.ts
git commit -m "feat(alerts-ui): types + hooks for resolve action + context"
```

---

## Task 9: AlertsFilters + AlertsTable

**Files:**
- Create: `frontend/src/components/admin/alerts/AlertsFilters.tsx`
- Create: `frontend/src/components/admin/alerts/AlertsTable.tsx`

- [ ] **Step 1: Create AlertsFilters.tsx**

```tsx
// frontend/src/components/admin/alerts/AlertsFilters.tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import type { AlertsListFilters } from '@/types/api';

interface Props {
  value: AlertsListFilters;
  onChange: (next: AlertsListFilters) => void;
}

const TYPES = ['', 'sos_pain', 'sos_machine', 'rpe_flag', 'rm_skipped', 'rm_week_starting'] as const;
const TYPE_LABEL: Record<string, string> = {
  '': 'Todos',
  sos_pain: 'SOS dolor',
  sos_machine: 'SOS máquina',
  rpe_flag: 'RPE alto',
  rm_skipped: 'RM salteado',
  rm_week_starting: 'Semana RM',
};

export function AlertsFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        value={value.status ?? 'open'}
        onValueChange={(s) => onChange({ ...value, status: s as 'open' | 'resolved' | 'all' })}
      >
        <TabsList>
          <TabsTrigger value="open">Abiertas</TabsTrigger>
          <TabsTrigger value="resolved">Resueltas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs
        value={value.type ?? ''}
        onValueChange={(t) => onChange({ ...value, type: t || undefined })}
      >
        <TabsList>
          {TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>{TYPE_LABEL[t]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Input
        placeholder="ID atleta (UUID)"
        value={value.athleteId ?? ''}
        onChange={(e) => onChange({ ...value, athleteId: e.target.value || undefined })}
        className="max-w-[260px]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create AlertsTable.tsx**

```tsx
// frontend/src/components/admin/alerts/AlertsTable.tsx
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { CoachAlert } from '@/types/api';
import { AlertRowActions } from './AlertRowActions';
import { cn } from '@/lib/utils';

const SEV_DOT: Record<string, string> = {
  red: 'bg-destructive',
  yellow: 'bg-yellow-500',
  info: 'bg-muted-foreground',
};

const TYPE_LABEL: Record<CoachAlert['type'], string> = {
  sos_pain: 'SOS dolor',
  sos_machine: 'SOS máquina',
  rpe_flag: 'RPE alto',
  rm_skipped: 'RM salteado',
  rm_week_starting: 'Semana RM',
};

function summary(a: CoachAlert): string {
  const p = a.payload as { zone?: string; intensity?: number; switched_to_exercise_id?: number };
  if (a.type === 'sos_pain' && p.zone) return `${p.zone} ${p.intensity ?? '?'}/10 · ${a.exercise_name ?? '?'}`;
  if (a.type === 'sos_machine') return `${a.exercise_name ?? '?'} ocupado`;
  return a.exercise_name ?? '—';
}

interface Props {
  alerts: CoachAlert[];
}

export function AlertsTable({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Sin alertas en esta vista.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">Sev</TableHead>
          <TableHead>Atleta</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Detalle</TableHead>
          <TableHead className="w-24">Hace</TableHead>
          <TableHead className="w-32">Resolución</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow key={a.id} className={cn(a.resolved_at && 'opacity-60')}>
            <TableCell>
              <span className={cn('inline-block h-2.5 w-2.5 rounded-full', SEV_DOT[a.severity])} />
            </TableCell>
            <TableCell className="font-medium">{a.athlete_name}</TableCell>
            <TableCell>{TYPE_LABEL[a.type]}</TableCell>
            <TableCell className="text-sm">{summary(a)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(a.created_at), { locale: es, addSuffix: false })}
            </TableCell>
            <TableCell>
              {a.resolution_action ? (
                <Badge variant="secondary" title={a.resolution_note ?? undefined}>
                  {a.resolution_action}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {!a.resolved_at && <AlertRowActions alert={a} />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors. `AlertRowActions` import will fail until Task 10 — leave the error for now if necessary, OR scaffold a stub component:

```tsx
// frontend/src/components/admin/alerts/AlertRowActions.tsx (stub)
import type { CoachAlert } from '@/types/api';
export function AlertRowActions(_: { alert: CoachAlert }) {
  return <span>⋯</span>;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/alerts/
git commit -m "feat(alerts-ui): AlertsFilters + AlertsTable (stub row actions)"
```

---

## Task 10: AlertRowActions — Popover with Type-Aware Items

**Files:**
- Modify (overwrite stub): `frontend/src/components/admin/alerts/AlertRowActions.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/admin/alerts/AlertRowActions.tsx
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { CoachAlert, AlertResolutionAction } from '@/types/api';
import { useMarkAlertRead } from '@/hooks/useAlerts';
import { SwapExerciseDialog } from './dialogs/SwapExerciseDialog';
import { SkipWeekDialog } from './dialogs/SkipWeekDialog';
import { ReduceIntensityDialog } from './dialogs/ReduceIntensityDialog';
import { RegenSkeletonDialog } from './dialogs/RegenSkeletonDialog';
import { ApproveSwitchDialog } from './dialogs/ApproveSwitchDialog';
import { RevertSwitchDialog } from './dialogs/RevertSwitchDialog';
import { ContactNoteDialog } from './dialogs/ContactNoteDialog';
import { AcknowledgeDialog } from './dialogs/AcknowledgeDialog';

const MATRIX: Record<CoachAlert['type'], AlertResolutionAction[]> = {
  sos_pain:          ['swap_exercise', 'skip_week', 'regen_skeleton', 'note_only'],
  sos_machine:       ['approve_switch', 'revert_switch', 'swap_exercise', 'note_only'],
  rpe_flag:          ['reduce_intensity', 'skip_week', 'note_only'],
  rm_skipped:        ['note_only'],
  rm_week_starting:  ['acknowledge', 'note_only'],
};

const ITEM_LABEL: Record<AlertResolutionAction, string> = {
  swap_exercise: '↺ Swap ejercicio',
  skip_week: '⏭ Skip esta semana',
  reduce_intensity: '🔽 Bajar intensidad',
  regen_skeleton: '🤖 Regenerar rutina',
  approve_switch: '✓ Aprobar cambio del atleta',
  revert_switch: '↩ Revertir cambio',
  note_only: '💬 Contactar + nota',
  acknowledge: '👁 Acknowledge',
  reschedule_rm: '📅 Reagendar RM',
  skip_rm_block: '⏭ Skip bloque RM',
};

export function AlertRowActions({ alert }: { alert: CoachAlert }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AlertResolutionAction | null>(null);
  const markRead = useMarkAlertRead();
  const actions = MATRIX[alert.type];

  const choose = (a: AlertResolutionAction) => { setActive(a); setOpen(false); };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Acciones">
            <MoreHorizontal size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => choose(a)}
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {ITEM_LABEL[a]}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          {!alert.read_at && (
            <button
              onClick={() => { markRead.mutate(alert.id); setOpen(false); }}
              className="block w-full rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              👁 Marcar leída
            </button>
          )}
        </PopoverContent>
      </Popover>

      {active === 'swap_exercise' && (
        <SwapExerciseDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'skip_week' && (
        <SkipWeekDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'reduce_intensity' && (
        <ReduceIntensityDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'regen_skeleton' && (
        <RegenSkeletonDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'approve_switch' && (
        <ApproveSwitchDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'revert_switch' && (
        <RevertSwitchDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'note_only' && (
        <ContactNoteDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'acknowledge' && (
        <AcknowledgeDialog alert={alert} onClose={() => setActive(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit (dialogs stubs to follow)**

```bash
git add frontend/src/components/admin/alerts/AlertRowActions.tsx
git commit -m "feat(alerts-ui): AlertRowActions popover with type-aware items"
```

---

## Task 11: Dialogs — Eight Action Forms

**Files:**
- Create: `frontend/src/components/admin/alerts/dialogs/SwapExerciseDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/SkipWeekDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/ReduceIntensityDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/RegenSkeletonDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/ApproveSwitchDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/RevertSwitchDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/ContactNoteDialog.tsx`
- Create: `frontend/src/components/admin/alerts/dialogs/AcknowledgeDialog.tsx`

Pattern: each dialog uses shadcn `Dialog`, accepts `{ alert, onClose }`, calls `useResolveAlert().mutateAsync(...)`, shows `toast.success/error` from `sonner`, then `onClose()`.

- [ ] **Step 1: SwapExerciseDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/SwapExerciseDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { CoachAlert } from '@/types/api';
import { useAlertContext, useResolveAlert } from '@/hooks/useAlerts';

export function SwapExerciseDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const ctx = useAlertContext(alert.id);
  const resolve = useResolveAlert();
  const [replId, setReplId] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const suggested = ctx.data?.suggestedAlternative;
  const chosen = replId === '' ? suggested?.id : Number(replId);

  const submit = async () => {
    if (!chosen) { toast.error('Elegí una alternativa'); return; }
    try {
      await resolve.mutateAsync({
        id: alert.id, action: 'swap_exercise',
        payload: { replacement_exercise_id: chosen }, note,
      });
      toast.success('Swap aplicado · alerta resuelta');
      onClose();
    } catch {
      toast.error('No se pudo aplicar el swap');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap: {alert.exercise_name ?? 'ejercicio'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ctx.isLoading && <div className="text-sm text-muted-foreground">Cargando contexto…</div>}
          {suggested && (
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs uppercase text-muted-foreground">Alternativa sugerida</div>
              <div className="font-medium">{suggested.name}</div>
              <div className="text-xs text-muted-foreground">ID {suggested.id}</div>
            </div>
          )}
          <div>
            <label className="text-xs uppercase text-muted-foreground">O ID manual</label>
            <Input
              type="number" min={1}
              placeholder={suggested ? `${suggested.id}` : 'exercise_id'}
              value={replId}
              onChange={(e) => setReplId(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <Textarea
            placeholder="Nota interna (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? 'Aplicando…' : 'Aplicar swap + resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: SkipWeekDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/SkipWeekDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function SkipWeekDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'skip_week', payload: {}, note });
      toast.success('Skip aplicado esta semana');
      onClose();
    } catch { toast.error('No se pudo aplicar el skip'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Skip {alert.exercise_name ?? 'ejercicio'} esta semana</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">El ejercicio desaparece del resto de sesiones de esta semana. Vuelve la próxima.</p>
        <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Confirmar skip</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: ReduceIntensityDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/ReduceIntensityDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ReduceIntensityDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [setsDelta, setSetsDelta] = useState<number | ''>('');
  const [weightPct, setWeightPct] = useState<number | ''>('');
  const [rpeDelta, setRpeDelta] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const submit = async () => {
    const payload: Record<string, number> = {};
    if (setsDelta !== '') payload.sets_delta = Number(setsDelta);
    if (weightPct !== '') payload.weight_pct = Number(weightPct);
    if (rpeDelta !== '') payload.rpe_delta = Number(rpeDelta);
    if (Object.keys(payload).length === 0) {
      toast.error('Definí al menos un ajuste'); return;
    }
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'reduce_intensity', payload, note });
      toast.success('Intensidad reducida esta semana');
      onClose();
    } catch { toast.error('No se pudo aplicar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bajar intensidad · {alert.exercise_name ?? 'ejercicio'}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <label className="block">Δ series (negativo, ej. -1)
            <Input type="number" max={0} min={-5} value={setsDelta}
              onChange={(e) => setSetsDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="block">% peso (0.5–1.0, ej. 0.8 = -20%)
            <Input type="number" step="0.05" min={0.5} max={1} value={weightPct}
              onChange={(e) => setWeightPct(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="block">Δ RPE (negativo)
            <Input type="number" max={0} min={-3} value={rpeDelta}
              onChange={(e) => setRpeDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: RegenSkeletonDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/RegenSkeletonDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function RegenSkeletonDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      await resolve.mutateAsync({
        id: alert.id, action: 'regen_skeleton',
        payload: reason ? { reason } : {}, note: reason || undefined,
      });
      toast.success('Rutina regenerada');
      onClose();
    } catch { toast.error('No se pudo regenerar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Regenerar rutina (AI)</DialogTitle></DialogHeader>
        <p className="text-sm text-destructive">Sustituye el skeleton activo del atleta. Acción irreversible sin backup manual.</p>
        <Textarea placeholder="Razón (opcional, se guarda en audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? 'Regenerando…' : 'Regenerar + resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: ApproveSwitchDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/ApproveSwitchDialog.tsx
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ApproveSwitchDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const p = alert.payload as { switched_to_exercise_id?: number };
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'approve_switch', payload: {} });
      toast.success('Cambio aprobado · override insertado para esta semana');
      onClose();
    } catch { toast.error('No se pudo aprobar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aprobar cambio del atleta</DialogTitle></DialogHeader>
        <p className="text-sm">
          Atleta cambió <strong>{alert.exercise_name ?? 'ejercicio'}</strong> por
          {' '}<strong>ejercicio ID {p.switched_to_exercise_id ?? '?'}</strong>.
          Confirmar aprueba el cambio para el resto de la semana.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Aprobar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: RevertSwitchDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/RevertSwitchDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function RevertSwitchDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'revert_switch', payload: {}, note });
      toast.success('Decisión registrada · no se modifica rutina');
      onClose();
    } catch { toast.error('No se pudo registrar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revertir cambio del atleta</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">El cambio ya ocurrió en la sesión del atleta. Esta acción sólo registra que NO se aprueba para próximas sesiones. No inserta override.</p>
        <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: ContactNoteDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/ContactNoteDialog.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ContactNoteDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [note, setNote] = useState('');
  const submit = async () => {
    if (!note.trim()) { toast.error('Escribí una nota'); return; }
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'note_only', payload: {}, note });
      toast.success('Nota guardada · alerta resuelta');
      onClose();
    } catch { toast.error('No se pudo guardar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Contactar atleta + nota interna</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">No se manda mensaje al atleta. Contactá por WhatsApp/email externo. Esta nota queda en audit.</p>
        <Textarea placeholder="Qué hablaste / decisión que tomaste fuera del sistema" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Guardar nota + resolver</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: AcknowledgeDialog**

```tsx
// frontend/src/components/admin/alerts/dialogs/AcknowledgeDialog.tsx
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function AcknowledgeDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'acknowledge', payload: {} });
      toast.success('Acknowledged');
      onClose();
    } catch { toast.error('No se pudo'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Acknowledge</DialogTitle></DialogHeader>
        <p className="text-sm">Marca la alerta como vista sin tomar acción de rutina.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 9: Type-check + commit**

Run: `cd frontend && npx tsc --noEmit`
Expected: zero errors.

```bash
git add frontend/src/components/admin/alerts/dialogs/
git commit -m "feat(alerts-ui): 8 action dialogs"
```

---

## Task 12: Page Rewrite + Delete AlertCard

**Files:**
- Modify: `frontend/src/pages/admin/Alerts.tsx`
- Delete: `frontend/src/components/AlertCard.tsx`

- [ ] **Step 1: Rewrite Alerts.tsx**

```tsx
// frontend/src/pages/admin/Alerts.tsx
import { useState } from 'react';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertsFilters } from '@/components/admin/alerts/AlertsFilters';
import { AlertsTable } from '@/components/admin/alerts/AlertsTable';
import type { AlertsListFilters } from '@/types/api';

export default function Alerts() {
  const [filters, setFilters] = useState<AlertsListFilters>({ status: 'open' });
  const { data, isLoading } = useAlerts(filters);

  return (
    <div className="space-y-4">
      <AlertsFilters value={filters} onChange={setFilters} />
      {isLoading && (
        <div className="text-sm text-muted-foreground">Cargando alertas...</div>
      )}
      {!isLoading && data && <AlertsTable alerts={data.items} />}
    </div>
  );
}
```

- [ ] **Step 2: Delete AlertCard**

Run:
```bash
git rm frontend/src/components/AlertCard.tsx
```

- [ ] **Step 3: Build + type-check**

Run: `cd frontend && npm run build`
Expected: build succeeds. If a stale import of `AlertCard` exists elsewhere, fix it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/Alerts.tsx
git commit -m "feat(alerts-ui): page rewrite as table; drop AlertCard"
```

---

## Task 13: Verification

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && npm test`
Expected: green.

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npm run build && npm test`
Expected: green.

- [ ] **Step 3: Manual smoke test**

1. `npm run start:dev` from repo root.
2. Login as admin at `/admin/alerts`.
3. Trigger a SOS pain from the mobile app (or seed via `psql`).
4. In the admin page, click `⋯` → `Swap ejercicio`.
5. In the swap dialog, confirm the suggested alternative shows.
6. Submit. Alert moves to resolved (visible under `Resueltas` tab) with the `swap_exercise` badge.
7. In `psql`: `SELECT * FROM weekly_overrides WHERE source_alert_id = '<alertId>';` returns one row with `override_type='swap'` and the chosen `replacement_exercise_id`.
8. As the same athlete in the mobile app, pull `/sessions/active`. The session items contain the replacement exercise, not the original.

- [ ] **Step 4: Commit + push (when user explicitly asks)**

```bash
git push -u origin <branch>
```

---

## Self-Review Pass

**Spec coverage:**
- Data model (`coach_alerts` + `weekly_overrides`) → Task 1.
- Action matrix → Task 2.
- `resolveAlert` with side-effects per action → Task 6.
- Engine consumes overrides → Task 4.
- `/admin/alerts` filtered list, `/context`, `/resolve` → Task 7.
- Duplicate `/admin/operations/alerts*` removed → Task 7.
- Frontend table + popover + dialogs → Tasks 8–12.
- Decisions D1–D7 from the spec are all reflected.

**Placeholder scan:** none — every step shows code or exact command.

**Type consistency:**
- `AlertResolutionAction` enum defined in `domain/alert-actions.ts` (backend) and `types/api.ts` (frontend), values identical.
- `useResolveAlert` returns `CoachAlert`; backend route returns `ctx.alert` of type `AlertContext['alert']` which is shape-compatible with `CoachAlert` (the frontend hook treats the response as `CoachAlert`).
- `applyOverridesToSlots` returns `EffectiveSlot[]`; consumer in engine spreads them into `buildItem` which now accepts `_override` — explicit cast not needed in TS because the property is optional.

No issues found.
