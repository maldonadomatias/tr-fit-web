import pool from '../db/connect.js';
import { computeStreak } from './dashboard.service.js';

const PROGRAM_TOTAL_WEEKS = 30;

export interface AthleteStats {
  total_sessions: number;
  sessions_this_month: number;
  weeks_active: number;
  streak: number;
  best_streak: number;
  compliance: number;
  compliance_delta: number;
  total_volume_kg: number;
  total_volume_delta: number;
  current_week: number;
  total_weeks: number;
}

interface AggRow {
  total_sessions: string;
  sessions_this_month: string;
  weeks_active: string;
  compliance_this_month: string | null;
  compliance_last_month: string | null;
  total_volume_kg: string | null;
  volume_this_month: string | null;
  volume_last_month: string | null;
}

export async function buildAthleteStats(athleteId: string): Promise<AthleteStats> {
  const aggR = await pool.query<AggRow>(
    `
    WITH finished AS (
      SELECT
        program_week,
        started_at,
        compliance_pct,
        total_volume_kg
      FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NOT NULL
    )
    SELECT
      COUNT(*)::text AS total_sessions,
      COUNT(*) FILTER (
        WHERE date_trunc('month', started_at) = date_trunc('month', NOW())
      )::text AS sessions_this_month,
      COUNT(DISTINCT program_week)::text AS weeks_active,
      AVG(compliance_pct) FILTER (
        WHERE date_trunc('month', started_at) = date_trunc('month', NOW())
      )::text AS compliance_this_month,
      AVG(compliance_pct) FILTER (
        WHERE date_trunc('month', started_at) = date_trunc('month', NOW() - INTERVAL '1 month')
      )::text AS compliance_last_month,
      COALESCE(SUM(total_volume_kg), 0)::text AS total_volume_kg,
      COALESCE(SUM(total_volume_kg) FILTER (
        WHERE date_trunc('month', started_at) = date_trunc('month', NOW())
      ), 0)::text AS volume_this_month,
      COALESCE(SUM(total_volume_kg) FILTER (
        WHERE date_trunc('month', started_at) = date_trunc('month', NOW() - INTERVAL '1 month')
      ), 0)::text AS volume_last_month
    FROM finished
    `,
    [athleteId],
  );
  const row = aggR.rows[0];

  const stateR = await pool.query<{ current_week: number | null }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const currentWeek = stateR.rows[0]?.current_week ?? 1;

  const streak = await computeStreak(athleteId);
  const bestStreak = await computeBestStreak(athleteId);

  const complianceThis = num(row.compliance_this_month);
  const complianceLast = num(row.compliance_last_month);
  const compliance = Math.round(complianceThis);
  const compliance_delta = Math.round(complianceThis - complianceLast);

  const volumeThis = num(row.volume_this_month);
  const volumeLast = num(row.volume_last_month);
  const total_volume_kg = Math.round(num(row.total_volume_kg));
  const total_volume_delta = volumeLast > 0
    ? Math.round(((volumeThis - volumeLast) / volumeLast) * 100)
    : 0;

  return {
    total_sessions: parseInt(row.total_sessions, 10),
    sessions_this_month: parseInt(row.sessions_this_month, 10),
    weeks_active: parseInt(row.weeks_active, 10),
    streak,
    best_streak: bestStreak,
    compliance,
    compliance_delta,
    total_volume_kg,
    total_volume_delta,
    current_week: currentWeek,
    total_weeks: PROGRAM_TOTAL_WEEKS,
  };
}

function num(s: string | null): number {
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function computeBestStreak(athleteId: string): Promise<number> {
  const r = await pool.query<{ day: string }>(
    `SELECT DISTINCT date_trunc('day', started_at AT TIME ZONE 'UTC')::date::text AS day
       FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NOT NULL
      ORDER BY day ASC`,
    [athleteId],
  );
  if (r.rows.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < r.rows.length; i++) {
    const prev = new Date(r.rows[i - 1].day);
    const cur = new Date(r.rows[i].day);
    const diff = (cur.getTime() - prev.getTime()) / 86_400_000;
    if (diff === 1) run += 1;
    else run = 1;
    if (run > best) best = run;
  }
  return best;
}
