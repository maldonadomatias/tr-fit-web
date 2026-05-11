import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import {
  startSession, logSet, finishSession, getActive, SessionError,
} from '../../src/services/session.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'crypto';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setupAthlete() {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  const a = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
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
  const sk = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: '' }, ai,
  );
  await approveSkeleton(sk.skeletonId, coach);
  await pool.query(
    `UPDATE athlete_program_state SET current_week = 3 WHERE athlete_id = $1`,
    [ath],
  );
  return { ath, principalId: p.rows[0].id, accesorioId: a.rows[0].id };
}

it('startSession 201 with expected items, rejects wrong_day', async () => {
  const { ath } = await setupAthlete();
  const out = await startSession(ath, 1, randomUUID());
  expect(out.sessionId).toBeTruthy();
  expect(out.expectedDay).toBe(1);
  expect(out.items.length).toBeGreaterThan(0);

  await expect(startSession(ath, 3, randomUUID()))
    .rejects.toMatchObject({ reason: 'wrong_day' });
});

it('startSession rejects when already in progress', async () => {
  const { ath } = await setupAthlete();
  await startSession(ath, 1, randomUUID());
  await expect(startSession(ath, 1, randomUUID()))
    .rejects.toMatchObject({ reason: 'session_in_progress' });
});

it('logSet idempotent by client_id', async () => {
  const { ath, principalId } = await setupAthlete();
  const { sessionId } = await startSession(ath, 1, randomUUID());
  const clientId = randomUUID();
  const r1 = await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
    completed: true, rpe: 7, client_id: clientId,
    client_ts: new Date().toISOString(),
  });
  expect(r1.created).toBe(true);

  const r2 = await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
    completed: true, rpe: 7, client_id: clientId,
    client_ts: new Date().toISOString(),
  });
  expect(r2.created).toBe(false);
  expect(r2.setId).toBe(r1.setId);

  const cnt = await pool.query(
    `SELECT COUNT(*)::int AS n FROM set_logs WHERE session_log_id = $1`,
    [sessionId],
  );
  expect(cnt.rows[0].n).toBe(1);
});

it('logSet rejects 404 for session belonging to another athlete', async () => {
  const { ath, principalId } = await setupAthlete();
  const { sessionId } = await startSession(ath, 1, randomUUID());
  const otherR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('other@test.local', 'x', 'athlete') RETURNING id`,
  );
  await expect(logSet(sessionId, otherR.rows[0].id, {
    exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
    completed: true, client_id: randomUUID(),
    client_ts: new Date().toISOString(),
  })).rejects.toMatchObject({ reason: 'not_found' });
});

it('finishSession computes summary + detects PRs', async () => {
  const { ath, principalId, accesorioId } = await setupAthlete();
  const { sessionId } = await startSession(ath, 1, randomUUID());
  for (const setIdx of [1, 2, 3]) {
    await logSet(sessionId, ath, {
      exercise_id: principalId, set_index: setIdx,
      weight_kg: 80 + setIdx, reps: 8, completed: true,
      client_id: randomUUID(), client_ts: new Date().toISOString(),
    });
    await logSet(sessionId, ath, {
      exercise_id: accesorioId, set_index: setIdx,
      weight_kg: 12, reps: 10, completed: true,
      client_id: randomUUID(), client_ts: new Date().toISOString(),
    });
  }
  const summary = await finishSession(sessionId, ath, 'normal');
  expect(summary.setsCompleted).toBe(6);
  expect(summary.compliancePct).toBeGreaterThan(0);
  expect(summary.totalVolumeKg).toBe(
    (81 * 8) + (82 * 8) + (83 * 8) + (12 * 10) * 3,
  );
  expect(summary.newPRs.length).toBeGreaterThanOrEqual(2);
});

it('finishSession rejects already_finished', async () => {
  const { ath } = await setupAthlete();
  const { sessionId } = await startSession(ath, 1, randomUUID());
  await finishSession(sessionId, ath, 'normal');
  await expect(finishSession(sessionId, ath, 'normal'))
    .rejects.toMatchObject({ reason: 'already_finished' });
});

it('getActive returns null when no session, returns session id otherwise', async () => {
  const { ath } = await setupAthlete();
  const empty = await getActive(ath);
  expect(empty.session).toBeNull();

  const { sessionId } = await startSession(ath, 1, randomUUID());
  const present = await getActive(ath);
  expect(present.session?.id).toBe(sessionId);
});

// Reference SessionError to keep import used.
void SessionError;
