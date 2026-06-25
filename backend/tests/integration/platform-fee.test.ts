// backend/tests/integration/platform-fee.test.ts
import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import {
  createAdmin,
  createSuperadmin,
  createAthlete,
} from './helpers/fixtures.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('platform-fee routes', () => {
  it('rejects athletes', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: ath, role: 'athlete' });
    const r = await request(app)
      .get('/api/platform-fee')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  it('admin can read the current summary', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .get('/api/platform-fee')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.summary.active_athletes).toBe(1);
    expect(r.body.summary.total_ars).toBe(106000);
    expect(r.body.config.base_fee_ars).toBe(105000);
  });

  it('admin cannot edit config', async () => {
    const coach = await createAdmin();
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ price_per_athlete_ars: 30000 });
    expect(r.status).toBe(403);
  });

  it('superadmin edits config and applies adjustment', async () => {
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });

    const upd = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ price_per_athlete_ars: 30000 });
    expect(upd.status).toBe(200);
    expect(upd.body.price_per_athlete_ars).toBe(30000);

    const adj = await request(app)
      .post('/api/platform-fee/adjust')
      .set('Authorization', `Bearer ${tok}`)
      .send({ current_usd: 1500 });
    expect(adj.status).toBe(200);
    expect(adj.body.config.reference_usd).toBe(1500);
    expect(adj.body.config.next_adjustment_date).toBe('2027-01-01');
  });

  it('superadmin can switch to testflight phase (50% base, no share)', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });

    const upd = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ phase: 'testflight' });
    expect(upd.status).toBe(200);
    expect(upd.body.phase).toBe('testflight');

    const r = await request(app)
      .get('/api/platform-fee')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.body.summary.phase).toBe('testflight');
    expect(r.body.summary.base_fee_ars).toBe(52500);
    expect(r.body.summary.revenue_share_ars).toBe(0);
    expect(r.body.summary.total_ars).toBe(52500);
  });

  it('rejects invalid phase value', async () => {
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });
    const r = await request(app)
      .put('/api/platform-fee/config')
      .set('Authorization', `Bearer ${tok}`)
      .send({ phase: 'beta' });
    expect(r.status).toBe(400);
  });

  it('rejects invalid adjust payload', async () => {
    const su = await createSuperadmin();
    const tok = signToken({ id: su, role: 'superadmin' });
    const r = await request(app)
      .post('/api/platform-fee/adjust')
      .set('Authorization', `Bearer ${tok}`)
      .send({ current_usd: -5 });
    expect(r.status).toBe(400);
  });

  it('exposes the fee-change log to admin', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 26000 });
    const r = await request(app)
      .get('/api/platform-fee/fee-log')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body[0].to_ars).toBe(26000);
  });
});
