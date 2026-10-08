import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { startSession } from '../../src/services/session.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'node:crypto';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

/** Skeleton de 3 días: día 1 Piernas, día 2 Pecho, día 3 Piernas. */
async function setupSkeleton(athleteId: string, coachId: string) {
  const legs = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Piernas%' LIMIT 1`,
  );
  const chest = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Pecho%' LIMIT 1`,
  );
  const day = (d: number, exerciseId: number, focus: string) => ({
    day_index: d, focus,
    slots: [
      { slot_index: 1, exercise_id: exerciseId, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
    ],
  });
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [
        day(1, legs.rows[0].id, 'Piernas'),
        day(2, chest.rows[0].id, 'Pecho'),
        day(3, legs.rows[0].id, 'Piernas'),
      ],
    },
  );
  await approveSkeleton(skeletonId, coachId);
  return skeletonId;
}

async function finishDay(athleteId: string, skeletonId: string, day: number) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [athleteId],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, finished_at)
     VALUES ($1, $2, $3, $4, 0, 0, gen_random_uuid(), NOW())`,
    [athleteId, skeletonId, week.rows[0].current_week, day],
  );
}

it('starts the first pending day when no day is picked', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const out = await startSession(ath, randomUUID());
  expect(out.expectedDay).toBe(1);
});

it('starts the picked pending day', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2 });
  expect(out.expectedDay).toBe(2);
});

it('refuses a day already finished this week', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 2);
  await expect(
    startSession(ath, randomUUID(), { dayOfWeek: 2, force: true }),
  ).rejects.toMatchObject({ reason: 'day_not_pending' });
});

it('allows repeating the last group even with a different pending alternative', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 3, force: true });
  expect(out.expectedDay).toBe(3);
  const persisted = await pool.query('SELECT day_of_week FROM session_logs WHERE id = $1', [out.sessionId]);
  expect(persisted.rows[0].day_of_week).toBe(3);
});

it('allows repeating yesterday’s group without force', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  // A session belongs to the day it started (#126), so move both instants.
  await pool.query("UPDATE session_logs SET started_at = NOW() - INTERVAL '1 day', finished_at = NOW() - INTERVAL '1 day' WHERE athlete_id = $1", [ath]);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 3 });
  expect(out.expectedDay).toBe(3);
});

// Escape: si TODO lo pendiente choca, el atleta no puede quedar sin entrenar.
it('allows the repeat when every pending day shares the group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  await finishDay(ath, sk, 2);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 3, force: true });
  expect(out.expectedDay).toBe(3);
});
