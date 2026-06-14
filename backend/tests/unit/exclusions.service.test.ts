// Real-DB integration test for exclusions.service (placed in unit/ per task spec).
// Requires trfit_test DB with all migrations applied.

import pool from '../../src/db/connect.js';
import {
  excludeExercise,
  listExclusions,
  getExclusionMap,
  reactivateExercise,
} from '../../src/services/exclusions.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function truncate(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      coach_alerts,
      athlete_excluded_exercises,
      athlete_profiles,
      coach_profiles,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function insertUser(email: string, role: 'admin' | 'athlete'): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', $2) RETURNING id`,
    [email, role],
  );
  return r.rows[0].id;
}

async function insertExercise(opts: {
  name: string;
  muscleGroup: string;
  equipment?: string;
}): Promise<{ id: number; name: string }> {
  const r = await pool.query<{ id: number; name: string }>(
    `INSERT INTO exercises
       (name, muscle_group, equipment, movement_pattern,
        level_min, contraindicated_for, modality)
     VALUES ($1, $2, $3, 'isolation', 'principiante', '{}', 'reps')
     RETURNING id, name`,
    [opts.name, opts.muscleGroup, opts.equipment ?? 'mancuerna'],
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Unique tag per run so seeded exercises don't collide with prior runs.
const tag = String(Date.now());

// Track inserted exercise ids so we can clean them up after the suite.
const insertedExerciseIds: number[] = [];

beforeEach(async () => {
  await truncate();
});

afterAll(async () => {
  // exercises rows must be deleted AFTER truncate() has already removed
  // rows that reference them (coach_alerts, athlete_excluded_exercises, etc.).
  // truncate() was called in beforeEach, so the referencing rows are gone.
  // We do one final truncate then delete lingering exercises.
  await truncate();
  if (insertedExerciseIds.length > 0) {
    await pool.query(
      `DELETE FROM exercises WHERE id = ANY($1)`,
      [insertedExerciseIds],
    );
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exclusions.service', () => {
  it('excludeExercise finds an alternative, persists exclusion, fires info alert; then idempotent; getExclusionMap; reactivate; no-alternative → null + yellow alert', async () => {
    // Seed coach user + coach_profile (required by createNoMachineAlert).
    const coachId = await insertUser('coach-excl@test.local', 'admin');
    await pool.query(
      `INSERT INTO coach_profiles (user_id, name) VALUES ($1, 'Coach')`,
      [coachId],
    );

    // Seed athlete user.
    const athleteId = await insertUser('athlete-excl@test.local', 'athlete');

    // Seed athlete_profiles with coach_id set (required by createNoMachineAlert).
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg,
          level, goal, days_per_week, equipment, injuries, coach_id,
          phone, plan_interest, training_mode, commitment, exercise_minutes,
          days_specific, referral_source)
       VALUES ($1, 'Test Atleta', 'male', 25, 175, 75,
               'medio', 'hipertrofia', 4, 'gym_completo', '{}', $2,
               '+5491111111111', 'full', 'gym', 'normal', 60,
               '{lun,mar,jue,sab}', 'google')`,
      [athleteId, coachId],
    );

    // Seed exA and exB in the SAME muscle_group — exB is the alternative for exA.
    // Both use 'mancuerna' (allowed by gym_completo), level_min=principiante,
    // no contraindications, so findAlternative(exA) → exB.
    // Use a run-unique tag so stale rows from prior runs don't interfere.
    const exA = await insertExercise({
      name: `ExA-${tag}`,
      muscleGroup: `mg-excl-${tag}`,
      equipment: 'mancuerna',
    });
    insertedExerciseIds.push(exA.id);
    const exB = await insertExercise({
      name: `ExB-${tag}`,
      muscleGroup: `mg-excl-${tag}`,
      equipment: 'mancuerna',
    });
    insertedExerciseIds.push(exB.id);

    // Seed loneEx in a UNIQUE muscle_group — no alternative possible.
    const loneEx = await insertExercise({
      name: `LoneEx-${tag}`,
      muscleGroup: `mg-lone-${tag}`,
      equipment: 'mancuerna',
    });
    insertedExerciseIds.push(loneEx.id);

    // -----------------------------------------------------------------------
    // 1. excludeExercise: finds exB as replacement, persists, fires info alert
    // -----------------------------------------------------------------------
    const { replacement } = await excludeExercise(athleteId, exA.id);
    expect(replacement?.id).toBe(exB.id);

    const rows = await listExclusions(athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0].exercise_id).toBe(exA.id);
    expect(rows[0].replacement_exercise_id).toBe(exB.id);
    expect(rows[0].replacement_name).toBe(exB.name);

    const alert = await pool.query<{ severity: string }>(
      `SELECT severity FROM coach_alerts
        WHERE athlete_id = $1
          AND type = 'sos_no_machine'
          AND exercise_id = $2`,
      [athleteId, exA.id],
    );
    expect(alert.rows[0].severity).toBe('info');

    // -----------------------------------------------------------------------
    // 2. Idempotent: calling again returns same replacement, no new row
    // -----------------------------------------------------------------------
    const again = await excludeExercise(athleteId, exA.id);
    expect(again.replacement?.id).toBe(exB.id);
    expect(await listExclusions(athleteId)).toHaveLength(1);

    // -----------------------------------------------------------------------
    // 3. getExclusionMap
    // -----------------------------------------------------------------------
    const map = await getExclusionMap(athleteId);
    expect(map.get(exA.id)).toBe(exB.id);

    // -----------------------------------------------------------------------
    // 4. reactivateExercise removes the exclusion
    // -----------------------------------------------------------------------
    await reactivateExercise(athleteId, exA.id);
    expect(await listExclusions(athleteId)).toHaveLength(0);

    // -----------------------------------------------------------------------
    // 5. no-alternative → null replacement + yellow alert
    // -----------------------------------------------------------------------
    const res = await excludeExercise(athleteId, loneEx.id);
    expect(res.replacement).toBeNull();

    const yellow = await pool.query<{ severity: string }>(
      `SELECT severity FROM coach_alerts
        WHERE athlete_id = $1
          AND exercise_id = $2
          AND type = 'sos_no_machine'`,
      [athleteId, loneEx.id],
    );
    expect(yellow.rows[0].severity).toBe('yellow');
  });
});
