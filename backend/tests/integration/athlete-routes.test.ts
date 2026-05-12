import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal' }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    rationale: 'r',
    days: [{ day_index: 1, focus: 'f',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' }] }],
  });
});
afterAll(async () => { await closePool(); });

async function ensureFirstExercise() {
  const r = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  if (r.rows[0]) return;
  await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_pattern,
                            is_principal, is_unilateral, level_min)
     VALUES ('Sentadilla','pierna','barra','squat',true,false,'principiante')
     ON CONFLICT DO NOTHING`,
  );
}

describe('GET /api/athlete/me/tier', () => {
  it('returns plan_interest', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/athlete/me/tier')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(['basico','full','premium']).toContain(r.body.plan_interest);
  });

  it('rejects unauth', async () => {
    const r = await request(app).get('/api/athlete/me/tier');
    expect(r.status).toBe(401);
  });

  it('rejects coach role', async () => {
    const c = await createCoach();
    const tok = signToken({ id: c, role: 'coach' });
    const r = await request(app).get('/api/athlete/me/tier')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/athlete/skeleton/regenerate', () => {
  it('premium returns 201', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(201);
    expect(r.body.skeletonId).toBeDefined();
    expect(r.body.status).toBe('pending_review');
  });

  it('basico after first regen returns 403 tier_blocked', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`,
      [a],
    );
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('tier_blocked');
  });

  it('full second regen within 30 days returns 429', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'full' WHERE user_id = $1`,
      [a],
    );
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
  });

  it('rejects unauth', async () => {
    const r = await request(app).post('/api/athlete/skeleton/regenerate').send({});
    expect(r.status).toBe(401);
  });

  it('rejects coach role', async () => {
    const c = await createCoach();
    const tok = signToken({ id: c, role: 'coach' });
    const r = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(403);
  });
});
