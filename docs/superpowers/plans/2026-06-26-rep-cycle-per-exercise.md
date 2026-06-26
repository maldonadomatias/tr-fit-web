# Per-Exercise Rep Cycle Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coach configure, per exercise, the rep count at which load increases ("tope"), and make the post-bump reset target depend on athlete sex (female → 4 reps, male/other → 6 reps), with reps climbing +2 each cycle.

**Architecture:** Add a `rep_cycle_threshold` integer column to `exercises` (admin-editable). Rewrite the accessory progression helper `advanceReps` to a unified rule: for plain-integer rep schemes, climb +2 until reaching the exercise's threshold, then reset to a sex-based value and bump weight. Legacy range/pyramid schemes (`"4 a 6"`, `"10x10x10"`, etc.) keep their existing rotation untouched. The weekly progression service fetches the athlete's `gender` and passes both `threshold` and `resetReps` into the helper.

**Tech Stack:** Node 20 + Express + TypeScript (ESM), PostgreSQL (`pg`), Jest (backend). React 19 + Vite + TypeScript + react-hook-form + zod + shadcn/ui (frontend). Vitest (frontend).

## Global Constraints

- Backend & frontend use ESM (`"type": "module"`); import local modules with `.js` extension in backend TS.
- Prettier: semicolons, single quotes, 80 print width, 2-space indent, ES5 trailing commas.
- Migrations: SQL files in `backend/src/db/migrations/` named `NNN_description.sql`, idempotent (`IF NOT EXISTS`), run via `cd backend && npm run db:migrate`. Next number is **046**.
- Default rep cycle threshold is **12**. The four legacy "hasta 15" exercises seed to **15**.
- Sex reset values are **exactly**: `female → 4`, `male → 6`, `other → 6`.
- Reps are climbed by **+2** and clamped so the cycle lands **exactly on the threshold** before resetting (so an odd threshold like 15 is reached on the nose: …12 → 14 → 15 → reset).

---

### Task 1: Database migration — `rep_cycle_threshold` column

**Files:**
- Create: `backend/src/db/migrations/046_rep_cycle_threshold.sql`

**Interfaces:**
- Produces: `exercises.rep_cycle_threshold INTEGER NOT NULL DEFAULT 12` (range-checked 1–50), seeded to 15 for the four legacy hasta-15 exercises.

- [ ] **Step 1: Write the migration SQL**

Create `backend/src/db/migrations/046_rep_cycle_threshold.sql`:

```sql
-- 046_rep_cycle_threshold.sql
--
-- Accessory progression previously hardcoded two rep "topes": a set of four
-- named exercises that climbed to 15 reps before bumping weight, and a default
-- of 12 for everything else (see progression-helpers.ts). Make the tope a
-- per-exercise, coach-editable value. Reps climb by +2 up to this threshold,
-- then reset to a sex-based value and bump the load.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS rep_cycle_threshold INTEGER NOT NULL DEFAULT 12
    CHECK (rep_cycle_threshold BETWEEN 1 AND 50);

-- Backfill the four legacy "hasta 15" exercises.
UPDATE exercises
   SET rep_cycle_threshold = 15
 WHERE name IN (
   'Face Pull parado con Soga',
   'Vuelos Posteriores Sentado con Mancuernas',
   'Vuelos Laterales con Mancuerna',
   'Vuelo Lateral Unilateral en polea altura Rodilla'
 );
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run db:migrate`
Expected: completes without error; migration `046_rep_cycle_threshold.sql` reported as applied.

- [ ] **Step 3: Verify column + backfill**

Run: `cd backend && node --input-type=module -e "import pool from './src/db/connect.js'; const r = await pool.query(\"SELECT name, rep_cycle_threshold FROM exercises WHERE rep_cycle_threshold = 15 ORDER BY name\"); console.log(r.rows); await pool.end();"`
Expected: the four seeded exercise names listed, each with `rep_cycle_threshold: 15`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/046_rep_cycle_threshold.sql
git commit -m "feat(db): add per-exercise rep_cycle_threshold column"
```

---

### Task 2: Backend Exercise type + admin CRUD plumbing

**Files:**
- Modify: `backend/src/domain/types.ts:15-32` (Exercise interface)
- Modify: `backend/src/services/admin-exercise.service.ts:53-59` (SELECT_COLS), `:131-143` (INSERT)
- Modify: `backend/src/routes/admin-exercises.ts:40-55` (createBody schema)

**Interfaces:**
- Consumes: `exercises.rep_cycle_threshold` from Task 1.
- Produces: `Exercise.rep_cycle_threshold: number` available on every read, settable on create/update via admin API.

- [ ] **Step 1: Add field to the backend Exercise type**

In `backend/src/domain/types.ts`, add the field to the `Exercise` interface (after `default_target` on line 31):

```ts
  modality: ExerciseModality;
  default_target: string | null;
  rep_cycle_threshold: number;
```

- [ ] **Step 2: Include the column in SELECT_COLS**

In `backend/src/services/admin-exercise.service.ts`, update `SELECT_COLS` (lines 53-59):

```ts
const SELECT_COLS = `
  id, name, muscle_group, equipment, movement_pattern,
  is_principal, is_unilateral, level_min,
  contraindicated_for, default_increment_kg, alternatives_ids,
  video_url, illustration_url, archived_at,
  modality, default_target, rep_cycle_threshold
`;
```

- [ ] **Step 3: Include the column in createExercise INSERT**

In `backend/src/services/admin-exercise.service.ts`, update the INSERT in `createExercise` (lines 131-143) to add `rep_cycle_threshold` as the 15th column/param:

```ts
    const r = await pool.query<Exercise>(
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          is_principal, is_unilateral, level_min,
          contraindicated_for, default_increment_kg, alternatives_ids,
          video_url, illustration_url, modality, default_target,
          rep_cycle_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${SELECT_COLS}`,
      [
        input.name, input.muscle_group, input.equipment, input.movement_pattern,
        input.is_principal, input.is_unilateral, input.level_min,
        input.contraindicated_for, input.default_increment_kg, input.alternatives_ids,
        input.video_url, input.illustration_url, input.modality, input.default_target,
        input.rep_cycle_threshold,
      ],
    );
```

Note: `normalize()` and `updateExercise()` need no change — `updateExercise` builds its SET clause dynamically from `Object.keys(patch)`, so a `rep_cycle_threshold` key flows through automatically.

- [ ] **Step 4: Add validation to the create/update body schema**

In `backend/src/routes/admin-exercises.ts`, add the field to `createBody` (after `default_target` on line 54):

```ts
  modality: ModalityEnum.default('reps'),
  default_target: z.string().trim().max(60).nullable().default(null),
  rep_cycle_threshold: z.number().int().min(1).max(50).default(12),
```

`updateBody = createBody.partial()` (line 57) picks this up automatically.

- [ ] **Step 5: Typecheck the backend**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. (If `tsc` reports the `Exercise` mock in `backend/tests/unit/progression-helpers.test.ts` is missing `rep_cycle_threshold`, that mock does not satisfy the full `Exercise` type — it is a local literal, not typed as `Exercise`, so it should not error. If it does, add `rep_cycle_threshold: 12` to the mock in that file.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/types.ts backend/src/services/admin-exercise.service.ts backend/src/routes/admin-exercises.ts
git commit -m "feat(admin): plumb rep_cycle_threshold through exercise CRUD"
```

---

### Task 3: Rewrite `advanceReps` — threshold + sex-based reset

**Files:**
- Modify: `backend/src/services/progression-helpers.ts:110-138` (AdvanceResult, advanceReps)
- Test: `backend/tests/unit/progression-helpers.test.ts:90-135` (rewrite the advanceReps describe blocks)

**Interfaces:**
- Produces: new signature
  ```ts
  interface AdvanceOptions { threshold: number; resetReps: number; }
  function advanceReps(currentReps: string, opts: AdvanceOptions): AdvanceResult;
  ```
  where `AdvanceResult = { newReps: string; bumpWeight: boolean }`.
- Behavior: for a plain-integer `currentReps`, climb `+2` and clamp to `threshold`; when `currentReps >= threshold`, return `{ newReps: String(resetReps), bumpWeight: true }`. Non-integer schemes fall through to the existing `ADVANCE_REPS` table unchanged.

- [ ] **Step 1: Rewrite the advanceReps unit tests (failing)**

In `backend/tests/unit/progression-helpers.test.ts`, replace the three describe blocks `'advanceReps — simple reps rotation'`, `'advanceReps — range rotation'`, `'advanceReps — pyramid rotations'`, and `'advanceReps — ejerciciosHasta15'` (lines 90-135) with:

```ts
describe('advanceReps — integer climb to threshold (male reset 6)', () => {
  const opts = { threshold: 12, resetReps: 6 };
  it.each([
    ['6', { newReps: '8', bumpWeight: false }],
    ['8', { newReps: '10', bumpWeight: false }],
    ['10', { newReps: '12', bumpWeight: false }],
    ['12', { newReps: '6', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, opts)).toEqual(expected);
  });
});

describe('advanceReps — integer climb to threshold (female reset 4)', () => {
  const opts = { threshold: 12, resetReps: 4 };
  it.each([
    ['4', { newReps: '6', bumpWeight: false }],
    ['10', { newReps: '12', bumpWeight: false }],
    ['12', { newReps: '4', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, opts)).toEqual(expected);
  });
});

describe('advanceReps — odd threshold lands exactly (15)', () => {
  it('male: 12 -> 14', () => {
    expect(advanceReps('12', { threshold: 15, resetReps: 6 }))
      .toEqual({ newReps: '14', bumpWeight: false });
  });
  it('male: 14 -> 15 (clamped, no bump yet)', () => {
    expect(advanceReps('14', { threshold: 15, resetReps: 6 }))
      .toEqual({ newReps: '15', bumpWeight: false });
  });
  it('male: 15 -> reset 6 with weight bump', () => {
    expect(advanceReps('15', { threshold: 15, resetReps: 6 }))
      .toEqual({ newReps: '6', bumpWeight: true });
  });
});

describe('advanceReps — at or above threshold resets and bumps', () => {
  it('exactly at threshold', () => {
    expect(advanceReps('12', { threshold: 12, resetReps: 6 }))
      .toEqual({ newReps: '6', bumpWeight: true });
  });
  it('above threshold (defensive)', () => {
    expect(advanceReps('16', { threshold: 12, resetReps: 6 }))
      .toEqual({ newReps: '6', bumpWeight: true });
  });
});

describe('advanceReps — legacy range/pyramid schemes unchanged', () => {
  const opts = { threshold: 12, resetReps: 6 };
  it.each([
    ['4 a 6', { newReps: '6 a 8', bumpWeight: false }],
    ['10 a 12', { newReps: '4 a 6', bumpWeight: true }],
    ['10x10x10', { newReps: '12x12x12', bumpWeight: false }],
    ['12x12x12', { newReps: '10x10x10', bumpWeight: true }],
    ['10 - 8 - 6', { newReps: '12 - 10 - 8', bumpWeight: true }],
    ['10x8x6x8x10', { newReps: '8x6x4x6x8', bumpWeight: true }],
  ])('%s -> %o', (input, expected) => {
    expect(advanceReps(input, opts)).toEqual(expected);
  });
});

describe('advanceReps — unknown pattern holds', () => {
  it('passes through unchanged, no bump', () => {
    expect(advanceReps('AMRAP', { threshold: 12, resetReps: 6 }))
      .toEqual({ newReps: 'AMRAP', bumpWeight: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/unit/progression-helpers.test.ts -t advanceReps`
Expected: FAIL — current `advanceReps(currentReps, isHasta15: boolean)` signature doesn't accept an options object; integer-climb and odd-threshold cases fail.

- [ ] **Step 3: Implement the new advanceReps**

In `backend/src/services/progression-helpers.ts`, replace the `AdvanceResult` interface and `advanceReps` function (lines 110-138) with:

```ts
export interface AdvanceResult {
  newReps: string;
  bumpWeight: boolean;
}

export interface AdvanceOptions {
  /** Rep "tope": reps climb +2 up to this, then reset and bump weight. */
  threshold: number;
  /** Reset rep target after a bump — sex-based: female 4, male/other 6. */
  resetReps: number;
}

export function advanceReps(
  currentReps: string,
  opts: AdvanceOptions,
): AdvanceResult {
  const { threshold, resetReps } = opts;

  // Plain-integer rep schemes (e.g. "6", "12", "15").
  if (/^\d+$/.test(currentReps.trim())) {
    const cur = parseInt(currentReps.trim(), 10);
    if (cur >= threshold) {
      return { newReps: String(resetReps), bumpWeight: true };
    }
    const next = cur + 2;
    return {
      newReps: String(next >= threshold ? threshold : next),
      bumpWeight: false,
    };
  }

  // Legacy range / pyramid rotations — unchanged.
  const next = ADVANCE_REPS[currentReps];
  if (next) {
    return { newReps: next, bumpWeight: REP_BUMP_TRIGGERS.has(currentReps) };
  }

  // Unknown pattern: hold.
  return { newReps: currentReps, bumpWeight: false };
}
```

Note: `EJERCICIOS_HASTA_15`, `REPS_SIMPLES`, `ADVANCE_REPS`, and `REP_BUMP_TRIGGERS` remain exported. `REPS_SIMPLES` and `EJERCICIOS_HASTA_15` are no longer referenced by `advanceReps`; leave them defined (still imported by the test file and removed from the service in Task 4). Do not delete `EJERCICIOS_HASTA_15` here — Task 4 removes its last runtime use.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/unit/progression-helpers.test.ts -t advanceReps`
Expected: PASS — all advanceReps describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/progression-helpers.ts backend/tests/unit/progression-helpers.test.ts
git commit -m "feat(progression): threshold + sex-based reset in advanceReps"
```

---

### Task 4: Wire threshold + athlete sex into weekly progression

**Files:**
- Modify: `backend/src/services/progression.service.ts:3-9` (imports), `:44-52` (fetch gender), `:105-107` (call new advanceReps)
- Test: `backend/tests/integration/progression.service.test.ts` (add a sex-based reset case)

**Interfaces:**
- Consumes: `Exercise.rep_cycle_threshold` (Task 2), `advanceReps(currentReps, { threshold, resetReps })` (Task 3), `athlete_profiles.gender`.
- Produces: weekly cron resets a completed accessory to `4` (female) or `6` (male/other) reps and bumps weight when the athlete reaches the exercise's `rep_cycle_threshold`.

- [ ] **Step 1: Add a failing integration test for sex-based reset**

Open `backend/tests/integration/progression.service.test.ts` and read its existing setup helpers (how it seeds an athlete, profile, skeleton, weights, and set_logs). Add one test that: seeds a **female** athlete with an accessory exercise whose `rep_cycle_threshold = 12`, sets `current_reps_text = '12'` and a known weight, logs all sets completed for the week, runs `runWeeklyProgressionForAthlete`, then asserts the row in `athlete_exercise_weights` now has `current_reps_text = '4'` and an increased weight. Mirror the seeding style already used in that file (do not invent new helpers). The assertion that locks in the new behavior:

```ts
const w = await pool.query(
  `SELECT current_reps_text, current_value
     FROM athlete_exercise_weights
    WHERE athlete_id = $1 AND exercise_id = $2`,
  [athleteId, exerciseId],
);
expect(w.rows[0].current_reps_text).toBe('4'); // female reset
expect(Number(w.rows[0].current_value)).toBeGreaterThan(startWeight);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/integration/progression.service.test.ts`
Expected: FAIL — current service uses the old `advanceReps(currentReps, isHasta15)` and resets to `'4 a 6'` (a range string), not `'4'`.

- [ ] **Step 3: Update the imports**

In `backend/src/services/progression.service.ts`, replace the helper import block (lines 3-6) with:

```ts
import {
  advanceReps, applyIncrement, isExcludedFromAutoProgression,
} from './progression-helpers.js';
```

(Removes the now-unused `EJERCICIOS_HASTA_15` import.)

- [ ] **Step 4: Fetch the athlete's gender once per run**

In `backend/src/services/progression.service.ts`, immediately after the `if (!state || !state.active_skeleton_id) { ... }` block (after line 51, before `const fromWeek = state.current_week;`), add:

```ts
    const genderR = await client.query<{ gender: string }>(
      `SELECT gender FROM athlete_profiles WHERE user_id = $1`,
      [athleteId],
    );
    const resetReps = genderR.rows[0]?.gender === 'female' ? 4 : 6;
```

- [ ] **Step 5: Replace the per-exercise advance call**

In `backend/src/services/progression.service.ts`, replace the three lines that compute `isHasta15` / `currentReps` / `adv` (lines 105-107) with:

```ts
      const threshold = ex.rep_cycle_threshold ?? 12;
      const currentReps = w.current_reps_text ?? '8';
      const adv = advanceReps(currentReps, { threshold, resetReps });
```

- [ ] **Step 6: Run the integration test + full progression suite**

Run: `cd backend && npx jest tests/integration/progression.service.test.ts tests/integration/progression-cron.test.ts`
Expected: PASS — including the new female-reset test. Fix any pre-existing test that asserted the old `'4 a 6'` reset string for a numeric scheme (update it to the new single-number reset).

- [ ] **Step 7: Typecheck the backend**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/progression.service.ts backend/tests/integration/progression.service.test.ts
git commit -m "feat(progression): per-exercise threshold and sex-based rep reset in weekly cron"
```

---

### Task 5: Frontend — type, editor field, list column

**Files:**
- Modify: `frontend/src/types/api.ts:248-265` (Exercise interface)
- Modify: `frontend/src/components/admin/exercises/ExerciseDialog.tsx:34-49` (schema), `:53-76` (exerciseToForm), `:78-97` (formToPayload), `:263-266` (form field)
- Modify: `frontend/src/pages/admin/Exercises.tsx:126-138` (table header), `:166-171` (table cell)

**Interfaces:**
- Consumes: `Exercise.rep_cycle_threshold` from the API (Task 2). `CreateExerciseInput` in `frontend/src/hooks/useAdminExercises.ts:47` is `Omit<Exercise, 'id' | 'archived_at'>`, so it inherits the new field automatically once the `Exercise` type has it.
- Produces: an editable "Tope de repes (ciclo)" numeric input and a "Tope" column in the exercises table.

- [ ] **Step 1: Add the field to the frontend Exercise type**

In `frontend/src/types/api.ts`, add to the `Exercise` interface (after `default_target` on line 263):

```ts
  modality: ExerciseModality;
  default_target: string | null;
  rep_cycle_threshold: number;
  archived_at: string | null;
```

- [ ] **Step 2: Add the field to the dialog form schema + conversions**

In `frontend/src/components/admin/exercises/ExerciseDialog.tsx`:

(a) In `schema` (after `default_target` on line 48):

```ts
  modality: z.enum(MODALITIES),
  default_target: z.string().trim().max(60),
  rep_cycle_threshold: z.coerce.number().int().min(1).max(50),
```

(b) In `exerciseToForm`, the create-mode default object (after `modality: 'reps', default_target: '',` on line 61):

```ts
      modality: 'reps', default_target: '',
      rep_cycle_threshold: 12,
```

(c) In `exerciseToForm`, the edit-mode return (after `default_target: e.default_target ?? '',` on line 74):

```ts
    modality: e.modality,
    default_target: e.default_target ?? '',
    rep_cycle_threshold: e.rep_cycle_threshold,
```

(d) In `formToPayload` (after the `default_target` line on line 95):

```ts
    default_target: v.default_target.trim() === '' ? null : v.default_target.trim(),
    rep_cycle_threshold: Number(v.rep_cycle_threshold),
```

- [ ] **Step 3: Add the input control to the dialog (Column 2)**

In `frontend/src/components/admin/exercises/ExerciseDialog.tsx`, after the `default_target` field block (the `<div>` ending on line 266), insert:

```tsx
              <div>
                <Label htmlFor="rep_cycle_threshold">Tope de repes (ciclo)</Label>
                <Input
                  id="rep_cycle_threshold"
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  {...form.register('rep_cycle_threshold')}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Al llegar a estas repes sube la carga y baja a 4 (mujer) o 6 (varón).
                </p>
              </div>
```

- [ ] **Step 4: Add the "Tope" column to the list table**

In `frontend/src/pages/admin/Exercises.tsx`:

(a) Add the header after the `Nivel` `<TableHead>` (line 135):

```tsx
            <TableHead>Nivel</TableHead>
            <TableHead>Tope</TableHead>
```

(b) Add the cell after the `level_min` `<TableCell>` (line 171):

```tsx
                <TableCell>{e.level_min}</TableCell>
                <TableCell>{e.rep_cycle_threshold}</TableCell>
```

(c) The two loading/empty rows use `colSpan={8}` (lines 143 and 149). Bump both to `colSpan={9}` since the table now has 9 columns.

- [ ] **Step 5: Typecheck + lint the frontend**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no type errors, no new lint errors.

- [ ] **Step 6: Build the frontend**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/components/admin/exercises/ExerciseDialog.tsx frontend/src/pages/admin/Exercises.tsx
git commit -m "feat(admin-ui): edit and display per-exercise rep cycle threshold"
```

---

## Open question for the coach (confirm before/after build)

1. **Athletes marked "otro" (or unspecified) sex** → this plan resets them to **6 reps** (same as male). Confirm.
2. **Odd thresholds** (e.g. 15) → reps land exactly on the threshold via the +2 climb: …12 → 14 → **15** → reset. Confirm this matches the intent (vs. stopping at 14).

Both are encoded as the Global Constraints above; changing them is a one-line edit in Task 3 (`resetReps`) / the clamp in `advanceReps`.

## Self-Review notes

- **Spec coverage:** per-exercise threshold (Tasks 1,2,5) ✓; sex-based reset 4/6 (Tasks 3,4) ✓; +2 climb (Task 3) ✓; admin UI to set it (Task 5) ✓; legacy range/pyramid schemes preserved (Task 3 fall-through, tested) ✓.
- **Type consistency:** `rep_cycle_threshold: number` is identical across `backend/domain/types.ts`, `frontend/types/api.ts`, the zod schemas, and the DB column. `advanceReps` new signature `(string, {threshold, resetReps})` used consistently in Task 3 (def + tests) and Task 4 (call site).
- **No placeholders:** every step shows concrete code/SQL/commands.
