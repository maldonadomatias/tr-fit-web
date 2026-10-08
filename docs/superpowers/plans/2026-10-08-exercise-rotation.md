# Exercise Rotation (cada 2 semanas) Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-10-08T00:00Z · source: claude+writing-plans -->

**Goal:** Every 2 program weeks, permanently swap ONE accessory exercise in the athlete's active skeleton for another of the same muscle group, rotating muscle groups in a fixed order, and push-notify the athlete.

**Architecture:** A pure selection module (`exercise-rotation.ts`) decides which slot to swap and to what, given the skeleton slots, the exercise catalog and the athlete-allowed catalog. A thin DB service (`exercise-rotation.service.ts`) loads data, applies the swap to `skeleton_slots`, seeds the new exercise's rep progression, logs to a new `exercise_rotations` table and advances `athlete_program_state.rotation_index`. It runs inside `runWeeklyProgressionForAthlete` (same transaction + advisory lock) when the week advances into an odd week ≥ 3 (3, 5, 7, …). Push is sent after COMMIT.

**Tech Stack:** Node 20, TypeScript (ESM, `.js` import suffixes), Express, PostgreSQL (`pg`), Jest (`npm test` in `backend/`, runs with `--experimental-vm-modules`).

**Spec (client ticket, summarized):**
1. Never rotate a principal (slot role `principal` or exercise `is_principal`) nor a finisher (dropset scheme like `10x10x10`).
2. Replacement must not already be in that same day (other days OK).
3. Replacement must be same muscle group.
4. Must respect athlete injuries (`exercises.contraindicated_for` vs `athlete_profiles.injuries`).
5. Must keep the rep cycle (copy the replaced exercise's `current_reps_text`); time-modality exercises are replaced only by time-modality exercises (`exercises.modality`).
6. Muscle group order across rotations: Espalda → Pecho → Piernas → Biceps → Triceps → Hombros → (back to Espalda). If a group has nothing rotatable, skip to the next.

**Decisions already taken (do not change):**
- "2 weeks" = program weeks (`athlete_program_state.current_week`), rotation fires when progression advances the week to 3, 5, 7, … (i.e. `toWeek > fromWeek && toWeek >= 3 && toWeek % 2 === 1`).
- Change is permanent: `UPDATE skeleton_slots SET exercise_id`. Logged in `exercise_rotations`.
- Muscle group matching: replacement must have the EXACT same `muscle_group` string (e.g. `Piernas - Cuadriceps`). The ORDER (rule 6) uses the prefix before `" - "` (e.g. `Piernas`), compared accent/case-insensitively.
- Candidate choice: if the original exercise has curated `alternatives_ids`, pick at random among the curated ones that pass all filters AND share the group prefix; otherwise random among all filtered exercises with the exact same `muscle_group`.
- Push notification type `exercise_rotated` to the athlete.

## Global Constraints
- Do NOT commit, push, or open PRs.
- ESM imports with `.js` suffix (e.g. `import x from './foo.js'`).
- Prettier style: single quotes, semicolons, 2 spaces, 80 cols, ES5 trailing commas.
- Minimal diffs; no drive-by refactors.
- Comments in the existing codebase are mostly Spanish/English mixed; keep new comments short.
- Integration tests need `TEST_DATABASE_URL` pointing at a migrated test DB. If the DB is unreachable, still run unit tests and `npx tsc --noEmit` and report that integration tests could not run.

## Review Focus
- Athlete with no rotatable slot in ANY group (e.g. only principals + finishers) → no change, `rotation_index` NOT advanced, no push, progression still succeeds.
- Group in the order has rotatable slots but zero candidates (all same-group exercises already that day / injured / wrong equipment) → skip to next group.
- Same exercise appears on two different days → only ONE slot changes; the replacement may equal an exercise used on another day but never one already used on the swapped slot's day.
- Replacement already has its own `athlete_exercise_weights` row → keep it untouched (its own history wins); only seed when absent.
- Rotation failure must not leave a half-applied state: it runs inside the progression transaction; an exception rolls back the whole progression (existing behaviour of the try/catch).

## File Structure
- Create `backend/src/db/migrations/071_exercise_rotation.sql` — `rotation_index` column, `exercise_rotations` table, `exercise_rotated` notification type.
- Create `backend/src/services/exercise-rotation.ts` — pure selection logic (no DB).
- Create `backend/src/services/exercise-rotation.service.ts` — DB orchestration.
- Modify `backend/src/services/progression.service.ts` — call rotation + push.
- Modify `backend/src/domain/types.ts` — add `'exercise_rotated'` to `NotificationType`.
- Modify `backend/src/services/notification-templates.ts` — template.
- Create `backend/tests/unit/exercise-rotation.test.ts`.
- Create `backend/tests/integration/exercise-rotation.test.ts`.
- Modify `backend/tests/unit/notification-templates.test.ts` — key list.

---

### Task 1: Migration

**Files:**
- Create: `backend/src/db/migrations/071_exercise_rotation.sql`

- [ ] **Step 1: Write migration**

```sql
-- 071_exercise_rotation.sql
--
-- Rotación automática: cada 2 semanas de programa se cambia 1 accesorio del
-- esqueleto activo por otro del mismo grupo muscular, rotando grupos en orden
-- Espalda → Pecho → Piernas → Biceps → Triceps → Hombros.

ALTER TABLE athlete_program_state
  ADD COLUMN IF NOT EXISTS rotation_index INT NOT NULL DEFAULT 0
    CHECK (rotation_index BETWEEN 0 AND 5);

CREATE TABLE IF NOT EXISTS exercise_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skeleton_id UUID NOT NULL REFERENCES athlete_skeletons(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL,
  day_of_week INT NOT NULL,
  program_week INT NOT NULL,
  muscle_group TEXT NOT NULL,
  from_exercise_id INT NOT NULL REFERENCES exercises(id),
  to_exercise_id INT NOT NULL REFERENCES exercises(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_rotations_athlete
  ON exercise_rotations(athlete_id, created_at DESC);

ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report',
    'community_revision','exercise_rotated'
  ));

ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
  "session_reminder": true,
  "session_missed": true,
  "week_start": true,
  "skeleton_approved": true,
  "sos_resolved": true,
  "rm_test_week": true,
  "membership_expiring": true,
  "membership_expired": true,
  "community_announcement": true,
  "community_event": true,
  "community_comment": true,
  "community_report": true,
  "community_revision": true,
  "exercise_rotated": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs || '{"exercise_rotated": true}'::jsonb
  WHERE NOT (notification_prefs ? 'exercise_rotated');
```

Before writing, run `ls backend/src/db/migrations | tail -3` and confirm the last one is `070_…`. If a `071_` already exists, use the next free number and update this name everywhere.

- [ ] **Step 2: Apply to test DB (best effort)**

Run (from `backend/`): `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate`
Expected: migration 071 applied, no error. If `TEST_DATABASE_URL` is unset or DB unreachable, skip and note it. NEVER run against `backend/.env` DATABASE_URL (it points to production).

### Task 2: Notification type + template

**Files:**
- Modify: `backend/src/domain/types.ts` (the `NotificationType` union, ~line 290)
- Modify: `backend/src/services/notification-templates.ts`
- Modify: `backend/tests/unit/notification-templates.test.ts`

- [ ] **Step 1: Update failing test** — in `notification-templates.test.ts`, rename `'covers all 13 types'` to `'covers all 14 types'`, insert `'exercise_rotated',` in the sorted array between `'community_revision',` and `'membership_expired',`, and add:

```ts
  it('renders exercise_rotated with both names', () => {
    const r = TEMPLATES.exercise_rotated({ from: 'Remo Gironda', to: 'Remo en T' });
    expect(r.title).toBe('Cambiamos un ejercicio');
    expect(r.body).toBe('Remo Gironda → Remo en T. ¡A variar estímulos!');
    expect(r.route).toBe('/(app)/athlete');
  });
```

- [ ] **Step 2: Run** `npx jest tests/unit/notification-templates.test.ts` → expect FAIL.

- [ ] **Step 3: Implement** — add `| 'exercise_rotated'` at the end of the `NotificationType` union, and in `TEMPLATES` add:

```ts
  exercise_rotated: ({ from, to }) => ({
    title: 'Cambiamos un ejercicio',
    body: `${from} → ${to}. ¡A variar estímulos!`,
    route: '/(app)/athlete',
  }),
```

- [ ] **Step 4: Run** `npx jest tests/unit/notification-templates.test.ts` → PASS. Run `npx tsc --noEmit` → no errors (if other `Record<NotificationType, …>` maps exist, `tsc` will point to them; add `exercise_rotated: true` / matching entry there).

### Task 3: Pure selection module

**Files:**
- Create: `backend/src/services/exercise-rotation.ts`
- Test: `backend/tests/unit/exercise-rotation.test.ts`

**Interfaces (produced):**
```ts
export const ROTATION_ORDER: readonly string[]; // ['Espalda','Pecho','Piernas','Biceps','Triceps','Hombros']
export function groupKey(muscleGroup: string): string; // prefix before ' - ', lowercased, accents stripped
export interface RotationSlot { id: string; day_of_week: number; exercise_id: number; role: string; reps: string | null; }
export interface RotationPick { slotId: string; dayOfWeek: number; from: Exercise; to: Exercise; group: string; nextIndex: number; }
export function pickRotation(slots: RotationSlot[], exById: Map<number, Exercise>, allowed: Exercise[], startIndex: number, rng?: () => number): RotationPick | null;
```

- [ ] **Step 1: Write failing tests** — `backend/tests/unit/exercise-rotation.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import {
  pickRotation,
  groupKey,
  ROTATION_ORDER,
  type RotationSlot,
} from '../../src/services/exercise-rotation.js';
import type { Exercise } from '../../src/domain/types.js';

function ex(over: Partial<Exercise> & { id: number; name: string }): Exercise {
  return {
    muscle_group: 'Espalda',
    equipment: 'mancuerna',
    movement_pattern: 'pull_h',
    is_principal: false,
    is_unilateral: false,
    level_min: 'principiante',
    contraindicated_for: [],
    default_increment_kg: 2.5,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
    modality: 'reps',
    default_target: null,
    rep_cycle_threshold: 12,
    ...over,
  } as Exercise;
}

function slot(over: Partial<RotationSlot> & { id: string; exercise_id: number }): RotationSlot {
  return { day_of_week: 1, role: 'accesorio', reps: '8', ...over };
}

const first = () => 0; // deterministic rng: always index 0

describe('groupKey', () => {
  it('uses the prefix, case and accent insensitive', () => {
    expect(groupKey('Piernas - Cuadriceps')).toBe('piernas');
    expect(groupKey('Bíceps')).toBe('biceps');
    expect(groupKey('Espalda')).toBe('espalda');
  });
});

describe('pickRotation', () => {
  const remo = ex({ id: 1, name: 'Remo' });
  const jalon = ex({ id: 2, name: 'Jalon' });
  const pullover = ex({ id: 3, name: 'Pullover' });
  const pecho = ex({ id: 10, name: 'Aperturas', muscle_group: 'Pecho - Mayor' });
  const pecho2 = ex({ id: 11, name: 'Cruce', muscle_group: 'Pecho - Mayor' });

  it('order starts at Espalda and ends at Hombros', () => {
    expect(ROTATION_ORDER).toEqual(['Espalda', 'Pecho', 'Piernas', 'Biceps', 'Triceps', 'Hombros']);
  });

  it('swaps an Espalda accessory for another Espalda exercise not used that day', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 }), slot({ id: 's2', exercise_id: 2 })];
    const byId = new Map([[1, remo], [2, jalon]]);
    const pick = pickRotation(slots, byId, [remo, jalon, pullover, pecho], 0, first);
    expect(pick?.to.id).toBe(3);
    expect(pick?.group).toBe('Espalda');
    expect(pick?.nextIndex).toBe(1);
  });

  it('allows a replacement used on another day', () => {
    const slots = [slot({ id: 's1', exercise_id: 1, day_of_week: 1 }), slot({ id: 's2', exercise_id: 2, day_of_week: 2 })];
    const byId = new Map([[1, remo], [2, jalon]]);
    const pick = pickRotation(slots, byId, [remo, jalon], 0, first);
    expect(pick?.slotId).toBe('s1');
    expect(pick?.to.id).toBe(2);
  });

  it('never rotates principal slots, principal exercises or dropset finishers', () => {
    const principalEx = ex({ id: 4, name: 'Remo Barra', is_principal: true });
    const slots = [
      slot({ id: 'a', exercise_id: 1, role: 'principal' }),
      slot({ id: 'b', exercise_id: 4 }),
      slot({ id: 'c', exercise_id: 2, reps: '10x10x10' }),
    ];
    const byId = new Map([[1, remo], [2, jalon], [4, principalEx]]);
    expect(pickRotation(slots, byId, [remo, jalon, pullover, principalEx], 0, first)).toBeNull();
  });

  it('never picks a principal exercise as replacement', () => {
    const principalEx = ex({ id: 4, name: 'Remo Barra', is_principal: true });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(slots, new Map([[1, remo]]), [remo, principalEx], 0, first);
    expect(pick).toBeNull();
  });

  it('requires exact same muscle_group', () => {
    const cuad = ex({ id: 20, name: 'Extension', muscle_group: 'Piernas - Cuadriceps' });
    const fem = ex({ id: 21, name: 'Curl femoral', muscle_group: 'Piernas - Femorales' });
    const slots = [slot({ id: 's1', exercise_id: 20 })];
    expect(pickRotation(slots, new Map([[20, cuad]]), [cuad, fem], 2, first)).toBeNull();
  });

  it('time-modality only replaced by time-modality', () => {
    const plancha = ex({ id: 30, name: 'Remo isometrico', modality: 'tiempo' });
    const slots = [slot({ id: 's1', exercise_id: 30 })];
    const byId = new Map([[30, plancha]]);
    expect(pickRotation(slots, byId, [plancha, remo], 0, first)).toBeNull();
    const plancha2 = ex({ id: 31, name: 'Colgado', modality: 'tiempo' });
    expect(pickRotation(slots, byId, [plancha, remo, plancha2], 0, first)?.to.id).toBe(31);
  });

  it('only picks from allowed (injury/equipment filtered) list', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    // pullover NOT in allowed → nothing
    expect(pickRotation(slots, new Map([[1, remo]]), [remo], 0, first)).toBeNull();
  });

  it('skips a group with no candidates and moves to the next', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 }), slot({ id: 's2', exercise_id: 10, day_of_week: 2 })];
    const byId = new Map([[1, remo], [10, pecho]]);
    const pick = pickRotation(slots, byId, [remo, pecho, pecho2], 0, first);
    expect(pick?.group).toBe('Pecho');
    expect(pick?.to.id).toBe(11);
    expect(pick?.nextIndex).toBe(2);
  });

  it('wraps around after Hombros', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(slots, new Map([[1, remo]]), [remo, jalon], 5, first);
    expect(pick?.group).toBe('Espalda');
    expect(pick?.nextIndex).toBe(1);
  });

  it('prefers curated alternatives when any passes filters', () => {
    const remoCur = ex({ id: 1, name: 'Remo', alternatives_ids: [3] });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(slots, new Map([[1, remoCur]]), [remoCur, jalon, pullover], 0, first);
    expect(pick?.to.id).toBe(3);
  });

  it('falls back to group when curated ones are not allowed', () => {
    const remoCur = ex({ id: 1, name: 'Remo', alternatives_ids: [99] });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(slots, new Map([[1, remoCur]]), [remoCur, jalon], 0, first);
    expect(pick?.to.id).toBe(2);
  });

  it('returns null when nothing in any group is rotatable', () => {
    expect(pickRotation([], new Map(), [], 0, first)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx jest tests/unit/exercise-rotation.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `backend/src/services/exercise-rotation.ts`:

```ts
// Rotación de accesorios cada 2 semanas (ticket "VARIACION EJERCICIOS").
// Lógica pura: el servicio carga datos y aplica; acá solo se decide qué
// slot cambia y por cuál ejercicio.

import type { Exercise } from '../domain/types.js';
import {
  isExcludedFromAutoProgression,
  weightScheme,
} from './progression-helpers.js';

/** Orden de grupos pedido por el coach; vuelve a Espalda después de Hombros. */
export const ROTATION_ORDER: readonly string[] = [
  'Espalda',
  'Pecho',
  'Piernas',
  'Biceps',
  'Triceps',
  'Hombros',
];

/** "Piernas - Cuadriceps" → "piernas"; "Bíceps" → "biceps". */
export function groupKey(muscleGroup: string): string {
  return muscleGroup
    .split(' - ')[0]
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface RotationSlot {
  id: string;
  day_of_week: number;
  exercise_id: number;
  role: string;
  reps: string | null;
}

export interface RotationPick {
  slotId: string;
  dayOfWeek: number;
  from: Exercise;
  to: Exercise;
  group: string;
  nextIndex: number;
}

function isRotatable(slot: RotationSlot, ex: Exercise): boolean {
  return (
    slot.role === 'accesorio' &&
    weightScheme(slot.reps) !== 'dropset' &&
    !ex.is_principal &&
    !isExcludedFromAutoProgression(ex.name, ex.muscle_group)
  );
}

function candidatesFor(
  orig: Exercise,
  allowed: Exercise[],
  usedInDay: Set<number>
): Exercise[] {
  const base = allowed.filter(
    (e) =>
      e.id !== orig.id &&
      !usedInDay.has(e.id) &&
      !e.is_principal &&
      e.modality === orig.modality &&
      !isExcludedFromAutoProgression(e.name, e.muscle_group)
  );
  const curated = (orig.alternatives_ids ?? [])
    .map((id) => base.find((e) => e.id === id))
    .filter(
      (e): e is Exercise =>
        !!e && groupKey(e.muscle_group) === groupKey(orig.muscle_group)
    );
  if (curated.length > 0) return curated;
  return base.filter((e) => e.muscle_group === orig.muscle_group);
}

/**
 * Elige el cambio de esta vuelta arrancando por ROTATION_ORDER[startIndex].
 * Si el grupo no tiene nada rotable (o sin candidatos), pasa al siguiente.
 * `allowed` ya viene filtrado por equipamiento, nivel, lesiones y exclusiones.
 */
export function pickRotation(
  slots: RotationSlot[],
  exById: Map<number, Exercise>,
  allowed: Exercise[],
  startIndex: number,
  rng: () => number = Math.random
): RotationPick | null {
  const n = ROTATION_ORDER.length;
  for (let step = 0; step < n; step++) {
    const idx = (((startIndex + step) % n) + n) % n;
    const group = ROTATION_ORDER[idx];
    const options: { slot: RotationSlot; from: Exercise; cands: Exercise[] }[] =
      [];
    for (const slot of slots) {
      const from = exById.get(slot.exercise_id);
      if (!from || !isRotatable(slot, from)) continue;
      if (groupKey(from.muscle_group) !== groupKey(group)) continue;
      const usedInDay = new Set(
        slots
          .filter((s) => s.day_of_week === slot.day_of_week)
          .map((s) => s.exercise_id)
      );
      const cands = candidatesFor(from, allowed, usedInDay);
      if (cands.length > 0) options.push({ slot, from, cands });
    }
    if (options.length === 0) continue;
    const o = options[Math.floor(rng() * options.length)];
    const to = o.cands[Math.floor(rng() * o.cands.length)];
    return {
      slotId: o.slot.id,
      dayOfWeek: o.slot.day_of_week,
      from: o.from,
      to,
      group,
      nextIndex: (idx + 1) % n,
    };
  }
  return null;
}
```

- [ ] **Step 4: Run** `npx jest tests/unit/exercise-rotation.test.ts` → all PASS.

### Task 4: DB service

**Files:**
- Create: `backend/src/services/exercise-rotation.service.ts`

**Interfaces:**
- Consumes: `pickRotation`, `RotationSlot` (Task 3); `listExercisesForAthlete(profile, athleteId)` from `./exercise.service.js`.
- Produces:
```ts
export interface RotationRecord { slot_id: string; day_of_week: number; group: string; from_exercise_id: number; from_name: string; to_exercise_id: number; to_name: string; }
export async function rotateOneExercise(client: PoolClient, athleteId: string, skeletonId: string, programWeek: number, rng?: () => number): Promise<RotationRecord | null>;
```

- [ ] **Step 1: Implement**

```ts
import type { PoolClient } from 'pg';
import type { AthleteProfile, Exercise } from '../domain/types.js';
import { listExercisesForAthlete } from './exercise.service.js';
import { pickRotation, type RotationSlot } from './exercise-rotation.js';

export interface RotationRecord {
  slot_id: string;
  day_of_week: number;
  group: string;
  from_exercise_id: number;
  from_name: string;
  to_exercise_id: number;
  to_name: string;
}

/**
 * Cambia 1 accesorio del esqueleto activo (permanente) y deja log.
 * Corre dentro de la transacción del caller (progresión semanal).
 */
export async function rotateOneExercise(
  client: PoolClient,
  athleteId: string,
  skeletonId: string,
  programWeek: number,
  rng: () => number = Math.random
): Promise<RotationRecord | null> {
  const profR = await client.query<AthleteProfile>(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`,
    [athleteId]
  );
  const profile = profR.rows[0];
  if (!profile) return null;

  const stateR = await client.query<{ rotation_index: number }>(
    `SELECT rotation_index FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId]
  );
  const startIndex = stateR.rows[0]?.rotation_index ?? 0;

  const slotsR = await client.query<RotationSlot>(
    `SELECT id, day_of_week, exercise_id, role, reps
       FROM skeleton_slots
      WHERE skeleton_id = $1
      ORDER BY day_of_week, slot_index`,
    [skeletonId]
  );
  if (slotsR.rows.length === 0) return null;

  const exR = await client.query<Exercise>(
    `SELECT * FROM exercises WHERE id = ANY($1::int[])`,
    [slotsR.rows.map((s) => s.exercise_id)]
  );
  const exById = new Map(exR.rows.map((e) => [e.id, e]));
  const allowed = await listExercisesForAthlete(profile, athleteId);

  const pick = pickRotation(slotsR.rows, exById, allowed, startIndex, rng);
  if (!pick) return null;

  await client.query(
    `UPDATE skeleton_slots SET exercise_id = $1
      WHERE id = $2 AND skeleton_id = $3`,
    [pick.to.id, pick.slotId, skeletonId]
  );

  // Sigue el ciclo de reps del ejercicio reemplazado. Si el nuevo ya tiene
  // historial propio, manda el suyo (mismo criterio que el swap del atleta).
  await client.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_reps_text,
        updated_by, scheme)
     SELECT $1, $2, NULL,
            (SELECT current_reps_text FROM athlete_exercise_weights
              WHERE athlete_id = $1 AND exercise_id = $3 AND scheme = 'normal'),
            'progression_cron', 'normal'
     ON CONFLICT (athlete_id, exercise_id, scheme) DO NOTHING`,
    [athleteId, pick.to.id, pick.from.id]
  );

  await client.query(
    `INSERT INTO exercise_rotations
       (athlete_id, skeleton_id, slot_id, day_of_week, program_week,
        muscle_group, from_exercise_id, to_exercise_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      athleteId,
      skeletonId,
      pick.slotId,
      pick.dayOfWeek,
      programWeek,
      pick.group,
      pick.from.id,
      pick.to.id,
    ]
  );

  await client.query(
    `UPDATE athlete_program_state SET rotation_index = $1
      WHERE athlete_id = $2`,
    [pick.nextIndex, athleteId]
  );

  return {
    slot_id: pick.slotId,
    day_of_week: pick.dayOfWeek,
    group: pick.group,
    from_exercise_id: pick.from.id,
    from_name: pick.from.name,
    to_exercise_id: pick.to.id,
    to_name: pick.to.name,
  };
}
```

Note: `listExercisesForAthlete` uses the global pool (read-only, outside the transaction) — acceptable, it only reads the catalog and exclusions.

- [ ] **Step 2: Run** `npx tsc --noEmit` → no errors.

### Task 5: Hook into weekly progression + push

**Files:**
- Modify: `backend/src/services/progression.service.ts`
- Test: `backend/tests/integration/exercise-rotation.test.ts`

- [ ] **Step 1: Write failing integration test** `backend/tests/integration/exercise-rotation.test.ts`:

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  createPendingSkeleton,
  approveSkeleton,
} from '../../src/services/skeleton.service.js';
import { runWeeklyProgressionForAthlete } from '../../src/services/progression.service.js';
import { rotateOneExercise } from '../../src/services/exercise-rotation.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

async function espaldaPair() {
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises
      WHERE muscle_group = 'Espalda' AND is_principal = FALSE
        AND modality = 'reps' AND archived_at IS NULL
        AND equipment = 'mancuerna'
      ORDER BY id LIMIT 1`
  );
  return r.rows[0].id;
}

async function setup(coach: string, ath: string, accesorioId: number, reps = '8') {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE ORDER BY id LIMIT 1`
  );
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: '' },
    {
      rationale: 'r',
      days: [
        {
          day_index: 1,
          focus: 'd',
          slots: [
            { slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
            { slot_index: 2, exercise_id: accesorioId, role: 'accesorio' as const, notes: null, series: 3, reps, descanso: '1 min' },
          ],
        },
      ],
    }
  );
  await approveSkeleton(skeletonId, coach);
  return skeletonId;
}

it('rotates one Espalda accessory, copies reps, logs and advances index', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const acc = await espaldaPair();
  const skeletonId = await setup(coach, ath, acc);
  await pool.query(
    `UPDATE athlete_exercise_weights SET current_reps_text = '10'
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, acc]
  );

  const client = await pool.connect();
  let rec;
  try {
    await client.query('BEGIN');
    rec = await rotateOneExercise(client, ath, skeletonId, 3, () => 0);
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  expect(rec).not.toBeNull();
  expect(rec!.group).toBe('Espalda');
  expect(rec!.from_exercise_id).toBe(acc);
  expect(rec!.to_exercise_id).not.toBe(acc);

  const slot = await pool.query(
    `SELECT exercise_id FROM skeleton_slots WHERE skeleton_id = $1 AND slot_index = 2`,
    [skeletonId]
  );
  expect(slot.rows[0].exercise_id).toBe(rec!.to_exercise_id);

  const toEx = await pool.query(
    `SELECT muscle_group FROM exercises WHERE id = $1`,
    [rec!.to_exercise_id]
  );
  expect(toEx.rows[0].muscle_group).toBe('Espalda');

  const w = await pool.query(
    `SELECT current_reps_text FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = $2 AND scheme = 'normal'`,
    [ath, rec!.to_exercise_id]
  );
  expect(w.rows[0].current_reps_text).toBe('10');

  const st = await pool.query(
    `SELECT rotation_index FROM athlete_program_state WHERE athlete_id = $1`,
    [ath]
  );
  expect(st.rows[0].rotation_index).toBe(1);

  const log = await pool.query(
    `SELECT count(*)::int AS n FROM exercise_rotations WHERE athlete_id = $1`,
    [ath]
  );
  expect(log.rows[0].n).toBe(1);
});

it('does not rotate dropset finishers', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const acc = await espaldaPair();
  const skeletonId = await setup(coach, ath, acc, '10x10x10');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rec = await rotateOneExercise(client, ath, skeletonId, 3, () => 0);
    await client.query('COMMIT');
    expect(rec).toBeNull();
  } finally {
    client.release();
  }
  const st = await pool.query(
    `SELECT rotation_index FROM athlete_program_state WHERE athlete_id = $1`,
    [ath]
  );
  expect(st.rows[0].rotation_index).toBe(0);
});

it('progression into week 3 rotates; into week 2 does not', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const acc = await espaldaPair();
  await setup(coach, ath, acc);

  // week 1 → 2 (no rotation). Force compliance with a completed set log.
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, completed)
     VALUES ($1, $2, 1, true)`,
    [ath, acc]
  );
  const r1 = await runWeeklyProgressionForAthlete(ath);
  expect(r1.toWeek).toBe(2);
  expect(r1.rotation).toBeNull();

  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, completed)
     VALUES ($1, $2, 2, true)`,
    [ath, acc]
  );
  const r2 = await runWeeklyProgressionForAthlete(ath);
  expect(r2.toWeek).toBe(3);
  expect(r2.rotation).not.toBeNull();
});
```

Before running, inspect `set_logs` columns (`grep -n "CREATE TABLE IF NOT EXISTS set_logs" -A 20 backend/src/db/migrations/*.sql` and later `ALTER TABLE set_logs` migrations) and look at how `tests/integration/progression.service.test.ts` inserts set_logs; copy that exact insert shape (add any NOT NULL columns such as session/day/set_index it requires). Same for any helper used there to bypass `rm_test_blocking`/periodization edge cases.

- [ ] **Step 2: Run** `npx jest tests/integration/exercise-rotation.test.ts` → FAIL (`rotation` undefined on result).

- [ ] **Step 3: Implement in `progression.service.ts`:**

  1. Imports at top:
  ```ts
  import { rotateOneExercise, type RotationRecord } from './exercise-rotation.service.js';
  import { notifyUser } from './notification.service.js';
  ```
  2. Add `rotation: RotationRecord | null;` to `ProgressionResult`, and `rotation: null` to the early `skipped` return object.
  3. Right after the `if (compliance >= env.COMPLIANCE_THRESHOLD && fromWeek < 30) { … }` block and BEFORE the `INSERT INTO progression_runs`, add:
  ```ts
    // Variación cada 2 semanas de programa: al entrar a la semana 3, 5, 7…
    let rotation: RotationRecord | null = null;
    if (toWeek > fromWeek && toWeek >= 3 && toWeek % 2 === 1) {
      rotation = await rotateOneExercise(
        client,
        athleteId,
        state.active_skeleton_id,
        toWeek
      );
    }
  ```
  4. After `await client.query('COMMIT');` (success path), before `return`:
  ```ts
    if (rotation) {
      void notifyUser(athleteId, 'exercise_rotated', {
        from: rotation.from_name,
        to: rotation.to_name,
      }).catch((err) =>
        logger.warn({ err, athleteId }, 'exercise_rotated push failed')
      );
    }
  ```
  5. Include `rotation` in the success return object.

- [ ] **Step 4: Run** `npx jest tests/integration/exercise-rotation.test.ts tests/integration/progression.service.test.ts tests/integration/progression-cron.test.ts tests/integration/week-complete-advance.test.ts` → PASS. If any existing test does `toEqual` on the full `ProgressionResult`, add `rotation: null` (or the expected value) to its expectation.

- [ ] **Step 5: Full verification** (from `backend/`):
  - `npx tsc --noEmit` → 0 errors
  - `npx jest tests/unit` → PASS
  - `npm test` (integration requires `TEST_DATABASE_URL`) → PASS, or report that DB was unreachable.
  - `npx prettier --check src/services/exercise-rotation.ts src/services/exercise-rotation.service.ts src/services/progression.service.ts` → fix with `--write` if needed.

- [ ] **Step 6 (skip unless user asked to commit):** commit.
