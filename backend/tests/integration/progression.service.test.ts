import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { runWeeklyProgressionForAthlete } from '../../src/services/progression.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup(coachId: string, athleteId: string) {
  const p = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  const a = await pool.query<{ id: number; name: string; equipment: string }>(
    `SELECT id, name, equipment FROM exercises
      WHERE is_principal = FALSE AND equipment = 'mancuerna' LIMIT 1`,
  );
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: 'd',
      slots: [
        { slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const },
        { slot_index: 2, exercise_id: a.rows[0].id, role: 'accesorio' as const },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: '' }, ai,
  );
  await approveSkeleton(skeletonId, coachId);
  return { principalId: p.rows[0].id, accesorioId: a.rows[0].id };
}

it('bumps accesorio reps when all sets completed (no weight bump on first rotation)', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup(coach, ath);
  await pool.query(
    `UPDATE athlete_exercise_weights
        SET current_weight_kg = 10, current_reps_text = '6 a 8'
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     VALUES ($1, $2, 1, 1, 1, TRUE), ($1, $2, 1, 1, 2, TRUE), ($1, $2, 1, 1, 3, TRUE)`,
    [ath, accesorioId],
  );
  const result = await runWeeklyProgressionForAthlete(ath);
  expect(result.status).toBe('success');
  const w = await pool.query(
    `SELECT current_weight_kg::text AS w, current_reps_text
       FROM athlete_exercise_weights WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  expect(w.rows[0].current_reps_text).toBe('8 a 10');
  expect(Number(w.rows[0].w)).toBe(10);
});

it('bumps weight when reps rotation triggers it (10 a 12 -> 4 a 6)', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup(coach, ath);
  await pool.query(
    `UPDATE athlete_exercise_weights
        SET current_weight_kg = 10, current_reps_text = '10 a 12'
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     VALUES ($1, $2, 1, 1, 1, TRUE), ($1, $2, 1, 1, 2, TRUE), ($1, $2, 1, 1, 3, TRUE)`,
    [ath, accesorioId],
  );
  await runWeeklyProgressionForAthlete(ath);
  const w = await pool.query(
    `SELECT current_weight_kg::text AS w, current_reps_text
       FROM athlete_exercise_weights WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  expect(w.rows[0].current_reps_text).toBe('4 a 6');
  expect(Number(w.rows[0].w)).toBe(12.5);
});

it('does NOT bump when set not completed', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup(coach, ath);
  await pool.query(
    `UPDATE athlete_exercise_weights
        SET current_weight_kg = 10, current_reps_text = '6 a 8'
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     VALUES ($1, $2, 1, 1, 1, TRUE), ($1, $2, 1, 1, 2, FALSE), ($1, $2, 1, 1, 3, TRUE)`,
    [ath, accesorioId],
  );
  await runWeeklyProgressionForAthlete(ath);
  const w = await pool.query(
    `SELECT current_reps_text FROM athlete_exercise_weights WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, accesorioId],
  );
  expect(w.rows[0].current_reps_text).toBe('6 a 8');
});

it('advances week when compliance >= threshold', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { principalId, accesorioId } = await setup(coach, ath);
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     SELECT $1, ex, 1, 1, gs, TRUE
       FROM (VALUES ($2::int), ($3::int)) e(ex)
       CROSS JOIN generate_series(1, 3) gs`,
    [ath, principalId, accesorioId],
  );
  const result = await runWeeklyProgressionForAthlete(ath);
  expect(result.fromWeek).toBe(1);
  expect(result.toWeek).toBe(2);
});

it('does not advance week when compliance < threshold', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { principalId, accesorioId } = await setup(coach, ath);
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     VALUES ($1, $2, 1, 1, 1, TRUE),
            ($1, $2, 1, 1, 2, FALSE), ($1, $2, 1, 1, 3, FALSE),
            ($1, $3, 1, 1, 1, FALSE), ($1, $3, 1, 1, 2, FALSE), ($1, $3, 1, 1, 3, FALSE)`,
    [ath, principalId, accesorioId],
  );
  const result = await runWeeklyProgressionForAthlete(ath);
  expect(result.toWeek).toBe(1);
});

it('sets rm_test_blocking when next week is RM test (week 9 -> 10)', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const { principalId, accesorioId } = await setup(coach, ath);
  await pool.query(
    `UPDATE athlete_program_state SET current_week = 9 WHERE athlete_id = $1`, [ath],
  );
  await pool.query(
    `INSERT INTO set_logs (athlete_id, exercise_id, week, day_of_week, set_index, completed)
     SELECT $1, ex, 9, 1, gs, TRUE
       FROM (VALUES ($2::int), ($3::int)) e(ex)
       CROSS JOIN generate_series(1, 3) gs`,
    [ath, principalId, accesorioId],
  );
  await runWeeklyProgressionForAthlete(ath);
  const s = await pool.query(
    `SELECT current_week, rm_test_blocking FROM athlete_program_state WHERE athlete_id = $1`,
    [ath],
  );
  expect(s.rows[0].current_week).toBe(10);
  expect(s.rows[0].rm_test_blocking).toBe(true);
});
