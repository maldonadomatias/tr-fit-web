export {};
// Force logout: an admin revokes every active refresh token of a user via
// POST /api/admin/users/:id/force-logout. The user's sessions die at the next
// token refresh (their short-lived access token expires on its own).
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

describe('POST /api/admin/users/:id/force-logout', () => {
  it('revokes every active refresh token so the next refresh fails', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();

    // Two sessions = two devices
    const s1 = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    const s2 = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    expect(s1.status).toBe(200);
    expect(s2.status).toBe(200);

    const r = await request(app)
      .post(`/api/admin/users/${u.id}/force-logout`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);

    // Both sessions are dead at refresh time
    const ref1 = await request(app).post('/api/auth/refresh').send({ refreshToken: s1.body.refreshToken });
    const ref2 = await request(app).post('/api/auth/refresh').send({ refreshToken: s2.body.refreshToken });
    expect(ref1.status).toBe(401);
    expect(ref2.status).toBe(401);

    // No token left un-revoked in the DB
    const live = await pool.query(
      `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
      [u.id],
    );
    expect(live.rows[0].n).toBe(0);

    // Action was audited
    const audit = await pool.query<{ type: string }>(
      `SELECT type FROM admin_audit_log WHERE target_id = $1 AND type = 'force_logout'`,
      [u.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('the user can log in again afterwards (new session works)', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const u = await verifiedAthleteUser();
    await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });

    await request(app)
      .post(`/api/admin/users/${u.id}/force-logout`)
      .set('Authorization', `Bearer ${adminTok}`);

    const again = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    expect(again.status).toBe(200);
    const ref = await request(app).post('/api/auth/refresh').send({ refreshToken: again.body.refreshToken });
    expect(ref.status).toBe(200);
  });

  it('an admin cannot force logout themselves', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .post(`/api/admin/users/${adminId}/force-logout`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('cannot_force_logout_self');
  });

  it('returns 404 for an unknown user', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const r = await request(app)
      .post(`/api/admin/users/00000000-0000-0000-0000-000000000000/force-logout`)
      .set('Authorization', `Bearer ${adminTok}`);
    expect(r.status).toBe(404);
  });

  it('a non-admin cannot force logout anyone', async () => {
    const u = await verifiedAthleteUser();
    const victim = await verifiedAthleteUser();
    const athleteTok = signToken({ id: u.id, role: 'athlete' });
    const r = await request(app)
      .post(`/api/admin/users/${victim.id}/force-logout`)
      .set('Authorization', `Bearer ${athleteTok}`);
    expect(r.status).toBe(403);
  });
});
