import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
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
  const coach = await createAdmin();
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
        { slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
        { slot_index: 2, exercise_id: a.rows[0].id, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
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

it('startSession 201 computes the day server-side', async () => {
  const { ath } = await setupAthlete();
  const out = await startSession(ath, randomUUID());
  expect(out.sessionId).toBeTruthy();
  expect(out.expectedDay).toBe(1);
  expect(out.items.length).toBeGreaterThan(0);
});

// Regression (bug: día repetido): a stale client used to send yesterday's
// day_of_week and, with ALLOW_ANY_DAY=1, the server logged a duplicate
// session for a day already finished. The server now derives the day from
// its own state, so consecutive sessions always advance.
it('startSession advances to the next pending day after each finish', async () => {
  const { ath } = await setupAthlete();
  for (const expected of [1, 2, 3, 4]) {
    const out = await startSession(ath, randomUUID(), { force: true });
    expect(out.expectedDay).toBe(expected);
    await finishSession(out.sessionId, ath, 'normal');
  }
  // All days done and the week hasn't advanced yet → wraps to day 1,
  // mirroring computeNextPendingDay (what the dashboard shows).
  const wrapped = await startSession(ath, randomUUID(), { force: true });
  expect(wrapped.expectedDay).toBe(1);
});

it('startSession rejects when already in progress', async () => {
  const { ath } = await setupAthlete();
  await startSession(ath, randomUUID());
  await expect(startSession(ath, randomUUID()))
    .rejects.toMatchObject({ reason: 'session_in_progress' });
});

it('logSet idempotent by client_id', async () => {
  const { ath, principalId } = await setupAthlete();
  const { sessionId } = await startSession(ath, randomUUID());
  const clientId = randomUUID();
  const r1 = await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1, unit: 'kg', value: 80, reps: 8,
    completed: true, rpe: 7, client_id: clientId,
    client_ts: new Date().toISOString(),
  });
  expect(r1.created).toBe(true);

  const r2 = await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1, unit: 'kg', value: 80, reps: 8,
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
  const { sessionId } = await startSession(ath, randomUUID());
  const otherR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('other@test.local', 'x', 'athlete') RETURNING id`,
  );
  await expect(logSet(sessionId, otherR.rows[0].id, {
    exercise_id: principalId, set_index: 1, unit: 'kg', value: 80, reps: 8,
    completed: true, client_id: randomUUID(),
    client_ts: new Date().toISOString(),
  })).rejects.toMatchObject({ reason: 'not_found' });
});

it('finishSession computes summary + detects PRs', async () => {
  const { ath, principalId, accesorioId } = await setupAthlete();
  const { sessionId } = await startSession(ath, randomUUID());
  for (const setIdx of [1, 2, 3]) {
    await logSet(sessionId, ath, {
      exercise_id: principalId, set_index: setIdx,
      unit: 'kg', value: 80 + setIdx, reps: 8, completed: true,
      client_id: randomUUID(), client_ts: new Date().toISOString(),
    });
    await logSet(sessionId, ath, {
      exercise_id: accesorioId, set_index: setIdx,
      unit: 'kg', value: 12, reps: 10, completed: true,
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

it('finishSession clamps compliancePct at 100 when extra sets are logged', async () => {
  // Regression: dropset sub-sets (one completed row per drop) and extra sets
  // push setsCompleted above the planned setsTarget, which used to yield
  // compliance well over 100% (e.g. "39 / 22 → 177%"). Compliance must cap
  // at 100 while the honest setsCompleted/setsTarget counts stay unclamped.
  const { ath, principalId } = await setupAthlete();
  const { sessionId } = await startSession(ath, randomUUID());
  const target = (
    await pool.query<{ t: number }>(
      `SELECT total_sets_target AS t FROM session_logs WHERE id = $1`,
      [sessionId],
    )
  ).rows[0].t;
  // Log far more completed sets than the plan calls for.
  const extra = target + 10;
  for (let i = 1; i <= extra; i++) {
    await logSet(sessionId, ath, {
      exercise_id: principalId, set_index: i,
      unit: 'kg', value: 50, reps: 5, completed: true,
      client_id: randomUUID(), client_ts: new Date().toISOString(),
    });
  }
  const summary = await finishSession(sessionId, ath, 'normal');
  expect(summary.setsCompleted).toBe(extra);
  expect(summary.setsTarget).toBe(target);
  expect(summary.setsCompleted).toBeGreaterThan(summary.setsTarget);
  expect(summary.compliancePct).toBe(100);
});

it('finishSession rejects already_finished', async () => {
  const { ath } = await setupAthlete();
  const { sessionId } = await startSession(ath, randomUUID());
  await finishSession(sessionId, ath, 'normal');
  await expect(finishSession(sessionId, ath, 'normal'))
    .rejects.toMatchObject({ reason: 'already_finished' });
});

it('getActive returns null when no session, returns session id otherwise', async () => {
  const { ath } = await setupAthlete();
  const empty = await getActive(ath);
  expect(empty.session).toBeNull();

  const { sessionId } = await startSession(ath, randomUUID());
  const present = await getActive(ath);
  expect(present.session?.id).toBe(sessionId);
});

// Reference SessionError to keep import used.
void SessionError;
