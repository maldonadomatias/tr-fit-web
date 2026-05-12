import pool from '../db/connect.js';
import type { Level, Goal } from '../domain/types.js';

export interface CoachAthleteRow {
  id: string;
  name: string;
  email: string;
  level: Level;
  goal: Goal;
  days_per_week: number;
  onboarded_at: string;
  current_week: number | null;
  skeleton_status:
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'superseded'
    | null;
  last_session_at: string | null;
  unread_alerts_count: number;
}

export async function listAthletesForCoach(
  coachId: string,
): Promise<CoachAthleteRow[]> {
  const r = await pool.query<CoachAthleteRow>(
    `SELECT
        ap.user_id AS id,
        ap.name,
        u.email,
        ap.level,
        ap.goal,
        ap.days_per_week,
        ap.onboarded_at,
        ps.current_week,
        (
          SELECT status FROM athlete_skeletons
            WHERE athlete_id = ap.user_id
            ORDER BY created_at DESC LIMIT 1
        ) AS skeleton_status,
        (
          SELECT MAX(started_at) FROM session_logs
            WHERE athlete_id = ap.user_id
        ) AS last_session_at,
        (
          SELECT COUNT(*)::int FROM coach_alerts
            WHERE athlete_id = ap.user_id AND read_at IS NULL
        ) AS unread_alerts_count
       FROM athlete_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN athlete_program_state ps ON ps.athlete_id = ap.user_id
      WHERE ap.coach_id = $1
      ORDER BY last_session_at DESC NULLS LAST`,
    [coachId],
  );
  return r.rows;
}

export class CoachError extends Error {
  constructor(public reason: 'not_found') {
    super(reason);
  }
}

export async function getAthleteDetailForCoach(
  coachId: string,
  athleteId: string,
): Promise<{
  profile: unknown;
  programState: unknown;
  activeSkeleton: { skeleton: unknown; slots: unknown[] } | null;
  recentSessions: unknown[];
  alertsCount: number;
  measurements: unknown[];
}> {
  const profR = await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1 AND coach_id = $2`,
    [athleteId, coachId],
  );
  if (!profR.rows[0]) throw new CoachError('not_found');
  const profile = profR.rows[0];

  const stateR = await pool.query(
    `SELECT current_week, rm_test_blocking, start_date, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const programState = stateR.rows[0] ?? null;

  let activeSkeleton: { skeleton: unknown; slots: unknown[] } | null = null;
  const skId = (programState as { active_skeleton_id?: string } | null)
    ?.active_skeleton_id;
  if (skId) {
    const skR = await pool.query(
      `SELECT * FROM athlete_skeletons WHERE id = $1`,
      [skId],
    );
    const slotsR = await pool.query(
      `SELECT ss.*, e.name AS exercise_name, e.muscle_group, e.equipment
         FROM skeleton_slots ss
         JOIN exercises e ON e.id = ss.exercise_id
        WHERE ss.skeleton_id = $1
        ORDER BY ss.day_of_week, ss.slot_index`,
      [skId],
    );
    activeSkeleton = { skeleton: skR.rows[0], slots: slotsR.rows };
  }

  const sessionsR = await pool.query(
    `SELECT id, program_week, day_of_week, started_at, finished_at,
            total_sets_completed, total_sets_target, compliance_pct,
            total_volume_kg, fatigue_rating
       FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 5`,
    [athleteId],
  );

  const alertsR = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM coach_alerts
      WHERE athlete_id = $1 AND read_at IS NULL`,
    [athleteId],
  );

  const measR = await pool.query(
    `SELECT * FROM athlete_measurements
      WHERE athlete_id = $1
      ORDER BY measured_at DESC
      LIMIT 10`,
    [athleteId],
  );

  return {
    profile,
    programState,
    activeSkeleton,
    recentSessions: sessionsR.rows,
    alertsCount: alertsR.rows[0].n,
    measurements: measR.rows,
  };
}
