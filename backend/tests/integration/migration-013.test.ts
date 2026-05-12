export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 013 — push notifications', () => {
  it('push_tokens table exists with unique token constraint', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('p1@t.local','x','athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, 'abc123', 'android')`, [u[0].id],
    );
    await expect(
      pool.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'abc123', 'ios')`, [u[0].id],
      ),
    ).rejects.toThrow();
  });

  it('notification_log accepts valid type and rejects invalid', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('p2@t.local','x','athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO notification_log (user_id, type, delivery_status)
       VALUES ($1, 'session_reminder', 'sent')`, [u[0].id],
    );
    await expect(
      pool.query(
        `INSERT INTO notification_log (user_id, type, delivery_status)
         VALUES ($1, 'bogus_type', 'sent')`, [u[0].id],
      ),
    ).rejects.toThrow();
  });

  it('users.timezone defaults to Argentina', async () => {
    const { rows: u } = await pool.query<{ timezone: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('p3@t.local','x','athlete')
       RETURNING timezone`,
    );
    expect(u[0].timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('users.notification_prefs has all 6 keys true by default', async () => {
    const { rows: u } = await pool.query<{ notification_prefs: Record<string, boolean> }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('p4@t.local','x','athlete')
       RETURNING notification_prefs`,
    );
    expect(u[0].notification_prefs).toEqual({
      session_reminder: true,
      session_missed: true,
      week_start: true,
      skeleton_approved: true,
      sos_resolved: true,
      rm_test_week: true,
    });
  });

  it('push_tokens cascades on user delete', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('p5@t.local','x','athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, 'tok5', 'ios')`, [u[0].id],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [u[0].id]);
    const r = await pool.query(
      `SELECT 1 FROM push_tokens WHERE token = 'tok5'`,
    );
    expect(r.rowCount).toBe(0);
  });
});
