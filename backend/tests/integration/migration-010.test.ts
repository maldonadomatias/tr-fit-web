export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 010 — plan_interest', () => {
  it('column exists on athlete_profiles', async () => {
    const r = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'athlete_profiles' AND column_name = 'plan_interest'`,
    );
    expect(r.rowCount).toBe(1);
  });

  it('accepts NULL (no active subscription)', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('pi1@t.local', 'x', 'athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries)
       VALUES ($1,'T','male',30,175,75,'intermedio','hipertrofia',4,'gym_completo','{}')`,
      [u[0].id],
    );
    const r = await pool.query<{ plan_interest: string | null }>(
      `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`, [u[0].id],
    );
    expect(r.rows[0].plan_interest).toBeNull();
  });

  it('accepts valid tier values', async () => {
    for (const tier of ['basico', 'full', 'premium']) {
      const { rows: u } = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, 'x', 'athlete') RETURNING id`,
        [`pi-${tier}@t.local`],
      );
      await pool.query(
        `INSERT INTO athlete_profiles
           (user_id, name, gender, age, height_cm, weight_kg, level, goal,
            days_per_week, equipment, injuries, plan_interest)
         VALUES ($1,'T','male',30,175,75,'intermedio','hipertrofia',4,'gym_completo','{}', $2)`,
        [u[0].id, tier],
      );
    }
    const r = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM athlete_profiles WHERE plan_interest IN ('basico','full','premium')`,
    );
    expect(parseInt(r.rows[0].n, 10)).toBe(3);
  });

  it('rejects invalid tier value', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('pi-bad@t.local', 'x', 'athlete') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO athlete_profiles
           (user_id, name, gender, age, height_cm, weight_kg, level, goal,
            days_per_week, equipment, injuries, plan_interest)
         VALUES ($1,'T','male',30,175,75,'intermedio','hipertrofia',4,'gym_completo','{}','bogus')`,
        [u[0].id],
      ),
    ).rejects.toThrow();
  });
});
