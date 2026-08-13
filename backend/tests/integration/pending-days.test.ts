import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { listPendingDays, computeNextPendingDay } from '../../src/services/engine.service.js';
import { primaryGroup, dominantGroupByDay } from '../../src/services/day-focus.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup4DaySkeleton(athleteId: string, coachId: string) {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE AND equipment='barra' LIMIT 1`,
  );
  const a = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
  );
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: `Day${d}`,
      slots: [
        { slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
        { slot_index: 2, exercise_id: a.rows[0].id, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' }, ai,
  );
  await approveSkeleton(skeletonId, coachId);
  return skeletonId;
}

/** Sesión terminada del día `day` en la semana de programa actual. */
async function finishDay(athleteId: string, skeletonId: string, day: number) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, finished_at)
     VALUES ($1, $2, $3, $4, 0, 0, gen_random_uuid(), NOW())`,
    [athleteId, skeletonId, week.rows[0].current_week, day],
  );
}

it('lists every day of the week when nothing is finished', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  await setup4DaySkeleton(ath, coach);
  expect(await listPendingDays(ath)).toEqual([1, 2, 3, 4]);
  expect(await computeNextPendingDay(ath)).toBe(1);
});

it('drops finished days and keeps the sequential order', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  expect(await listPendingDays(ath)).toEqual([2, 3, 4]);
  expect(await computeNextPendingDay(ath)).toBe(2);
});

// El bug: con MAX(día)+1, hacer el día 3 dejaba el 2 inalcanzable.
it('keeps an earlier day pending when a later one was done first', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  await finishDay(ath, sk, 3);
  expect(await listPendingDays(ath)).toEqual([2, 4]);
  expect(await computeNextPendingDay(ath)).toBe(2);
});

it('is empty when the week is complete, and the next day wraps to 1', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  for (const d of [1, 2, 3, 4]) await finishDay(ath, sk, d);
  expect(await listPendingDays(ath)).toEqual([]);
  expect(await computeNextPendingDay(ath)).toBe(1);
});

it('ignores unfinished sessions', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id)
     VALUES ($1, $2, $3, 1, 0, 0, gen_random_uuid())`,
    [ath, sk, week.rows[0].current_week],
  );
  expect(await listPendingDays(ath)).toEqual([1, 2, 3, 4]);
});

describe('dominantGroupByDay', () => {
  it('trims the subgroup off a muscle_group', () => {
    expect(primaryGroup('Piernas - Cuadriceps')).toBe('Piernas');
    expect(primaryGroup('Espalda')).toBe('Espalda');
    expect(primaryGroup('  Pecho - Mayor ')).toBe('Pecho');
  });

  it('picks the group with most principal slots per day', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { days_per_week: 2 });
    const legs = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = TRUE
         AND muscle_group LIKE 'Piernas%' LIMIT 2`,
    );
    const chest = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = TRUE
         AND muscle_group LIKE 'Pecho%' LIMIT 1`,
    );
    if (legs.rows.length < 2 || chest.rows.length < 1) return;
    const ai = {
      rationale: 'r',
      days: [
        {
          day_index: 1, focus: 'Piernas / Pecho',
          slots: [
            { slot_index: 1, exercise_id: legs.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
            { slot_index: 2, exercise_id: legs.rows[1].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
            { slot_index: 3, exercise_id: chest.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
          ],
        },
        {
          day_index: 2, focus: 'Pecho',
          slots: [
            { slot_index: 1, exercise_id: chest.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
          ],
        },
      ],
    };
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, ai,
    );
    await approveSkeleton(skeletonId, coach);

    const byDay = await dominantGroupByDay(skeletonId);
    expect(byDay[1]).toBe('Piernas');
    expect(byDay[2]).toBe('Pecho');
  });

  it('has no dominant group for a day without principals', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { days_per_week: 2 });
    const acc = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
    );
    const ai = {
      rationale: 'r',
      days: [1, 2].map((d) => ({
        day_index: d, focus: 'Accesorios',
        slots: [
          { slot_index: 1, exercise_id: acc.rows[0].id, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
        ],
      })),
    };
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, ai,
    );
    await approveSkeleton(skeletonId, coach);
    const byDay = await dominantGroupByDay(skeletonId);
    expect(byDay[1] ?? null).toBeNull();
  });
});
