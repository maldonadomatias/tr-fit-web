import request from 'supertest';
import app from '../../src/app.js';
import { signToken } from '../../src/middleware/auth.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import {
  createAdmin,
  createAthlete,
  signupUserInDb,
} from './helpers/fixtures.js';
import {
  getUser,
  setAthleteMonthlyFee,
} from '../../src/services/admin.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('athlete monthly fee', () => {
  it('defaults to 25000 and getUser returns it', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const u = await getUser(ath);
    expect(u?.monthly_fee_ars).toBe(25000);
  });

  it('setAthleteMonthlyFee updates and writes an audit row', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const v = await setAthleteMonthlyFee(ath, 28000, coach);
    expect(v).toBe(28000);
    expect((await getUser(ath))?.monthly_fee_ars).toBe(28000);
    const log = await pool.query(
      `SELECT meta FROM admin_audit_log
        WHERE type = 'athlete_fee_changed' AND target_id = $1`,
      [ath]
    );
    expect(log.rowCount).toBe(1);
    expect(Number(log.rows[0].meta.from)).toBe(25000);
    expect(Number(log.rows[0].meta.to)).toBe(28000);
  });

  it('PUT /admin/users/:id/monthly-fee updates (admin allowed)', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 23000 });
    expect(r.status).toBe(200);
    expect(r.body.monthly_fee_ars).toBe(23000);
  });

  it('accepts a zero fee', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 0 });
    expect(r.status).toBe(200);
    expect(r.body.monthly_fee_ars).toBe(0);
  });

  it('accepts any non-negative value without the old 5k–500k limits', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    for (const fee of [1500, 750000, 100_000_000]) {
      const r = await request(app)
        .put(`/api/admin/users/${ath}/monthly-fee`)
        .set('Authorization', `Bearer ${tok}`)
        .send({ monthly_fee_ars: fee });
      expect(r.status).toBe(200);
      expect(r.body.monthly_fee_ars).toBe(fee);
    }
  });

  it('rejects a negative fee', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach);
    const tok = signToken({ id: coach, role: 'admin' });
    const r = await request(app)
      .put(`/api/admin/users/${ath}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: -1 });
    expect(r.status).toBe(400);
  });

  it('updates the fee for a new athlete before onboarding', async () => {
    const coach = await createAdmin();
    const tok = signToken({ id: coach, role: 'admin' });
    const { id: athleteId } = await signupUserInDb(
      'new-fee@test.local',
      'pwd-test-1234',
      true
    );

    const r = await request(app)
      .put(`/api/admin/users/${athleteId}/monthly-fee`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ monthly_fee_ars: 32000 });

    expect(r.status).toBe(200);
    expect(r.body.monthly_fee_ars).toBe(32000);
    expect((await getUser(athleteId))?.monthly_fee_ars).toBe(32000);
  });
});
