import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<
  (opts: {
    to: string;
    subject: string;
    html: string;
    from: string;
  }) => Promise<{ id: string }>
>;
const resendMod = (await import('resend')) as unknown as {
  __mockSend: MockSend;
};

const { resetDatabase, ensureMigrated, closePool } = await import(
  './helpers/test-db.js'
);
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, verifiedAthleteUser } = await import(
  './helpers/fixtures.js'
);
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
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ id: 'msg' });
});
afterAll(async () => {
  await closePool();
});

describe('POST /api/admin/users/:id/send-password-reset', () => {
  it('emails a live reset code to the athlete and audits the admin', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/send-password-reset`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);

    expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
    expect(resendMod.__mockSend.mock.calls[0][0].to).toBe(u.email);

    const live = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM password_resets
        WHERE user_id = $1 AND used_at IS NULL`,
      [u.id]
    );
    expect(live.rows[0].n).toBe(1);

    // The whole point of the admin route: the support action is attributable.
    const audit = await pool.query<{ actor: string }>(
      `SELECT actor FROM admin_audit_log
        WHERE target_id = $1 AND type = 'password_reset_sent'`,
      [u.id]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor).toContain('@');
  });

  it('the emailed code actually works end to end', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    await request(app)
      .post(`/api/admin/users/${u.id}/send-password-reset`)
      .set('Authorization', `Bearer ${adminTok}`);

    const html = resendMod.__mockSend.mock.calls[0][0].html;
    const code = html.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeDefined();

    const reset = await request(app).post('/api/auth/reset-password').send({
      email: u.email,
      code,
      newPassword: 'brand-new-pass-1234',
    });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: 'brand-new-pass-1234' });
    expect(login.status).toBe(200);
  });

  it('refuses non-athletes, whose code could never be redeemed', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const otherAdmin = await createAdmin();

    const r = await request(app)
      .post(`/api/admin/users/${otherAdmin}/send-password-reset`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(400);
    expect(r.body.error).toBe('not_athlete');
    expect(resendMod.__mockSend).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .post(
        '/api/admin/users/00000000-0000-0000-0000-000000000000/send-password-reset'
      )
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('a non-admin cannot trigger a reset for someone else', async () => {
    const u = await verifiedAthleteUser();
    const victim = await verifiedAthleteUser();
    const athleteTok = signToken({ id: u.id, role: 'athlete' });
    const r = await request(app)
      .post(`/api/admin/users/${victim.id}/send-password-reset`)
      .set('Authorization', `Bearer ${athleteTok}`);
    expect(r.status).toBe(403);
  });
});
