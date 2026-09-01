import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { signToken } from '../../src/middleware/auth.js';
import pool from '../../src/db/connect.js';
import request from 'supertest';
import app from '../../src/app.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup() {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number; principal: boolean }>(
    `(SELECT id, true AS principal FROM exercises WHERE is_principal = TRUE LIMIT 1)
     UNION ALL
     (SELECT id, false AS principal FROM exercises WHERE is_principal = FALSE LIMIT 1)`,
  );
  const pid = ex.rows.find((r) => r.principal)!.id;
  const aid = ex.rows.find((r) => !r.principal)!.id;
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: 'd',
      slots: [
        { slot_index: 1, exercise_id: pid, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
        { slot_index: 2, exercise_id: aid, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, ai,
  );
  return { coach, ath, skeletonId, pid, aid };
}

it('GET /api/athlete/me — pending review when not approved', async () => {
  const { ath } = await setup();
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).get('/api/athlete/me').set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.blockedReason).toBe('awaiting_review');
});

it('GET /api/athlete/today — 403 awaiting_review', async () => {
  const { ath } = await setup();
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).get('/api/athlete/today').set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('awaiting_review');
});

it('GET /api/athlete/today — returns session after approval', async () => {
  const { ath, coach, skeletonId } = await setup();
  await approveSkeleton(skeletonId, coach);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).get('/api/athlete/today').set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.items)).toBe(true);
});

it('POST /api/athlete/rm — records RM', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100, week: 10 });
  expect(r.status).toBe(201);
  expect(typeof r.body.rmId).toBe('string');
});

async function setProgramWeek(athleteId: string, week: number) {
  await pool.query(
    `UPDATE athlete_program_state SET current_week = $1 WHERE athlete_id = $2`,
    [week, athleteId]
  );
}

// La app no tiene una fuente confiable de la semana de programa adentro de la
// sesión, y rm_tests está keyeada por program_week: que la elija el servidor.
it('POST /api/athlete/rm — derives week from program state when omitted', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 10);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app)
    .post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(201);
  const row = await pool.query<{ program_week: number }>(
    `SELECT program_week FROM rm_tests WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, pid]
  );
  expect(row.rows[0].program_week).toBe(10);
});

it('POST /api/athlete/rm — derives week 30 too', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 30);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app)
    .post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(201);
  const row = await pool.query<{ program_week: number }>(
    `SELECT program_week FROM rm_tests WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, pid]
  );
  expect(row.rows[0].program_week).toBe(30);
});

it('POST /api/athlete/rm — 400 when the current week is not a testing week', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 7);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app)
    .post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('week_not_testable');
});
