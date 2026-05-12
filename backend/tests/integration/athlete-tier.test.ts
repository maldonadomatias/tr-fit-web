export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('GET /api/athlete/me/tier', () => {
  it('returns null when no plan', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = NULL WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/athlete/me/tier')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.plan_interest).toBeNull();
  });

  it('returns tier when set', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/api/athlete/me/tier')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.plan_interest).toBe('premium');
  });

  it('rejects unauthenticated', async () => {
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
