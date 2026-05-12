export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function makeAthlete(email: string) {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','athlete') RETURNING id`,
    [email],
  );
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries)
     VALUES ($1,'T','male',30,175,75,'intermedio','hipertrofia',4,'gym_completo','{}')`,
    [u[0].id],
  );
  return u[0].id;
}

describe('migration 011 — subscriptions', () => {
  it('table exists', async () => {
    const r = await pool.query(
      `SELECT to_regclass('public.subscriptions') AS t`,
    );
    expect(r.rows[0].t).not.toBeNull();
  });

  it('inserts and reads a subscription row', async () => {
    const id = await makeAthlete('sub1@t.local');
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'full','pre-123','plan-abc','pending')`,
      [id],
    );
    const r = await pool.query<{ tier: string; status: string }>(
      `SELECT tier, status FROM subscriptions WHERE athlete_id = $1`, [id],
    );
    expect(r.rows[0]).toEqual({ tier: 'full', status: 'pending' });
  });

  it('rejects invalid status', async () => {
    const id = await makeAthlete('sub2@t.local');
    await expect(
      pool.query(
        `INSERT INTO subscriptions
           (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
         VALUES ($1,'full','pre-999','plan-abc','bogus')`,
        [id],
      ),
    ).rejects.toThrow();
  });

  it('ON DELETE CASCADE removes subscription when athlete deleted', async () => {
    const id = await makeAthlete('sub3@t.local');
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'basico','pre-del','plan-abc','pending')`,
      [id],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    const r = await pool.query(
      `SELECT 1 FROM subscriptions WHERE athlete_id = $1`, [id],
    );
    expect(r.rowCount).toBe(0);
  });

  it('mp_webhook_log deduplicates by event_id', async () => {
    await pool.query(
      `INSERT INTO mp_webhook_log (event_id, payload) VALUES ('evt-1', '{}')`,
    );
    await pool.query(
      `INSERT INTO mp_webhook_log (event_id, payload)
       VALUES ('evt-1', '{}') ON CONFLICT (event_id) DO NOTHING`,
    );
    const r = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM mp_webhook_log WHERE event_id = 'evt-1'`,
    );
    expect(parseInt(r.rows[0].n, 10)).toBe(1);
  });
});
