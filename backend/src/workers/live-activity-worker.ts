import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { sendLiveActivityEnd } from '../services/apns.service.js';

export const MAX_JOB_ATTEMPTS = 3;
export const STUCK_RUNNING_MS = 300000;
export const RETRY_BACKOFF_MS = 30000;
export const TICK_MS = 10000;

let interval: ReturnType<typeof setInterval> | null = null;

interface Job {
  id: string;
  apns_token: string;
  content_state: { name: string; props: string };
  end_at: Date;
  attempts: number;
}

export async function liveActivityTick(): Promise<void> {
  try {
    await pool.query(
      `UPDATE live_activity_jobs
          SET status = 'queued', next_attempt_at = now()
        WHERE status = 'running'
          AND started_at < now() - ($1::int * interval '1 millisecond')`,
      [STUCK_RUNNING_MS],
    );

    const claim = await pool.query<Job>(
      `UPDATE live_activity_jobs
          SET status = 'running', started_at = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM live_activity_jobs
           WHERE status = 'queued' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
       RETURNING id, apns_token, content_state, end_at, attempts`,
    );
    const job = claim.rows[0];
    if (!job) return;

    // Dismiss now (the countdown has hit its end); `end_at` is already due.
    const dismissalAtSec = Math.floor(Date.now() / 1000);
    const result = await sendLiveActivityEnd(job.apns_token, job.content_state, dismissalAtSec);

    if (result === 'sent' || result === 'token_invalid') {
      await pool.query(
        `UPDATE live_activity_jobs SET status = 'done', finished_at = now() WHERE id = $1`,
        [job.id],
      );
      return;
    }
    // 'failed' → retry with backoff, then give up.
    if (job.attempts < MAX_JOB_ATTEMPTS) {
      await pool.query(
        `UPDATE live_activity_jobs
            SET status = 'queued', last_error = 'apns_failed',
                next_attempt_at = now() + ($2::int * interval '1 millisecond')
          WHERE id = $1`,
        [job.id, RETRY_BACKOFF_MS],
      );
    } else {
      await pool.query(
        `UPDATE live_activity_jobs
            SET status = 'failed', last_error = 'apns_failed', finished_at = now()
          WHERE id = $1`,
        [job.id],
      );
      logger.error({ jobId: job.id }, 'live activity end push failed permanently');
    }
  } catch (e) {
    logger.error({ err: e }, 'liveActivityTick failed');
  }
}

export function startLiveActivityWorker(): void {
  if (interval) return;
  interval = setInterval(() => { void liveActivityTick(); }, TICK_MS);
  logger.info('live activity worker started');
}
