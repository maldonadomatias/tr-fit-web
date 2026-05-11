import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { runWeeklyProgressionForAll } from '../../src/services/progression.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('runWeeklyProgressionForAll iterates over active athletes', async () => {
  const coach = await createCoach();
  const a1 = await createAthlete(coach);
  const a2 = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  const pid = ex.rows[0].id;
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: 'd',
      slots: [{ slot_index: 1, exercise_id: pid, role: 'principal' as const }],
    })),
  };
  const s1 = await createPendingSkeleton(
    { athleteId: a1, generationPrompt: {}, generationRationale: '' }, ai,
  );
  const s2 = await createPendingSkeleton(
    { athleteId: a2, generationPrompt: {}, generationRationale: '' }, ai,
  );
  await approveSkeleton(s1.skeletonId, coach);
  await approveSkeleton(s2.skeletonId, coach);

  await runWeeklyProgressionForAll();

  const runs = await pool.query(`SELECT count(*)::int AS n FROM progression_runs`);
  expect(runs.rows[0].n).toBe(2);
});
