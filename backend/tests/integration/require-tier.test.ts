export {};
import express from 'express';
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const { signToken, requireAuth } = await import('../../src/middleware/auth.js');
const { requireRole } = await import('../../src/middleware/role.js');
const { requireTier } = await import('../../src/middleware/require-tier.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;

const app = express();
app.use(express.json());
app.get('/gate-full', requireAuth, requireRole('athlete'), requireTier('full'),
  (_req, res) => res.json({ ok: true }));
app.get('/gate-premium', requireAuth, requireRole('athlete'), requireTier('premium'),
  (_req, res) => res.json({ ok: true }));

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('requireTier', () => {
  it('passes when tier sufficient', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'full' WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/gate-full').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });

  it('premium satisfies full gate', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/gate-full').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });

  it('basico blocked from full gate', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/gate-full').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('tier_insufficient');
    expect(r.body.required).toBe('full');
    expect(r.body.actual).toBe('basico');
  });

  it('null plan_interest returns 403 no_plan', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/gate-premium').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('no_plan');
  });

  it('premium passes premium gate', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'premium' WHERE user_id = $1`, [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app).get('/gate-premium').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
  });
});
