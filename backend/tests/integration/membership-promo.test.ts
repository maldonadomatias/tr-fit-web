export {};
// Promo prepay: quarterly (+3 calendar months) and annual (+12).
// Grants access like a cuota. Vacation coverage does not stack; a future
// paid_until does. A rejected account is approved.
const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, verifiedAthleteUser } =
  await import('./helpers/fixtures.js');
const { addCalendarMonth } =
  await import('../../src/services/membership.service.js');
const { getAthleteBillingRevenue } =
  await import('../../src/services/platform-fee.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

function admin() {
  return createAdmin().then((id) => signToken({ id, role: 'admin' }));
}

function sameLocalDay(iso: string, expected: Date) {
  const got = new Date(iso);
  expect(got.getFullYear()).toBe(expected.getFullYear());
  expect(got.getMonth()).toBe(expected.getMonth());
  expect(got.getDate()).toBe(expected.getDate());
}

describe('POST /api/admin/users/:id/membership/promo', () => {
  it('charges a quarterly promo, enables login, and moves paid_until 3 months', async () => {
    const adminTok = await admin();
    const email = `promo-q-${Date.now()}@test.local`;
    const { id } = await signupUserInDb(email, 'pwd-test-1234', true);
    await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [id]);

    const before = new Date();
    const r = await request(app)
      .post(`/api/admin/users/${id}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({
        plan: 'quarterly',
        amount: 60000,
        method: 'transfer',
        paid_at: '2026-10-20',
      });
    expect(r.status).toBe(201);
    expect(r.body.membership.status).toBe('active');
    sameLocalDay(r.body.membership.paid_until, addCalendarMonth(before, 3));

    const pay = await pool.query<{
      amount: string;
      kind: string;
      reference: string;
    }>(`SELECT amount, kind, reference FROM payments WHERE user_id = $1`, [id]);
    expect(pay.rowCount).toBe(1);
    expect(Number(pay.rows[0].amount)).toBe(60000);
    expect(pay.rows[0].kind).toBe('quarterly');
    expect(pay.rows[0].reference).toBe('Promo trimestral');

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`,
      [id]
    );
    expect(status.rows[0].status).toBe('approved');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'pwd-test-1234' });
    expect(login.status).toBe(200);

    const audit = await pool.query(
      `SELECT meta FROM admin_audit_log WHERE target_id = $1 AND type = 'membership_promo'`,
      [id]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].meta.plan).toBe('quarterly');

    const rev = await getAthleteBillingRevenue('2026-10-20');
    expect(rev.realCount).toBe(1);
  });

  it('stacks an annual promo on a future paid_until', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    const base = new Date('2027-03-06T15:00:00.000Z');
    await pool.query(
      `UPDATE memberships SET status = 'active', paid_until = $2 WHERE user_id = $1`,
      [u.id, base.toISOString()]
    );

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ plan: 'annual', amount: 200000, paid_at: '2026-10-20' });
    expect(r.status).toBe(201);
    expect(r.body.membership.status).toBe('active');
    sameLocalDay(r.body.membership.paid_until, addCalendarMonth(base, 12));

    const pay = await pool.query<{ kind: string; reference: string }>(
      `SELECT kind, reference FROM payments WHERE user_id = $1`,
      [u.id]
    );
    expect(pay.rows[0].kind).toBe('annual');
    expect(pay.rows[0].reference).toBe('Promo anual');
  });

  it('starts a promo from today when the athlete is on vacation', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    await pool.query(
      `UPDATE memberships
          SET status = 'vacation', paid_until = '2027-03-06T15:00:00.000Z', paused_at = NULL
        WHERE user_id = $1`,
      [u.id]
    );

    const before = new Date();
    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ plan: 'quarterly', amount: 60000, paid_at: '2026-10-20' });
    expect(r.status).toBe(201);
    expect(r.body.membership.status).toBe('active');
    sameLocalDay(r.body.membership.paid_until, addCalendarMonth(before, 3));
  });

  it('clears a pause and approves a rejected account', async () => {
    const adminTok = await admin();
    const u = await verifiedAthleteUser();
    const base = new Date('2027-03-06T15:00:00.000Z');
    await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [
      u.id,
    ]);
    await pool.query(
      `UPDATE memberships
          SET status = 'paused', paused_at = now(), paid_until = $2
        WHERE user_id = $1`,
      [u.id, base.toISOString()]
    );

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ plan: 'quarterly', amount: 0, paid_at: '2026-10-20' });
    expect(r.status).toBe(201);
    expect(r.body.membership.status).toBe('active');
    expect(r.body.membership.paused_at).toBeNull();
    sameLocalDay(r.body.membership.paid_until, addCalendarMonth(base, 3));

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1`,
      [u.id]
    );
    expect(status.rows[0].status).toBe('approved');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(200);
  });

  it('rejects a non-athlete, a bad payload, and a non-admin', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    const staff = await request(app)
      .post(`/api/admin/users/${adminId}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ plan: 'quarterly', amount: 1, paid_at: '2026-10-20' });
    expect(staff.status).toBe(409);
    expect(staff.body.error).toBe('not_athlete');

    const bad = await request(app)
      .post(`/api/admin/users/${u.id}/membership/promo`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ plan: 'mensual', amount: -1 });
    expect(bad.status).toBe(400);

    const athleteTok = signToken({ id: u.id, role: 'athlete' });
    const forbidden = await request(app)
      .post(`/api/admin/users/${u.id}/membership/promo`)
      .set('Authorization', `Bearer ${athleteTok}`)
      .send({ plan: 'annual', amount: 1, paid_at: '2026-10-20' });
    expect(forbidden.status).toBe(403);
  });
});
