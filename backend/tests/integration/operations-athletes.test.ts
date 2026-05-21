import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const { default: app } = await import('../../src/app.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('GET /api/admin/operations/athletes returns list with metadata', async () => {
  const coach = await createAdmin();
  const a1 = await createAthlete(coach, { name: 'Atleta Uno' });
  const a2 = await createAthlete(coach, { name: 'Atleta Dos' });
  const tok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .get('/api/admin/operations/athletes')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body).toHaveLength(2);
  const ids = r.body.map((a: { id: string }) => a.id);
  expect(ids).toContain(a1);
  expect(ids).toContain(a2);
  expect(r.body[0]).toHaveProperty('email');
  expect(r.body[0]).toHaveProperty('current_week');
  expect(r.body[0]).toHaveProperty('skeleton_status');
  expect(r.body[0]).toHaveProperty('last_session_at');
  expect(r.body[0]).toHaveProperty('unread_alerts_count');
});

it('GET /api/admin/operations/athletes only returns athletes of this coach', async () => {
  const coachA = await createAdmin();
  const coachB = await createAdmin();
  const a1 = await createAthlete(coachA);
  await createAthlete(coachB);
  const tok = signToken({ id: coachA, role: 'admin' });
  const r = await request(app)
    .get('/api/admin/operations/athletes')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body).toHaveLength(1);
  expect(r.body[0].id).toBe(a1);
});

it('GET /api/admin/operations/athletes/:id returns detail; 404 if not own athlete', async () => {
  const coachA = await createAdmin();
  const coachB = await createAdmin();
  const ath = await createAthlete(coachA);
  const tokA = signToken({ id: coachA, role: 'admin' });
  const tokB = signToken({ id: coachB, role: 'admin' });

  const ok = await request(app)
    .get(`/api/admin/operations/athletes/${ath}`)
    .set('Authorization', `Bearer ${tokA}`);
  expect(ok.status).toBe(200);
  expect(ok.body).toHaveProperty('profile');
  expect(ok.body).toHaveProperty('programState');
  expect(ok.body).toHaveProperty('alertsCount');

  const bad = await request(app)
    .get(`/api/admin/operations/athletes/${ath}`)
    .set('Authorization', `Bearer ${tokB}`);
  expect(bad.status).toBe(404);
});

it('non-admin role forbidden', async () => {
  const admin = await createAdmin();
  const ath = await createAthlete(admin);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app)
    .get('/api/admin/operations/athletes')
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(403);
});

it('athlete detail includes measurements + new profile fields', async () => {
  const coach = await createAdmin();
  const athleteId = await createAthlete(coach, {
    level: 'medio',
    goal: 'hipertrofia',
  });
  await pool.query(
    `INSERT INTO athlete_measurements (athlete_id, chest_cm, source)
     VALUES ($1, 100, 'onboarding')`,
    [athleteId],
  );
  const tok = signToken({ id: coach, role: 'admin' });
  const r = await request(app)
    .get(`/api/admin/operations/athletes/${athleteId}`)
    .set('Authorization', `Bearer ${tok}`);
  expect(r.status).toBe(200);
  expect(r.body.measurements).toHaveLength(1);
  expect(Number(r.body.measurements[0].chest_cm)).toBe(100);
  expect(r.body.profile.phone).toBe('+5491111111111');
  expect(r.body.profile.training_mode).toBe('gym');
});
