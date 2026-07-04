import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { runRegenJob, sweepOrphanProfiles } from '../services/skeleton-regen.service.js';

export const MAX_JOB_ATTEMPTS = 3;
export const STUCK_RUNNING_MS = 300000;
export const RETRY_BACKOFF_MS = 30000;
export const WORKER_TICK_MS = 5000;

let interval: ReturnType<typeof setInterval> | null = null;

// One reaper + claim + run cycle. Never throws (logs and swallows).
export async function regenTick(): Promise<void> {
  try {
    // Reaper: a running job older than STUCK_RUNNING_MS is treated as crashed.
    await pool.query(
      `UPDATE skeleton_regen_jobs
          SET status = 'queued', next_attempt_at = now()
        WHERE status = 'running'
          AND started_at < now() - ($1::int * interval '1 millisecond')`,
      [STUCK_RUNNING_MS],
    );

    // Claim one runnable job atomically.
    const claim = await pool.query<{ id: string; athlete_id: string; attempts: number }>(
      `UPDATE skeleton_regen_jobs
          SET status = 'running', started_at = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM skeleton_regen_jobs
           WHERE status = 'queued' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
       RETURNING id, athlete_id, attempts`,
    );
    const job = claim.rows[0];
    if (!job) return;

    try {
      await runRegenJob(job.athlete_id);
      await pool.query(
        `UPDATE skeleton_regen_jobs
            SET status = 'done', finished_at = now()
          WHERE id = $1`,
        [job.id],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (job.attempts < MAX_JOB_ATTEMPTS) {
        await pool.query(
          `UPDATE skeleton_regen_jobs
              SET status = 'queued', last_error = $2,
                  next_attempt_at = now() + ($3::int * interval '1 millisecond')
            WHERE id = $1`,
          [job.id, msg, RETRY_BACKOFF_MS],
        );
        logger.warn({ jobId: job.id, attempts: job.attempts }, 'regen job retry');
      } else {
        await pool.query(
          `UPDATE skeleton_regen_jobs
              SET status = 'failed', last_error = $2, finished_at = now()
            WHERE id = $1`,
          [job.id, msg],
        );
        logger.error({ jobId: job.id }, 'regen job failed permanently');
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'regenTick failed');
  }
}

export function startRegenWorker(): void {
  if (interval) return;
  void sweepOrphanProfiles()
    .then(({ enqueued }) => {
      if (enqueued > 0) {
        logger.warn({ enqueued }, 'regen sweep: enqueued jobs for orphan profiles');
      }
    })
    .catch((e) => logger.error({ err: e }, 'regen sweep failed'));
  interval = setInterval(() => { void regenTick(); }, WORKER_TICK_MS);
  logger.info('regen worker started');
}
