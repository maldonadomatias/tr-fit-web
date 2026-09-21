import { jest } from '@jest/globals';

const emails: Array<{ email: string; newFee: number; downgraded: boolean }> =
  [];
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendCommunityRevisionEmail: async (o: {
    email: string;
    newFee: number;
    downgraded: boolean;
  }) => {
    emails.push(o);
  },
  sendVerifyEmail: async () => {},
  sendPasswordResetEmail: async () => {},
  sendCoachPainAlert: async () => {},
  sendMembershipExpiringEmail: async () => {},
  sendMembershipExpiredEmail: async () => {},
  sendAccountApprovedEmail: async () => {},
}));

const pool = (await import('../../src/db/connect.js')).default;
const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const svc = await import('../../src/services/platform-fee.service.js');
const { runPlatformFeeTick } =
  await import('../../src/workers/platform-fee-cron.js');

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  emails.length = 0;
});
afterAll(async () => {
  await closePool();
});

async function insertAd(
  fee: number,
  starts: string,
  ends: string
): Promise<void> {
  await pool.query(
    `INSERT INTO community_ads (brand_name, image_path, image_url, cta_label, cta_url, monthly_fee_ars, starts_on, ends_on)
     VALUES ('M', 'p', 'u', 'c', 'https://x.example', $1, $2, $3)`,
    [fee, starts, ends]
  );
}

describe('communityActiveForPeriod', () => {
  it('launch month counts', () => {
    expect(svc.communityActiveForPeriod('2026-10-20', '2026-10-01')).toBe(true);
    expect(svc.communityActiveForPeriod('2026-10-20', '2026-09-01')).toBe(
      false
    );
    expect(svc.communityActiveForPeriod(null, '2026-10-01')).toBe(false);
  });
});

describe('config', () => {
  it('exposes and updates community fields', async () => {
    const c0 = await svc.getConfig();
    expect(c0).toMatchObject({
      community_fee_ars: 30000,
      community_fallback_fee_ars: 40000,
      community_revision_threshold_ars: 50000,
      ad_share_pct: 15,
      community_launched_on: null,
      community_revision_applied_at: null,
    });
    const c1 = await svc.updateConfig({
      community_launched_on: '2026-10-01',
      ad_share_pct: 20,
    });
    expect(c1.community_launched_on).toBe('2026-10-01');
    expect(c1.ad_share_pct).toBe(20);
    const c2 = await svc.updateConfig({ community_launched_on: null });
    expect(c2.community_launched_on).toBeNull();
  });
});

describe('snapshotMonth with community', () => {
  it('module off: no community amounts', async () => {
    await insertAd(100000, '2026-10-01', '2026-10-31');
    await svc.snapshotMonth('2026-10-01');
    const [h] = await svc.getHistory();
    expect(h).toMatchObject({
      community_fee_ars: 0,
      ad_revenue_ars: 0,
      ad_share_ars: 0,
      total_ars: 105000,
    });
  });

  it('module on: adds community fee + 15% of ads to the total', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-20' });
    await insertAd(100000, '2026-10-01', '2026-10-31');
    await svc.snapshotMonth('2026-10-01');
    const [h] = await svc.getHistory();
    expect(h).toMatchObject({
      community_fee_ars: 30000,
      ad_revenue_ars: 100000,
      ad_share_ars: 15000,
      total_ars: 150000,
    });
  });
});

describe('computeCurrent with community', () => {
  it('invoice includes community fee and 15% of previous month ads', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    await insertAd(100000, '2026-10-01', '2026-10-31');
    const s = await svc.computeCurrent('2026-11-05');
    expect(s).toMatchObject({
      community_fee_ars: 30000,
      ad_revenue_ars: 100000,
      ad_share_pct: 15,
      ad_share_ars: 15000,
    });
    expect(s.total_ars).toBe(105000 + 30000 + 15000);
  });
  it('module off: zeroes', async () => {
    const s = await svc.computeCurrent('2026-11-05');
    expect(s).toMatchObject({
      community_fee_ars: 0,
      ad_revenue_ars: 0,
      ad_share_ars: 0,
      total_ars: 105000,
    });
  });
});

describe('applyAdjustment', () => {
  it('scales community amounts with the same factor as the base', async () => {
    const c = await svc.applyAdjustment(1500); // factor 1500 / 1420
    expect(c.base_fee_ars).toBe(110915.49);
    expect(c.community_fee_ars).toBe(31690.14);
    expect(c.community_fallback_fee_ars).toBe(42253.52);
    expect(c.community_revision_threshold_ars).toBe(52816.9);
  });
});

async function adminUser(): Promise<void> {
  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('boss@t.local', 'x', 'superadmin')`
  );
}

async function history(period: string, adRevenue: number): Promise<void> {
  await pool.query(
    `INSERT INTO platform_fee_history (period, base_fee_ars, active_athletes, price_per_athlete_ars,
       gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars, usd_at_snapshot, ad_revenue_ars)
     VALUES ($1, 0, 0, 0, 0, 4, 0, 0, 1420, $2)`,
    [period, adRevenue]
  );
}

describe('applyCommunityRevisionIfDue', () => {
  it('not due before launch + 6 months', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-15' });
    expect(await svc.applyCommunityRevisionIfDue('2027-04-14')).toEqual({
      applied: false,
    });
  });

  it('downgrades to fallback when the 6-month average is below the threshold, once', async () => {
    await adminUser();
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    for (const p of [
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
    ]) {
      await history(p, 40000);
    }
    await history('2027-04-01', 999999); // 7th month: ignored
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({
      applied: true,
      average: 40000,
      newFee: 40000,
      downgraded: true,
    });
    const c = await svc.getConfig();
    expect(c.community_fee_ars).toBe(40000);
    expect(c.community_revision_applied_at).not.toBeNull();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      email: 'boss@t.local',
      downgraded: true,
    });
    expect(await svc.applyCommunityRevisionIfDue('2027-05-01')).toEqual({
      applied: false,
    });
    expect(emails).toHaveLength(1);
  });

  it('keeps the fee at exactly the threshold and still marks applied', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    for (const p of [
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
    ]) {
      await history(p, 50000);
    }
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({
      applied: true,
      downgraded: false,
      newFee: 30000,
    });
    expect(
      (await svc.getConfig()).community_revision_applied_at
    ).not.toBeNull();
  });

  it('missing months count as zero', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    await history('2026-10-01', 300000);
    const r = await svc.applyCommunityRevisionIfDue('2027-04-01');
    expect(r).toMatchObject({
      applied: true,
      average: 50000,
      downgraded: false,
    });
  });

  it('module off never applies', async () => {
    expect(await svc.applyCommunityRevisionIfDue('2030-01-01')).toEqual({
      applied: false,
    });
  });

  it('runPlatformFeeTick snapshots then revises', async () => {
    await svc.updateConfig({ community_launched_on: '2026-10-01' });
    const r = await runPlatformFeeTick('2027-04-01');
    const c = await svc.getConfig();
    expect(c.community_revision_applied_at).not.toBeNull();
    expect(c.community_fee_ars).toBe(40000); // no ads at all -> average 0
    expect(r).toBeUndefined();
  });
});
