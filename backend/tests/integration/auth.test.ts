import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<(opts: { to: string; subject: string; html: string; from: string }) => Promise<{ id: string }>>;
const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signupUserInDb, verifiedAthleteUser } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const { default: app } = await import('../../src/app.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); resendMod.__mockSend.mockReset(); resendMod.__mockSend.mockResolvedValue({ id: 'msg' }); });
afterAll(async () => { await closePool(); });

const signupBody = { email: 'new@test.local', password: 'hunter2-secure' };

it('signup creates unverified user and triggers verify email', async () => {
  const r = await request(app).post('/api/auth/signup').send(signupBody);
  expect(r.status).toBe(201);
  expect(r.body.verifyRequired).toBe(true);
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const { rowCount } = await pool.query(
    `SELECT 1 FROM users WHERE email = $1 AND email_verified = FALSE`,
    [signupBody.email],
  );
  expect(rowCount).toBe(1);
});

it('signup duplicate email returns 409', async () => {
  await request(app).post('/api/auth/signup').send(signupBody);
  const r = await request(app).post('/api/auth/signup').send(signupBody);
  expect(r.status).toBe(409);
  expect(r.body.error).toBe('email_already_registered');
});

it('signup creates a pending-approval user (admin must enable)', async () => {
  const r = await request(app).post('/api/auth/signup').send(signupBody);
  expect(r.status).toBe(201);
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM users WHERE email = $1`,
    [signupBody.email],
  );
  expect(rows[0].status).toBe('pending');
});

it('login blocked when email not verified', async () => {
  const { email, password } = { email: 'unver@test.local', password: 'pwd-test-1234' };
  await signupUserInDb(email, password, false);
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('email_not_verified');
});

it('login succeeds for verified user, returns access + refresh + user', async () => {
  const u = await verifiedAthleteUser();
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(200);
  expect(typeof r.body.accessToken).toBe('string');
  expect(typeof r.body.refreshToken).toBe('string');
  expect(r.body.user.email).toBe(u.email);
  expect(r.body.user.role).toBe('athlete');
});

it('login blocked when account is pending approval', async () => {
  const u = await verifiedAthleteUser('pending@test.local');
  await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.error).toBe('blocked');
  expect(r.body.reason).toBe('not_approved');
});

it('login blocked when account is rejected', async () => {
  const u = await verifiedAthleteUser('rejected@test.local');
  await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [u.id]);
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.error).toBe('blocked');
  expect(r.body.reason).toBe('rejected');
});

it('login blocked when athlete approved but membership expired', async () => {
  const u = await verifiedAthleteUser('expmem@test.local');
  await pool.query(
    `UPDATE memberships SET paid_until = now() - interval '1 day', status='expired' WHERE user_id=$1`,
    [u.id],
  );
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('not_approved');
});

it('login blocked when athlete approved but has no membership', async () => {
  const u = await verifiedAthleteUser('nomem@test.local');
  await pool.query(`DELETE FROM memberships WHERE user_id=$1`, [u.id]);
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('not_approved');
});

it('refresh blocked after athlete membership expires', async () => {
  const u = await verifiedAthleteUser('refexp@test.local');
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  const refreshTok = loginR.body.refreshToken;
  await pool.query(
    `UPDATE memberships SET paid_until = now() - interval '1 day', status='expired' WHERE user_id=$1`,
    [u.id],
  );
  const r = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshTok });
  expect(r.status).toBe(401);
});

it('login succeeds again after a rejected account is re-approved', async () => {
  const u = await verifiedAthleteUser('reapprove@test.local');
  await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [u.id]);
  const blocked = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(blocked.status).toBe(403);
  await pool.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [u.id]);
  const ok = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(ok.status).toBe(200);
  expect(typeof ok.body.accessToken).toBe('string');
});

it('verified-but-unverified-email takes precedence over status gate', async () => {
  // A brand-new signup is both unverified AND pending; the email gate fires first.
  const { email, password } = { email: 'unver-pending@test.local', password: 'pwd-test-1234' };
  const { id } = await signupUserInDb(email, password, false);
  await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [id]);
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(403);
  expect(r.body.reason).toBe('email_not_verified');
});

it('login wrong password returns 401 invalid_credentials', async () => {
  const u = await verifiedAthleteUser();
  const r = await request(app).post('/api/auth/login').send({ email: u.email, password: 'wrong-pass-xx' });
  expect(r.status).toBe(401);
  expect(r.body.error).toBe('invalid_credentials');
});

it('refresh rotates token: B→C works, then reuse B revokes family', async () => {
  const u = await verifiedAthleteUser();
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  const refreshA = loginR.body.refreshToken;

  const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshA });
  expect(r1.status).toBe(200);
  const refreshB = r1.body.refreshToken;
  expect(refreshB).not.toBe(refreshA);

  const r2 = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshB });
  expect(r2.status).toBe(200);
  const refreshC = r2.body.refreshToken;

  // Reuse B (already rotated) → should detect reuse, revoke family
  const r3 = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshB });
  expect(r3.status).toBe(401);
  expect(r3.body.reason).toBe('reuse_detected');

  // C should now also fail (whole family revoked)
  const r4 = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshC });
  expect(r4.status).toBe(401);
});

it('logout revokes refresh token', async () => {
  const u = await verifiedAthleteUser();
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  const refreshToken = loginR.body.refreshToken;

  const out = await request(app).post('/api/auth/logout').send({ refreshToken });
  expect(out.status).toBe(204);

  const after = await request(app).post('/api/auth/refresh').send({ refreshToken });
  expect(after.status).toBe(401);
});

it('verify-email marks user verified, second click 400 used', async () => {
  const { id, verifyToken } = await signupUserInDb('vmark@test.local', 'pwd-test-1234', false);
  const r = await request(app).get(`/api/auth/verify-email?token=${verifyToken}`);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toMatch(/html/);

  const u = await pool.query(`SELECT email_verified FROM users WHERE id = $1`, [id]);
  expect(u.rows[0].email_verified).toBe(true);

  const r2 = await request(app).get(`/api/auth/verify-email?token=${verifyToken}`);
  expect(r2.status).toBe(400);
});

it('forgot-password always returns 200 (anti-enum), sends email if user exists', async () => {
  await verifiedAthleteUser('exists@test.local');
  const r1 = await request(app).post('/api/auth/forgot-password').send({ email: 'exists@test.local' });
  expect(r1.status).toBe(200);
  expect(r1.body.message).toBe('if account exists, code sent');
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  // Email should contain a 6-digit code (not a link)
  const call = resendMod.__mockSend.mock.calls[0]?.[0] as unknown as { html: string };
  expect(call.html).toMatch(/\d{6}/);

  resendMod.__mockSend.mockClear();
  const r2 = await request(app).post('/api/auth/forgot-password').send({ email: 'nope@test.local' });
  expect(r2.status).toBe(200);
  expect(resendMod.__mockSend).not.toHaveBeenCalled();
});

// Helper: seed a known OTP code into password_resets bypassing bcrypt via known code
async function seedKnownCode(userId: string, code: string): Promise<void> {
  const bcryptMod = await import('bcrypt');
  const { expiresIn, RESET_TOKEN_TTL_MS } = await import('../../src/services/verification.service.js');
  const codeHash = await bcryptMod.default.hash(code, 10);
  await pool.query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresIn(RESET_TOKEN_TTL_MS)],
  );
}

it('verify-reset-code: valid code returns { valid: true } without consuming', async () => {
  const u = await verifiedAthleteUser('vrcode@test.local');
  const code = '654321';
  await seedKnownCode(u.id, code);

  const r = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: u.email, code });
  expect(r.status).toBe(200);
  expect(r.body.valid).toBe(true);

  // Code should still be usable (not consumed)
  const r2 = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: u.email, code });
  expect(r2.status).toBe(200);
});

it('verify-reset-code: wrong code returns 400 invalid_code with attemptsLeft', async () => {
  const u = await verifiedAthleteUser('vrcode2@test.local');
  await seedKnownCode(u.id, '777777');

  const r = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: u.email, code: '000000' });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('invalid_code');
  expect(typeof r.body.attemptsLeft).toBe('number');
  expect(r.body.attemptsLeft).toBe(4);
});

it('verify-reset-code: 5 wrong attempts returns 410 code_expired', async () => {
  const u = await verifiedAthleteUser('vrcode3@test.local');
  await seedKnownCode(u.id, '888888');

  for (let i = 0; i < 4; i++) {
    await request(app)
      .post('/api/auth/verify-reset-code')
      .send({ email: u.email, code: '000000' });
  }
  // 5th wrong attempt — should expire the code
  const r = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: u.email, code: '000000' });
  expect(r.status).toBe(410);
  expect(r.body.error).toBe('code_expired');

  // Subsequent correct code also fails (row consumed)
  const r2 = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: u.email, code: '888888' });
  expect(r2.status).toBe(410);
});

it('verify-reset-code: unknown email returns 410 code_expired (anti-enum)', async () => {
  const r = await request(app)
    .post('/api/auth/verify-reset-code')
    .send({ email: 'nobody@test.local', code: '123456' });
  expect(r.status).toBe(410);
  expect(r.body.error).toBe('code_expired');
});

it('reset-password: OTP flow — changes password, revokes tokens, returns auth result', async () => {
  const u = await verifiedAthleteUser('resetotp@test.local');

  // First login → get a refresh token
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(loginR.status).toBe(200);
  const oldRefresh = loginR.body.refreshToken;

  const code = '246810';
  await seedKnownCode(u.id, code);

  const r = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: u.email, code, newPassword: 'newpass-secure99' });
  expect(r.status).toBe(200);
  expect(typeof r.body.accessToken).toBe('string');
  expect(typeof r.body.refreshToken).toBe('string');
  expect(r.body.user.email).toBe(u.email);
  expect(r.body.user.role).toBe('athlete');

  // Old refresh token revoked (anti-takeover)
  const after = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
  expect(after.status).toBe(401);

  // New token from reset response works
  const afterRefresh = await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: r.body.refreshToken });
  expect(afterRefresh.status).toBe(200);

  // Old password fails, new password works
  const failOld = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(failOld.status).toBe(401);
  const okNew = await request(app).post('/api/auth/login').send({ email: u.email, password: 'newpass-secure99' });
  expect(okNew.status).toBe(200);
});

it('reset-password: wrong code returns 400 invalid_code with attemptsLeft', async () => {
  const u = await verifiedAthleteUser('resetwrong@test.local');
  await seedKnownCode(u.id, '135790');

  const r = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: u.email, code: '000000', newPassword: 'newpass-secure99' });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('invalid_code');
  expect(r.body.attemptsLeft).toBe(4);
});

it('reset-password: code already consumed returns 410 code_expired', async () => {
  const u = await verifiedAthleteUser('resetconsumed@test.local');
  const code = '112233';
  await seedKnownCode(u.id, code);

  // Consume the code with a successful reset
  await request(app)
    .post('/api/auth/reset-password')
    .send({ email: u.email, code, newPassword: 'newpass-secure99' });

  // Second attempt same code → 410
  const r2 = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: u.email, code, newPassword: 'another-pass-99' });
  expect(r2.status).toBe(410);
  expect(r2.body.error).toBe('code_expired');
});

it('reset-password: weak password returns 400 weak_password', async () => {
  const u = await verifiedAthleteUser('resetweak@test.local');
  await seedKnownCode(u.id, '999888');

  const r = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: u.email, code: '999888', newPassword: 'short' });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('weak_password');
});

it('reset-password: non-athlete gets 403 not_athlete and code is burned', async () => {
  // Create an admin user (non-athlete) with email_verified = true
  const bcryptMod = await import('bcrypt');
  const coachEmail = `admin-reset-${Date.now()}@test.local`;
  const coachPass = 'admin-pass-1234';
  const coachHash = await bcryptMod.default.hash(coachPass, 4);
  const { rows: coachRows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
     VALUES ($1, $2, 'admin', TRUE, NOW()) RETURNING id`,
    [coachEmail, coachHash],
  );
  const coachId = coachRows[0].id;

  const code = '567890';
  await seedKnownCode(coachId, code);

  const r = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: coachEmail, code, newPassword: 'newpass-secure99' });
  expect(r.status).toBe(403);
  expect(r.body.error).toBe('not_athlete');

  // Verify the code row was burned (used_at is non-null) despite the error
  const { rows } = await pool.query<{ used_at: string | null }>(
    `SELECT used_at FROM password_resets WHERE user_id = $1`,
    [coachId],
  );
  expect(rows[0].used_at).not.toBeNull();
});

it('rate-limit kicks in on 11th login attempt within window', async () => {
  process.env.RATE_LIMIT_TEST = 'on';
  // Re-import app after enabling rate limit
  const fresh = await import('../../src/app.js?rateLimitFresh' + Date.now());
  const appWithLimit = (fresh as { default: typeof app }).default;
  try {
    const u = await verifiedAthleteUser('limit@test.local');
    // Burn 10 attempts (any pattern; mix of correct and incorrect doesn't matter)
    for (let i = 0; i < 10; i++) {
      await request(appWithLimit)
        .post('/api/auth/login')
        .send({ email: u.email, password: 'wrong-pass-xx' });
    }
    const r = await request(appWithLimit)
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
  } finally {
    delete process.env.RATE_LIMIT_TEST;
  }
});

it('E2E happy path: signup → verify → admin approves → login → /api/athlete/me', async () => {
  const r1 = await request(app).post('/api/auth/signup').send({
    email: 'e2e@test.local', password: 'pwd-test-1234',
  });
  expect(r1.status).toBe(201);

  // We can't reverse the hash from signup's email_verifications row.
  // Inject a new token directly to simulate clicking the verify link.
  const { generateToken: gen, hashToken: hash } =
    await import('../../src/services/verification.service.js');
  const plain = gen();
  await pool.query(
    `UPDATE email_verifications SET token_hash = $1
       WHERE user_id = $2 AND used_at IS NULL`,
    [hash(plain), r1.body.userId],
  );

  const r2 = await request(app).get(`/api/auth/verify-email?token=${plain}`);
  expect(r2.status).toBe(200);

  // Signups start 'pending'; an admin enables the account (manual-payment flow):
  // approve + grant an active membership (both access axes).
  await pool.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [r1.body.userId]);
  await pool.query(
    `INSERT INTO memberships (user_id, status, paid_until) VALUES ($1, 'active', 'infinity')
     ON CONFLICT (user_id) DO NOTHING`,
    [r1.body.userId],
  );

  const r3 = await request(app).post('/api/auth/login').send({
    email: 'e2e@test.local', password: 'pwd-test-1234',
  });
  expect(r3.status).toBe(200);
  const access = r3.body.accessToken;

  const r4 = await request(app).get('/api/athlete/me').set('Authorization', `Bearer ${access}`);
  expect(r4.status).toBe(200);
});
