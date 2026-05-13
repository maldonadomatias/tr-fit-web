import pool from '../db/connect.js';

/**
 * Returns the length, in days, of the most recent contiguous run of
 * days that ended on today (UTC) or yesterday. Returns 0 when the
 * most-recent finished session is older than yesterday or no
 * finished sessions exist.
 */
export async function computeStreak(athleteId: string): Promise<number> {
  const r = await pool.query<{ day: string }>(
    `SELECT DISTINCT date_trunc('day', started_at AT TIME ZONE 'UTC')::date::text AS day
       FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NOT NULL
      ORDER BY day DESC`,
    [athleteId],
  );
  if (r.rows.length === 0) return 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  const days = r.rows.map((x) => x.day);
  const mostRecent = new Date(days[0]);
  if (mostRecent.getTime() !== today.getTime() &&
      mostRecent.getTime() !== yesterday.getTime()) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = (prev.getTime() - cur.getTime()) / (24 * 60 * 60 * 1000);
    if (diff === 1) streak += 1;
    else break;
  }
  return streak;
}
