export {};
import express from 'express';
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken, requireAuth } = await import('../../src/middleware/auth.js');
const { requireRole } = await import('../../src/middleware/role.js');
const { requireTier } = await import('../../src/middleware/require-tier.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;

const app = express();
app.use(express.json());
app.get('/protected-premium', requireAuth, requireRole('athlete'),
  requireTier('premium'), (_req, res) => res.json({ ok: true }));
app.get('/protected-full', requireAuth, requireRole('athlete'),
  requireTier('full'), (_req, res) => res.json({ ok: true }));

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('requireTier', () => {
  it('passes when tier sufficient', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/protected-full')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });

  it('blocks when tier insufficient', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/protected-premium')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('tier_insufficient');
    expect(r.body.required).toBe('premium');
    expect(r.body.actual).toBe('basico');
  });

  it('returns 403 no_plan for athlete without profile', async () => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('nt@t.local','x','athlete') RETURNING id`,
    );
    const tok = signToken({ id: r.rows[0].id, role: 'athlete' });
    const resp = await request(app).get('/protected-full')
      .set('Authorization', `Bearer ${tok}`);
    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe('no_plan');
  });

  it('premium passes premium gate', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/protected-premium')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });
});
