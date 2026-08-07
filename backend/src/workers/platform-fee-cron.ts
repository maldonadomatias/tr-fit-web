// backend/src/workers/platform-fee-cron.ts
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { previousMonthPeriod } from '../services/platform-fee.math.js';
import { snapshotMonth } from '../services/platform-fee.service.js';

export { previousMonthPeriod };

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
