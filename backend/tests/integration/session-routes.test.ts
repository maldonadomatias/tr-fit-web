import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const { createPendingSkeleton, approveSkeleton } = await import('../../src/services/skeleton.service.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const { default: app } = await import('../../src/app.js');
const { randomUUID } = await import('crypto');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup() {
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
  return { ath, principalId: p.rows[0].id, tok: signToken({ id: ath, role: 'athlete' }) };
}

it('POST /api/sessions 201 + GET /active returns it', async () => {
  const { tok } = await setup();
  const r = await request(app).post('/api/sessions')
    .set('Authorization', `Bearer ${tok}`)
    .send({ day_of_week: 1, client_id: randomUUID() });
  expect(r.status).toBe(201);
  expect(r.body.sessionId).toBeTruthy();

  const g = await request(app).get('/api/sessions/active')
    .set('Authorization', `Bearer ${tok}`);
  expect(g.body.session.id).toBe(r.body.sessionId);
});

it('POST /api/sessions/:id/sets 201 + idempotent 200 on dup client_id', async () => {
  const { tok, principalId } = await setup();
  const sess = await request(app).post('/api/sessions')
    .set('Authorization', `Bearer ${tok}`)
    .send({ day_of_week: 1, client_id: randomUUID() });
  const cid = randomUUID();
  const r1 = await request(app).post(`/api/sessions/${sess.body.sessionId}/sets`)
    .set('Authorization', `Bearer ${tok}`)
    .send({
      exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
      completed: true, rpe: 7, client_id: cid,
      client_ts: new Date().toISOString(),
    });
  expect(r1.status).toBe(201);
  const r2 = await request(app).post(`/api/sessions/${sess.body.sessionId}/sets`)
    .set('Authorization', `Bearer ${tok}`)
    .send({
      exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
      completed: true, rpe: 7, client_id: cid,
      client_ts: new Date().toISOString(),
    });
  expect(r2.status).toBe(200);
});

it('PATCH /api/sessions/:id/finish returns summary', async () => {
  const { tok, principalId } = await setup();
  const sess = await request(app).post('/api/sessions')
    .set('Authorization', `Bearer ${tok}`)
    .send({ day_of_week: 1, client_id: randomUUID() });
  await request(app).post(`/api/sessions/${sess.body.sessionId}/sets`)
    .set('Authorization', `Bearer ${tok}`)
    .send({
      exercise_id: principalId, set_index: 1, weight_kg: 80, reps: 8,
      completed: true, client_id: randomUUID(),
      client_ts: new Date().toISOString(),
    });
  const fin = await request(app).patch(`/api/sessions/${sess.body.sessionId}/finish`)
    .set('Authorization', `Bearer ${tok}`)
    .send({ fatigue_rating: 'normal' });
  expect(fin.status).toBe(200);
  expect(fin.body.summary.setsCompleted).toBe(1);
});

it('POST /api/sessions wrong day returns 400 with expectedDay', async () => {
  const { tok } = await setup();
  const r = await request(app).post('/api/sessions')
    .set('Authorization', `Bearer ${tok}`)
    .send({ day_of_week: 3, client_id: randomUUID() });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('wrong_day');
  expect(r.body.expectedDay).toBe(1);
});
