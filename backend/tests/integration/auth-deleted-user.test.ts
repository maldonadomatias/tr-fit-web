export {};
// requireAuth must reject tokens whose user no longer exists (deleted) or was
// rejected (disabled) — with a 401 at the middleware, not an FK crash deep in
// each route. Regression guard for the production crash in POST /api/push/register.
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, verifiedAthleteUser } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function deletedAthleteToken(): Promise<string> {
  const u = await verifiedAthleteUser();
  const token = signToken({ id: u.id, role: 'athlete' });
  await pool.query(`DELETE FROM users WHERE id = $1`, [u.id]);
  return token;
}

describe('requireAuth with a deleted user', () => {
  it('returns 401 on an athlete route (GET /api/profile/status)', async () => {
    const token = await deletedAthleteToken();
    const r = await request(app)
      .get('/api/profile/status')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });

  it('returns 401 on POST /api/push/register (the original crash site)', async () => {
    const token = await deletedAthleteToken();
    const r = await request(app)
      .post('/api/push/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'ExponentPushToken[deleted-user]', platform: 'ios' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });

  it('returns 401 on an admin route when the admin was deleted', async () => {
    const adminId = await createAdmin();
    const token = signToken({ id: adminId, role: 'admin' });
    await pool.query(`DELETE FROM users WHERE id = $1`, [adminId]);
    const r = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });
});

describe('requireAuth with a rejected (disabled) user', () => {
  it('returns 401 even though the JWT is still valid', async () => {
    const u = await verifiedAthleteUser();
    const token = signToken({ id: u.id, role: 'athlete' });
    await pool.query(`UPDATE users SET status = 'rejected' WHERE id = $1`, [u.id]);
    const r = await request(app)
      .get('/api/profile/status')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('invalid_token');
  });
});

describe('requireAuth with a live user (no over-blocking)', () => {
  it('still lets an approved athlete through', async () => {
    const u = await verifiedAthleteUser();
    const token = signToken({ id: u.id, role: 'athlete' });
    const r = await request(app)
      .get('/api/profile/status')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ has_profile: false });
  });

  it('still lets an admin through', async () => {
    const adminId = await createAdmin();
    const token = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
  });
});
