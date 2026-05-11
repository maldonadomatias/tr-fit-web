import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<(opts: { to: string; subject: string; html: string; from: string }) => Promise<{ data: { id: string }; error: null }>>;
const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const { default: app } = await import('../../src/app.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ data: { id: 'msg' }, error: null });
});
afterAll(async () => { await closePool(); });

it('POST /api/alerts SOS pain creates row + emails coach', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const tok = signToken({ id: ath, role: 'athlete' });

  const r = await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${tok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'lumbar', intensity: 7 },
    });
  expect(r.status).toBe(201);
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
});

it('GET /api/coach/alerts lists alerts for coach', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  const athTok = signToken({ id: ath, role: 'athlete' });
  await request(app).post('/api/alerts')
    .set('Authorization', `Bearer ${athTok}`)
    .send({
      type: 'sos_pain', exercise_id: ex.rows[0].id,
      payload: { zone: 'rodilla', intensity: 5 },
    });

  const coachTok = signToken({ id: coach, role: 'coach' });
  const list = await request(app).get('/api/coach/alerts?unread=true')
    .set('Authorization', `Bearer ${coachTok}`);
  expect(list.status).toBe(200);
  expect(list.body).toHaveLength(1);
});

it('GET /api/exercises/:id/alternatives returns alternative or null', async () => {
  const coach = await createCoach();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE muscle_group = 'Pecho - Mayor' AND is_principal = FALSE LIMIT 1`,
  );
  if (!ex.rows[0]) return;
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).get(`/api/exercises/${ex.rows[0].id}/alternatives`)
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body).toHaveProperty('alternative');
});
