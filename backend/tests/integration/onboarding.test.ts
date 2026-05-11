import { jest } from '@jest/globals';

// Mock openai BEFORE importing the app
jest.unstable_mockModule('openai', () => {
  const create = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
    __mockCreate: create,
  };
});

type MockCreate = jest.Mock<
  () => Promise<{ choices: Array<{ message: { content: string } }> }>
>;

const openaiMod = (await import('openai')) as unknown as { __mockCreate: MockCreate };
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); openaiMod.__mockCreate.mockReset(); });
afterAll(async () => { await closePool(); });

async function makeAthleteUser() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`a-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

const validPayload = {
  name: 'Mati', gender: 'male', age: 30, height_cm: 175, weight_kg: 75,
  level: 'intermedio', goal: 'hipertrofia', days_per_week: 4,
  equipment: 'gym_completo', injuries: [],
};

it('rejects unauthenticated', async () => {
  const r = await request(app).post('/api/onboarding/complete').send(validPayload);
  expect(r.status).toBe(401);
});

it('rejects payload validation errors', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send({ ...validPayload, age: 5 });
  expect(r.status).toBe(400);
});

it('creates profile + skeleton + slots on success', async () => {
  await createCoach();
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });

  const ex = await pool.query<{ id: number; principal: boolean }>(
    `(SELECT id, true AS principal FROM exercises WHERE is_principal = TRUE LIMIT 1)
     UNION ALL
     (SELECT id, false AS principal FROM exercises WHERE is_principal = FALSE LIMIT 1)`,
  );
  const pid = ex.rows.find((r) => r.principal)!.id;
  const aid = ex.rows.find((r) => !r.principal)!.id;
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: [1, 2, 3, 4].map((d) => ({
        day_index: d, focus: 'd',
        slots: [
          { slot_index: 1, exercise_id: pid, role: 'principal' },
          { slot_index: 2, exercise_id: aid, role: 'accesorio' },
        ],
      })),
    }) } }],
  });

  const r = await request(app)
    .post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`)
    .send(validPayload);
  expect(r.status).toBe(201);
  expect(r.body.status).toBe('pending_review');

  const slots = await pool.query(`SELECT count(*)::int AS n FROM skeleton_slots`);
  expect(slots.rows[0].n).toBe(8);

  const prof = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`, [u],
  );
  expect(prof.rows[0].coach_id).toBeTruthy();
});

it('onboarded athlete is visible in coach pending inbox', async () => {
  const coachId = await createCoach();
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: [1, 2, 3, 4].map((d) => ({
        day_index: d, focus: 'd',
        slots: [{ slot_index: 1, exercise_id: ex.rows[0].id, role: 'principal' }],
      })),
    }) } }],
  });
  const onboardR = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(onboardR.status).toBe(201);

  // Coach should see it
  const coachTok = signToken({ id: coachId, role: 'coach' });
  const inbox = await request(app)
    .get('/api/coach/skeletons/pending')
    .set('Authorization', `Bearer ${coachTok}`);
  expect(inbox.status).toBe(200);
  expect(inbox.body).toHaveLength(1);
  expect(inbox.body[0].athlete_id).toBe(u);
});

it('returns 409 on duplicate onboarding', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE LIMIT 1`,
  );
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      rationale: 'r',
      days: [1, 2, 3, 4].map((d) => ({
        day_index: d, focus: 'd',
        slots: [{ slot_index: 1, exercise_id: ex.rows[0].id, role: 'principal' }],
      })),
    }) } }],
  });
  await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  const r2 = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(r2.status).toBe(409);
});

it('returns 502 when skeleton generation fails', async () => {
  const u = await makeAthleteUser();
  const tok = signToken({ id: u, role: 'athlete' });
  openaiMod.__mockCreate.mockResolvedValue({
    choices: [{ message: { content: '{"bad": true}' } }],
  });
  const r = await request(app).post('/api/onboarding/complete')
    .set('Authorization', `Bearer ${tok}`).send(validPayload);
  expect(r.status).toBe(502);
});
