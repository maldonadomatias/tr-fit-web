# Deterministic Exercise Substitution + Regen Observability Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-08-07T14:10:00Z · source: claude+writing-plans -->

**Goal:** Make routine generation finish in seconds instead of ~10 minutes for athletes whose equipment/level knocks exercises out of the coach's template, and make any remaining generation failure visible and self-healing instead of silent.

**Architecture:** Today `generateRoutine` sends the WHOLE routine to OpenAI whenever any template exercise is unavailable for the athlete. A `casa_basica` beginner loses 16 of ~20 template exercises, so the model is asked to rewrite the entire routine; that call exceeds the 120 s client timeout, the job retries 3× (~10 min), and nothing logs why. This plan replaces that reason with a **pure, deterministic substitution pass** over the already-loaded athlete-allowed catalog — curated `alternatives_ids` first, then same-muscle-group ranking. OpenAI is then only called for genuinely *structural* adjustments (day count, session minutes, gender, coach rejection feedback, or slots with no viable substitute). Three smaller changes remove the blind spots: log the job's `last_error`, run the orphan sweep periodically instead of only at boot, and surface a stuck/failed generation to both the athlete (dashboard `regenState`) and the coach (banner in the rutinas queue).

**Tech Stack:** Node 20, TypeScript (ESM, `.js` import specifiers), Express 4, node-postgres, Jest (`node --experimental-vm-modules`), React 18 + TanStack Query + Tailwind on the admin frontend.

## Global Constraints

- **Do not open PRs, push, or commit** unless the user explicitly requested it for this /auto-build run. Skip every `git commit` step in this plan unless told otherwise.
- All backend imports use the `.js` extension even for `.ts` sources (ESM/NodeNext). Example: `import { x } from './foo.js';`
- Repo root for every path in this plan is `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web`. Backend paths are relative to `backend/`.
- Run backend tests with `npm test -- <path>` from `backend/`. They need Postgres at `postgres://postgres:postgres@localhost:5432/trfit_test` (already running on this machine).
- Never call OpenAI in tests. Existing suites mock `../../src/services/openai.service.js` or the `openai` module — follow whichever pattern the suite you touch already uses.
- Prefer minimal diffs; no drive-by refactors. Do not reformat files you are not otherwise changing.
- Spanish is the user-facing copy language. Code, identifiers and comments in English, matching the surrounding file.
- Do NOT change `OPENAI_MODEL`, the OpenAI client `timeout`, or `maxRetries`. The point of this plan is to stop making the giant call at all.

---

### Task 1: Deterministic substitution service

A pure function that rewrites a coach template so every slot uses an exercise the athlete can actually do. No DB access, no async — it operates on catalogs the caller already loaded.

**Files:**
- Create: `backend/src/services/exercise-substitution.service.ts`
- Test: `backend/tests/unit/exercise-substitution.test.ts`

**Interfaces:**
- Consumes: `Exercise` from `../domain/types.js`; `RoutineTemplate`, `TemplateSlot` from `./template.service.js`.
- Produces (Task 2 depends on these exact names):
  ```ts
  export interface SubstitutionResult {
    template: RoutineTemplate;
    substituted: { from: string; to: string }[];
    unresolved: string[];
  }
  export function substituteUnavailableSlots(
    template: RoutineTemplate,
    allowed: Exercise[],
    catalog: Exercise[],
  ): SubstitutionResult;
  ```
  `substituted` lists `{ from: <original exercise_name>, to: <replacement exercise_name> }`. `unresolved` lists the names of exercises that had no viable replacement (their slot is left untouched, so the AI adjuster can still handle them).

**Ranking rules (implement exactly):**

For a slot whose `exercise_id` is not in `allowed`:
1. Look up the original in `catalog` by id. If it is not there at all, push its `exercise_name` to `unresolved` and keep the slot as-is.
2. Build the candidate pool: every exercise in `allowed` whose id is not already used by another slot **in that same day** (including slots kept verbatim, and replacements chosen earlier in the same day).
3. **Curated first:** the original's `alternatives_ids`, in that array's order, intersected with the candidate pool. First hit wins.
4. **Fallback:** candidates with the same `muscle_group` as the original, sorted by, in order:
   - same `movement_pattern` as the original first (`0` if equal else `1`),
   - same `is_principal` as the original first (`0` if equal else `1`),
   - same `equipment` as the original first (`0` if equal else `1`),
   - `id` ascending (deterministic tie-break).
   First one wins.
5. If both produce nothing, push the name to `unresolved` and keep the slot unchanged.

A replacement slot keeps the template's `role`, `series`, `reps`, `rir`, `descanso` and `notes` verbatim, and takes `exercise_id`, `exercise_name` and `muscle_group` from the replacement.

The input `template` must not be mutated — return a new object with new `days_detail`/`slots` arrays.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/exercise-substitution.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { substituteUnavailableSlots } from '../../src/services/exercise-substitution.service.js';
import type { Exercise } from '../../src/domain/types.js';
import type { RoutineTemplate, TemplateSlot } from '../../src/services/template.service.js';

function ex(over: Partial<Exercise> & { id: number; name: string }): Exercise {
  return {
    muscle_group: 'pecho',
    equipment: 'mancuerna',
    movement_pattern: 'push_h',
    is_principal: true,
    is_unilateral: false,
    level_min: 'principiante',
    contraindicated_for: [],
    default_increment_kg: 2.5,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
    modality: 'reps',
    default_target: null,
    rep_cycle_threshold: 3,
    ...over,
  } as Exercise;
}

function slot(over: Partial<TemplateSlot> & { exercise_id: number; exercise_name: string }): TemplateSlot {
  return {
    muscle_group: 'pecho',
    role: 'principal',
    series: 4,
    reps: '8-10',
    rir: '2',
    descanso: '90s',
    notes: 'nota del coach',
    ...over,
  } as TemplateSlot;
}

function tpl(slots: TemplateSlot[][]): RoutineTemplate {
  return {
    source: 'TEST.xlsx',
    gender: 'male',
    days: slots.length,
    leg_days: 1,
    schedules: [],
    days_detail: slots.map((s, i) => ({ focus: `dia ${i + 1}`, slots: s })),
  };
}

describe('substituteUnavailableSlots', () => {
  it('keeps slots whose exercise is already allowed', () => {
    const keep = ex({ id: 1, name: 'Press Mancuerna' });
    const t = tpl([[slot({ exercise_id: 1, exercise_name: 'Press Mancuerna' })]]);
    const r = substituteUnavailableSlots(t, [keep], [keep]);
    expect(r.substituted).toEqual([]);
    expect(r.unresolved).toEqual([]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(1);
  });

  it('prefers a curated alternative over the muscle-group sweep', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra', alternatives_ids: [30] });
    const sweep = ex({ id: 20, name: 'Press Mancuerna' });
    const curated = ex({ id: 30, name: 'Flexiones', equipment: 'bw', movement_pattern: 'core' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    const r = substituteUnavailableSlots(t, [sweep, curated], [orig, sweep, curated]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(30);
    expect(r.substituted).toEqual([{ from: 'Press Barra', to: 'Flexiones' }]);
    expect(r.unresolved).toEqual([]);
  });

  it('falls back to same muscle group, ranking movement_pattern then is_principal then equipment', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra', movement_pattern: 'push_h', is_principal: true });
    const wrongPattern = ex({ id: 20, name: 'Aperturas', movement_pattern: 'isolation' });
    const rightPattern = ex({ id: 21, name: 'Press Mancuerna', movement_pattern: 'push_h' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    const r = substituteUnavailableSlots(t, [wrongPattern, rightPattern], [orig, wrongPattern, rightPattern]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(21);
  });

  it('never repeats an exercise within the same day', () => {
    const origA = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const origB = ex({ id: 11, name: 'Press Inclinado Barra', equipment: 'barra' });
    const only1 = ex({ id: 20, name: 'Press Mancuerna' });
    const only2 = ex({ id: 21, name: 'Aperturas', movement_pattern: 'isolation' });
    const t = tpl([[
      slot({ exercise_id: 10, exercise_name: 'Press Barra' }),
      slot({ exercise_id: 11, exercise_name: 'Press Inclinado Barra' }),
    ]]);
    const r = substituteUnavailableSlots(t, [only1, only2], [origA, origB, only1, only2]);
    const ids = r.template.days_detail[0].slots.map((s) => s.exercise_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual([20, 21]);
  });

  it('reuses the same exercise across different days', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna' });
    const t = tpl([
      [slot({ exercise_id: 10, exercise_name: 'Press Barra' })],
      [slot({ exercise_id: 10, exercise_name: 'Press Barra' })],
    ]);
    const r = substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(20);
    expect(r.template.days_detail[1].slots[0].exercise_id).toBe(20);
  });

  it('keeps the coach prescription and role on a substituted slot', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna', muscle_group: 'pecho' });
    const t = tpl([[slot({
      exercise_id: 10, exercise_name: 'Press Barra',
      role: 'accesorio', series: 3, reps: '12', rir: '1', descanso: '60s', notes: 'lento',
    })]]);
    const r = substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(r.template.days_detail[0].slots[0]).toEqual({
      exercise_id: 20,
      exercise_name: 'Press Mancuerna',
      muscle_group: 'pecho',
      role: 'accesorio',
      series: 3,
      reps: '12',
      rir: '1',
      descanso: '60s',
      notes: 'lento',
    });
  });

  it('reports unresolved when no candidate shares the muscle group', () => {
    const orig = ex({ id: 10, name: 'Sentadilla Barra', muscle_group: 'pierna', equipment: 'barra' });
    const other = ex({ id: 20, name: 'Press Mancuerna', muscle_group: 'pecho' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Sentadilla Barra', muscle_group: 'pierna' })]]);
    const r = substituteUnavailableSlots(t, [other], [orig, other]);
    expect(r.unresolved).toEqual(['Sentadilla Barra']);
    expect(r.substituted).toEqual([]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(10);
  });

  it('does not mutate the input template', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(t.days_detail[0].slots[0].exercise_id).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `npm test -- tests/unit/exercise-substitution.test.ts`
Expected: FAIL — cannot resolve `../../src/services/exercise-substitution.service.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/exercise-substitution.service.ts`:

```ts
// Deterministic replacement of template exercises the athlete cannot do.
//
// The coach's Excel templates are gym routines. An athlete training at home,
// or a beginner, loses a large part of them to the equipment/level/injury
// filter in listExercisesForAthlete. Handing that whole rewrite to the AI
// adjuster meant a request big enough to blow the OpenAI client timeout, so
// onboarding took ~10 min (or failed). A same-muscle-group swap is a
// mechanical decision, so it is made here in code — the AI is left for the
// structural adjustments only.

import type { Exercise } from '../domain/types.js';
import type { RoutineTemplate, TemplateSlot } from './template.service.js';

export interface SubstitutionResult {
  template: RoutineTemplate;
  substituted: { from: string; to: string }[];
  unresolved: string[];
}

function rank(orig: Exercise, cand: Exercise): [number, number, number, number] {
  return [
    cand.movement_pattern === orig.movement_pattern ? 0 : 1,
    cand.is_principal === orig.is_principal ? 0 : 1,
    cand.equipment === orig.equipment ? 0 : 1,
    cand.id,
  ];
}

function pickReplacement(
  orig: Exercise,
  allowed: Exercise[],
  usedInDay: Set<number>,
): Exercise | null {
  const pool = allowed.filter((e) => !usedInDay.has(e.id));

  // Curated picks win outright, in the admin's own order — same rule the
  // athlete-facing swap picker uses (alternatives.service.ts).
  for (const id of orig.alternatives_ids ?? []) {
    const hit = pool.find((e) => e.id === id);
    if (hit) return hit;
  }

  const sameGroup = pool.filter((e) => e.muscle_group === orig.muscle_group);
  if (sameGroup.length === 0) return null;
  sameGroup.sort((a, b) => {
    const ra = rank(orig, a);
    const rb = rank(orig, b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  });
  return sameGroup[0];
}

/**
 * Rewrites `template` so every slot uses an exercise present in `allowed`.
 *
 * @param allowed athlete-filtered catalog (listExercisesForAthlete output)
 * @param catalog full catalog, needed to look up originals that `allowed`
 *                already filtered out
 */
export function substituteUnavailableSlots(
  template: RoutineTemplate,
  allowed: Exercise[],
  catalog: Exercise[],
): SubstitutionResult {
  const allowedIds = new Set(allowed.map((e) => e.id));
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const substituted: { from: string; to: string }[] = [];
  const unresolved: string[] = [];

  const days_detail = template.days_detail.map((day) => {
    // Uniqueness is per day: the same exercise may legitimately appear on
    // two different days, but never twice in one session.
    const usedInDay = new Set<number>(
      day.slots.filter((s) => allowedIds.has(s.exercise_id)).map((s) => s.exercise_id),
    );
    const slots: TemplateSlot[] = day.slots.map((s) => {
      if (allowedIds.has(s.exercise_id)) return { ...s };
      const orig = byId.get(s.exercise_id);
      if (!orig) {
        unresolved.push(s.exercise_name);
        return { ...s };
      }
      const repl = pickReplacement(orig, allowed, usedInDay);
      if (!repl) {
        unresolved.push(s.exercise_name);
        return { ...s };
      }
      usedInDay.add(repl.id);
      substituted.push({ from: s.exercise_name, to: repl.name });
      return {
        ...s,
        exercise_id: repl.id,
        exercise_name: repl.name,
        muscle_group: repl.muscle_group,
      };
    });
    return { focus: day.focus, slots };
  });

  return { template: { ...template, days_detail }, substituted, unresolved };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `npm test -- tests/unit/exercise-substitution.test.ts`
Expected: PASS, 8 tests.

---

### Task 2: Use substitution in generateRoutine, keep the AI for structural work only

**Files:**
- Modify: `backend/src/services/routine-generation.service.ts` (whole file — `adjustmentReasons` and `generateRoutine`)
- Modify: `backend/src/services/skeleton-regen.service.ts:98-110` (pass the full catalog, record substitutions)
- Test: `backend/tests/integration/routine-generation.test.ts` (create)

**Interfaces:**
- Consumes: `substituteUnavailableSlots` / `SubstitutionResult` from Task 1; `listExercises` and `listExercisesForAthlete` from `./exercise.service.js`.
- Produces:
  ```ts
  export interface GenerateRoutineResult {
    skeleton: AiSkeletonOutput;
    source: 'template' | 'template+swap' | 'template+ai';
    templateSource: string;
    reasons: string[];
    substituted: { from: string; to: string }[];
  }
  export interface GenerateRoutineInput {
    profile: AthleteProfile;
    exercises: Exercise[];   // athlete-allowed catalog
    catalog: Exercise[];     // full catalog (new, required)
    rejectionFeedback?: string;
  }
  ```
  `source` is `'template'` when nothing was changed, `'template+swap'` when only deterministic substitution ran, `'template+ai'` when OpenAI was called.

**Behaviour:**
1. Select the template as today.
2. Run `substituteUnavailableSlots` on it FIRST.
3. Build reasons from the *substituted* template: the "ejercicios no disponibles" reason now lists ONLY `unresolved` names (usually empty). The `exercise_minutes < 60`, `days_per_week !== template.days`, `gender === 'other'` and `rejectionFeedback` reasons are unchanged, but computed against the substituted template.
4. No reasons → return the substituted template built via `buildSkeletonFromTemplate`, `source` = `'template'` if nothing was substituted else `'template+swap'`.
5. Reasons remain → call `adjustSkeleton` with the **substituted** template (a much smaller ask), `source` = `'template+ai'`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/routine-generation.test.ts`:

```ts
import { jest } from '@jest/globals';

const mockAdjust = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  adjustSkeleton: mockAdjust,
}));

const { generateRoutine } = await import('../../src/services/routine-generation.service.js');
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { listExercises, listExercisesForAthlete } = await import('../../src/services/exercise.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); mockAdjust.mockReset(); });
afterAll(async () => { await closePool(); });

// Mirrors the real prod case: casa_basica + level 'nunca' + 3 days male.
const homeProfile = {
  user_id: '00000000-0000-0000-0000-000000000001',
  name: 'Casa', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'nunca', goal: 'hipertrofia', days_per_week: 3, leg_days: 1,
  equipment: 'casa_basica', injuries: [], coach_id: null,
  onboarded_at: new Date().toISOString(), phone: null, plan_interest: 'full',
  training_mode: 'casa', commitment: 'normal', exercise_minutes: 60,
  days_specific: ['lun', 'mie', 'vie'], referral_source: 'google', sport_focus: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

it('home beginner: substitutes deterministically and never calls OpenAI', async () => {
  const catalog = await listExercises();
  const exercises = await listExercisesForAthlete(homeProfile);
  expect(exercises.length).toBeGreaterThan(0);

  const r = await generateRoutine({ profile: homeProfile, exercises, catalog });

  expect(mockAdjust).not.toHaveBeenCalled();
  expect(r.source).toBe('template+swap');
  expect(r.reasons).toEqual([]);
  expect(r.substituted.length).toBeGreaterThan(0);

  // Every slot the athlete gets must be one they can actually do.
  const allowedIds = new Set(exercises.map((e) => e.id));
  for (const day of r.skeleton.days) {
    for (const s of day.slots) expect(allowedIds.has(s.exercise_id)).toBe(true);
  }
});

it('no substitution needed: pure template, source stays "template"', async () => {
  const catalog = await listExercises();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gymProfile = { ...homeProfile, equipment: 'gym_completo', level: 'avanzado' } as any;
  const exercises = await listExercisesForAthlete(gymProfile);

  const r = await generateRoutine({ profile: gymProfile, exercises, catalog });

  expect(mockAdjust).not.toHaveBeenCalled();
  expect(r.source).toBe('template');
  expect(r.substituted).toEqual([]);
});

it('structural reason still reaches the AI, with the substituted template', async () => {
  const catalog = await listExercises();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shortProfile = { ...homeProfile, exercise_minutes: 30 } as any;
  const exercises = await listExercisesForAthlete(shortProfile);
  const allowedIds = new Set(exercises.map((e) => e.id));

  mockAdjust.mockResolvedValue({
    rationale: 'ajustado',
    days: [{ day_index: 1, focus: 'f', slots: [{
      slot_index: 1, exercise_id: exercises[0].id, role: 'principal',
      notes: null, series: null, reps: null, descanso: null,
    }] }],
  });

  const r = await generateRoutine({ profile: shortProfile, exercises, catalog });

  expect(mockAdjust).toHaveBeenCalledTimes(1);
  expect(r.source).toBe('template+ai');
  // The AI must receive an already-substituted template: no unavailable ids.
  const arg = mockAdjust.mock.calls[0][0] as { template: { days_detail: { slots: { exercise_id: number }[] }[] }, reasons: string[] };
  for (const d of arg.template.days_detail) {
    for (const s of d.slots) expect(allowedIds.has(s.exercise_id)).toBe(true);
  }
  // and only the structural reason, not the "ejercicios no disponibles" one
  expect(arg.reasons).toHaveLength(1);
  expect(arg.reasons[0]).toContain('30 min');
});
```

> Notes for the implementer:
> - `resetDatabase()` does NOT truncate `exercises` (they are seeded once), but it DOES reset every `alternatives_ids` to `'{}'`. So this integration test always exercises the same-muscle-group fallback, never the curated branch. Curated ordering is covered by the pure unit tests in Task 1 — do not try to seed `alternatives_ids` here.
> - The test does not use `pool` directly; do not import it just to satisfy a habit — `npm run lint` fails on unused imports.
> - `mockAdjust` is typed loosely on purpose — `adjustSkeleton` takes a single object argument. If TypeScript complains about the mock signature, type it as `jest.fn<(input: unknown) => Promise<unknown>>()` and cast at the call site rather than widening the production types.

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `npm test -- tests/integration/routine-generation.test.ts`
Expected: FAIL — `generateRoutine` does not accept `catalog`, `source` is `'template+ai'`, and `mockAdjust` was called.

- [ ] **Step 3: Rewrite routine-generation.service.ts**

Replace `backend/src/services/routine-generation.service.ts` with:

```ts
// Orchestrator for template-first routine generation.
//
// The coach's Excel templates are the literal base of every routine. A
// profile that fits a template cleanly gets it verbatim — no OpenAI call.
//
// Exercises the athlete cannot do (equipment / level / injury / exclusions)
// are swapped out DETERMINISTICALLY (exercise-substitution.service): that is
// a mechanical same-muscle-group decision, and routing it through the model
// meant a request large enough to blow the client timeout for home athletes.
//
// The AI is only invoked as an ADJUSTER for what is genuinely structural:
// shorter sessions, a day count outside the coach matrix, a gender without
// its own matrix, coach rejection feedback, or a slot with no viable
// substitute in the catalog.

import type { AiSkeletonOutput } from '../domain/schemas.js';
import type { AthleteProfile, Exercise } from '../domain/types.js';
import { adjustSkeleton } from './openai.service.js';
import {
  buildSkeletonFromTemplate,
  selectTemplate,
  type RoutineTemplate,
} from './template.service.js';
import { substituteUnavailableSlots } from './exercise-substitution.service.js';
import { seriesRangeFor } from './series-budget.js';

export interface GenerateRoutineInput {
  profile: AthleteProfile;
  /** Athlete-filtered catalog (listExercisesForAthlete): already excludes
   *  injury-contraindicated, incompatible-equipment, above-level and
   *  coach-excluded exercises. */
  exercises: Exercise[];
  /** Full catalog (listExercises), needed to look up template exercises that
   *  the athlete filter removed. */
  catalog: Exercise[];
  rejectionFeedback?: string;
}

export interface GenerateRoutineResult {
  skeleton: AiSkeletonOutput;
  source: 'template' | 'template+swap' | 'template+ai';
  templateSource: string;
  reasons: string[];
  substituted: { from: string; to: string }[];
}

function adjustmentReasons(
  profile: AthleteProfile,
  template: RoutineTemplate,
  unresolved: string[],
  rejectionFeedback?: string,
): string[] {
  const reasons: string[] = [];

  if (unresolved.length > 0) {
    reasons.push(
      `Ejercicios de la rutina base NO disponibles para este atleta (lesión, equipamiento, nivel o exclusiones) y sin reemplazo automático posible: ${unresolved.join(', ')}. Reemplazá cada uno por un equivalente del catálogo provisto que trabaje el mismo grupo muscular con un estímulo similar.`,
    );
  }

  const minutes = profile.exercise_minutes ?? 60;
  if (minutes < 60) {
    const { min, max } = seriesRangeFor(minutes);
    reasons.push(
      `El atleta entrena ${minutes} min (la rutina base es de 60): bajá el volumen quitando accesorios o series hasta ${min}-${max} series totales por día (cada calentamiento cuenta 1 serie; los principales hacen 3).`,
    );
  }

  if (profile.days_per_week !== template.days) {
    reasons.push(
      `El atleta entrena ${profile.days_per_week} días pero la rutina base es de ${template.days}: reacomodá el plan a exactamente ${profile.days_per_week} días manteniendo el estilo y las prioridades del entrenador.`,
    );
  }

  if (profile.gender === 'other') {
    reasons.push(
      'El atleta no se identifica con el género de la rutina base (matriz mujer): mantené la estructura, ajustando énfasis sólo si el objetivo lo pide.',
    );
  }

  if (rejectionFeedback) {
    reasons.push(
      `El coach RECHAZÓ la rutina anterior con este feedback, aplicalo: "${rejectionFeedback}".`,
    );
  }

  return reasons;
}

export async function generateRoutine(
  input: GenerateRoutineInput,
): Promise<GenerateRoutineResult> {
  const { profile, exercises, catalog, rejectionFeedback } = input;
  const { template: base } = selectTemplate(profile);

  // Swap first: it shrinks (and usually eliminates) the AI ask.
  const swap = substituteUnavailableSlots(base, exercises, catalog);
  const template = swap.template;

  const reasons = adjustmentReasons(
    profile, template, swap.unresolved, rejectionFeedback,
  );

  if (reasons.length === 0) {
    return {
      skeleton: buildSkeletonFromTemplate(template),
      source: swap.substituted.length > 0 ? 'template+swap' : 'template',
      templateSource: template.source,
      reasons,
      substituted: swap.substituted,
    };
  }

  const skeleton = await adjustSkeleton({
    template,
    profile,
    exercises,
    reasons,
  });
  return {
    skeleton,
    source: 'template+ai',
    templateSource: template.source,
    reasons,
    substituted: swap.substituted,
  };
}
```

- [ ] **Step 4: Update the three generateRoutine call sites**

Each caller must now pass `catalog` and may record `substituted`.

In `backend/src/services/skeleton-regen.service.ts`, change the import line to also pull `listExercises`:

```ts
import { listExercisesForAthlete, listExercises } from './exercise.service.js';
```

and inside `runRegenJob` replace the generation block with:

```ts
    const exercises = await listExercisesForAthlete(profile, athleteId);
    const catalog = await listExercises();
    const gen = await generateRoutine({ profile, exercises, catalog });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId,
        generationPrompt: {
          profile, exercises_count: exercises.length, trigger: 'regen',
          source: gen.source, template: gen.templateSource, reasons: gen.reasons,
          substituted: gen.substituted,
        },
        generationRationale: gen.skeleton.rationale,
      },
      gen.skeleton,
    );
```

Then find the other two call sites and give each the same `catalog` argument (and add `substituted: gen.substituted` to their `generationPrompt` object if they build one):

Run: `grep -rn "generateRoutine(" backend/src --include=*.ts`
Expected hits: `src/services/skeleton-regen.service.ts`, `src/routes/rutinas.ts`, `src/routes/admin-ops.ts`. Each already imports `listExercisesForAthlete` from `../services/exercise.service.js`; add `listExercises` to the same import and call it right before `generateRoutine`.

- [ ] **Step 5: Run the new test plus every suite that touches generation**

Run from `backend/`:
```
npm test -- tests/integration/routine-generation.test.ts tests/integration/onboarding.test.ts tests/integration/regen-worker.test.ts tests/integration/skeleton-regen-service.test.ts tests/integration/skeletons.test.ts tests/integration/admin-rutinas.test.ts
```
Expected: all PASS. If an existing test asserted `source === 'template+ai'` for a profile that is now handled by substitution, update that assertion to the new expected `source` — do not weaken the assertion to `expect.any(String)`.

- [ ] **Step 6: Typecheck**

Run from `backend/`: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: Log the job error instead of swallowing it

The worker writes the failure into `skeleton_regen_jobs.last_error` but logs only the job id, which is why this bug was invisible in Railway for two weeks.

**Files:**
- Modify: `backend/src/workers/regen-worker.ts:58` and `:66`
- Test: `backend/tests/integration/regen-worker.test.ts` (add one case)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. Log-shape change only.

- [ ] **Step 1: Write the failing test**

Two edits to `backend/tests/integration/regen-worker.test.ts`.

**1a — mock the logger module.** The file already uses `jest.unstable_mockModule` for `openai.service.js`; add this immediately after that existing mock block and BEFORE the first `await import(...)` line (ESM module mocks must be registered before the module graph loads):

```ts
const mockLog = {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  fatal: jest.fn(), debug: jest.fn(), trace: jest.fn(),
};
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLog,
}));
```

Add `mockLog.warn.mockReset(); mockLog.error.mockReset();` to the existing `beforeEach`.

**1b — the test case.** Append inside the existing `describe('regenTick', ...)` block. The suite already defines `mockAdjust`, `makeClaimable`, `jobStatus`, and imports `regenTick`, `MAX_JOB_ATTEMPTS`, `enqueueRegenJob`, `createAdmin`, `createAthlete`.

```ts
  it('logs the underlying error message on retry and on permanent failure', async () => {
    // days_per_week 6 is outside the coach 3-5 matrix, so generation takes the
    // AI path and hits the mocked rejection.
    const athleteId = await createAthlete(await createAdmin(), {
      days_per_week: 6,
      days_specific: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'],
    });
    mockAdjust.mockRejectedValue(new Error('Request timed out.'));
    const { jobId } = await enqueueRegenJob(athleteId);

    for (let i = 0; i < MAX_JOB_ATTEMPTS; i++) {
      await makeClaimable(jobId);
      await regenTick();
    }
    expect((await jobStatus(jobId)).status).toBe('failed');

    const logged = [...mockLog.warn.mock.calls, ...mockLog.error.mock.calls]
      .map((c) => JSON.stringify(c[0]))
      .join(' ');
    expect(logged).toContain('Request timed out.');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `npm test -- tests/integration/regen-worker.test.ts -t "logs the underlying error"`
Expected: FAIL — the logged payload contains only `jobId`/`attempts`, not the message.

- [ ] **Step 3: Add the message to both log calls**

In `backend/src/workers/regen-worker.ts`, inside the `catch (e)` block:

```ts
        logger.warn({ jobId: job.id, attempts: job.attempts, err: msg }, 'regen job retry');
```

and

```ts
        logger.error({ jobId: job.id, err: msg }, 'regen job failed permanently');
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `npm test -- tests/integration/regen-worker.test.ts`
Expected: PASS (all cases in the file).

---

### Task 4: Run the orphan sweep periodically, with a cooldown

`sweepOrphanProfiles` only runs once at worker startup, so an athlete whose job burned all its attempts stays skeleton-less until the next deploy. Running it on a timer fixes that, but it must not re-enqueue in a tight loop when generation is deterministically broken.

**Files:**
- Modify: `backend/src/services/skeleton-regen.service.ts:57-70` (`sweepOrphanProfiles`)
- Modify: `backend/src/workers/regen-worker.ts` (call it on a cadence)
- Test: `backend/tests/integration/skeleton-regen-service.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export const SWEEP_COOLDOWN_MS = 1_800_000; // 30 min
  export async function sweepOrphanProfiles(): Promise<{ enqueued: number }>;
  export const SWEEP_EVERY_MS = 600_000; // 10 min — exported from regen-worker.ts
  ```
  `sweepOrphanProfiles` keeps its signature; it gains the cooldown internally.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/skeleton-regen-service.test.ts`. That file already imports everything these cases need at module level: `createAdmin`, `createAthlete`, `pool`, and `sweepOrphanProfiles`. No new imports.

```ts
  it('sweep skips an athlete whose job is inside the cooldown window', async () => {
    const athleteId = await createAthlete(await createAdmin());
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, finished_at)
       VALUES ($1, 'failed', now())`,
      [athleteId],
    );
    const { enqueued } = await sweepOrphanProfiles();
    expect(enqueued).toBe(0);
  });

  it('sweep re-enqueues an athlete whose failed job is older than the cooldown', async () => {
    const athleteId = await createAthlete(await createAdmin());
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, created_at, finished_at)
       VALUES ($1, 'failed', now() - interval '2 hours', now() - interval '2 hours')`,
      [athleteId],
    );
    const { enqueued } = await sweepOrphanProfiles();
    expect(enqueued).toBe(1);
    const q = await pool.query(
      `SELECT 1 FROM skeleton_regen_jobs WHERE athlete_id = $1 AND status = 'queued'`,
      [athleteId],
    );
    expect(q.rowCount).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `backend/`: `npm test -- tests/integration/skeleton-regen-service.test.ts`
Expected: FAIL on the cooldown case — today the sweep re-enqueues immediately (`enqueued` is 1, not 0).

- [ ] **Step 3: Add the cooldown to sweepOrphanProfiles**

In `backend/src/services/skeleton-regen.service.ts`, replace the `sweepOrphanProfiles` function with:

```ts
// Never re-enqueue the same athlete more often than this. Generation can be
// deterministically broken for a profile (bad catalog, model refusing); the
// sweep is a safety net, not a hot retry loop.
export const SWEEP_COOLDOWN_MS = 1_800_000;

// Reconciliation: profiles that never got any skeleton (process died
// mid-generation, or every job attempt burned out) and have no active job get
// one enqueued. Runs periodically from the worker.
export async function sweepOrphanProfiles(): Promise<{ enqueued: number }> {
  const r = await pool.query(
    `INSERT INTO skeleton_regen_jobs (athlete_id, status)
     SELECT p.user_id, 'queued'
       FROM athlete_profiles p
      WHERE NOT EXISTS (
              SELECT 1 FROM athlete_skeletons s WHERE s.athlete_id = p.user_id)
        AND NOT EXISTS (
              SELECT 1 FROM skeleton_regen_jobs j
               WHERE j.athlete_id = p.user_id
                 AND j.status IN ('queued', 'running'))
        AND NOT EXISTS (
              SELECT 1 FROM skeleton_regen_jobs j
               WHERE j.athlete_id = p.user_id
                 AND j.created_at > now() - ($1::int * interval '1 millisecond'))`,
    [SWEEP_COOLDOWN_MS],
  );
  return { enqueued: r.rowCount ?? 0 };
}
```

- [ ] **Step 4: Run the sweep tests**

Run from `backend/`: `npm test -- tests/integration/skeleton-regen-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Call the sweep on a cadence from the worker**

In `backend/src/workers/regen-worker.ts`:

Add the constant next to the other timing constants:

```ts
export const SWEEP_EVERY_MS = 600_000;
```

Add a module-level cursor next to `let interval`:

```ts
let lastSweepAt = 0;
```

At the very top of the `try` block in `regenTick`, before the reaper query:

```ts
    if (Date.now() - lastSweepAt >= SWEEP_EVERY_MS) {
      lastSweepAt = Date.now();
      const { enqueued } = await sweepOrphanProfiles();
      if (enqueued > 0) {
        logger.warn({ enqueued }, 'regen sweep: enqueued jobs for orphan profiles');
      }
    }
```

Then simplify `startRegenWorker` — the boot-time sweep is now the first tick's job:

```ts
export function startRegenWorker(): void {
  if (interval) return;
  interval = setInterval(() => { void regenTick(); }, WORKER_TICK_MS);
  logger.info('regen worker started');
}
```

`sweepOrphanProfiles` stays in the existing import from `../services/skeleton-regen.service.js`.

- [ ] **Step 6: Run the worker suite**

Run from `backend/`: `npm test -- tests/integration/regen-worker.test.ts`
Expected: PASS. Note the first `regenTick()` of each test now also runs a sweep (`lastSweepAt` starts at 0). If a test asserts an exact job count and the sweep adds one for a fixture athlete without a skeleton, scope the assertion to the job id under test rather than disabling the sweep.

---

### Task 5: Expose regen state on the athlete dashboard

The home screen shows "Tu plan se está revisando" whether generation is running, waiting on the coach, or dead. `GET /athlete/me` already computes exactly the state we need; the dashboard just does not return it.

**Files:**
- Modify: `backend/src/services/dashboard.service.ts:88-108` (payload type) and `buildDashboard`
- Test: `backend/tests/integration/athlete-routes.test.ts` (add two cases at the end of the file)

> `GET /athlete/dashboard` has **no** test coverage today. `athlete-routes.test.ts` already sets up everything these cases need at module level — `app`, `request` (supertest), `signToken`, `createAdmin`, `createAthlete`, `pool` — so add them there rather than creating a new suite.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // added to DashboardPayload
  regenState: 'generating' | 'pending_review' | 'failed' | 'idle';
  ```
  Task 6 (mobile app, separate plan) consumes this field name and these four values verbatim.

- [ ] **Step 1: Write the failing test**

```ts
it('dashboard reports regenState failed when the last job failed and nothing is pending', async () => {
  const athleteId = await createAthlete(await createAdmin());
  await pool.query(
    `INSERT INTO skeleton_regen_jobs (athlete_id, status, finished_at)
     VALUES ($1, 'failed', now())`,
    [athleteId],
  );
  const tok = signToken({ id: athleteId, role: 'athlete' });
  const r = await request(app)
    .get('/api/athlete/dashboard')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.regenState).toBe('failed');
  expect(r.body.today.blocked).toBe('awaiting_review');
});

it('dashboard reports regenState generating while a job is queued', async () => {
  const athleteId = await createAthlete(await createAdmin());
  await pool.query(
    `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')`,
    [athleteId],
  );
  const tok = signToken({ id: athleteId, role: 'athlete' });
  const r = await request(app)
    .get('/api/athlete/dashboard')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.body.regenState).toBe('generating');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `backend/`: `npm test -- tests/integration/athlete-routes.test.ts -t regenState`
Expected: FAIL — `r.body.regenState` is `undefined`.

- [ ] **Step 3: Add regenState to the payload**

In `backend/src/services/dashboard.service.ts`, add the field to `DashboardPayload` right after `nextSessions`:

```ts
  nextSessions: NextSession[];
  regenState: 'generating' | 'pending_review' | 'failed' | 'idle';
```

Add this helper above `buildDashboard` (it is the same query `GET /athlete/me` already runs — keep the two in sync):

```ts
async function computeRegenState(
  userId: string,
): Promise<DashboardPayload['regenState']> {
  const r = await pool.query<{
    active: boolean; pending: boolean; failed: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM skeleton_regen_jobs
               WHERE athlete_id = $1 AND status IN ('queued','running')) AS active,
       EXISTS(SELECT 1 FROM athlete_skeletons
               WHERE athlete_id = $1 AND status = 'pending_review') AS pending,
       (SELECT status FROM skeleton_regen_jobs
          WHERE athlete_id = $1
          ORDER BY created_at DESC LIMIT 1) = 'failed' AS failed`,
    [userId],
  );
  const rs = r.rows[0];
  if (rs.active) return 'generating';
  if (rs.pending) return 'pending_review';
  if (rs.failed) return 'failed';
  return 'idle';
}
```

Then set it on BOTH returned payloads: the early return for a missing profile (around line 130 — use `'idle'` there, there is no profile yet) and the main return at the end of `buildDashboard` (use `await computeRegenState(userId)`).

- [ ] **Step 4: Run tests to verify they pass**

Run from `backend/`: `npm test -- tests/integration/athlete-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run from `backend/`: `npx tsc --noEmit`
Expected: no errors. If another file constructs a `DashboardPayload` literal, add `regenState` there too.

---

### Task 6: Show stuck generations to the coach in the rutinas queue

An athlete whose generation failed simply does not exist in `/admin/rutinas`. The coach has no way to know. The queue page already polls every 60 s — that is where the warning belongs.

**Files:**
- Create: `backend/src/services/generation-health.service.ts`
- Modify: `backend/src/routes/rutinas.ts` (add `GET /pending/stuck` next to `GET /pending`)
- Modify: `frontend/src/hooks/usePendingRutinas.ts` (add a sibling hook)
- Modify: `frontend/src/pages/admin/Rutinas.tsx` (`ColaPane` — render the banner)
- Test: `backend/tests/integration/admin-rutinas.test.ts` (add cases)

**Interfaces:**
- Consumes: `listPendingForCoach` pattern from `./skeleton.service.js` for the `coach_id` filter.
- Produces:
  ```ts
  export interface StuckGeneration {
    athlete_id: string;
    athlete_name: string;
    status: 'failed' | 'stalled';
    last_error: string | null;
    since: string;
  }
  export async function listStuckGenerations(coachId: string): Promise<StuckGeneration[]>;
  ```
  `'failed'` = the athlete's most recent job is `failed`. `'stalled'` = the athlete has a `queued`/`running` job older than 15 minutes. Athletes who already have any skeleton row are never listed.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/admin-rutinas.test.ts`. That file has NO module-level `coachId`/`adminToken` — every test creates its own via `createAdmin()` + `signToken`, so these do the same. `request`, `app`, `pool`, `signToken`, `createAdmin`, `createAthlete` are already imported at the top of the file.

```ts
describe('GET /admin/rutinas/pending/stuck', () => {
  it('lists athletes whose generation failed', async () => {
    const coachId = await createAdmin();
    const adminToken = signToken({ id: coachId, role: 'admin' });
    const athleteId = await createAthlete(coachId);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, last_error, finished_at)
       VALUES ($1, 'failed', 'Request timed out.', now())`,
      [athleteId],
    );
    const r = await request(app)
      .get('/api/admin/rutinas/pending/stuck')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].athlete_id).toBe(athleteId);
    expect(r.body[0].status).toBe('failed');
    expect(r.body[0].last_error).toBe('Request timed out.');
  });

  it('flags a job stuck in queued for over 15 minutes', async () => {
    const coachId = await createAdmin();
    const adminToken = signToken({ id: coachId, role: 'admin' });
    const athleteId = await createAthlete(coachId);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, created_at)
       VALUES ($1, 'queued', now() - interval '30 minutes')`,
      [athleteId],
    );
    const r = await request(app)
      .get('/api/admin/rutinas/pending/stuck')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].status).toBe('stalled');
  });

  it('ignores athletes that already have a skeleton', async () => {
    const coachId = await createAdmin();
    const adminToken = signToken({ id: coachId, role: 'admin' });
    const athleteId = await createAthlete(coachId);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, finished_at)
       VALUES ($1, 'failed', now())`,
      [athleteId],
    );
    await pool.query(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by, generation_prompt)
       VALUES ($1, 'pending_review', 'ai', '{}'::jsonb)`,
      [athleteId],
    );
    const r = await request(app)
      .get('/api/admin/rutinas/pending/stuck')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.body).toHaveLength(0);
  });

  it('does not leak another coach\'s athletes', async () => {
    const coachA = await createAdmin();
    const coachB = await createAdmin();
    const athleteId = await createAthlete(coachA);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, finished_at)
       VALUES ($1, 'failed', now())`,
      [athleteId],
    );
    const r = await request(app)
      .get('/api/admin/rutinas/pending/stuck')
      .set('Authorization', `Bearer ${signToken({ id: coachB, role: 'admin' })}`);
    expect(r.body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `backend/`: `npm test -- tests/integration/admin-rutinas.test.ts -t stuck`
Expected: FAIL with 404 — the route does not exist.

- [ ] **Step 3: Write the service**

Create `backend/src/services/generation-health.service.ts`:

```ts
import pool from '../db/connect.js';

// A job sitting in queued/running longer than this means the worker died or
// the generation hung — either way the coach should see the athlete.
export const STALLED_AFTER_MS = 900_000;

export interface StuckGeneration {
  athlete_id: string;
  athlete_name: string;
  status: 'failed' | 'stalled';
  last_error: string | null;
  since: string;
}

export async function listStuckGenerations(
  coachId: string,
): Promise<StuckGeneration[]> {
  const { rows } = await pool.query<StuckGeneration>(
    `SELECT ap.user_id AS athlete_id,
            ap.name    AS athlete_name,
            CASE WHEN j.status = 'failed' THEN 'failed' ELSE 'stalled' END AS status,
            j.last_error,
            COALESCE(j.finished_at, j.created_at) AS since
       FROM athlete_profiles ap
       JOIN LATERAL (
              SELECT status, last_error, created_at, finished_at
                FROM skeleton_regen_jobs
               WHERE athlete_id = ap.user_id
               ORDER BY created_at DESC
               LIMIT 1
            ) j ON TRUE
      WHERE ap.coach_id = $1
        AND NOT EXISTS (
              SELECT 1 FROM athlete_skeletons s WHERE s.athlete_id = ap.user_id)
        AND (
              j.status = 'failed'
              OR (j.status IN ('queued', 'running')
                  AND j.created_at < now() - ($2::int * interval '1 millisecond'))
            )
      ORDER BY since ASC`,
    [coachId, STALLED_AFTER_MS],
  );
  return rows;
}
```

- [ ] **Step 4: Add the route**

In `backend/src/routes/rutinas.ts`, add the import:

```ts
import { listStuckGenerations } from '../services/generation-health.service.js';
```

and register the route **immediately after** the existing `router.get('/pending', ...)` and **before** `router.get('/:id', ...)` — otherwise `/:id` swallows it:

```ts
router.get('/pending/stuck', async (req, res) => {
  const list = await listStuckGenerations(req.user!.id);
  res.json(list);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run from `backend/`: `npm test -- tests/integration/admin-rutinas.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the frontend hook**

In `frontend/src/hooks/usePendingRutinas.ts`, append:

```ts
export interface StuckGeneration {
  athlete_id: string;
  athlete_name: string;
  status: 'failed' | 'stalled';
  last_error: string | null;
  since: string;
}

export function useStuckGenerations() {
  return useQuery({
    queryKey: ['admin', 'rutinas', 'stuck'],
    queryFn: async (): Promise<StuckGeneration[]> => {
      const r = await api.get<StuckGeneration[]>('/admin/rutinas/pending/stuck');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 7: Render the banner**

In `frontend/src/pages/admin/Rutinas.tsx`, inside `ColaPane`, add the hook next to the existing `usePendingRutinas()` call:

```tsx
  const { data: stuck = [] } = useStuckGenerations();
```

and render this directly above the existing list/detail layout that `ColaPane` returns (wrap the current return in a fragment if needed):

```tsx
  {stuck.length > 0 && (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
      <span className="font-semibold">
        {stuck.length === 1
          ? '1 atleta sin rutina generada'
          : `${stuck.length} atletas sin rutina generada`}
      </span>
      {': '}
      {stuck.map((s) => s.athlete_name).join(', ')}
      {'. '}
      Se reintenta solo cada 30 min; si persiste, revisá los logs de generación.
    </div>
  )}
```

Update the import at the top of the file:

```tsx
import { usePendingRutinas, useStuckGenerations } from '@/hooks/usePendingRutinas';
```

- [ ] **Step 8: Verify the frontend builds and its tests still pass**

Run from `frontend/`: `npm run build`
Expected: build succeeds.

Run from `frontend/`: `npm test -- Rutinas`
Expected: the existing `Rutinas.discard.test.tsx` and `Rutinas.skip.test.tsx` still PASS. They render `Rutinas` and will now also fire the new query — if they fail on an unmocked request, mock `/admin/rutinas/pending/stuck` to return `[]` the same way those files already mock `/admin/rutinas/pending`.

---

### Task 7: Full backend suite green

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the whole backend suite**

Run from `backend/`: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Lint and typecheck**

Run from `backend/`: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Report**

Write a short summary of: how many exercises get substituted for a `casa_basica` + `nunca` profile (from the Task 2 test output), which suites needed assertion updates, and anything in the plan that turned out to be wrong.
