# Exercise Modality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give exercises a `modality` (reps / tiempo / distancia) + `default_target`, so time/distance exercises (e.g. "Bicicleta fija") stop showing a bogus "10 reps" and render their real prescription instead.

**Architecture:** Modality is intrinsic to the exercise (one new enum column + a free-text default target). The engine stamps each `SessionItem` with the exercise's modality and, for warmups, uses `default_target` instead of the hardcoded `'10'`. The admin lets the coach set both. The app reads `modality` to pick the target label and to gate reps-only UI (RPE, weight, rep stepper). Non-reps sets log `completed=true` with no value/reps/rpe.

**Tech Stack:** Backend: Node + Express + TypeScript + PostgreSQL (pg) + Jest. Frontend admin: React 19 + Vite + react-hook-form + zod + Vitest. App: Expo RN + NativeWind + Zustand + Jest.

**Spec:** `docs/superpowers/specs/2026-06-12-exercise-modality-design.md`

**Repos / cwd:**
- Backend + admin frontend: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web` (`backend/`, `frontend/`).
- Mobile app: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`.

**Conventions:** Conventional Commits, header-only. NEVER add AI attribution trailers. Backend tests: `cd backend && npx jest <path>`. Frontend tests: `cd frontend && npx vitest run <path>`. App tests: `npx jest <path>` from the app root. The app `.ai/global/rules/60-vcs.md` also forbids AI trailers.

---

## File Structure

**Backend (`tr-fit-web/backend/`):**
- Create: `src/db/migrations/033_exercise_modality.sql` — add columns + backfill.
- Modify: `src/domain/types.ts` — `ExerciseModality`, `Exercise.modality`/`default_target`, `SessionItem.modality`.
- Modify: `src/services/admin-exercise.service.ts` — interface, `SELECT_COLS`, INSERT.
- Modify: `src/routes/admin-exercises.ts` — zod `createBody` modality + default_target.
- Modify: `src/services/engine.service.ts` — `baseItem` modality param, warmup target.
- Test: `tests/unit/engine-modality.test.ts`, `tests/integration/admin-exercises.test.ts` (extend).

**Admin frontend (`tr-fit-web/frontend/`):**
- Modify: `src/types/api.ts` — `ExerciseModality`, `Exercise` fields.
- Modify: `src/components/admin/exercises/ExerciseDialog.tsx` — modality select + default_target input.

**App (`tr-fit-app/`):**
- Modify: `lib/api.ts` — `SessionItem.modality`.
- Create: `lib/exercise-target.ts` — `targetDisplay` / `isRepBased`.
- Test: `__tests__/exercise-target.test.ts`.
- Modify: `components/session/PreSetCard.tsx`, `InSetView.tsx`, `PostSetCard.tsx`, `GuidedSessionScreen.tsx`, `lib/guided-log.ts`.
- Modify: `app/(app)/session/active.tsx` (carril) + `components/session/SetRowIter.tsx`.

---

## Task 1: Migration — modality + default_target columns

**Files:**
- Create: `backend/src/db/migrations/033_exercise_modality.sql`

- [ ] **Step 1: Write the migration**

Create `backend/src/db/migrations/033_exercise_modality.sql`:
```sql
-- 033_exercise_modality.sql
--
-- Exercises had no notion of modality: every prescription was assumed to be
-- repetitions. Time/distance exercises (e.g. "Bicicleta fija", a 5-min cardio
-- warmup) were forced to show "10 reps". Add an intrinsic modality + a free-text
-- default target, and backfill existing cardio exercises to 'tiempo'.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'reps'
    CHECK (modality IN ('reps', 'tiempo', 'distancia')),
  ADD COLUMN IF NOT EXISTS default_target TEXT;

UPDATE exercises SET modality = 'tiempo' WHERE movement_pattern = 'cardio';
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run db:migrate`
Expected: migration `033_exercise_modality.sql` applies without error.

- [ ] **Step 3: Verify the schema and backfill**

Run:
```bash
cd backend && node -e "import('./src/db/connect.js').then(async ({default:p})=>{const r=await p.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='exercises' AND column_name IN ('modality','default_target') ORDER BY column_name\");console.log(r.rows);const c=await p.query(\"SELECT count(*)::int n FROM exercises WHERE movement_pattern='cardio' AND modality<>'tiempo'\");console.log('cardio not tiempo:',c.rows[0].n);process.exit(0)})"
```
Expected: prints both column names; `cardio not tiempo: 0`.

> If the project runs migrations only inside Docker, run `docker-compose -f docker-compose.yml -f docker-compose.dev.yml run --rm backend npm run db:migrate` instead. Use whichever path the repo's `npm run db:migrate` expects.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/033_exercise_modality.sql
git commit -m "feat(exercises): add modality and default_target columns"
```

---

## Task 2: Backend domain types

**Files:**
- Modify: `backend/src/domain/types.ts`

- [ ] **Step 1: Add the modality type + Exercise fields**

In `backend/src/domain/types.ts`, just above `export interface Exercise {` (currently near line 47), add:
```ts
export type ExerciseModality = 'reps' | 'tiempo' | 'distancia';
```
Inside `interface Exercise`, after `illustration_url: string | null;`, add:
```ts
  modality: ExerciseModality;
  default_target: string | null;
```

- [ ] **Step 2: Add modality to SessionItem**

In the same file, inside `interface SessionItem` (near line 107), after `reps: string;`, add:
```ts
  modality: ExerciseModality;
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: errors ONLY where `SessionItem` / `Exercise` literals are constructed without the new fields (engine `baseItem` — fixed in Task 5) and the admin service `Exercise` (its own interface — Task 3). Note them; they are addressed in later tasks. No errors elsewhere.

- [ ] **Step 4: Commit**

```bash
git add backend/src/domain/types.ts
git commit -m "feat(exercises): add modality to domain Exercise and SessionItem types"
```

---

## Task 3: Admin exercise service — persist modality + default_target

**Files:**
- Modify: `backend/src/services/admin-exercise.service.ts`
- Test: `backend/tests/integration/admin-exercises.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/admin-exercises.test.ts` a test inside the existing top-level `describe` (match the file's existing setup/helpers for auth + db). Add:
```ts
it('persists and returns modality and default_target', async () => {
  const created = await createExercise({
    name: `Bici Test ${Date.now()}`,
    muscle_group: 'cardio',
    equipment: 'maquina',
    movement_pattern: 'cardio',
    is_principal: false,
    is_unilateral: false,
    level_min: 'principiante',
    contraindicated_for: [],
    default_increment_kg: 1,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
    modality: 'tiempo',
    default_target: '5 min',
  });
  expect(created.modality).toBe('tiempo');
  expect(created.default_target).toBe('5 min');

  const updated = await updateExercise(created.id, { default_target: '10 min' });
  expect(updated.modality).toBe('tiempo');
  expect(updated.default_target).toBe('10 min');
});
```
Ensure `createExercise` and `updateExercise` are imported in this test file (they are used by sibling tests; add to the import if missing).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/integration/admin-exercises.test.ts -t "modality"`
Expected: FAIL — TypeScript rejects `modality`/`default_target` on the input, or the returned object lacks them.

- [ ] **Step 3: Update the service**

In `backend/src/services/admin-exercise.service.ts`:

(a) Add the modality type and extend `Exercise` (this file declares its own `Exercise`):
```ts
export type ExerciseModality = 'reps' | 'tiempo' | 'distancia';
```
In `interface Exercise`, after `archived_at: string | null;` add:
```ts
  modality: ExerciseModality;
  default_target: string | null;
```

(b) Extend `SELECT_COLS` — append the two columns:
```ts
const SELECT_COLS = `
  id, name, muscle_group, equipment, movement_pattern,
  is_principal, is_unilateral, level_min,
  contraindicated_for, default_increment_kg, alternatives_ids,
  video_url, illustration_url, archived_at,
  modality, default_target
`;
```

(c) Extend the INSERT in `createExercise` — add columns + params:
```ts
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          is_principal, is_unilateral, level_min,
          contraindicated_for, default_increment_kg, alternatives_ids,
          video_url, illustration_url, modality, default_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${SELECT_COLS}`,
      [
        input.name, input.muscle_group, input.equipment, input.movement_pattern,
        input.is_principal, input.is_unilateral, input.level_min,
        input.contraindicated_for, input.default_increment_kg, input.alternatives_ids,
        input.video_url, input.illustration_url, input.modality, input.default_target,
      ],
```
`CreateExerciseInput` is `Omit<Exercise, 'id' | 'archived_at'>`, so it now includes `modality` + `default_target` automatically. `updateExercise` builds its SET clause dynamically from `Object.keys(patch)`, so it already handles both new keys with no change.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest tests/integration/admin-exercises.test.ts -t "modality"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/admin-exercise.service.ts backend/tests/integration/admin-exercises.test.ts
git commit -m "feat(exercises): persist modality and default_target in admin service"
```

---

## Task 4: Admin route validation

**Files:**
- Modify: `backend/src/routes/admin-exercises.ts`

- [ ] **Step 1: Add modality + default_target to the zod schema**

In `backend/src/routes/admin-exercises.ts`, after the `LevelEnum` declaration add:
```ts
const ModalityEnum = z.enum(['reps', 'tiempo', 'distancia']);
```
In `createBody`, after `illustration_url: z.string().url().nullable(),` add:
```ts
  modality: ModalityEnum,
  default_target: z.string().trim().min(1).max(60).nullable(),
```
`updateBody = createBody.partial()` already inherits both.

- [ ] **Step 2: Typecheck + targeted route test (manual contract check)**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors in this file.

Then verify the contract accepts the new fields:
```bash
cd backend && node -e "import('zod').then(async z=>{})" >/dev/null 2>&1; echo "schema compiled via tsc above"
```
(The integration test in Task 3 exercises the service; route-level zod is validated by tsc + the existing route tests if present. If `tests/integration/admin-exercises.test.ts` posts through the HTTP layer, add `modality: 'reps', default_target: null` to any existing create payloads there that now fail validation.)

- [ ] **Step 3: Run the full admin-exercises suite**

Run: `cd backend && npx jest tests/integration/admin-exercises.test.ts`
Expected: PASS (all tests). Fix any existing create payloads in the test that lack the now-required `modality` by adding `modality: 'reps', default_target: null`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin-exercises.ts
git commit -m "feat(exercises): validate modality and default_target in admin route"
```

---

## Task 5: Engine — stamp modality + warmup target

**Files:**
- Modify: `backend/src/services/engine.service.ts`
- Test: `backend/tests/unit/engine-modality.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/engine-modality.test.ts` (mirrors the fake-pool pattern of `tests/unit/engine.service.test.ts`):
```ts
import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5433/mydb';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';
process.env.MP_ACCESS_TOKEN ??= 'mp-test';
process.env.MP_WEBHOOK_SECRET ??= 'mp-webhook-test';
process.env.MP_PLAN_ID_BASICO ??= 'plan-b';
process.env.MP_PLAN_ID_FULL ??= 'plan-f';
process.env.MP_PLAN_ID_PREMIUM ??= 'plan-p';

const { buildWarmupItemForTest } = await import('../../src/services/engine.service.js');

const cardioExercise = {
  id: 1, name: 'Bicicleta fija', muscle_group: 'cardio', equipment: 'maquina',
  movement_pattern: 'cardio', is_principal: false, is_unilateral: false,
  level_min: 'principiante', contraindicated_for: [], default_increment_kg: 1,
  alternatives_ids: [], video_url: null, illustration_url: null,
  modality: 'tiempo' as const, default_target: '5 min',
};
const articularExercise = {
  ...cardioExercise, id: 2, name: 'Movimiento articular',
  movement_pattern: 'isolation', modality: 'reps' as const, default_target: null,
};

describe('warmup item modality', () => {
  it('time warmup uses default_target as reps text and carries modality', () => {
    const item = buildWarmupItemForTest(cardioExercise, 'kg', 0, null);
    expect(item.modality).toBe('tiempo');
    expect(item.reps).toBe('5 min');
  });
  it('reps warmup with no default_target falls back to "10"', () => {
    const item = buildWarmupItemForTest(articularExercise, 'kg', 0, null);
    expect(item.modality).toBe('reps');
    expect(item.reps).toBe('10');
  });
  it('time warmup with no default_target falls back to empty (not "10")', () => {
    const item = buildWarmupItemForTest(
      { ...cardioExercise, default_target: null }, 'kg', 0, null,
    );
    expect(item.modality).toBe('tiempo');
    expect(item.reps).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/unit/engine-modality.test.ts`
Expected: FAIL — `buildWarmupItemForTest` is not exported.

- [ ] **Step 3: Update the engine**

In `backend/src/services/engine.service.ts`:

(a) `baseItem` gains a `modality` parameter and includes it. Update its signature + return (currently lines ~197-211):
```ts
function baseItem(
  ex: Exercise, role: SlotRole, slotIndex: number,
  weight: number | null, unit: 'kg' | 'ladrillos',
  series: number, reps: string, descanso: string,
  notes: string | null,
  modality: ExerciseModality,
  flag?: 'rm_test' | 'missing_rm',
): SessionItem {
  return {
    exercise: ex, role, slot_index: slotIndex,
    suggested_value: weight === null ? null : Number(weight),
    unit,
    series, reps, descanso, notes, modality,
    ...(flag ? { flag } : {}),
  };
}
```
Add `ExerciseModality` to the existing import from `../domain/types.js` (alongside `Exercise`, `SlotRole`, `SessionItem`, etc.).

(b) Update every `baseItem(...)` call to pass `exercise.modality` as the new `modality` argument (it sits AFTER `notes` and BEFORE the optional `flag`). The calls are at the warmup, rm_test, missing_rm, computed-weight, casilleros, and accesorio branches. For the two that pass a `flag` (`'rm_test'`, `'missing_rm'`), put `exercise.modality` before the flag:
```ts
// rm_test branch:
baseItem(exercise, slot.role, slot.slot_index, null, unit,
  cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes,
  exercise.modality, 'rm_test');
// missing_rm branch:
baseItem(exercise, slot.role, slot.slot_index, null, unit,
  cfg.principal_series, cfg.principal_reps, cfg.principal_descanso, notes,
  exercise.modality, 'missing_rm');
// computed-weight, casilleros, accesorio branches: append `, exercise.modality` as the last arg.
```

(c) Replace the warmup branch (currently lines ~116-120) with a modality-aware target, and extract a small helper so it is unit-testable:
```ts
export function buildWarmupItemForTest(
  exercise: Exercise,
  unit: 'kg' | 'ladrillos',
  slotIndex: number,
  notes: string | null,
): SessionItem {
  const warmupTarget =
    exercise.default_target ?? (exercise.modality === 'reps' ? '10' : '');
  return baseItem(
    exercise, 'calentamiento', slotIndex, null, unit,
    2, warmupTarget, '1 min', notes, exercise.modality,
  );
}
```
Then in `buildItem`, the `if (slot.role === 'calentamiento')` branch becomes:
```ts
  if (slot.role === 'calentamiento') {
    item = buildWarmupItemForTest(exercise, unit, slot.slot_index, notes);
  } else if (slot.role === 'principal') {
```
(The exported name reads oddly in prod but keeps the unit boundary explicit; if you prefer, name it `buildWarmupItem` and keep the `ForTest` alias export — either way the test imports the exported symbol.)

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx jest tests/unit/engine-modality.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing engine suites for regressions**

Run: `cd backend && npx jest tests/unit/engine.service.test.ts tests/integration/engine.service.test.ts`
Expected: PASS. The `*` select in `buildItem`'s exercises query already returns the new columns, so `exercise.modality` is populated at runtime.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/engine.service.ts backend/tests/unit/engine-modality.test.ts
git commit -m "feat(exercises): stamp modality on session items and fix warmup target"
```

---

## Task 6: Admin frontend — modality + default_target in the form

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/components/admin/exercises/ExerciseDialog.tsx`

- [ ] **Step 1: Add the type**

In `frontend/src/types/api.ts`, above `export interface Exercise {` add:
```ts
export type ExerciseModality = 'reps' | 'tiempo' | 'distancia';
```
Inside `interface Exercise`, after `illustration_url: string | null;` add:
```ts
  modality: ExerciseModality;
  default_target: string | null;
```

- [ ] **Step 2: Extend the form schema + mappers**

In `frontend/src/components/admin/exercises/ExerciseDialog.tsx`:

(a) Add the modality options constant near `LEVELS`:
```ts
const MODALITIES = ['reps', 'tiempo', 'distancia'] as const;
```
(b) In `schema`, after `illustration_url: ...nullable(),` add:
```ts
  modality: z.enum(MODALITIES),
  default_target: z.string().trim().max(60),
```
(c) In `exerciseToForm`, add to BOTH the create-default object and the edit object:
- create branch: `modality: 'reps', default_target: '',`
- edit branch: `modality: e.modality, default_target: e.default_target ?? '',`
(d) In `formToPayload`, add to the returned object:
```ts
    modality: v.modality,
    default_target: v.default_target.trim() === '' ? null : v.default_target.trim(),
```
(e) Add two form controls in Column 2 (after the `muscle_group`/before URLs is fine; place them in the second `<div className="flex flex-col gap-3">`):
```tsx
              <div>
                <Label>Modalidad</Label>
                <Select
                  value={form.watch('modality')}
                  onValueChange={(v) => form.setValue('modality', v as FormValues['modality'])}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="default_target">Objetivo por defecto</Label>
                <Input id="default_target" {...form.register('default_target')} placeholder="ej. 5 min, 2 km, 10" />
              </div>
```

- [ ] **Step 3: Typecheck + build the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (the `CreateExerciseInput` from `useAdminExercises` derives from the shared `Exercise` type; confirm that hook's input type includes the new fields — if it re-declares `CreateExerciseInput`, add `modality` + `default_target` there too).

- [ ] **Step 4: Run frontend tests (no regressions)**

Run: `cd frontend && npx vitest run`
Expected: PASS. If any exercise-related test builds an `Exercise` literal, add `modality: 'reps', default_target: null`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/components/admin/exercises/ExerciseDialog.tsx
git commit -m "feat(exercises): edit modality and default target in admin form"
```

---

## Task 7: App — SessionItem modality + target helper

**Files:**
- Modify: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/lib/api.ts`
- Create: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/lib/exercise-target.ts`
- Test: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/__tests__/exercise-target.test.ts`

All steps run from `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`.

- [ ] **Step 1: Add modality to the app SessionItem**

In `lib/api.ts`, inside `interface SessionItem` (after `reps: string;`, near line 156) add:
```ts
  modality: 'reps' | 'tiempo' | 'distancia';
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/exercise-target.test.ts`:
```ts
import { targetDisplay, isRepBased } from '@/lib/exercise-target';

describe('isRepBased', () => {
  it('true only for reps', () => {
    expect(isRepBased('reps')).toBe(true);
    expect(isRepBased('tiempo')).toBe(false);
    expect(isRepBased('distancia')).toBe(false);
  });
});

describe('targetDisplay', () => {
  it('reps: hero is the top number, label "reps"', () => {
    expect(targetDisplay('reps', '8')).toEqual({ hero: '8', label: 'reps' });
    expect(targetDisplay('reps', '6 a 8')).toEqual({ hero: '8', label: 'reps' });
  });
  it('reps: non-numeric falls back to the raw text', () => {
    expect(targetDisplay('reps', 'AMRAP')).toEqual({ hero: 'AMRAP', label: 'reps' });
  });
  it('tiempo: hero is the raw target text, no rep label', () => {
    expect(targetDisplay('tiempo', '5 min')).toEqual({ hero: '5 min', label: '' });
  });
  it('distancia: hero is the raw target text, no rep label', () => {
    expect(targetDisplay('distancia', '2 km')).toEqual({ hero: '2 km', label: '' });
  });
  it('empty target yields a dash hero', () => {
    expect(targetDisplay('tiempo', '')).toEqual({ hero: '—', label: '' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest __tests__/exercise-target.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/exercise-target.ts`**

```ts
export type Modality = 'reps' | 'tiempo' | 'distancia';

export function isRepBased(modality: Modality): boolean {
  return modality === 'reps';
}

/**
 * How to render an exercise's target in the live session.
 * - reps: the hero is the TOP of the rep range (fixed number, Tato's rule),
 *   label "reps". Non-numeric prescriptions (AMRAP, "max") show the raw text.
 * - tiempo/distancia: the hero is the raw target text ("5 min", "2 km") and
 *   there is no rep label — never parse a number out of it.
 */
export function targetDisplay(
  modality: Modality,
  targetText: string,
): { hero: string; label: string } {
  const text = (targetText ?? '').trim();
  if (modality !== 'reps') {
    return { hero: text === '' ? '—' : text, label: '' };
  }
  const matches = text.match(/\d+/g);
  if (!matches || matches.length === 0) {
    return { hero: text === '' ? '—' : text, label: 'reps' };
  }
  const top = matches[matches.length - 1]!;
  return { hero: String(parseInt(top, 10)), label: 'reps' };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx jest __tests__/exercise-target.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/exercise-target.ts __tests__/exercise-target.test.ts
git commit -m "feat(session): add modality to app SessionItem and target helper"
```

---

## Task 8: App guided flow — render + gate by modality

**Files:**
- Modify: `components/session/PreSetCard.tsx`, `InSetView.tsx`, `PostSetCard.tsx`, `GuidedSessionScreen.tsx`, `lib/guided-log.ts`
- Test: `__tests__/in-set-view.test.tsx`, `__tests__/post-set-card.test.tsx` (extend)

All paths under `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`. Run from there.

- [ ] **Step 1: Write failing tests**

Add to `__tests__/in-set-view.test.tsx` a new test (the component will gain a `modality` prop):
```ts
it('shows the raw time target instead of a rep count for tiempo', () => {
  const { getByText, queryByText } = render(
    <InSetView setIndex={1} name="Bicicleta fija" repsTarget="5 min" currentKg={null} unitLabel="kg" coachNote={null} noWeight modality="tiempo" />,
  );
  expect(getByText('5 min')).toBeTruthy();
  expect(queryByText('reps')).toBeNull();
});
```
Add to `__tests__/post-set-card.test.tsx`:
```ts
it('hides reps stepper and RPE for non-reps modalities', () => {
  const { queryByText } = render(<PostSetCard {...base} modality="tiempo" noWeight />);
  expect(queryByText(/Reps logradas/)).toBeNull();
  expect(queryByText(/Esfuerzo de la serie/)).toBeNull();
});
```
And update the existing `base` object in `post-set-card.test.tsx` to include `modality: 'reps' as const,`. Update the existing in-set-view tests' renders to pass `modality="reps"`. Also update **every** render in `__tests__/pre-set-card.test.tsx` to pass `modality="reps"` (the prop becomes required) — add a third test there:
```ts
it('shows the time target with a Tiempo label for tiempo modality', () => {
  const { getByText, queryByText } = render(
    <PreSetCard setIndex={1} series={2} repsTarget="5 min" currentKg={null} restLabel="1 min" unitLabel="kg" noWeight modality="tiempo" />,
  );
  expect(getByText('Tiempo')).toBeTruthy();
  expect(getByText('5 min')).toBeTruthy();
  expect(queryByText('Reps objetivo')).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/in-set-view.test.tsx __tests__/post-set-card.test.tsx`
Expected: FAIL — `modality` not a prop / rep UI still shown.

- [ ] **Step 3: Update `InSetView.tsx`**

Add `modality` to `Props` and use `targetDisplay`. Replace the import block top and the hero number:
```tsx
import { targetDisplay, type Modality } from '@/lib/exercise-target';
```
In `Props` add `modality: Modality;`. Destructure `modality`. Replace the reps hero (the first 56px Text + "reps" label) and the weight section so the hero uses `targetDisplay`:
```tsx
        <View className="mt-5 flex-row items-baseline justify-center gap-2">
          <Text className="text-foreground" style={{ fontSize: 56, lineHeight: 64, fontVariant: ['tabular-nums'], fontWeight: '700', includeFontPadding: false }}>
            {targetDisplay(modality, repsTarget).hero}
          </Text>
          {targetDisplay(modality, repsTarget).label ? (
            <Text className="text-base font-semibold text-muted-foreground">
              {targetDisplay(modality, repsTarget).label}
            </Text>
          ) : null}
          {modality === 'reps' && !noWeight && (
            <>
              <Text className="text-base text-muted-foreground">·</Text>
              <Text className="text-foreground" style={{ fontSize: 56, lineHeight: 64, fontVariant: ['tabular-nums'], fontWeight: '700', includeFontPadding: false }}>
                {currentKg ?? '—'}
              </Text>
              <Text className="text-base font-semibold text-muted-foreground">{unitLabel}</Text>
            </>
          )}
        </View>
```

- [ ] **Step 4: Update `PreSetCard.tsx`**

Add `modality` to `Props` (`import { targetDisplay, type Modality } from '@/lib/exercise-target';`, add `modality: Modality;`). Replace the "Reps objetivo" `BigStat` so its label/value follow modality:
```tsx
        <View className="flex-1">
          {modality === 'reps' ? (
            <BigStat label="Reps objetivo" num={targetDisplay('reps', repsTarget).hero} />
          ) : (
            <BigStat label={modality === 'tiempo' ? 'Tiempo' : 'Distancia'} num={targetDisplay(modality, repsTarget).hero} />
          )}
        </View>
```
(`repsTarget` is the prop already passed; rename is unnecessary — it now carries the raw target text for non-reps.) The weight column already gates on `noWeight`; leave it.

- [ ] **Step 5: Update `PostSetCard.tsx`**

Add `modality` to `Props` (`import { isRepBased, type Modality } from '@/lib/exercise-target';`, add `modality: Modality;`). Gate the reps stepper + RPE on rep-based modality. Change the `Stepper` and `RPESelector` blocks to render only when `isRepBased(modality)`:
```tsx
      {isRepBased(modality) && (
        <Stepper
          label="Reps logradas — ¿cuántas hiciste?"
          unit="reps"
          value={repsAchieved}
          step={1}
          min={0}
          hint={`Meta: ${repsTarget}`}
          onChange={onChangeReps}
        />
      )}

      {isRepBased(modality) && !noWeight && (
        <RPESelector value={rpe} target={[7, 8]} showNames onChange={onChangeRpe} />
      )}

      {isRepBased(modality) && !noWeight && hasNextSet && (
        <WeightAdjustSegment
          value={weightAdjust}
          currentKg={currentKg}
          step={step}
          nextSetIndex={setIndex + 1}
          unitLabel={unitLabel}
          onChange={onChangeWeightAdjust}
        />
      )}
```
Add `repsTarget` to `Props` if not already present (it is). For non-reps, the card then shows just the "Serie N · ¿Cómo salió?" header — confirmation only.

- [ ] **Step 6: Update `GuidedSessionScreen.tsx` — pass modality + meta + logging**

In `components/session/GuidedSessionScreen.tsx`:
(a) Import: `import { targetDisplay, isRepBased } from '@/lib/exercise-target';`
(b) `repsTarget` currently = `parseRepsTop(item.reps)`. For non-reps this must be the RAW text. Replace:
```tsx
  const repsTarget = useMemo(
    () => (isRepBased(item.modality) ? parseRepsTop(item.reps) : item.reps),
    [item.reps, item.modality],
  );
  const repsTop = useMemo(
    () => (isRepBased(item.modality) ? parseInt(parseRepsTop(item.reps), 10) || 0 : 0),
    [item.reps, item.modality],
  );
```
(c) Pass `modality={item.modality}` to `<InSetView .../>`, `<PreSetCard .../>`, and `<PostSetCard .../>`.
(d) The meta row reps portion — replace `${repsTarget} reps meta` with modality-aware text:
```tsx
  const targetMeta = isRepBased(item.modality)
    ? `${repsTarget} reps meta`
    : `${targetDisplay(item.modality, item.reps).hero} objetivo`;
```
and use `targetMeta` in the non-post_set branch of `metaRow` in place of `${repsTarget} reps meta`.
(e) Logging — non-reps logs no reps/rpe. In `persistAndAdvance`, change the payload args:
```tsx
        value: noWeight || !isRepBased(item.modality) ? null : state.currentWeight,
        reps: isRepBased(item.modality) ? repsAchieved : null,
        rpe: noWeight || !isRepBased(item.modality) ? null : rpe,
```

- [ ] **Step 7: Update `lib/guided-log.ts` to allow null reps**

In `lib/guided-log.ts`, change the `reps` field type to accept null and pass it through:
```ts
export function buildSetLogPayload(args: {
  clientId: string;
  exerciseId: number;
  setIndex: number;
  value: number | null;
  unit: 'kg' | 'ladrillos';
  reps: number | null;
  rpe: Rpe | number | null;
}): Omit<SetLogPayload, 'client_ts'> {
  return {
    client_id: args.clientId,
    exercise_id: args.exerciseId,
    set_index: args.setIndex,
    value: args.value,
    unit: args.unit,
    reps: args.reps,
    completed: true,
    rpe: args.rpe ?? undefined,
  };
}
```
(`SetLogPayload.reps` is already `number | null`, so this matches.)

- [ ] **Step 8: Run the tests**

Run: `npx jest __tests__/in-set-view.test.tsx __tests__/post-set-card.test.tsx __tests__/pre-set-card.test.tsx __tests__/post-set-logging.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — fix any prop mismatches (every `InSetView`/`PreSetCard`/`PostSetCard` usage must now pass `modality`).

- [ ] **Step 9: Commit**

```bash
git add components/session/PreSetCard.tsx components/session/InSetView.tsx components/session/PostSetCard.tsx components/session/GuidedSessionScreen.tsx lib/guided-log.ts __tests__/in-set-view.test.tsx __tests__/post-set-card.test.tsx __tests__/pre-set-card.test.tsx
git commit -m "feat(session): render and gate guided flow by exercise modality"
```

---

## Task 9: App carril — modality-aware table

**Files:**
- Modify: `app/(app)/session/active.tsx`, `components/session/SetRowIter.tsx`

All paths under `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`.

- [ ] **Step 1: Gate the carril for non-reps modalities**

The carril `SessionScreen` (in `app/(app)/session/active.tsx`) builds `repsTarget` from `parseRepsRange(item.reps)`. For non-reps modalities, the reps/weight inputs make no sense. Add at the top of `SessionScreen` (after `const isBodyweight = ...`):
```tsx
  const isRepsModality = item.modality === 'reps';
```
Wrap the `RPESelector` render so it only appears for reps-based, non-warmup exercises:
```tsx
        {!isWarmup && isRepsModality && (
          <RPESelector
```
(keep the rest of that block unchanged).

- [ ] **Step 2: Show the target text + a single completion check for non-reps rows**

In the sets table `.map(...)` inside `SessionScreen`, for non-reps modalities render a simplified row instead of `SetRowIter`. Replace the `<SetRowIter ... />` invocation with:
```tsx
                {isRepsModality ? (
                  <SetRowIter
                    index={setIdx}
                    state={rowState}
                    active={isActive}
                    isLast={isLast && !(resting?.afterSetIdx === setIdx)}
                    unit={item.unit}
                    weightStep={weightStep}
                    suggestedValue={rmMissing ? null : item.suggested_value}
                    defaultReps={repsRange.top}
                    lastWeekKg={null}
                    onChangeValue={(n) => persist(setIdx, { value: n })}
                    onChangeReps={(n) => persist(setIdx, { reps: n })}
                    onToggleComplete={() =>
                      draft.completed ? unlockSet(setIdx) : completeSet(setIdx)
                    }
                  />
                ) : (
                  <Pressable
                    onPress={() =>
                      draft.completed ? unlockSet(setIdx) : completeSet(setIdx)
                    }
                    className="flex-row items-center gap-2 px-3.5 py-3"
                  >
                    <Text className="w-12 text-center text-[13px] font-bold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                      {setIdx}
                    </Text>
                    <Text className="flex-1 text-[13px] text-muted-foreground">
                      {item.reps}
                    </Text>
                    <View className={`h-7 w-7 items-center justify-center rounded-lg ${draft.completed ? 'bg-brand' : 'border border-border'}`}>
                      {draft.completed ? (
                        <Icon as={Check} size={14} className="text-brand-foreground" strokeWidth={3} />
                      ) : null}
                    </View>
                  </Pressable>
                )}
```
Add the imports at the top of `active.tsx` if missing: `Check` from `lucide-react-native` (the file already imports `Info, Replace, Siren`; add `Check`).

- [ ] **Step 3: Ensure non-reps completion does not require a weight**

`completeSet`/`persist` in `SessionScreen` gate on `!noWeight && value == null`. For non-reps exercises that are not warmup/bw (rare, e.g. a weighted carry), still allow completion: change the guard in `completeSet` and `persist` from `if (!noWeight && ...)` to also pass when modality is non-reps:
```tsx
    if (!noWeight && isRepsModality && d.value == null) return; // in completeSet
```
and in `persist`:
```tsx
    if (!noWeight && isRepsModality && next.value == null) return;
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit` (expect clean) then `npx jest` (full suite).
Expected: all PASS. If any existing session test builds a `SessionItem` literal without `modality`, add `modality: 'reps'`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/session/active.tsx" components/session/SetRowIter.tsx
git commit -m "feat(session): render carril table by exercise modality"
```

> Note: `SetRowIter.tsx` may need no change if the non-reps path bypasses it entirely (Step 2). Stage it only if you modified it; otherwise drop it from the `git add`.

---

## Task 10: Full verification

- [ ] **Step 1: Backend**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit && npx jest`
Expected: clean tsc; all suites pass (pre-existing OpenAI/Firebase-env failures, if any, match the known baseline — do not "fix" by widening scope).

- [ ] **Step 2: Frontend admin**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/frontend && npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 3: App**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npx jest`
Expected: clean; all suites pass.

- [ ] **Step 4: Manual smoke**

In admin (`http://localhost:3000`), edit "Bicicleta fija": set Modalidad = tiempo, Objetivo por defecto = "5 min". Start a session in the app on a day that includes it → the guided IN_SET shows "5 min" (no "reps"), PostSet has no stepper/RPE, just confirm. Carril shows "5 min" with a single check.

---

## Spec Coverage Check

- Migration + backfill cardio→tiempo → Task 1 ✓
- `modality`/`default_target` on Exercise + `SessionItem.modality` → Tasks 2, 3, 7 ✓
- Engine warmup uses default_target, modality-aware fallback, stamps modality → Task 5 ✓
- Admin edits modality + default_target (service + route + form) → Tasks 3, 4, 6 ✓
- App target helper (no number parse for tiempo/distancia) → Task 7 ✓
- Guided render + gate (PreSet/InSet/PostSet/meta) + non-reps logging completed-only → Task 8 ✓
- Carril modality-aware → Task 9 ✓
- Out of scope (log achieved time/distance, time progression, slot override) → not implemented ✓

## Out of Scope

- Registering achieved time/distance; progression by time/distance; per-slot modality override; backfilling real `default_target` values (coach sets them in admin).
