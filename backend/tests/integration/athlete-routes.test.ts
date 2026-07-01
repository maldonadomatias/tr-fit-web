import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{
      slot_index: number; exercise_id: number;
      role: 'calentamiento' | 'principal' | 'accesorio';
      notes: string | null;
    }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
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
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal', notes: null }] }],
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
    const c = await createAdmin();
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

  it('rejects admin role', async () => {
    const c = await createAdmin();
    const tok = signToken({ id: c, role: 'admin' });
    const r = await request(app).get('/api/athlete/me/tier')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });
});

describe('PATCH /api/athlete/me', () => {
  it('updates scalar fields and persists them', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ name: 'Nuevo Nombre', weight_kg: 80, goal: 'fuerza' });
    expect(r.status).toBe(200);
    const row = await pool.query(
      `SELECT name, weight_kg, goal, days_specific FROM athlete_profiles WHERE user_id = $1`,
      [a],
    );
    expect(row.rows[0].name).toBe('Nuevo Nombre');
    expect(Number(row.rows[0].weight_kg)).toBe(80);
    expect(row.rows[0].goal).toBe('fuerza');
    // days_per_week untouched → days_specific preserved
    expect(row.rows[0].days_specific).toEqual(['lun', 'mar', 'jue', 'sab']);
  });

  it('updates days_per_week and nulls days_specific to satisfy the CHECK', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c); // defaults to 4 days
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ days_per_week: 3 });
    expect(r.status).toBe(200);
    const row = await pool.query(
      `SELECT days_per_week, days_specific FROM athlete_profiles WHERE user_id = $1`,
      [a],
    );
    expect(row.rows[0].days_per_week).toBe(3);
    expect(row.rows[0].days_specific).toBeNull();
  });

  it('keeps days_specific when days_per_week is sent but unchanged', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c); // 4 days
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ days_per_week: 4 });
    expect(r.status).toBe(200);
    const row = await pool.query(
      `SELECT days_specific FROM athlete_profiles WHERE user_id = $1`,
      [a],
    );
    expect(row.rows[0].days_specific).toEqual(['lun', 'mar', 'jue', 'sab']);
  });

  it('rejects days_per_week below valid range (2-6)', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ days_per_week: 1 });
    expect(r.status).toBe(400);
  });

  it('rejects days_per_week above valid range (2-6)', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ days_per_week: 7 });
    expect(r.status).toBe(400);
  });

  it('rejects a body with no recognized fields', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ foo: 'bar' });
    expect(r.status).toBe(400);
  });

  it('rejects unauth', async () => {
    const r = await request(app).patch('/api/athlete/me').send({ weight_kg: 80 });
    expect(r.status).toBe(401);
  });

  it('rejects admin role', async () => {
    const c = await createAdmin();
    const tok = signToken({ id: c, role: 'admin' });
    const r = await request(app).patch('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`)
      .send({ weight_kg: 80 });
    expect(r.status).toBe(403);
  });
});

describe('POST /api/athlete/skeleton/regenerate', () => {
  it('premium returns 201', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
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

  // Tier gating removed — regeneration is always allowed, no 403/429 fires.
  it('basico after a prior regen still returns 201 (no tier_blocked)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
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
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending_review');
  });

  it('full second regen within 30 days still returns 201 (no rate_limit)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
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
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending_review');
  });

  it('rejects unauth', async () => {
    const r = await request(app).post('/api/athlete/skeleton/regenerate').send({});
    expect(r.status).toBe(401);
  });

  it('rejects admin role', async () => {
    const c = await createAdmin();
    const tok = signToken({ id: c, role: 'admin' });
    const r = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(403);
  });

  it('returns 409 with message when a pending exists', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const first = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});
    expect(second.status).toBe(409);
    expect(second.body.message).toBe(
      'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
    );
  });
});

describe('GET /api/athlete/me', () => {
  it('GET /athlete/me returns pendingReview=false with no pending, true after regen', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const agent = request(app);

    const before = await agent.get('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`);
    expect(before.status).toBe(200);
    expect(before.body.pendingReview).toBe(false);

    await agent.post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${tok}`).send({});

    const after = await agent.get('/api/athlete/me')
      .set('Authorization', `Bearer ${tok}`);
    expect(after.body.pendingReview).toBe(true);
  });
});
