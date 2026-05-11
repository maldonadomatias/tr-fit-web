import cron from 'node-cron';
import { env } from '../config/env.js';
import { runWeeklyProgressionForAll } from '../services/progression.service.js';
import logger from '../utils/logger.js';

let task: ReturnType<typeof cron.schedule> | null = null;

export function startProgressionCron(): void {
  if (task) return;
  task = cron.schedule(
    env.PROGRESSION_CRON_SCHEDULE,
    async () => {
      logger.info('progression cron: running');
      try {
        await runWeeklyProgressionForAll();
        logger.info('progression cron: done');
      } catch (e) {
        logger.error({ err: e }, 'progression cron failed');
      }
    },
    { timezone: env.CRON_TZ },
  );
  logger.info(
    { schedule: env.PROGRESSION_CRON_SCHEDULE, tz: env.CRON_TZ },
    'progression cron scheduled',
  );
}

export function stopProgressionCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
