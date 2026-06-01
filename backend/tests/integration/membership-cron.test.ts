import { jest } from '@jest/globals';

const sendExpiring = jest.fn<(o: never) => Promise<void>>().mockResolvedValue(undefined);
const sendExpired = jest.fn<(o: never) => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendMembershipExpiringEmail: sendExpiring,
  sendMembershipExpiredEmail: sendExpired,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete, setMembership } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { runMembershipTick } = await import('../../src/workers/membership-cron.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); sendExpiring.mockClear(); sendExpired.mockClear(); });
afterAll(async () => { await closePool(); });

async function status(userId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(`SELECT status FROM memberships WHERE user_id=$1`, [userId]);
  return r.rows[0].status;
}

describe('runMembershipTick', () => {
  it('flips active→expiring within grace window and emails once', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() + 3 * 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('expiring');
    expect(sendExpiring).toHaveBeenCalledTimes(1);

    await runMembershipTick();
    expect(sendExpiring).toHaveBeenCalledTimes(1);
  });

  it('flips to expired past paid_until and emails once', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() - 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('expired');
    expect(sendExpired).toHaveBeenCalledTimes(1);

    await runMembershipTick();
    expect(sendExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves far-future active memberships alone', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() + 60 * 86_400_000).toISOString(), 'active');
    await runMembershipTick();
    expect(await status(a)).toBe('active');
    expect(sendExpiring).not.toHaveBeenCalled();
  });

  it('never resurrects a cancelled membership', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() - 86_400_000).toISOString(), 'cancelled');
    await runMembershipTick();
    expect(await status(a)).toBe('cancelled');
  });

  it('re-activates a renewed membership previously flagged expired', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setMembership(a, new Date(Date.now() + 60 * 86_400_000).toISOString(), 'expired');
    await runMembershipTick();
    expect(await status(a)).toBe('active');
  });
});
