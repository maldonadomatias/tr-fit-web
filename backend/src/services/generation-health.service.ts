import pool from '../db/connect.js';

// A job sitting in queued/running longer than this means the worker died or
// the generation hung — either way the coach should see the athlete.
export const STALLED_AFTER_MS = 900_000;

export interface StuckGeneration {
  athlete_id: string;
  athlete_name: string;
  status: 'failed' | 'stalled';
  last_error: string | null;
  since: string;
}

export async function listStuckGenerations(
  coachId: string,
): Promise<StuckGeneration[]> {
  const { rows } = await pool.query<StuckGeneration>(
    `SELECT ap.user_id AS athlete_id,
            ap.name    AS athlete_name,
            CASE WHEN j.status = 'failed' THEN 'failed' ELSE 'stalled' END AS status,
            j.last_error,
            COALESCE(j.finished_at, j.created_at) AS since
       FROM athlete_profiles ap
       JOIN LATERAL (
              SELECT status, last_error, created_at, finished_at
                FROM skeleton_regen_jobs
               WHERE athlete_id = ap.user_id
               ORDER BY created_at DESC
               LIMIT 1
            ) j ON TRUE
      WHERE ap.coach_id = $1
        AND NOT EXISTS (
              SELECT 1 FROM athlete_skeletons s WHERE s.athlete_id = ap.user_id)
        AND (
              j.status = 'failed'
              OR (j.status IN ('queued', 'running')
                  AND j.created_at < now() - ($2::int * interval '1 millisecond'))
            )
      ORDER BY since ASC`,
    [coachId, STALLED_AFTER_MS],
  );
  return rows;
}
