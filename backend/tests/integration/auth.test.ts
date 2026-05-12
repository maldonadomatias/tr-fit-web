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
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);

  resendMod.__mockSend.mockClear();
  const r2 = await request(app).post('/api/auth/forgot-password').send({ email: 'nope@test.local' });
  expect(r2.status).toBe(200);
  expect(resendMod.__mockSend).not.toHaveBeenCalled();
});

it('reset-password changes password and revokes all refresh tokens', async () => {
  const u = await verifiedAthleteUser('reset@test.local');

  // First login → get a refresh token
  const loginR = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  const oldRefresh = loginR.body.refreshToken;

  // Generate a reset token directly in DB (simulating user clicking forgot-password email link)
  const { generateToken: gen, hashToken: hash, expiresIn: ex, RESET_TOKEN_TTL_MS } =
    await import('../../src/services/verification.service.js');
  const plain = gen();
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [u.id, hash(plain), ex(RESET_TOKEN_TTL_MS)],
  );

  const r = await request(app)
    .post('/api/auth/reset-password')
    .send({ token: plain, newPassword: 'newpass-12345' });
  expect(r.status).toBe(200);

  // Old refresh token revoked
  const after = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
  expect(after.status).toBe(401);

  // Old password fails, new password works
  const failOld = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  expect(failOld.status).toBe(401);
  const okNew = await request(app).post('/api/auth/login').send({ email: u.email, password: 'newpass-12345' });
  expect(okNew.status).toBe(200);
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

it('E2E happy path: signup → verify → login → /api/athlete/me', async () => {
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

  const r3 = await request(app).post('/api/auth/login').send({
    email: 'e2e@test.local', password: 'pwd-test-1234',
  });
  expect(r3.status).toBe(200);
  const access = r3.body.accessToken;

  const r4 = await request(app).get('/api/athlete/me').set('Authorization', `Bearer ${access}`);
  expect(r4.status).toBe(200);
});
