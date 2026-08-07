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
  getAthleteBillingRevenue,
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

  it('getActiveAthleteRevenue counts only athletes paid for the current month', async () => {
    const coach = await createAdmin();
    await createAthlete(coach); // infinity → paid this month
    await createAthlete(coach);
    const expired = await createAthlete(coach);
    await setMembership(expired, '2000-01-01T00:00:00.000Z', 'expired');
    const rev = await getActiveAthleteRevenue('2026-06-24');
    expect(rev.count).toBe(2);
    expect(rev.grossArs).toBe(50000);
  });

  it('invoice bills previous month real; collection tracks current month', async () => {
    const coach = await createAdmin();
    // Paid for June only (covers into July, not full July → not July real)
    const juneOnly = await createAthlete(coach);
    await setMembership(juneOnly, '2026-07-15T00:00:00.000Z', 'active');
    // Paid through August → real for both June and July
    const both = await createAthlete(coach);
    await setMembership(both, '2026-08-15T00:00:00.000Z', 'active');
    // Unpaid / expired — estimated only
    const expired = await createAthlete(coach);
    await setMembership(expired, '2026-06-01T00:00:00.000Z', 'expired');
    const cancelled = await createAthlete(coach);
    await setMembership(cancelled, '2026-05-01T00:00:00.000Z', 'cancelled');

    // 5 July: invoice settles June (due 10 July); collection is July progress.
    const s = await computeCurrent('2026-07-05');
    expect(s.revenue_period).toBe('2026-06-01');
    expect(s.due_date).toBe('2026-07-10');
    expect(s.overdue).toBe(false);
    // June real: juneOnly + both
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(50000);
    expect(s.revenue_share_ars).toBe(2000);
    expect(s.total_ars).toBe(107000);
    // July collection: only `both` is real; 3 in estimated pool
    expect(s.estimated_athletes).toBe(3);
    expect(s.gross_estimated_ars).toBe(75000);
    expect(s.current_real_athletes).toBe(1);
    expect(s.current_real_ars).toBe(25000);
    expect(s.collection_pct).toBe(33.3);
  });

  it('invoice is overdue after the 10th if unpaid', async () => {
    const s = await computeCurrent('2026-07-11');
    expect(s.due_date).toBe('2026-07-10');
    expect(s.overdue).toBe(true);
  });

  it('computeCurrent applies base + 4% on previous month real', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await createAthlete(coach);
    const s = await computeCurrent('2026-06-24');
    // infinity memberships count as real for May (previous) and June (current)
    expect(s.revenue_period).toBe('2026-05-01');
    expect(s.active_athletes).toBe(2);
    expect(s.gross_revenue_ars).toBe(50000);
    expect(s.current_real_ars).toBe(50000);
    expect(s.gross_estimated_ars).toBe(50000);
    expect(s.collection_pct).toBe(100);
    expect(s.revenue_share_ars).toBe(2000);
    expect(s.total_ars).toBe(107000);
    expect(s.adjustment_due).toBe(false);
  });

  it('computeCurrent sums per-athlete fees for the 4% on previous month', async () => {
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

  it('prefers frozen history snapshot for the previous-month invoice', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await snapshotMonth('2026-05-01');
    // Add another athlete after snapshot — must not change May invoice
    await createAthlete(coach);
    const s = await computeCurrent('2026-06-15');
    expect(s.revenue_period).toBe('2026-05-01');
    expect(s.active_athletes).toBe(1);
    expect(s.gross_revenue_ars).toBe(25000);
    expect(s.total_ars).toBe(106000);
    // June collection includes both athletes
    expect(s.current_real_athletes).toBe(2);
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
    // Previous-month real still reported; share is zeroed in testflight
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

  it('records payment against the previous-month revenue period', async () => {
    const coach = await createAdmin();
    await snapshotMonth('2026-05-01');
    // Paying on 5 June settles May (due 10 June)
    const pay = await recordCurrentPayment(coach, '2026-06-05');
    expect(pay?.period).toBe('2026-05-01');

    const h = await getHistory();
    expect(h[0]).toMatchObject({
      period: '2026-05-01',
      paid_total_ars: 105000,
      paid_at: expect.any(String),
    });

    const s = await computeCurrent('2026-06-05');
    expect(s.overdue).toBe(false);
    // After payment, still not overdue even past the 10th
    const late = await computeCurrent('2026-06-15');
    expect(late.overdue).toBe(false);
  });
});
