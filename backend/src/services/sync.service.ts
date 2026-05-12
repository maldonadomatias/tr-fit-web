import pool from '../db/connect.js';
import type { SetLogPayload } from '../domain/schemas.js';

export interface SyncResult {
  accepted: Array<{ clientId: string; setId: string; syncedAt: string }>;
  conflicts: Array<{ clientId: string; reason: 'older_ts' | 'session_finished' | 'not_found' }>;
}

export async function syncSets(
  athleteId: string,
  sessionId: string,
  sets: SetLogPayload[],
): Promise<SyncResult> {
  const result: SyncResult = { accepted: [], conflicts: [] };

  const s = await pool.query<{
    id: string; athlete_id: string; finished_at: string | null;
    program_week: number; day_of_week: number;
  }>(
    `SELECT id, athlete_id, finished_at, program_week, day_of_week
       FROM session_logs WHERE id = $1`,
    [sessionId],
  );
  const session = s.rows[0];
  if (!session || session.athlete_id !== athleteId) {
    for (const set of sets) {
      result.conflicts.push({ clientId: set.client_id, reason: 'not_found' });
    }
    return result;
  }
  if (session.finished_at) {
    for (const set of sets) {
      result.conflicts.push({ clientId: set.client_id, reason: 'session_finished' });
    }
    return result;
  }

  for (const set of sets) {
    const existing = await pool.query<{ client_ts: string | null }>(
      `SELECT client_ts FROM set_logs WHERE client_id = $1`,
      [set.client_id],
    );
    if (existing.rows[0]?.client_ts &&
        new Date(existing.rows[0].client_ts) > new Date(set.client_ts)) {
      result.conflicts.push({ clientId: set.client_id, reason: 'older_ts' });
      continue;
    }

    const r = await pool.query<{ id: string; synced_at: string }>(
      `INSERT INTO set_logs
         (athlete_id, exercise_id, week, day_of_week, set_index,
          weight_kg, reps, completed, rpe,
          session_log_id, client_id, client_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO UPDATE SET
         weight_kg = EXCLUDED.weight_kg,
         reps = EXCLUDED.reps,
         completed = EXCLUDED.completed,
         rpe = EXCLUDED.rpe,
         client_ts = EXCLUDED.client_ts,
         synced_at = NOW()
       RETURNING id, synced_at`,
      [athleteId, set.exercise_id, session.program_week, session.day_of_week,
       set.set_index, set.weight_kg, set.reps, set.completed,
       set.rpe ?? null, sessionId, set.client_id, set.client_ts],
    );
    result.accepted.push({
      clientId: set.client_id,
      setId: r.rows[0].id,
      syncedAt: r.rows[0].synced_at,
    });
  }

  await pool.query(
    `UPDATE session_logs
       SET total_sets_completed = (
         SELECT COUNT(*) FROM set_logs
          WHERE session_log_id = $1 AND completed = TRUE)
     WHERE id = $1`,
    [sessionId],
  );

  return result;
}
