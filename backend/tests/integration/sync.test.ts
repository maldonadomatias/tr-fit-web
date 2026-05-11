import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createCoach, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { startSession } from '../../src/services/session.service.js';
import { syncSets } from '../../src/services/sync.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'crypto';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setupSession() {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: 'd',
      slots: [{ slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const }],
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
  const { sessionId } = await startSession(ath, 1, randomUUID());
  return { ath, sessionId, principalId: p.rows[0].id };
}

it('syncSets accepts all on first sync, idempotent on re-sync', async () => {
  const { ath, sessionId, principalId } = await setupSession();
  const sets = [1, 2, 3].map((i) => ({
    exercise_id: principalId, set_index: i, weight_kg: 80, reps: 8,
    completed: true, client_id: randomUUID(),
    client_ts: new Date().toISOString(),
  }));
  const r1 = await syncSets(ath, sessionId, sets);
  expect(r1.accepted).toHaveLength(3);
  expect(r1.conflicts).toHaveLength(0);

  const r2 = await syncSets(ath, sessionId, sets);
  expect(r2.accepted).toHaveLength(3);
  const cnt = await pool.query(
    `SELECT COUNT(*)::int AS n FROM set_logs WHERE session_log_id = $1`,
    [sessionId],
  );
  expect(cnt.rows[0].n).toBe(3);
});

it('syncSets rejects with older_ts when existing has newer ts', async () => {
  const { ath, sessionId, principalId } = await setupSession();
  const clientId = randomUUID();
  const newer = new Date(Date.now() + 60_000).toISOString();
  const older = new Date(Date.now() - 60_000).toISOString();

  await syncSets(ath, sessionId, [{
    exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
    completed: true, client_id: clientId, client_ts: newer,
  }]);

  const r2 = await syncSets(ath, sessionId, [{
    exercise_id: principalId, set_index: 1, weight_kg: 70, reps: 8,
    completed: true, client_id: clientId, client_ts: older,
  }]);
  expect(r2.conflicts).toHaveLength(1);
  expect(r2.conflicts[0].reason).toBe('older_ts');
});

it('syncSets returns not_found for foreign session', async () => {
  const { sessionId, principalId } = await setupSession();
  const otherR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('foreign@t.local', 'x', 'athlete') RETURNING id`,
  );
  const r = await syncSets(otherR.rows[0].id, sessionId, [{
    exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
    completed: true, client_id: randomUUID(),
    client_ts: new Date().toISOString(),
  }]);
  expect(r.conflicts).toHaveLength(1);
  expect(r.conflicts[0].reason).toBe('not_found');
});
