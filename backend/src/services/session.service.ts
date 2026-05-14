import pool from '../db/connect.js';
import type { SessionSummary } from '../domain/types.js';
import type { SetLogPayload } from '../domain/schemas.js';
import { buildTodaySession, TodayBlockedError } from './engine.service.js';

export class SessionError extends Error {
  constructor(public reason:
    'session_in_progress' | 'wrong_day' | 'session_finished' | 'not_found' |
    'no_active_skeleton' | 'already_finished') {
    super(reason);
  }
}

interface StartSessionResult {
  sessionId: string;
  expectedDay: number;
  items: Awaited<ReturnType<typeof buildTodaySession>>;
}

export async function startSession(
  athleteId: string,
  dayOfWeek: number,
  clientId: string,
): Promise<StartSessionResult> {
  const stateR = await pool.query<{
    current_week: number; active_skeleton_id: string | null;
  }>(
    `SELECT current_week, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const state = stateR.rows[0];
  if (!state || !state.active_skeleton_id) {
    throw new SessionError('no_active_skeleton');
  }

  const lastR = await pool.query<{ day_of_week: number }>(
    `SELECT day_of_week FROM session_logs
       WHERE athlete_id = $1 AND program_week = $2 AND finished_at IS NOT NULL
       ORDER BY day_of_week DESC LIMIT 1`,
    [athleteId, state.current_week],
  );
  const lastDay = lastR.rows[0]?.day_of_week ?? 0;
  const expectedDay = lastDay + 1;

  if (dayOfWeek !== expectedDay) {
    const err = new SessionError('wrong_day');
    (err as SessionError & { expectedDay?: number }).expectedDay = expectedDay;
    throw err;
  }

  const activeR = await pool.query<{ id: string }>(
    `SELECT id FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NULL LIMIT 1`,
    [athleteId],
  );
  if (activeR.rows[0]) {
    throw new SessionError('session_in_progress');
  }

  const items = await buildTodaySession(athleteId, dayOfWeek);
  const totalSetsTarget = items.reduce((sum, it) => sum + it.series, 0);

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id)
     VALUES ($1, $2, $3, $4, $5, 0, $6)
     ON CONFLICT (client_id) DO UPDATE SET athlete_id = EXCLUDED.athlete_id
     RETURNING id`,
    [athleteId, state.active_skeleton_id, state.current_week,
     dayOfWeek, totalSetsTarget, clientId],
  );

  return { sessionId: ins.rows[0].id, expectedDay, items };
}

export async function logSet(
  sessionId: string,
  athleteId: string,
  payload: SetLogPayload,
): Promise<{ setId: string; created: boolean }> {
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
    throw new SessionError('not_found');
  }
  if (session.finished_at) {
    throw new SessionError('session_finished');
  }

  const r = await pool.query<{ id: string; was_insert: boolean }>(
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
       synced_at = NOW()
     RETURNING id, (xmax = 0) AS was_insert`,
    [athleteId, payload.exercise_id, session.program_week, session.day_of_week,
     payload.set_index, payload.weight_kg, payload.reps, payload.completed,
     payload.rpe ?? null, sessionId, payload.client_id, payload.client_ts],
  );

  await pool.query(
    `UPDATE session_logs
       SET total_sets_completed = (
         SELECT COUNT(*) FROM set_logs
          WHERE session_log_id = $1 AND completed = TRUE)
     WHERE id = $1`,
    [sessionId],
  );

  return { setId: r.rows[0].id, created: r.rows[0].was_insert };
}

export async function getActive(
  athleteId: string,
): Promise<{
  session: {
    id: string;
    day_of_week: number;
    started_at: string;
    items: import('../domain/types.js').SessionItem[];
    sets: import('../domain/types.js').SetLog[];
    current_slot_index: number;
  } | null;
}> {
  const r = await pool.query<{
    id: string; day_of_week: number; started_at: string;
  }>(
    `SELECT id, day_of_week, started_at
       FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [athleteId],
  );
  const row = r.rows[0];
  if (!row) return { session: null };

  let items: import('../domain/types.js').SessionItem[] = [];
  try {
    items = await buildTodaySession(athleteId, row.day_of_week);
  } catch (e) {
    if (!(e instanceof TodayBlockedError)) throw e;
    // Allow stale active sessions to surface even if engine refuses to
    // rebuild items (e.g. skeleton replaced). UI handles empty items.
  }

  const setsR = await pool.query<import('../domain/types.js').SetLog>(
    `SELECT * FROM set_logs
      WHERE session_log_id = $1
      ORDER BY client_ts ASC`,
    [row.id],
  );
  const sets = setsR.rows;

  let currentSlotIndex = 0;
  for (const item of items) {
    const completed = sets.filter(
      (s) => s.exercise_id === item.exercise.id && s.completed,
    ).length;
    if (completed >= item.series) currentSlotIndex += 1;
    else break;
  }

  return {
    session: {
      id: row.id,
      day_of_week: row.day_of_week,
      started_at: row.started_at,
      items,
      sets,
      current_slot_index: currentSlotIndex,
    },
  };
}

export async function finishSession(
  sessionId: string,
  athleteId: string,
  fatigueRating: 'suave' | 'normal' | 'exigente',
): Promise<SessionSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query<{
      id: string; athlete_id: string; finished_at: string | null;
      started_at: string; total_sets_target: number | null;
    }>(
      `SELECT id, athlete_id, finished_at, started_at, total_sets_target
         FROM session_logs WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const session = r.rows[0];
    if (!session || session.athlete_id !== athleteId) {
      throw new SessionError('not_found');
    }
    if (session.finished_at) {
      throw new SessionError('already_finished');
    }

    const aggR = await client.query<{
      total_completed: number;
      total_volume: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE completed = TRUE)::int AS total_completed,
         COALESCE(SUM(weight_kg * reps) FILTER (WHERE completed = TRUE), 0)::text AS total_volume
         FROM set_logs WHERE session_log_id = $1`,
      [sessionId],
    );
    const agg = aggR.rows[0];
    const setsCompleted = agg.total_completed;
    const setsTarget = session.total_sets_target ?? 0;
    const totalVolumeKg = Number(agg.total_volume ?? 0);
    const compliancePct = setsTarget > 0 ? (setsCompleted / setsTarget) * 100 : 0;

    const now = new Date();
    const durationSeconds = Math.floor(
      (now.getTime() - new Date(session.started_at).getTime()) / 1000,
    );

    const prR = await client.query<{
      exercise_id: number; name: string; kg: string; reps: number;
    }>(
      `WITH cur AS (
         SELECT exercise_id, MAX(weight_kg * reps) AS cur_max,
                weight_kg, reps
           FROM set_logs
          WHERE session_log_id = $1 AND completed = TRUE
          GROUP BY exercise_id, weight_kg, reps
       ), best_old AS (
         SELECT sl.exercise_id, COALESCE(MAX(sl.weight_kg * sl.reps), 0) AS old_max
           FROM set_logs sl
          WHERE sl.athlete_id = $2 AND sl.completed = TRUE
            AND sl.session_log_id IS DISTINCT FROM $1
          GROUP BY sl.exercise_id
       )
       SELECT DISTINCT ON (c.exercise_id)
              c.exercise_id, e.name, c.weight_kg::text AS kg, c.reps
         FROM cur c
         LEFT JOIN best_old b ON b.exercise_id = c.exercise_id
         JOIN exercises e ON e.id = c.exercise_id
        WHERE c.cur_max > COALESCE(b.old_max, 0)
        ORDER BY c.exercise_id, c.cur_max DESC`,
      [sessionId, athleteId],
    );
    const newPRs = prR.rows.map((p) => ({
      exerciseId: p.exercise_id, name: p.name,
      kg: Number(p.kg), reps: p.reps,
    }));

    await client.query(
      `UPDATE session_logs
         SET finished_at = NOW(),
             fatigue_rating = $1,
             total_sets_completed = $2,
             compliance_pct = $3,
             total_volume_kg = $4,
             duration_seconds = $5
       WHERE id = $6`,
      [fatigueRating, setsCompleted, compliancePct, totalVolumeKg,
       durationSeconds, sessionId],
    );

    await client.query('COMMIT');

    return {
      totalVolumeKg, setsCompleted, setsTarget, compliancePct,
      durationSeconds, newPRs,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
