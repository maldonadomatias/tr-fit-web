// backend/tests/integration/platform-fee-service.test.ts
import pool from '../../src/db/connect.js';
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import {
  createAdmin,
  createAthlete,
  setMembership,
} from './helpers/fixtures.js';
import {
  getConfig,
  updateConfig,
  getActiveAthleteRevenue,
  computeCurrent,
  previewAdjustment,
  applyAdjustment,
  snapshotMonth,
  getHistory,
  recordCurrentPayment,
} from '../../src/services/platform-fee.service.js';
import { setAthleteMonthlyFee } from '../../src/services/admin.service.js';

// resetDatabase() (shared helper) does not truncate the platform-fee tables, so
// reset them here to keep each test isolated from prior config mutations and
// history snapshots, restoring the migration-seeded config row.
async function resetPlatformFee(): Promise<void> {
  await pool.query('TRUNCATE TABLE platform_fee_history RESTART IDENTITY');
  await pool.query('DELETE FROM platform_fee_config');
  await pool.query(
    `INSERT INTO platform_fee_config
       (id, base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
        revenue_share_pct, adjustment_interval_months, next_adjustment_date)
     VALUES (1, 105000, 1420, 1500, 25000, 4, 3, '2026-10-01')`
  );
}

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  await resetPlatformFee();
});
afterAll(async () => {
  await closePool();
});

describe('platform fee service', () => {
  it('getConfig returns the seeded row', async () => {
    const c = await getConfig();
    expect(c.base_fee_ars).toBe(105000);
    expect(c.reference_usd).toBe(1420);
    expect(c.next_adjustment_date).toBe('2026-10-01');
  });

  it('getActiveAthleteRevenue counts only approved athletes with active membership', async () => {
    const coach = await createAdmin();
    await createAthlete(coach); // active membership (infinity) via fixture
    await createAthlete(coach);
    const expired = await createAthlete(coach);
    await setMembership(expired, '2000-01-01T00:00:00.000Z', 'expired');
    const rev = await getActiveAthleteRevenue();
    expect(rev.count).toBe(2);
    expect(rev.grossArs).toBe(50000);
  });

  it('computeCurrent applies base + 4% on gross', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await createAthlete(coach);
    const s = await computeCurrent('2026-06-24');
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(50000);
    expect(s.revenue_share_ars).toBe(2000);
    expect(s.total_ars).toBe(107000);
    expect(s.adjustment_due).toBe(false);
  });

  it('computeCurrent sums per-athlete fees for the 4%', async () => {
    const coach = await createAdmin();
    const a1 = await createAthlete(coach);
    const a2 = await createAthlete(coach);
    await setAthleteMonthlyFee(a1, 23000, coach);
    await setAthleteMonthlyFee(a2, 28000, coach);
    const s = await computeCurrent('2026-06-24');
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(51000);
    expect(s.revenue_share_ars).toBe(2040);
    expect(s.total_ars).toBe(107040);
  });

  it('computeCurrent flags adjustment_due when the date has arrived', async () => {
    const s = await computeCurrent('2026-10-01');
    expect(s.adjustment_due).toBe(true);
  });

  it('testflight phase charges 50% base and no 4% share', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await createAthlete(coach);
    await updateConfig({ phase: 'testflight' });
    const s = await computeCurrent('2026-06-24');
    expect(s.phase).toBe('testflight');
    expect(s.base_fee_ars).toBe(52500);
    expect(s.revenue_share_ars).toBe(0);
    expect(s.total_ars).toBe(52500);
    expect(s.gross_revenue_ars).toBe(50000);
  });

  it('previewAdjustment does not mutate config', async () => {
    const p = await previewAdjustment(1500);
    expect(p.new_base_fee_ars).toBe(110915.49);
    expect((await getConfig()).base_fee_ars).toBe(105000);
  });

  it('applyAdjustment scales base, rolls reference usd and bumps the date', async () => {
    const c = await applyAdjustment(1500);
    expect(c.base_fee_ars).toBe(110915.49);
    expect(c.reference_usd).toBe(1500);
    expect(c.current_usd).toBe(1500);
    expect(c.next_adjustment_date).toBe('2027-01-01');
  });

  it('updateConfig patches whitelisted fields only', async () => {
    const c = await updateConfig({
      price_per_athlete_ars: 30000,
      revenue_share_pct: 5,
    });
    expect(c.price_per_athlete_ars).toBe(30000);
    expect(c.revenue_share_pct).toBe(5);
    expect(c.base_fee_ars).toBe(105000);
  });

  it('snapshotMonth is idempotent per period', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await snapshotMonth('2026-05-01');
    await snapshotMonth('2026-05-01');
    const h = await getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].period).toBe('2026-05-01');
    expect(h[0].total_ars).toBe(106000);
  });

  it('includes the recorded payment in monthly history', async () => {
    const coach = await createAdmin();
    await snapshotMonth('2026-06-01');
    await recordCurrentPayment(coach, '2026-06-24');

    const h = await getHistory();

    expect(h[0]).toMatchObject({
      period: '2026-06-01',
      paid_total_ars: 105000,
      paid_at: expect.any(String),
    });
  });
});
