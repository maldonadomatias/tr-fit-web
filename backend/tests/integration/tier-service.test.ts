export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { hasTier, getUserTier } = await import('../../src/services/tier.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('hasTier', () => {
  it('basico does not satisfy full', () => {
    expect(hasTier('basico', 'full')).toBe(false);
  });
  it('full satisfies full', () => {
    expect(hasTier('full', 'full')).toBe(true);
  });
  it('premium satisfies full', () => {
    expect(hasTier('premium', 'full')).toBe(true);
  });
  it('basico satisfies basico', () => {
    expect(hasTier('basico', 'basico')).toBe(true);
  });
  it('full does not satisfy premium', () => {
    expect(hasTier('full', 'premium')).toBe(false);
  });
});

describe('getUserTier', () => {
  it('returns plan_interest for existing athlete', async () => {
    const coach = await createCoach();
    const athleteId = await createAthlete(coach);
    const tier = await getUserTier(athleteId);
    expect(tier).toBe('full');
  });

  it('returns null for user without profile', async () => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('np@t.local','x','athlete') RETURNING id`,
    );
    const tier = await getUserTier(r.rows[0].id);
    expect(tier).toBeNull();
  });
});
