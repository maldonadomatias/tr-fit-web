import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { buildDashboard } from '../../src/services/dashboard.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

/** Día 1 Piernas, día 2 Pecho, día 3 Piernas. */
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

it('lists the pending days after today, with their dominant group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const d = await buildDashboard(ath);
  expect(d.today.dayIndex).toBe(1);
  expect(d.nextSessions.map((s) => s.dayIndex)).toEqual([2, 3]);
  expect(d.nextSessions[0].dominantGroup).toBe('Pecho');
  expect(d.nextSessions[1].dominantGroup).toBe('Piernas');
  expect(d.nextSessions.every((s) => s.pending === true)).toBe(true);
});

it('blocks a pending day repeating the last session group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1); // Piernas
  const d = await buildDashboard(ath);
  // Pendientes 2 (Pecho) y 3 (Piernas). Hoy es el 2; el 3 queda bloqueado.
  expect(d.today.dayIndex).toBe(2);
  const day3 = d.nextSessions.find((s) => s.dayIndex === 3);
  expect(day3?.blocked).toBe('same_focus');
});

it('falls back to the cyclic projection when the week is done', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  for (const day of [1, 2, 3]) await finishDay(ath, sk, day);
  const d = await buildDashboard(ath);
  expect(d.nextSessions.length).toBe(3);
  expect(d.nextSessions.every((s) => s.blocked === null)).toBe(true);
  expect(d.nextSessions.every((s) => s.pending === false)).toBe(true);
});
