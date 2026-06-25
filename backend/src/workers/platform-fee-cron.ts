// backend/src/workers/platform-fee-cron.ts
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { snapshotMonth } from '../services/platform-fee.service.js';

/** First day (YYYY-MM-01, UTC) of the month before todayISO. */
export function previousMonthPeriod(todayISO: string): string {
  const [y, m] = todayISO.split('-').map(Number);
  // m is 1-based; m-2 is the previous month's 0-based index.
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

export async function runPlatformFeeTick(todayISO?: string): Promise<void> {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const period = previousMonthPeriod(today);
  await snapshotMonth(period);
  logger.info({ period }, 'platform fee snapshot complete');
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startPlatformFeeCron(): void {
  if (task) return;
  // 1st of each month at 06:00 server time — snapshot the month that just closed.
  task = cron.schedule('0 6 1 * *', () => {
    runPlatformFeeTick().catch((e) =>
      logger.error({ err: e }, 'platform fee cron failed')
    );
  });
  logger.info('platform fee cron scheduled');
}
