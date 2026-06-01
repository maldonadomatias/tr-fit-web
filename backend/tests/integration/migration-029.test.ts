export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 029 memberships + payments', () => {
  it('memberships and payments tables exist', async () => {
    const reg = await pool.query(
      `SELECT to_regclass('public.memberships') AS m, to_regclass('public.payments') AS p`,
    );
    expect(reg.rows[0].m).toBe('memberships');
    expect(reg.rows[0].p).toBe('payments');
  });

  it('rejects invalid membership status', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','athlete') RETURNING id`,
      [`m-${Date.now()}@t.local`],
    );
    await expect(
      pool.query(
        `INSERT INTO memberships (user_id, status, paid_until) VALUES ($1,'bogus', now())`,
        [u.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it('payments ledger accepts a transfer row', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','athlete') RETURNING id`,
      [`p-${Date.now()}@t.local`],
    );
    const r = await pool.query(
      `INSERT INTO payments (user_id, paid_at, amount, method, covers_until)
       VALUES ($1, current_date, 25000, 'transfer', now() + interval '30 days') RETURNING id`,
      [u.rows[0].id],
    );
    expect(r.rows[0].id).toBeDefined();
  });

  it('backfills approved athletes with an infinity membership', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1,'x','athlete','approved') RETURNING id`,
      [`bf-${Date.now()}@t.local`],
    );
    await pool.query(
      `INSERT INTO memberships (user_id, status, started_at, paid_until)
       SELECT id, 'active', now(), 'infinity'::timestamptz
       FROM users WHERE id = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [u.rows[0].id],
    );
    const m = await pool.query<{ status: string; paid_until: unknown }>(
      `SELECT status, paid_until FROM memberships WHERE user_id = $1`, [u.rows[0].id],
    );
    expect(m.rows[0].status).toBe('active');
    // node-postgres parses 'infinity'::timestamptz to the JS number Infinity.
    expect(m.rows[0].paid_until).toBe(Infinity);
  });
});
