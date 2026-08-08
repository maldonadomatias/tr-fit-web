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

const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, verifiedAthleteUser } =
  await import('./helpers/fixtures.js');
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

describe('POST /api/admin/users/:id/resend-verification', () => {
  it('emails a fresh verification token to the target user and audits it', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const email = `unverified-${Date.now()}@test.local`;
    const { id } = await signupUserInDb(email, 'test-pass-1234', false);

    const r = await request(app)
      .post(`/api/admin/users/${id}/resend-verification`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.alreadyVerified).toBeUndefined();
    expect(r.body.emailSendFailed).toBe(false);

    // The email went to the athlete, not to the admin.
    expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
    expect(resendMod.__mockSend.mock.calls[0][0].to).toBe(email);

    // Exactly one live verification token, and the older one was invalidated.
    const live = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_verifications
        WHERE user_id = $1 AND used_at IS NULL`,
      [id]
    );
    expect(live.rows[0].n).toBe(1);

    const audit = await pool.query<{ type: string }>(
      `SELECT type FROM admin_audit_log
        WHERE target_id = $1 AND type = 'verification_resent'`,
      [id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it('is a no-op for an already verified user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/resend-verification`)
      .set('Authorization', `Bearer ${adminTok}`);

    expect(r.status).toBe(200);
    expect(r.body.alreadyVerified).toBe(true);
    expect(resendMod.__mockSend).not.toHaveBeenCalled();

    const audit = await pool.query(
      `SELECT 1 FROM admin_audit_log
        WHERE target_id = $1 AND type = 'verification_resent'`,
      [u.id]
    );
    expect(audit.rowCount).toBe(0);
  });

  it('returns 404 for an unknown user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .post(
        '/api/admin/users/00000000-0000-0000-0000-000000000000/resend-verification'
      )
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });

  it('a non-admin cannot resend anyone else’s verification', async () => {
    const u = await verifiedAthleteUser();
    const victim = await verifiedAthleteUser();
    const athleteTok = signToken({ id: u.id, role: 'athlete' });
    const r = await request(app)
      .post(`/api/admin/users/${victim.id}/resend-verification`)
      .set('Authorization', `Bearer ${athleteTok}`);
    expect(r.status).toBe(403);
  });
});
