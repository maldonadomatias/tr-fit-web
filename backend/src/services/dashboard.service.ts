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

const WEEKDAY_CODES = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
const WEEKDAY_LABELS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

function codeFromDate(d: Date): typeof WEEKDAY_CODES[number] {
  return WEEKDAY_CODES[d.getUTCDay()];
}

function dayOfWeek1to7(d: Date): number {
  // 1 = Mon … 7 = Sun, matching backend skeleton_slots.day_of_week.
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export interface NextSession {
  date: string;
  dayIndex: number | null;
  focus: string | null;
  exerciseCount: number;
  estimatedMin: number;
  rest: boolean;
}

export interface ProjectNextSessionsInput {
  now: Date;
  daysSpecific: string[];                 // ['lun','mar',…]
  slotsByDay: Record<number, number>;     // dayOfWeek -> count
  focusByDay: Record<number, string>;     // dayOfWeek -> focus
  estimatedMin: number;
}

export function projectNextSessions(
  input: ProjectNextSessionsInput,
): NextSession[] {
  const { now, daysSpecific, slotsByDay, focusByDay, estimatedMin } = input;
  const set = new Set(daysSpecific.map((c) => c.toLowerCase()));
  const out: NextSession[] = [];

  for (let i = 1; i <= 7 && out.length < 3; i++) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + i);
    const code = codeFromDate(d);
    const label = `${WEEKDAY_LABELS_ES[d.getUTCDay()]} ${d.getUTCDate()}`;
    const rest = !set.has(code);
    const dow = dayOfWeek1to7(d);

    if (rest) {
      out.push({
        date: label, dayIndex: null, focus: null,
        exerciseCount: 0, estimatedMin: 0, rest: true,
      });
    } else {
      const sorted = Array.from(set).map((c) => {
        return ((WEEKDAY_CODES.indexOf(c as typeof WEEKDAY_CODES[number]) + 6) % 7) + 1;
      }).sort((a, b) => a - b);
      const dayIndex = sorted.indexOf(dow) + 1;
      out.push({
        date: label,
        dayIndex: dayIndex > 0 ? dayIndex : null,
        focus: focusByDay[dow] ?? null,
        exerciseCount: slotsByDay[dow] ?? 0,
        estimatedMin,
        rest: false,
      });
    }
  }
  return out;
}
