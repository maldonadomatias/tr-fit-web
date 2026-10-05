export {};
// Vacation hold: access blocked, real paid_until, maintenance payment.
// A rejected account stays rejected. The cuota that brings them back starts today.
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, verifiedAthleteUser } = await import('./helpers/fixtures.js');
const { runMembershipTick } = await import('../../src/workers/membership-cron.js');
const { registerPayment } = await import('../../src/services/membership.service.js');
const { getStats } = await import('../../src/services/admin.service.js');
const { getAthleteBillingRevenue } = await import('../../src/services/platform-fee.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

function admin() {
  return createAdmin().then((id) => signToken({ id, role: 'admin' }));
}

describe('POST /api/admin/users/:id/membership/vacation', () => {
  it('charges maintenance, blocks login, and keeps a real paid_until', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15', record_payment: true });
    expect(r.status).toBe(200);
    expect(r.body.membership.status).toBe('vacation');
    expect(new Date(r.body.membership.paid_until).toISOString()).toBe('2026-11-15T15:00:00.000Z');

    const pay = await pool.query<{ amount: string; kind: string }>(
      `SELECT amount, kind FROM payments WHERE user_id = $1`,
      [u.id],
    );
    expect(pay.rowCount).toBe(1);
    expect(Number(pay.rows[0].amount)).toBe(10000);
    expect(pay.rows[0].kind).toBe('vacation');

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`,
      [u.id],
    );
    expect(status.rows[0].status).toBe('approved');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(403);
    expect(login.body.reason).toBe('membership_paused');

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND type = 'membership_vacation'`,
      [u.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('leaves a rejected account rejected', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [u.id]);

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-12-01' });
    expect(r.status).toBe(200);
    expect(r.body.membership.status).toBe('vacation');

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`, [u.id],
    );
    expect(status.rows[0].status).toBe('rejected');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(403);
    expect(login.body.reason).toBe('rejected');
  });

  it('updates the date without booking another payment', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15' });

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ paid_until: '2026-12-20', record_payment: false });
    expect(r.status).toBe(200);
    expect(new Date(r.body.membership.paid_until).toISOString()).toBe('2026-12-20T15:00:00.000Z');

    const pay = await pool.query(`SELECT 1 FROM payments WHERE user_id = $1`, [u.id]);
    expect(pay.rowCount).toBe(1);
  });

  it('kills an existing session at the next token refresh', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    const session = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(session.status).toBe(200);

    await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15' });

    const ref = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.body.refreshToken });
    expect(ref.status).toBe(401);
  });

  it('does not let the cron turn vacation into expired', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15' });
    await pool.query(
      `UPDATE memberships SET paid_until = now() - interval '2 days' WHERE user_id = $1`,
      [u.id],
    );

    await runMembershipTick();

    const m = await pool.query<{ status: string }>(
      `SELECT status FROM memberships WHERE user_id = $1`, [u.id],
    );
    expect(m.rows[0].status).toBe('vacation');
  });

  it('starts the return payment from today, not from the vacation end', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-12-01' });
    await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [u.id]);

    const before = Date.now();
    await registerPayment(u.id, {
      amount: 28000,
      method: 'transfer',
      paidAt: new Date().toISOString().slice(0, 10),
      periodDays: 30,
    });

    const m = await pool.query<{ status: string; paid_until: Date }>(
      `SELECT status, paid_until FROM memberships WHERE user_id = $1`, [u.id],
    );
    expect(m.rows[0].status).toBe('active');
    const until = new Date(m.rows[0].paid_until).getTime();
    expect(until).toBeGreaterThan(before + 29 * 86_400_000);
    expect(until).toBeLessThan(before + 31 * 86_400_000);

    const user = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`, [u.id],
    );
    expect(user.rows[0].status).toBe('approved');
  });

  it('is left out of MRR and the platform-fee pool', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-12-01' });

    const stats = await getStats();
    expect(stats.active_subs).toBe(0);
    expect(stats.mrr_estimated).toBe(0);
    const rev = await getAthleteBillingRevenue();
    expect(rev.estimatedCount).toBe(0);
  });

  it('400 when the date does not exist', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-02-31' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_date');
  });

  it('400 without an amount when booking the payment', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ paid_until: '2026-11-15', record_payment: true });
    expect(r.status).toBe(400);
  });

  it('409 for a staff account and 404 for an unknown user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const staff = await request(app)
      .post(`/api/admin/users/${adminId}/membership/vacation`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15' });
    expect(staff.status).toBe(409);

    const missing = await request(app)
      .post('/api/admin/users/00000000-0000-0000-0000-000000000000/membership/vacation')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ amount: 10000, paid_until: '2026-11-15' });
    expect(missing.status).toBe(404);
  });
});
