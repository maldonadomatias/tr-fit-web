# Exercise Exclusion + Gym-Change Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permanent "No tengo esta máquina" exercise exclusion (with auto-replacement, dashboard listing, per-exercise reactivate) and a "He cambiado de gimnasio" full program reset.

**Architecture:** New `athlete_excluded_exercises` table. Backend services exclude/reactivate/list and apply exclusions in the session engine (swap excluded→replacement before weekly overrides; skip if no replacement). A program-reset service rewinds to week 1, clears weights/exclusions/overrides, keeps RM tests. Both actions emit informational coach alerts. The app gets a 3rd SOS sheet and a Profile "Mi gimnasio" section.

**Tech Stack:** Node/Express + TypeScript + PostgreSQL (pg) + Jest (backend); React Native + Expo + Jest + @gorhom/bottom-sheet (app).

**Repos & branches:** Both repos work on `main` (per user decision). `cd` into the right repo per task. Stage ONLY the files you touch — both working trees contain unrelated uncommitted changes; never `git add -A`.

---

## File Structure

**tr-fit-web (backend):**
- Create `backend/src/db/migrations/034_excluded_exercises.sql` — table + coach_alerts type CHECK extension.
- Modify `backend/src/domain/types.ts` — extend `CoachAlert.type` union.
- Modify `backend/src/domain/alert-actions.ts` — register new alert types.
- Modify `backend/src/services/alert.service.ts` — `createNoMachineAlert`, `createProgramResetAlert`.
- Create `backend/src/services/exclusions.service.ts` — exclude/reactivate/list/getExclusionMap.
- Create `backend/src/services/program-reset.service.ts` — `resetProgramForGymChange`.
- Modify `backend/src/services/engine.service.ts` — apply exclusions to slots.
- Modify `backend/src/services/exercise.service.ts` — filter excluded in `listExercisesForAthlete`.
- Modify `backend/src/routes/athlete.ts` — 4 new routes.
- Tests under `backend/tests/unit/`.

**tr-fit-app (UI):**
- Modify `lib/api.ts` — 4 new client functions.
- Create `components/session/NoMachineSheet.tsx`.
- Modify `app/(app)/session/active.tsx` + `components/session/GuidedSessionScreen.tsx` — 3rd SOS button + sheet.
- Create `app/(app)/profile/gimnasio.tsx`.
- Modify `app/(app)/athlete/profile.tsx` — "Mi gimnasio" SettingsRow.

---

## Task 1: Migration — excluded-exercises table + alert types

**Files:**
- Create: `backend/src/db/migrations/034_excluded_exercises.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 034_excluded_exercises.sql
-- Permanent per-athlete exercise exclusions ("no tengo esta máquina") and the
-- two new informational coach-alert types.

CREATE TABLE IF NOT EXISTS athlete_excluded_exercises (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),
  reason TEXT NOT NULL DEFAULT 'no_machine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, exercise_id)
);

-- Extend coach_alerts.type CHECK (mirror of 032_membership_notifications.sql).
ALTER TABLE coach_alerts DROP CONSTRAINT IF EXISTS coach_alerts_type_check;
ALTER TABLE coach_alerts ADD CONSTRAINT coach_alerts_type_check
  CHECK (type IN (
    'sos_pain','sos_machine','rpe_flag','rm_skipped','rm_week_starting',
    'membership_expiring','membership_overdue',
    'sos_no_machine','program_reset'
  ));
```

- [ ] **Step 2: Run migrations**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm run db:migrate`
Expected: applies `034_excluded_exercises` with no error. (If the DB is not running, note it and continue — the SQL is verified by inspection; later DB-backed tests will exercise it.)

- [ ] **Step 3: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/db/migrations/034_excluded_exercises.sql
git commit -m "feat: athlete_excluded_exercises table + new alert types"
```

---

## Task 2: Domain types for new alert types

**Files:**
- Modify: `backend/src/domain/types.ts` (the `CoachAlert.type` union near line 204)
- Modify: `backend/src/domain/alert-actions.ts`

- [ ] **Step 1: Extend the CoachAlert type union**

In `backend/src/domain/types.ts`, find:
```ts
  type: 'sos_pain' | 'sos_machine' | 'rpe_flag' | 'rm_skipped' | 'rm_week_starting' | 'membership_expiring' | 'membership_overdue';
```
Replace with:
```ts
  type: 'sos_pain' | 'sos_machine' | 'rpe_flag' | 'rm_skipped' | 'rm_week_starting' | 'membership_expiring' | 'membership_overdue' | 'sos_no_machine' | 'program_reset';
```

- [ ] **Step 2: Register actions for new types**

In `backend/src/domain/alert-actions.ts`, find the `AlertType` union (it lists `'sos_pain'`, `'sos_machine'`, ...) and add `| 'sos_no_machine' | 'program_reset'` to it. Then in the actions map object (the one mapping each type to an array like `sos_machine: [...]`), add:
```ts
  sos_no_machine:      ['note_only'],
  program_reset:       ['note_only'],
```
If the map type requires every `AlertType` key to be present, these two entries satisfy it. If TypeScript complains about missing keys for other pre-existing types, leave those as-is — only add the two new keys.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/domain/types.ts backend/src/domain/alert-actions.ts
git commit -m "feat: register sos_no_machine + program_reset alert types"
```

---

## Task 3: Alert helpers for no-machine + program-reset

**Files:**
- Modify: `backend/src/services/alert.service.ts`

- [ ] **Step 1: Add the two alert helpers**

Append to `backend/src/services/alert.service.ts` (mirror `createMachineAlert`, which resolves `coach_id` from `athlete_profiles` and inserts into `coach_alerts`). `AlertError` and `resolveSessionLogId` already exist in this file.

```ts
export interface CreateNoMachineAlertInput {
  athleteId: string;
  exerciseId: number;
  replacementExerciseId: number | null;
  sessionLogId?: string;
}

export async function createNoMachineAlert(
  input: CreateNoMachineAlertInput,
): Promise<{ alertId: string }> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [input.athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) throw new AlertError('no_coach_assigned');

  const sessionLogId = await resolveSessionLogId(
    input.athleteId, input.sessionLogId,
  );
  // No replacement found → coach must resolve manually → bump severity.
  const severity = input.replacementExerciseId === null ? 'yellow' : 'info';
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_no_machine', $3, $4, $5, $6::jsonb) RETURNING id`,
    [input.athleteId, coachId, severity, input.exerciseId, sessionLogId,
     JSON.stringify({ replacement_exercise_id: input.replacementExerciseId })],
  );
  return { alertId: ins.rows[0].id };
}

export async function createProgramResetAlert(
  athleteId: string,
): Promise<{ alertId: string }> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) throw new AlertError('no_coach_assigned');

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, payload)
     VALUES ($1, $2, 'program_reset', 'info', '{}'::jsonb) RETURNING id`,
    [athleteId, coachId],
  );
  return { alertId: ins.rows[0].id };
}
```

NOTE: `resolveSessionLogId` may require an active session. For `createNoMachineAlert` the call always happens during a session (the SOS sheet), so a session log exists. Verify `resolveSessionLogId` tolerates an explicit `sessionLogId` arg the way `createMachineAlert` uses it; pass it through identically.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/alert.service.ts
git commit -m "feat: createNoMachineAlert + createProgramResetAlert"
```

---

## Task 4: exclusions.service

**Files:**
- Create: `backend/src/services/exclusions.service.ts`
- Test: `backend/tests/unit/exclusions.service.test.ts`

- [ ] **Step 1: Read an existing DB-backed test to learn the harness**

Read `backend/tests/unit/session.service.test.ts` (or another `*.service.test.ts`) to see how the test DB is set up (imports, `beforeEach`/truncate, seeding users/exercises/profiles). Mirror that harness exactly in the new test file.

- [ ] **Step 2: Write the service**

Create `backend/src/services/exclusions.service.ts`:

```ts
import pool from '../db/connect.js';
import type { Exercise } from '../domain/types.js';
import { findAlternative } from './alternatives.service.js';
import { createNoMachineAlert } from './alert.service.js';

export interface ExclusionRow {
  exercise_id: number;
  exercise_name: string;
  replacement_exercise_id: number | null;
  replacement_name: string | null;
}

/** Map of excluded original exercise_id → replacement_exercise_id (or null). */
export async function getExclusionMap(
  athleteId: string,
): Promise<Map<number, number | null>> {
  const r = await pool.query<{ exercise_id: number; replacement_exercise_id: number | null }>(
    `SELECT exercise_id, replacement_exercise_id
       FROM athlete_excluded_exercises WHERE athlete_id = $1`,
    [athleteId],
  );
  return new Map(r.rows.map((row) => [row.exercise_id, row.replacement_exercise_id]));
}

export async function listExclusions(athleteId: string): Promise<ExclusionRow[]> {
  const r = await pool.query<ExclusionRow>(
    `SELECT e.exercise_id,
            orig.name AS exercise_name,
            e.replacement_exercise_id,
            repl.name AS replacement_name
       FROM athlete_excluded_exercises e
       JOIN exercises orig ON orig.id = e.exercise_id
       LEFT JOIN exercises repl ON repl.id = e.replacement_exercise_id
      WHERE e.athlete_id = $1
      ORDER BY e.created_at DESC`,
    [athleteId],
  );
  return r.rows;
}

export async function excludeExercise(
  athleteId: string,
  exerciseId: number,
  sessionLogId?: string,
): Promise<{ replacement: Exercise | null }> {
  // Idempotent: if already excluded, return the stored replacement.
  const existing = await pool.query<{ replacement_exercise_id: number | null }>(
    `SELECT replacement_exercise_id FROM athlete_excluded_exercises
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [athleteId, exerciseId],
  );
  if (existing.rows[0]) {
    const replId = existing.rows[0].replacement_exercise_id;
    const repl = replId
      ? (await pool.query<Exercise>(`SELECT * FROM exercises WHERE id = $1`, [replId])).rows[0] ?? null
      : null;
    return { replacement: repl };
  }

  // Exclude already-excluded exercises from the candidate replacements.
  const excludedIds = [...(await getExclusionMap(athleteId)).keys(), exerciseId];
  const replacement = await findAlternative(exerciseId, athleteId, excludedIds);

  await pool.query(
    `INSERT INTO athlete_excluded_exercises
       (athlete_id, exercise_id, replacement_exercise_id, reason)
     VALUES ($1, $2, $3, 'no_machine')`,
    [athleteId, exerciseId, replacement?.id ?? null],
  );

  await createNoMachineAlert({
    athleteId,
    exerciseId,
    replacementExerciseId: replacement?.id ?? null,
    sessionLogId,
  });

  return { replacement };
}

export async function reactivateExercise(
  athleteId: string,
  exerciseId: number,
): Promise<void> {
  await pool.query(
    `DELETE FROM athlete_excluded_exercises
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [athleteId, exerciseId],
  );
}
```

- [ ] **Step 3: Write the test**

Create `backend/tests/unit/exclusions.service.test.ts` using the harness from Step 1. Seed: a coach user, an athlete user with `athlete_profiles` (coach_id, equipment='gym_completo', level, injuries='{}'), and ≥2 exercises in the same `muscle_group` with compatible equipment (so `findAlternative` returns one). Assertions:

```ts
// excludeExercise picks a replacement, inserts the row, and creates an alert.
const { replacement } = await excludeExercise(athleteId, exA.id);
expect(replacement?.id).toBe(exB.id);
const rows = await listExclusions(athleteId);
expect(rows).toHaveLength(1);
expect(rows[0].exercise_id).toBe(exA.id);
expect(rows[0].replacement_exercise_id).toBe(exB.id);
const alerts = await pool.query(
  `SELECT type, severity FROM coach_alerts WHERE athlete_id = $1 AND type = 'sos_no_machine'`,
  [athleteId],
);
expect(alerts.rows[0].severity).toBe('info');

// idempotent: excluding again returns same replacement, no duplicate row.
const again = await excludeExercise(athleteId, exA.id);
expect(again.replacement?.id).toBe(exB.id);
expect((await listExclusions(athleteId))).toHaveLength(1);

// getExclusionMap reflects the exclusion.
const map = await getExclusionMap(athleteId);
expect(map.get(exA.id)).toBe(exB.id);

// reactivate removes it.
await reactivateExercise(athleteId, exA.id);
expect(await listExclusions(athleteId)).toHaveLength(0);

// no-alternative case: exclude the only exercise in a lone muscle group →
// replacement null, alert severity 'yellow'.
const res = await excludeExercise(athleteId, loneEx.id);
expect(res.replacement).toBeNull();
const yellow = await pool.query(
  `SELECT severity FROM coach_alerts WHERE athlete_id=$1 AND exercise_id=$2 AND type='sos_no_machine'`,
  [athleteId, loneEx.id],
);
expect(yellow.rows[0].severity).toBe('yellow');
```

- [ ] **Step 4: Run the test**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx jest exclusions.service`
Expected: PASS. (If the test DB is unavailable, document the failure as environment-only and verify the SQL/logic by inspection.)

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/exclusions.service.ts backend/tests/unit/exclusions.service.test.ts
git commit -m "feat: exclusions.service (exclude/reactivate/list/getExclusionMap)"
```

---

## Task 5: program-reset.service

**Files:**
- Create: `backend/src/services/program-reset.service.ts`
- Test: `backend/tests/unit/program-reset.service.test.ts`

- [ ] **Step 1: Write the service**

Create `backend/src/services/program-reset.service.ts`:

```ts
import pool from '../db/connect.js';
import { createProgramResetAlert } from './alert.service.js';

/**
 * "He cambiado de gimnasio" — rewind the program to week 1 and clear the data
 * that is gym-specific (weights, exclusions, weekly overrides). RM tests are
 * preserved as a historical strength reference.
 */
export async function resetProgramForGymChange(athleteId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE athlete_program_state
          SET current_week = 1, last_week_advanced_at = NULL, rm_test_blocking = FALSE
        WHERE athlete_id = $1`,
      [athleteId],
    );
    await client.query(`DELETE FROM athlete_exercise_weights   WHERE athlete_id = $1`, [athleteId]);
    await client.query(`DELETE FROM athlete_excluded_exercises WHERE athlete_id = $1`, [athleteId]);
    await client.query(`DELETE FROM weekly_overrides           WHERE athlete_id = $1`, [athleteId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await createProgramResetAlert(athleteId);
}
```

- [ ] **Step 2: Write the test**

Create `backend/tests/unit/program-reset.service.test.ts` (mirror harness). Seed an athlete with: `athlete_program_state.current_week = 5`, one row in `athlete_exercise_weights`, one in `athlete_excluded_exercises`, one in `weekly_overrides`, and one in `rm_tests`. Then:

```ts
await resetProgramForGymChange(athleteId);

const state = await pool.query(`SELECT current_week, rm_test_blocking FROM athlete_program_state WHERE athlete_id=$1`, [athleteId]);
expect(state.rows[0].current_week).toBe(1);
expect(state.rows[0].rm_test_blocking).toBe(false);

for (const t of ['athlete_exercise_weights','athlete_excluded_exercises','weekly_overrides']) {
  const c = await pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE athlete_id=$1`, [athleteId]);
  expect(c.rows[0].n).toBe(0);
}
// rm_tests preserved.
const rm = await pool.query(`SELECT count(*)::int AS n FROM rm_tests WHERE athlete_id=$1`, [athleteId]);
expect(rm.rows[0].n).toBe(1);

// alert created.
const al = await pool.query(`SELECT count(*)::int AS n FROM coach_alerts WHERE athlete_id=$1 AND type='program_reset'`, [athleteId]);
expect(al.rows[0].n).toBe(1);
```

- [ ] **Step 3: Run the test**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx jest program-reset.service`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/program-reset.service.ts backend/tests/unit/program-reset.service.test.ts
git commit -m "feat: resetProgramForGymChange (week 1, clear weights/exclusions/overrides, keep RM)"
```

---

## Task 6: Apply exclusions in the engine + filter generation

**Files:**
- Modify: `backend/src/services/engine.service.ts`
- Modify: `backend/src/services/exercise.service.ts`
- Test: `backend/tests/unit/engine.service.test.ts` (add cases)

- [ ] **Step 1: Apply exclusions to slots in buildTodaySession**

In `backend/src/services/engine.service.ts`, add the import near the top:
```ts
import { getExclusionMap } from './exclusions.service.js';
```
Then in `buildTodaySession`, between the slots query (`slotsR`) and `applyOverridesToSlots`, replace:
```ts
  if (slotsR.rows.length === 0) return [];

  const effectiveSlots = await applyOverridesToSlots(
    athleteId, state.current_week, dayOfWeek, slotsR.rows,
  );
```
with:
```ts
  if (slotsR.rows.length === 0) return [];

  // Apply permanent exclusions first: swap excluded exercise → replacement,
  // or drop the slot entirely when no replacement exists.
  const exclusions = await getExclusionMap(athleteId);
  const slotsAfterExclusion = slotsR.rows
    .map((slot) => {
      if (!exclusions.has(slot.exercise_id)) return slot;
      const repl = exclusions.get(slot.exercise_id) ?? null;
      return repl === null ? null : { ...slot, exercise_id: repl };
    })
    .filter((s): s is SkeletonSlot => s !== null);
  if (slotsAfterExclusion.length === 0) return [];

  const effectiveSlots = await applyOverridesToSlots(
    athleteId, state.current_week, dayOfWeek, slotsAfterExclusion,
  );
```

- [ ] **Step 2: Filter excluded exercises out of generation**

In `backend/src/services/exercise.service.ts`, change `listExercisesForAthlete` to accept the athlete id and filter excluded. Add import:
```ts
import { getExclusionMap } from './exclusions.service.js';
```
Replace the function with:
```ts
export async function listExercisesForAthlete(
  profile: AthleteProfile,
  athleteId?: string,
): Promise<Exercise[]> {
  const allowedEquipment = equipmentMatrix[profile.equipment];
  const athleteLevel = athleteLevelRank(profile.level);
  const excluded = athleteId ? await getExclusionMap(athleteId) : new Map<number, number | null>();
  const all = await listExercises();
  return all.filter((ex) => {
    if (excluded.has(ex.id)) return false;
    if (!allowedEquipment.includes(ex.equipment)) return false;
    if (levelOrder[ex.level_min] > athleteLevel) return false;
    if (ex.contraindicated_for.some((c) => profile.injuries.includes(c))) return false;
    return true;
  });
}
```
Then find every caller of `listExercisesForAthlete` (grep) and pass the athlete id where available. If a caller has no athlete id in scope, leave it (the param is optional → backward compatible). Run `grep -rn "listExercisesForAthlete" backend/src` and update call sites that have the athlete id handy (e.g. skeleton generation).

- [ ] **Step 3: Add engine tests**

In `backend/tests/unit/engine.service.test.ts`, add cases (mirror existing seeding):
```ts
// Excluded exercise in a slot is swapped to its replacement.
await pool.query(
  `INSERT INTO athlete_excluded_exercises (athlete_id, exercise_id, replacement_exercise_id, reason)
   VALUES ($1,$2,$3,'no_machine')`, [athleteId, exA.id, exB.id]);
let items = await buildTodaySession(athleteId, dayWithExA);
expect(items.map((i) => i.exercise.id)).toContain(exB.id);
expect(items.map((i) => i.exercise.id)).not.toContain(exA.id);

// Exclusion with null replacement drops the slot.
await pool.query(`DELETE FROM athlete_excluded_exercises WHERE athlete_id=$1`, [athleteId]);
await pool.query(
  `INSERT INTO athlete_excluded_exercises (athlete_id, exercise_id, replacement_exercise_id, reason)
   VALUES ($1,$2,NULL,'no_machine')`, [athleteId, exA.id]);
items = await buildTodaySession(athleteId, dayWithExA);
expect(items.map((i) => i.exercise.id)).not.toContain(exA.id);
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit && npx jest engine.service`
Expected: clean + PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/engine.service.ts backend/src/services/exercise.service.ts backend/tests/unit/engine.service.test.ts
git commit -m "feat: apply exercise exclusions in engine + filter generation"
```

---

## Task 7: Athlete routes

**Files:**
- Modify: `backend/src/routes/athlete.ts`

- [ ] **Step 1: Add imports + routes**

In `backend/src/routes/athlete.ts`, add imports:
```ts
import { excludeExercise, reactivateExercise, listExclusions } from '../services/exclusions.service.js';
import { resetProgramForGymChange } from '../services/program-reset.service.js';
```
Add these routes (anywhere after `const router = ...` and the `requireAuth, requireRole('athlete')` middleware):
```ts
router.get('/exclusions', async (req, res) => {
  const rows = await listExclusions(req.user!.id);
  res.json(rows);
});

router.post('/exclusions', async (req, res) => {
  const exerciseId = Number((req.body ?? {}).exercise_id);
  if (!Number.isInteger(exerciseId)) {
    return res.status(400).json({ error: 'exercise_id required' });
  }
  const sessionLogId =
    typeof (req.body ?? {}).session_log_id === 'string'
      ? (req.body as { session_log_id?: string }).session_log_id
      : undefined;
  const { replacement } = await excludeExercise(req.user!.id, exerciseId, sessionLogId);
  res.json({
    replacement: replacement
      ? {
          id: replacement.id,
          name: replacement.name,
          muscle_group: replacement.muscle_group,
          equipment: replacement.equipment,
        }
      : null,
  });
});

router.delete('/exclusions/:exerciseId', async (req, res) => {
  const exerciseId = Number(req.params.exerciseId);
  if (!Number.isInteger(exerciseId)) {
    return res.status(400).json({ error: 'invalid exerciseId' });
  }
  await reactivateExercise(req.user!.id, exerciseId);
  res.json({ ok: true });
});

router.post('/program/reset', async (req, res) => {
  await resetProgramForGymChange(req.user!.id);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify route registration**

Confirm `routes/athlete.ts` is mounted under `/athlete` in `backend/src/app.ts` (grep `athlete`); it already is (existing `/athlete/me` works). No change needed.

- [ ] **Step 4: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/routes/athlete.ts
git commit -m "feat: athlete routes for exclusions + program reset"
```

---

## Task 8: App API client

**Files:**
- Modify: `lib/api.ts` (tr-fit-app)

- [ ] **Step 1: Add client functions**

In `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/lib/api.ts`, add (near the other session/alert helpers; `apiGet`, `apiPost`, `apiDelete` already exist):
```ts
export interface ExclusionItem {
  exercise_id: number;
  exercise_name: string;
  replacement_exercise_id: number | null;
  replacement_name: string | null;
}

export function apiListExclusions() {
  return apiGet<ExclusionItem[]>('/athlete/exclusions');
}

export function apiExcludeExercise(exerciseId: number, sessionLogId?: string) {
  return apiPost<{ replacement: { id: number; name: string; muscle_group: string; equipment: string } | null }>(
    '/athlete/exclusions',
    { exercise_id: exerciseId, session_log_id: sessionLogId },
  );
}

export function apiReactivateExercise(exerciseId: number) {
  return apiDelete<{ ok: true }>(`/athlete/exclusions/${exerciseId}`);
}

export function apiResetProgram() {
  return apiPost<{ ok: true }>('/athlete/program/reset', {});
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add lib/api.ts
git commit -m "feat: api client for exclusions + program reset"
```

---

## Task 9: NoMachineSheet + 3rd SOS button

**Files:**
- Create: `components/session/NoMachineSheet.tsx` (tr-fit-app)
- Modify: `app/(app)/session/active.tsx`, `components/session/GuidedSessionScreen.tsx`

- [ ] **Step 1: Create NoMachineSheet**

Create `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/components/session/NoMachineSheet.tsx` (mirrors `MachineSheet.tsx`, but permanent — calls `apiExcludeExercise`, shows the chosen permanent replacement, swaps the current session item, then advances):

```tsx
import { forwardRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { apiExcludeExercise } from '@/lib/api';
import { useSessionStore } from '@/store/session.store';
import { useThemeColors } from '@/lib/colors';

interface Props {
  exerciseId: number;
  onResolved: () => void;
}

export const NoMachineSheet = forwardRef<BottomSheetModal, Props>(function NoMachineSheet(
  { exerciseId, onResolved },
  ref,
) {
  const { active } = useSessionStore();
  const colors = useThemeColors();
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    (ref as { current?: BottomSheetModal })?.current?.dismiss();
  };

  const confirm = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      const { replacement } = await apiExcludeExercise(exerciseId, active.sessionId);
      if (replacement) {
        useSessionStore.setState((state) => ({
          ...state,
          active: state.active && {
            ...state.active,
            items: state.active.items.map((it, idx) =>
              idx === state.active!.currentSlotIndex
                ? {
                    ...it,
                    exercise: {
                      id: replacement.id,
                      name: replacement.name,
                      muscle_group: replacement.muscle_group,
                      equipment: replacement.equipment,
                    },
                  }
                : it,
            ),
          },
        }));
      }
      close();
      onResolved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['45%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
    >
      <BottomSheetView style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Text className="mb-2 text-2xl font-bold text-foreground">
          No tengo esta máquina
        </Text>
        <Text className="mb-6 text-muted-foreground">
          La sacamos de tu rutina para siempre y la reemplazamos por otra
          equivalente. Tu coach queda avisado. Podés revertirlo desde Perfil →
          Mi gimnasio.
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            onPress={close}
            disabled={submitting}
            className="flex-1 items-center rounded-md border border-border py-4"
          >
            <Text className="font-semibold text-foreground">Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={confirm}
            disabled={submitting}
            className="flex-1 items-center rounded-md bg-brand py-4"
          >
            <Text className="font-semibold text-brand-foreground">
              {submitting ? 'Quitando...' : 'Quitar para siempre'}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

- [ ] **Step 2: Wire into standard session (active.tsx)**

In `app/(app)/session/active.tsx`:
- Import: `import { NoMachineSheet } from '@/components/session/NoMachineSheet';`
- Add a ref in `SessionScreen` next to `machineRef`: it's created in the parent `ActiveSession` and passed down. Simplest: add a local ref in `SessionScreen`:
  ```tsx
  const noMachineRef = useRef<BottomSheetModal>(null);
  ```
- In the SOS row (the `View` with the "Siento dolor" and "Máquina ocupada" Pressables), add a third button. To keep the row usable with 3 buttons, change the row to wrap, and add:
  ```tsx
          <Pressable
            onPress={() => noMachineRef.current?.present()}
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5"
          >
            <Text className="text-[13px] font-semibold text-foreground">
              No tengo esta máquina
            </Text>
          </Pressable>
  ```
  (If three side-by-side is too tight, change the row container to `flex-row flex-wrap gap-2` so the third wraps to a second line.)
- Render the sheet next to the others (after `<MachineSheet ... />`):
  ```tsx
      <NoMachineSheet
        ref={noMachineRef}
        exerciseId={item.exercise.id}
        onResolved={() => { /* item swapped in store; nothing else needed */ }}
      />
  ```

- [ ] **Step 3: Wire into guided session (GuidedSessionScreen.tsx)**

The guided `SOSRow` (lines ~306-334) only has pain + machine and takes `painRef`/`machineRef`. Add a third button + a `noMachineRef`:
- Add `noMachineRef` prop to `SOSRow` and a `noMachineRef = useRef<BottomSheetModal>(null)` in `GuidedSessionScreen`, passed into `SOSRow` (only rendered in the `pre_set` phase) AND used to render `<NoMachineSheet ref={noMachineRef} exerciseId={item.exercise.id} onResolved={() => {}} />` near the other sheets.
- In `SOSRow`, add the third Pressable mirroring the active.tsx button, calling `noMachineRef.current?.present()`. Use `flex-wrap` on the row if needed.
- Import `NoMachineSheet`.

- [ ] **Step 4: Typecheck + tests**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npm test`
Expected: clean + suite green.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add components/session/NoMachineSheet.tsx "app/(app)/session/active.tsx" components/session/GuidedSessionScreen.tsx
git commit -m "feat: 'No tengo esta máquina' SOS option (permanent exclusion)"
```

---

## Task 10: Profile "Mi gimnasio" screen + reset button

**Files:**
- Create: `app/(app)/profile/gimnasio.tsx` (tr-fit-app)
- Modify: `app/(app)/athlete/profile.tsx`

- [ ] **Step 1: Create the screen**

Create `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app/app/(app)/profile/gimnasio.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Text } from '@/components/ui/text';
import {
  apiListExclusions,
  apiReactivateExercise,
  apiResetProgram,
  type ExclusionItem,
} from '@/lib/api';

export default function GimnasioScreen() {
  const [items, setItems] = useState<ExclusionItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    apiListExclusions()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);
  useFocusEffect(load);

  const reactivate = async (exerciseId: number) => {
    setBusy(true);
    try {
      await apiReactivateExercise(exerciseId);
      setItems((prev) => prev.filter((i) => i.exercise_id !== exerciseId));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = () => {
    Alert.alert(
      'He cambiado de gimnasio',
      'Vas a reiniciar tu rutina a la semana 1 y tendrás que re-anotar los pesos. Esto no se puede deshacer. ¿Seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await apiResetProgram();
              setItems([]);
              Alert.alert('Listo', 'Tu rutina se reinició a la semana 1.');
              router.back();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }}>
        <Text className="mb-1 text-2xl font-bold text-foreground">Mi gimnasio</Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          Ejercicios que sacaste por no tener la máquina. Podés reactivarlos.
        </Text>

        {items.length === 0 ? (
          <Text className="mb-8 text-sm text-muted-foreground">
            No tenés ejercicios excluidos.
          </Text>
        ) : (
          <View className="mb-8 gap-3">
            {items.map((it) => (
              <View
                key={it.exercise_id}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <View className="flex-1 pr-3">
                  <Text className="font-semibold text-foreground">{it.exercise_name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {it.replacement_name ? `Reemplazo: ${it.replacement_name}` : 'Sin reemplazo (lo elige tu coach)'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => reactivate(it.exercise_id)}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <Text className="text-[13px] font-semibold text-foreground">Reactivar</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={confirmReset}
          disabled={busy}
          className="items-center rounded-md border py-4"
          style={{ borderColor: 'hsla(0, 84%, 60%, 0.45)' }}
        >
          <Text className="font-semibold" style={{ color: 'hsla(0, 84%, 50%, 1)' }}>
            He cambiado de gimnasio
          </Text>
        </Pressable>
        <Text className="mt-2 text-center text-xs text-muted-foreground">
          Reinicia tu rutina a la semana 1 y borra los pesos guardados.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Add the SettingsRow link**

In `app/(app)/athlete/profile.tsx`, add a `SettingsRow` near the other rows (e.g. after the "Unidades" row that does `router.push('/(app)/profile/unidades' as never)`):
```tsx
            <SettingsRow
              label="Mi gimnasio"
              onPress={() => router.push('/(app)/profile/gimnasio' as never)}
            />
```
Match the exact props the other `SettingsRow` usages pass (check whether they include an `icon`/`description`/`value` prop and mirror the closest one). Keep it consistent with the surrounding rows.

- [ ] **Step 3: Typecheck + tests**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npm test`
Expected: clean + suite green.

- [ ] **Step 4: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add "app/(app)/profile/gimnasio.tsx" "app/(app)/athlete/profile.tsx"
git commit -m "feat: Profile 'Mi gimnasio' — excluded exercises + gym-change reset"
```

---

## Final verification

- [ ] Backend: `cd tr-fit-web/backend && npx tsc --noEmit && npx jest exclusions.service program-reset.service engine.service` — green (note any pre-existing env-only failures in other suites).
- [ ] App: `cd tr-fit-app && npx tsc --noEmit && npm test` — green.
- [ ] Manual smoke (optional, needs running stack): exclude an exercise mid-session → it swaps and a `sos_no_machine` alert appears; Profile → Mi gimnasio lists it with Reactivar; "He cambiado de gimnasio" rewinds to week 1; next session no longer schedules the excluded exercise.

---

## Self-review notes

- **Spec coverage:** table+alert types (T1-T2), alert helpers (T3), exclude/reactivate/list (T4), reset keeps RM (T5), engine swap + generation filter (T6), routes (T7), app client (T8), 3rd SOS sheet (T9), Profile dashboard + reset (T10). All spec sections covered.
- **Out of scope respected:** no 4-week rotation; exclusions are simply consulted by the engine and generation filter, ready for a future rotation to honor.
- **Type consistency:** `getExclusionMap`, `excludeExercise`, `reactivateExercise`, `listExclusions`, `resetProgramForGymChange`, `createNoMachineAlert`, `createProgramResetAlert`, `ExclusionItem`/`ExclusionRow`, `apiExcludeExercise`/`apiReactivateExercise`/`apiListExclusions`/`apiResetProgram` used consistently across tasks.
- **DB-test caveat:** backend service tests are DB-backed; mirror the existing harness in `backend/tests/unit/*.service.test.ts`. If the test DB is unavailable in the environment, the memory notes some suites already fail on env — verify logic by inspection and flag.
- **Cross-repo:** tasks `cd` explicitly; stage only touched files (both repos have unrelated uncommitted WIP).
