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
