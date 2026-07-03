export {};
// Membership freeze (injury/vacation): POST /api/admin/users/:id/membership/pause
// stops the clock and blocks access; /resume credits the paused days back by
// shifting paid_until and restores access.
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, verifiedAthleteUser, setMembership } = await import('./helpers/fixtures.js');
const { runMembershipTick } = await import('../../src/workers/membership-cron.js');
const { registerPayment } = await import('../../src/services/membership.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const DAY_MS = 86_400_000;

function admin() {
  return createAdmin().then((id) => signToken({ id, role: 'admin' }));
}

async function athleteWithPaidDays(days: number) {
  const u = await verifiedAthleteUser();
  await setMembership(u.id, new Date(Date.now() + days * DAY_MS).toISOString(), 'active');
  return u;
}

describe('POST /api/admin/users/:id/membership/pause', () => {
  it('pauses an active membership and blocks login', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(10);

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(200);
    expect(r.body.membership.status).toBe('paused');
    expect(r.body.membership.paused_at).not.toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(403);
    expect(login.body.reason).toBe('membership_paused');

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND type = 'membership_paused'`,
      [u.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('kills existing sessions at the next token refresh', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(10);
    const session = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(session.status).toBe(200);

    await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);

    const ref = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.body.refreshToken });
    expect(ref.status).toBe(401);
  });

  it('409 when the membership is not active (expired)', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await setMembership(u.id, new Date(Date.now() - 10 * DAY_MS).toISOString(), 'expired');

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('membership_not_active');
  });

  it('409 when the user has no membership', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await pool.query(`DELETE FROM memberships WHERE user_id = $1`, [u.id]);

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(409);
  });

  it('404 for an unknown user', async () => {
    const adminTok = await admin();
    const r = await request(app)
      .post(`/api/admin/users/00000000-0000-0000-0000-000000000000/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/membership/resume', () => {
  it('credits the paused days back and restores access', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(10);

    await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    // Simulate a 5-day pause
    await pool.query(
      `UPDATE memberships SET paused_at = now() - interval '5 days' WHERE user_id = $1`,
      [u.id],
    );

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/resume`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(200);
    expect(r.body.membership.status).toBe('active');
    expect(r.body.membership.paused_at).toBeNull();

    // paid_until moved from +10d to ~+15d (5 paused days credited back)
    const paidUntil = new Date(r.body.membership.paid_until).getTime();
    const expected = Date.now() + 15 * DAY_MS;
    expect(Math.abs(paidUntil - expected)).toBeLessThan(60_000);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(200);

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND type = 'membership_resumed'`,
      [u.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('keeps an infinity paid_until as infinity', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser(); // fixture seeds paid_until = infinity

    await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/resume`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(200);

    const m = await pool.query<{ inf: boolean }>(
      `SELECT paid_until = 'infinity'::timestamptz AS inf FROM memberships WHERE user_id = $1`,
      [u.id],
    );
    expect(m.rows[0].inf).toBe(true);
  });

  it('409 when the membership is not paused', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(10);
    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/resume`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('membership_not_paused');
  });
});

describe('paused memberships vs cron and payments', () => {
  it('the membership cron never expires a paused membership', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(1);
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);
    // Clock passes paid_until while paused
    await pool.query(
      `UPDATE memberships SET paid_until = now() - interval '3 days' WHERE user_id = $1`,
      [u.id],
    );

    await runMembershipTick();

    const m = await pool.query<{ status: string }>(
      `SELECT status FROM memberships WHERE user_id = $1`, [u.id],
    );
    expect(m.rows[0].status).toBe('paused');
  });

  it('registering a payment while paused reactivates the membership', async () => {
    const adminTok = await admin();
    const u = await athleteWithPaidDays(10);
    await request(app)
      .post(`/api/admin/users/${u.id}/membership/pause`)
      .set('Authorization', `Bearer ${adminTok}`);

    await registerPayment(u.id, {
      amount: 25000,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
      periodDays: 30,
    });

    const m = await pool.query<{ status: string; paused_at: string | null }>(
      `SELECT status, paused_at FROM memberships WHERE user_id = $1`, [u.id],
    );
    expect(m.rows[0].status).toBe('active');
    expect(m.rows[0].paused_at).toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(200);
  });
});
