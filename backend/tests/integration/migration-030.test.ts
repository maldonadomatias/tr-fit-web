export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 030 exercise_minutes options', () => {
  it('accepts the new 105 and 120 values', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await expect(
      pool.query(`UPDATE athlete_profiles SET exercise_minutes = 105 WHERE user_id = $1`, [a]),
    ).resolves.toBeDefined();
    await expect(
      pool.query(`UPDATE athlete_profiles SET exercise_minutes = 120 WHERE user_id = $1`, [a]),
    ).resolves.toBeDefined();
  });

  it('still accepts legacy values (existing profiles unaffected)', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await expect(
      pool.query(`UPDATE athlete_profiles SET exercise_minutes = 90 WHERE user_id = $1`, [a]),
    ).resolves.toBeDefined();
  });

  it('rejects an off-list value', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await expect(
      pool.query(`UPDATE athlete_profiles SET exercise_minutes = 100 WHERE user_id = $1`, [a]),
    ).rejects.toThrow();
  });
});
