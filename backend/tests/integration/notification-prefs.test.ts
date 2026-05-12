export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function makeAthlete() {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'x', 'athlete') RETURNING id`,
    [`n-${Date.now()}-${Math.random()}@t.local`],
  );
  return rows[0].id;
}

describe('PATCH /api/profile/notification-prefs', () => {
  it('merges partial update', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const r = await request(app)
      .patch('/api/profile/notification-prefs')
      .set('Authorization', `Bearer ${tok}`)
      .send({ session_reminder: false });
    expect(r.status).toBe(200);
    const row = await pool.query<{ notification_prefs: Record<string, boolean> }>(
      `SELECT notification_prefs FROM users WHERE id=$1`, [u],
    );
    expect(row.rows[0].notification_prefs.session_reminder).toBe(false);
    expect(row.rows[0].notification_prefs.week_start).toBe(true);
  });

  it('rejects unknown key', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const r = await request(app)
      .patch('/api/profile/notification-prefs')
      .set('Authorization', `Bearer ${tok}`)
      .send({ bogus: true });
    expect(r.status).toBe(400);
  });

  it('returns updated prefs in response body', async () => {
    const u = await makeAthlete();
    const tok = signToken({ id: u, role: 'athlete' });
    const r = await request(app)
      .patch('/api/profile/notification-prefs')
      .set('Authorization', `Bearer ${tok}`)
      .send({ week_start: false });
    expect(r.body.notification_prefs.week_start).toBe(false);
  });
});
