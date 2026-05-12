import pool from '../db/connect.js';

export interface RmHistoryPoint {
  program_week: 10 | 20 | 30;
  value_kg: string;
  tested_at: string;
}

export interface RmHistoryRow {
  exercise_id: number;
  exercise_name: string;
  data: RmHistoryPoint[];
}

export async function listRmHistory(athleteId: string): Promise<RmHistoryRow[]> {
  const r = await pool.query<{
    exercise_id: number; exercise_name: string;
    program_week: 10 | 20 | 30; value_kg: string; tested_at: string;
  }>(
    `SELECT r.exercise_id, e.name AS exercise_name,
            r.program_week, r.value_kg, r.tested_at
       FROM rm_tests r
       JOIN exercises e ON e.id = r.exercise_id
      WHERE r.athlete_id = $1
      ORDER BY r.exercise_id, r.program_week`,
    [athleteId],
  );
  const byEx = new Map<number, RmHistoryRow>();
  for (const row of r.rows) {
    let bucket = byEx.get(row.exercise_id);
    if (!bucket) {
      bucket = {
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        data: [],
      };
      byEx.set(row.exercise_id, bucket);
    }
    bucket.data.push({
      program_week: row.program_week,
      value_kg: row.value_kg,
      tested_at: row.tested_at,
    });
  }
  return Array.from(byEx.values());
}

export interface ComplianceRow {
  program_week: number;
  completed: number;
  avg_compliance_pct: number | null;
}

export async function listCompliance(
  athleteId: string,
  weeks: number,
): Promise<ComplianceRow[]> {
  const r = await pool.query<{
    program_week: number;
    completed: string;
    avg_compliance_pct: string | null;
  }>(
    `SELECT program_week,
            COUNT(*)::text AS completed,
            AVG(compliance_pct)::text AS avg_compliance_pct
       FROM session_logs
      WHERE athlete_id = $1
        AND finished_at IS NOT NULL
        AND started_at > now() - ($2 || ' weeks')::interval
      GROUP BY program_week
      ORDER BY program_week`,
    [athleteId, String(weeks)],
  );
  return r.rows.map((row) => ({
    program_week: row.program_week,
    completed: parseInt(row.completed, 10),
    avg_compliance_pct: row.avg_compliance_pct == null
      ? null : Number(row.avg_compliance_pct),
  }));
}

export interface VolumeRow {
  session_log_id: string;
  started_at: string;
  total_kg: string | null;
}

export async function listVolume(
  athleteId: string,
  weeks: number,
): Promise<VolumeRow[]> {
  const r = await pool.query<VolumeRow>(
    `SELECT id AS session_log_id, started_at, total_volume_kg AS total_kg
       FROM session_logs
      WHERE athlete_id = $1
        AND finished_at IS NOT NULL
        AND started_at > now() - ($2 || ' weeks')::interval
      ORDER BY started_at`,
    [athleteId, String(weeks)],
  );
  return r.rows;
}

export interface RpeBucket {
  rpe: number;
  count: number;
}

export async function listRpeHistogram(
  athleteId: string,
  weeks: number,
): Promise<RpeBucket[]> {
  const r = await pool.query<{ rpe: string; count: string }>(
    `SELECT s.rpe::text AS rpe, COUNT(*)::text AS count
       FROM set_logs s
       JOIN session_logs sl ON sl.id = s.session_log_id
      WHERE sl.athlete_id = $1
        AND s.completed = TRUE
        AND s.rpe IS NOT NULL
        AND sl.started_at > now() - ($2 || ' weeks')::interval
      GROUP BY s.rpe
      ORDER BY s.rpe`,
    [athleteId, String(weeks)],
  );
  return r.rows.map((row) => ({
    rpe: Number(row.rpe),
    count: parseInt(row.count, 10),
  }));
}

export interface WeightVsSuggestedRow {
  exercise_id: number;
  exercise_name: string;
  avg_used_kg: string;
  suggested_kg: string | null;
  delta_pct: string | null;
}

export async function listWeightVsSuggested(
  athleteId: string,
  weeks: number,
): Promise<WeightVsSuggestedRow[]> {
  const r = await pool.query<WeightVsSuggestedRow>(
    `WITH used AS (
       SELECT s.exercise_id, AVG(s.weight_kg) AS avg_used_kg
         FROM set_logs s
         JOIN session_logs sl ON sl.id = s.session_log_id
        WHERE sl.athlete_id = $1
          AND s.completed = TRUE
          AND s.weight_kg IS NOT NULL
          AND sl.started_at > now() - ($2 || ' weeks')::interval
        GROUP BY s.exercise_id
     ),
     suggested AS (
       SELECT exercise_id, current_weight_kg AS suggested_kg
         FROM athlete_exercise_weights
        WHERE athlete_id = $1
     )
     SELECT u.exercise_id,
            e.name AS exercise_name,
            u.avg_used_kg::text AS avg_used_kg,
            sg.suggested_kg::text AS suggested_kg,
            (CASE WHEN sg.suggested_kg IS NULL OR sg.suggested_kg = 0
                  THEN NULL
                  ELSE ((u.avg_used_kg - sg.suggested_kg) / sg.suggested_kg * 100)
             END)::text AS delta_pct
       FROM used u
       JOIN exercises e ON e.id = u.exercise_id
       LEFT JOIN suggested sg ON sg.exercise_id = u.exercise_id
      ORDER BY ABS(COALESCE((u.avg_used_kg - sg.suggested_kg) / NULLIF(sg.suggested_kg, 0) * 100, 0)) DESC
      LIMIT 10`,
    [athleteId, String(weeks)],
  );
  return r.rows;
}
