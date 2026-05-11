import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { recordRm } from '../../src/services/rm.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup(coachId: string, athleteId: string, principals: number[]) {
  const ai = {
    rationale: 'r',
    days: principals.map((id, i) => ({
      day_index: i + 1, focus: 'd',
      slots: [{ slot_index: 1, exercise_id: id, role: 'principal' as const }],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: '' }, ai,
  );
  await approveSkeleton(skeletonId, coachId);
}

it('records RM and clears blocking when all principals registered', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const ps = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 4`,
  );
  const principals = ps.rows.map((r) => r.id);
  await setup(coach, ath, principals);
  await pool.query(
    `UPDATE athlete_program_state SET rm_test_blocking = TRUE WHERE athlete_id = $1`,
    [ath],
  );

  for (const id of principals.slice(0, 3)) {
    await recordRm({ athleteId: ath, exerciseId: id, valueKg: 100, week: 10 });
  }
  let s = await pool.query(
    `SELECT rm_test_blocking FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  expect(s.rows[0].rm_test_blocking).toBe(true); // 3 of 4 done

  await recordRm({ athleteId: ath, exerciseId: principals[3], valueKg: 100, week: 10 });
  s = await pool.query(
    `SELECT rm_test_blocking FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  expect(s.rows[0].rm_test_blocking).toBe(false);
});

it('upserts: re-recording same RM updates value', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  await setup(coach, ath, [ex.rows[0].id]);
  await recordRm({ athleteId: ath, exerciseId: ex.rows[0].id, valueKg: 100, week: 10 });
  await recordRm({ athleteId: ath, exerciseId: ex.rows[0].id, valueKg: 105, week: 10 });
  const r = await pool.query(
    `SELECT value_kg::text AS v FROM rm_tests WHERE athlete_id = $1`, [ath],
  );
  expect(r.rows).toHaveLength(1);
  expect(Number(r.rows[0].v)).toBe(105);
});
