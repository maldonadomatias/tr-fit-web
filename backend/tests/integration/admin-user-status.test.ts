export {};
// Verifies that the admin enablement flow is the single source of truth for
// account access: an admin toggles users.status via PATCH /api/admin/users/:id
// and the login gate immediately reflects the change (pending/rejected → 403,
// approved → 200). This closes the loop between admin enablement and login.
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const { createAdmin, signupUserInDb, setMembership } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const PWD = 'pwd-test-1234';

async function pendingVerifiedAthlete(email: string): Promise<string> {
  const { id } = await signupUserInDb(email, PWD, true); // verified
  await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [id]);
  return id;
}

describe('admin user-status enablement → login gate', () => {
  it('approving a pending athlete lets them log in', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const email = 'enable-me@test.local';
    const athleteId = await pendingVerifiedAthlete(email);

    // Pending → login blocked
    const blocked = await request(app).post('/api/auth/login').send({ email, password: PWD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.reason).toBe('not_approved');

    // Admin enables the account: approve status AND grant an active membership
    // (both axes required — approval alone no longer grants access).
    const patch = await request(app)
      .patch(`/api/admin/users/${athleteId}`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ status: 'approved' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('approved');
    await setMembership(athleteId, 'infinity', 'active');

    // Now login succeeds
    const ok = await request(app).post('/api/auth/login').send({ email, password: PWD });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.accessToken).toBe('string');

    // Enablement was audited
    const audit = await pool.query<{ type: string }>(
      `SELECT type FROM admin_audit_log WHERE target_id = $1 AND type = 'user_approved'`,
      [athleteId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('rejecting an approved athlete blocks their next login', async () => {
    const adminId = await createAdmin();
    const adminTok = signToken({ id: adminId, role: 'admin' });
    const email = 'disable-me@test.local';
    const { id: athleteId } = await signupUserInDb(email, PWD, true); // verified + approved (default)
    await setMembership(athleteId, 'infinity', 'active'); // active membership so "before" login passes

    const before = await request(app).post('/api/auth/login').send({ email, password: PWD });
    expect(before.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/admin/users/${athleteId}`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ status: 'rejected' });
    expect(patch.status).toBe(200);

    const after = await request(app).post('/api/auth/login').send({ email, password: PWD });
    expect(after.status).toBe(403);
    expect(after.body.reason).toBe('rejected');

    const audit = await pool.query<{ type: string }>(
      `SELECT type FROM admin_audit_log WHERE target_id = $1 AND type = 'user_rejected'`,
      [athleteId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('non-admin cannot change account status', async () => {
    const email = 'attacker@test.local';
    const { id: athleteId } = await signupUserInDb(email, PWD, true);
    const athleteTok = signToken({ id: athleteId, role: 'athlete' });

    const patch = await request(app)
      .patch(`/api/admin/users/${athleteId}`)
      .set('Authorization', `Bearer ${athleteTok}`)
      .send({ status: 'approved' });
    expect(patch.status).toBe(403);
  });
});
