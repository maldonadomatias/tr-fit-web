import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import {
  startSession, logSet, finishSession,
} from '../../src/services/session.service.js';
import { computeNextPendingDay } from '../../src/services/engine.service.js';
import { runWeeklyProgressionForAll } from '../../src/services/progression.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'node:crypto';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

/** Skeleton de 3 días, un principal por día. */
async function setupSkeleton(athleteId: string, coachId: string) {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [1, 2, 3].map((d) => ({
        day_index: d, focus: `Day${d}`,
        slots: [{
          slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const,
          notes: null, series: null, reps: null, descanso: null,
        }],
      })),
    },
  );
  await approveSkeleton(skeletonId, coachId);
  return { skeletonId, principalId: p.rows[0].id };
}

/** Entrena el día pendiente que toque, con una serie completada. */
async function trainNextDay(athleteId: string, principalId: number) {
  const { sessionId, expectedDay } = await startSession(
    athleteId, randomUUID(), { force: true },
  );
  await logSet(sessionId, athleteId, {
    exercise_id: principalId, set_index: 1, unit: 'kg', value: 80, reps: 8,
    completed: true, rpe: 8, client_id: randomUUID(),
    client_ts: new Date().toISOString(),
  });
  await finishSession(sessionId, athleteId, 'normal');
  return expectedDay;
}

async function currentWeek(athleteId: string) {
  const r = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  return r.rows[0].current_week;
}

it('sube la semana al terminar el último día pendiente', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const { principalId } = await setupSkeleton(ath, coach);

  expect(await trainNextDay(ath, principalId)).toBe(1);
  expect(await currentWeek(ath)).toBe(1);
  expect(await trainNextDay(ath, principalId)).toBe(2);
  expect(await currentWeek(ath)).toBe(1);

  // El último día cierra la semana: sin esto el dashboard volvía al día 1 de
  // la MISMA semana y duplicaba la sesión (bug 2026-08-14).
  expect(await trainNextDay(ath, principalId)).toBe(3);
  expect(await currentWeek(ath)).toBe(2);
  expect(await computeNextPendingDay(ath)).toBe(1);
});

it('no sube la semana cuando todavía quedan días pendientes', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const { principalId } = await setupSkeleton(ath, coach);

  await trainNextDay(ath, principalId);
  expect(await currentWeek(ath)).toBe(1);
});

it('el cron no vuelve a subir la semana que ya cerró el atleta', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const { principalId } = await setupSkeleton(ath, coach);

  await trainNextDay(ath, principalId);
  await trainNextDay(ath, principalId);
  await trainNextDay(ath, principalId);
  expect(await currentWeek(ath)).toBe(2);

  // El domingo el cron pasa igual: la semana 2 recién arrancó, no la toca.
  await runWeeklyProgressionForAll();
  expect(await currentWeek(ath)).toBe(2);
});
