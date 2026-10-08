import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { startSession } from '../../src/services/session.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'node:crypto';

// Ticket #126: "Entrenar de todas formas" must reset at 00:00 in the athlete's
// timezone (ART), counting a session on the day it was started — not a
// rolling 24 h and not the UTC day (which flips at 21:00 ART).

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup() {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE ORDER BY id LIMIT 1`,
  );
  const day = (d: number) => ({
    day_index: d, focus: `D${d}`,
    slots: [{ slot_index: 1, exercise_id: ex.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null }],
  });
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: 'r' },
    { rationale: 'r', days: [day(1), day(2), day(3)] },
  );
  await approveSkeleton(skeletonId, coach);
  return { ath, skeletonId };
}

/** A finished session on day 1 with explicit start/finish instants. */
async function pastSession(ath: string, sk: string, startedAt: string, finishedAt: string) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, started_at, finished_at)
     VALUES ($1, $2, $3, 1, 0, 0, gen_random_uuid(), $4, $5)`,
    [ath, sk, week.rows[0].current_week, startedAt, finishedAt],
  );
}

const at = (iso: string) => new Date(iso);

it('(a) yesterday 12:00 ART then today 09:00 ART is allowed', async () => {
  const { ath, skeletonId } = await setup();
  await pastSession(ath, skeletonId, '2026-10-07T12:00:00-03:00', '2026-10-07T13:00:00-03:00');
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2, now: at('2026-10-08T09:00:00-03:00') });
  expect(out.expectedDay).toBe(2);
});

it('(b) a session started yesterday and finished today does not block today', async () => {
  const { ath, skeletonId } = await setup();
  // Real #126 shape: started 07/10 11:35 ART, closed 08/10 11:30 ART.
  await pastSession(ath, skeletonId, '2026-10-07T11:35:46-03:00', '2026-10-08T11:30:41-03:00');
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2, now: at('2026-10-08T11:31:07-03:00') });
  expect(out.expectedDay).toBe(2);
});

it('(c) 19:00 and 22:00 ART the same day is blocked (UTC would have split them)', async () => {
  const { ath, skeletonId } = await setup();
  await pastSession(ath, skeletonId, '2026-10-08T19:00:00-03:00', '2026-10-08T20:00:00-03:00');
  await expect(
    startSession(ath, randomUUID(), { dayOfWeek: 2, now: at('2026-10-08T22:00:00-03:00') }),
  ).rejects.toMatchObject({ reason: 'already_trained_today' });
  // The override still works.
  const forced = await startSession(ath, randomUUID(), { dayOfWeek: 2, force: true, now: at('2026-10-08T22:00:00-03:00') });
  expect(forced.expectedDay).toBe(2);
});

it('(d) 23:30 ART yesterday then 00:30 ART today is allowed', async () => {
  const { ath, skeletonId } = await setup();
  await pastSession(ath, skeletonId, '2026-10-07T23:30:00-03:00', '2026-10-08T00:10:00-03:00');
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2, now: at('2026-10-08T00:30:00-03:00') });
  expect(out.expectedDay).toBe(2);
});

it('uses the athlete timezone column', async () => {
  const { ath, skeletonId } = await setup();
  await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [ath]);
  // 20:00 and 22:00 ART on 08/10 are 23:00Z 08/10 and 01:00Z 09/10: different UTC days.
  await pastSession(ath, skeletonId, '2026-10-08T20:00:00-03:00', '2026-10-08T20:30:00-03:00');
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2, now: at('2026-10-08T22:00:00-03:00') });
  expect(out.expectedDay).toBe(2);
});
