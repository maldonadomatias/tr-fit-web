export {};
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
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const ENDPOINTS = ['/rms', '/compliance', '/volume', '/rpe', '/weight-vs-suggested'];

describe('progress routes', () => {
  it('all endpoints reject unauth', async () => {
    for (const path of ENDPOINTS) {
      const r = await request(app).get(`/api/progress${path}`);
      expect(r.status).toBe(401);
    }
  });

  it('all endpoints reject coach role', async () => {
    const c = await createCoach();
    const tok = signToken({ id: c, role: 'coach' });
    for (const path of ENDPOINTS) {
      const r = await request(app).get(`/api/progress${path}`)
        .set('Authorization', `Bearer ${tok}`);
      expect(r.status).toBe(403);
    }
  });

  it('returns 200 with empty array for new athlete', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    // Upgrade to premium so tier-gated endpoints (/rms, /weight-vs-suggested) are accessible.
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    for (const path of ENDPOINTS) {
      const r = await request(app).get(`/api/progress${path}`)
        .set('Authorization', `Bearer ${tok}`);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body).toEqual([]);
    }
  });

  it('compliance accepts weeks query param', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/compliance?weeks=4')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });

  it('rejects invalid weeks query param', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/compliance?weeks=abc')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(400);
  });
});

describe('progress routes tier gating', () => {
  it('basico is blocked from /rms', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/rms')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('tier_insufficient');
  });

  it('basico is blocked from /weight-vs-suggested', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/weight-vs-suggested')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('premium accesses /rms', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/rms')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });

  it('basico accesses /compliance (no gate)', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/progress/compliance')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });
});
