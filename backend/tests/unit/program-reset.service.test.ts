// Real-DB integration test for program-reset.service (placed in unit/ per task spec).
// Requires trfit_test DB with all migrations applied.

import pool from '../../src/db/connect.js';
import { resetProgramForGymChange } from '../../src/services/program-reset.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function truncate(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      coach_alerts,
      weekly_overrides,
      athlete_excluded_exercises,
      athlete_exercise_weights,
      rm_tests,
      athlete_program_state,
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
  // rows that reference them. truncate() was called in beforeEach, so the
  // referencing rows are gone. We do one final truncate then delete lingering exercises.
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

describe('program-reset.service', () => {
  it('resets week to 1, clears weights/exclusions/overrides, preserves RM tests, fires program_reset alert', async () => {
    // Seed coach user + coach_profile (required by createProgramResetAlert).
    const coachId = await insertUser(`coach-reset-${tag}@test.local`, 'admin');
    await pool.query(
      `INSERT INTO coach_profiles (user_id, name) VALUES ($1, 'Coach Reset')`,
      [coachId],
    );

    // Seed athlete user.
    const athleteId = await insertUser(`athlete-reset-${tag}@test.local`, 'athlete');

    // Seed athlete_profiles with coach_id set (required by createProgramResetAlert).
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg,
          level, goal, days_per_week, equipment, injuries, coach_id,
          phone, plan_interest, training_mode, commitment, exercise_minutes,
          days_specific, referral_source)
       VALUES ($1, 'Test Reset Atleta', 'male', 28, 178, 80,
               'medio', 'hipertrofia', 4, 'gym_completo', '{}', $2,
               '+5491122334455', 'full', 'gym', 'normal', 60,
               '{lun,mar,jue,sab}', 'google')`,
      [athleteId, coachId],
    );

    // Seed an exercise to use for weights, exclusions, overrides, and RM tests.
    const ex = await insertExercise({
      name: `ResetEx-${tag}`,
      muscleGroup: `mg-reset-${tag}`,
      equipment: 'mancuerna',
    });
    insertedExerciseIds.push(ex.id);

    // Seed a second exercise for the exclusion replacement slot (can be NULL, but
    // let's keep it simple and use NULL replacement per the task spec).
    // No second exercise needed for this test since replacement_exercise_id is optional.

    // Seed athlete_program_state with current_week=5, rm_test_blocking=TRUE.
    // active_skeleton_id is nullable so we pass NULL.
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date, rm_test_blocking)
       VALUES ($1, NULL, 5, '2025-01-01', TRUE)`,
      [athleteId],
    );

    // Seed ONE athlete_exercise_weights row.
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, updated_by)
       VALUES ($1, $2, 60.00, 'athlete_initial')`,
      [athleteId, ex.id],
    );

    // Seed ONE athlete_excluded_exercises row (NULL replacement, reason='no_machine').
    await pool.query(
      `INSERT INTO athlete_excluded_exercises
         (athlete_id, exercise_id, replacement_exercise_id, reason)
       VALUES ($1, $2, NULL, 'no_machine')`,
      [athleteId, ex.id],
    );

    // Seed ONE weekly_overrides row.
    // override_type='skip' does not require replacement_exercise_id.
    // program_week and expires_after_week must satisfy: expires_after_week >= program_week.
    await pool.query(
      `INSERT INTO weekly_overrides
         (athlete_id, program_week, original_exercise_id,
          override_type, intensity_payload, expires_after_week)
       VALUES ($1, 5, $2, 'skip', '{}'::jsonb, 5)`,
      [athleteId, ex.id],
    );

    // Seed ONE rm_tests row (program_week must be in (10,20,30)).
    await pool.query(
      `INSERT INTO rm_tests
         (athlete_id, exercise_id, program_week, value_kg)
       VALUES ($1, $2, 10, 100.00)`,
      [athleteId, ex.id],
    );

    // -----------------------------------------------------------------------
    // Execute the service under test.
    // -----------------------------------------------------------------------
    await resetProgramForGymChange(athleteId);

    // -----------------------------------------------------------------------
    // Assertions.
    // -----------------------------------------------------------------------

    // Program state: week reset to 1, rm_test_blocking = false, last_week_advanced_at = NULL.
    const state = await pool.query(
      `SELECT current_week, rm_test_blocking, last_week_advanced_at
         FROM athlete_program_state WHERE athlete_id=$1`,
      [athleteId],
    );
    expect(state.rows[0].current_week).toBe(1);
    expect(state.rows[0].rm_test_blocking).toBe(false);
    expect(state.rows[0].last_week_advanced_at).toBeNull();

    // Gym-specific tables should be empty for this athlete.
    for (const t of ['athlete_exercise_weights', 'athlete_excluded_exercises', 'weekly_overrides']) {
      const c = await pool.query(
        `SELECT count(*)::int AS n FROM ${t} WHERE athlete_id=$1`,
        [athleteId],
      );
      expect(c.rows[0].n).toBe(0);
    }

    // RM tests must be PRESERVED.
    const rm = await pool.query(
      `SELECT count(*)::int AS n FROM rm_tests WHERE athlete_id=$1`,
      [athleteId],
    );
    expect(rm.rows[0].n).toBe(1);

    // A program_reset coach alert must have been fired.
    const al = await pool.query(
      `SELECT count(*)::int AS n FROM coach_alerts
        WHERE athlete_id=$1 AND type='program_reset'`,
      [athleteId],
    );
    expect(al.rows[0].n).toBe(1);
  });
});
