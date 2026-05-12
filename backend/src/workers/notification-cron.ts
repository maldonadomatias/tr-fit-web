import cron from 'node-cron';
import { DateTime } from 'luxon';
import pool from '../db/connect.js';
import { notifyUser } from '../services/notification.service.js';
import logger from '../utils/logger.js';

const WEEKDAY_KEYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;

interface AthleteRow {
  id: string;
  timezone: string;
  days_specific: string[] | null;
}

export async function runNotificationTick(now: DateTime = DateTime.now()): Promise<void> {
  const users = await pool.query<AthleteRow>(
    `SELECT u.id, u.timezone, p.days_specific
       FROM users u
       LEFT JOIN athlete_profiles p ON p.user_id = u.id
      WHERE u.role = 'athlete'`,
  );

  for (const u of users.rows) {
    try {
      const dt = now.setZone(u.timezone);
      const localHour = dt.hour;
      const todayKey = WEEKDAY_KEYS[dt.weekday - 1];
      const weekday = dt.weekday;

      // session_reminder — local 8am + today is training day
      if (localHour === 8 && u.days_specific?.includes(todayKey)) {
        await notifyUser(u.id, 'session_reminder');
      }

      // session_missed — local 21h + today was training day + no finished session today
      if (localHour === 21 && u.days_specific?.includes(todayKey)) {
        const had = await pool.query(
          `SELECT 1 FROM session_logs
            WHERE athlete_id = $1
              AND started_at >= date_trunc('day', now() AT TIME ZONE $2)
              AND finished_at IS NOT NULL`,
          [u.id, u.timezone],
        );
        if ((had.rowCount ?? 0) === 0) {
          await notifyUser(u.id, 'session_missed');
        }
      }

      // week_start — Monday 7am local
      if (weekday === 1 && localHour === 7) {
        const s = await pool.query<{ current_week: number | null }>(
          `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
          [u.id],
        );
        const cw = s.rows[0]?.current_week;
        if (cw != null) {
          await notifyUser(u.id, 'week_start', { week: String(cw) });
        }
      }

      // rm_test_week — Sunday 21h local + current_week in {10,20,30}
      if (weekday === 7 && localHour === 21) {
        const s = await pool.query<{ current_week: number | null }>(
          `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
          [u.id],
        );
        const cw = s.rows[0]?.current_week;
        if (cw != null && [10, 20, 30].includes(cw)) {
          await notifyUser(u.id, 'rm_test_week', { week: String(cw) });
        }
      }
    } catch (e) {
      logger.error({ err: e, userId: u.id }, 'notification tick failed for user');
    }
  }
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startNotificationCron(): void {
  if (task) return;
  task = cron.schedule('0 * * * *', async () => {
    logger.info('notification cron: tick');
    try {
      await runNotificationTick();
    } catch (e) {
      logger.error({ err: e }, 'notification cron failed');
    }
  });
  logger.info('notification cron scheduled (0 * * * *)');
}

export function stopNotificationCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
