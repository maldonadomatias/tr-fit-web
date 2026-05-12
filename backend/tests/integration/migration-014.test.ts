export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 014 — body_weight_kg', () => {
  it('accepts valid body_weight_kg', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('bw1@t.local','x','athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO athlete_measurements (athlete_id, body_weight_kg, source)
       VALUES ($1, 75.5, 'onboarding')`, [u[0].id],
    );
    const r = await pool.query<{ body_weight_kg: string | null }>(
      `SELECT body_weight_kg FROM athlete_measurements WHERE athlete_id = $1`,
      [u[0].id],
    );
    expect(Number(r.rows[0].body_weight_kg)).toBe(75.5);
  });

  it('rejects body_weight_kg below 30', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('bw2@t.local','x','athlete') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO athlete_measurements (athlete_id, body_weight_kg, source)
         VALUES ($1, 25, 'onboarding')`, [u[0].id],
      ),
    ).rejects.toThrow();
  });

  it('rejects body_weight_kg above 300', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('bw3@t.local','x','athlete') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO athlete_measurements (athlete_id, body_weight_kg, source)
         VALUES ($1, 350, 'onboarding')`, [u[0].id],
      ),
    ).rejects.toThrow();
  });

  it('NULL body_weight_kg allowed', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('bw4@t.local','x','athlete') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO athlete_measurements (athlete_id, chest_cm, source)
         VALUES ($1, 100, 'onboarding')`, [u[0].id],
      ),
    ).resolves.not.toThrow();
  });
});
