// backend/tests/integration/platform-fee-cron.test.ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { getHistory } from '../../src/services/platform-fee.service.js';
import {
  previousMonthPeriod,
  runPlatformFeeTick,
} from '../../src/workers/platform-fee-cron.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('platform fee cron', () => {
  it('previousMonthPeriod returns the first of the prior month', () => {
    expect(previousMonthPeriod('2026-07-01')).toBe('2026-06-01');
    expect(previousMonthPeriod('2026-01-15')).toBe('2025-12-01');
  });

  it('runPlatformFeeTick snapshots the closed month once', async () => {
    const coach = await createAdmin();
    await createAthlete(coach);
    await runPlatformFeeTick('2026-07-01');
    await runPlatformFeeTick('2026-07-01');
    const h = await getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].period).toBe('2026-06-01');
  });
});
