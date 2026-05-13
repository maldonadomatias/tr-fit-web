import pool from '../db/connect.js';
import { buildTodaySession, TodayBlockedError } from './engine.service.js';
import { listCompliance } from './progress.service.js';

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

type Goal = 'hipertrofia' | 'fuerza' | 'recomp' | 'perdida_grasa';

const GOAL_LABEL: Record<Goal, string> = {
  hipertrofia: 'Hipertrofia',
  fuerza: 'Fuerza',
  recomp: 'Recomposición',
  perdida_grasa: 'Pérdida de grasa',
};

export interface DashboardPayload {
  displayName: string;
  currentWeek: number;
  totalWeeks: number;
  blockLabel: string | null;
  blockWeeksRange: [number, number] | null;
  today: {
    dayIndex: number | null;
    focus: string | null;
    tag: string;
    exerciseCount: number;
    estimatedMin: number;
    blocked: null | 'awaiting_review' | 'rm_test_required' | 'rest_day';
  };
  stats: {
    streakDays: number;
    compliancePct: number;
  };
  nextSessions: NextSession[];
}

function firstName(name: string | null | undefined): string {
  if (!name) return 'Atleta';
  return name.trim().split(/\s+/)[0] || 'Atleta';
}

export async function buildDashboard(userId: string): Promise<DashboardPayload> {
  const profileR = await pool.query<{
    name: string | null;
    goal: Goal | null;
    exercise_minutes: number | null;
    days_specific: string[] | null;
  }>(
    `SELECT name, goal, exercise_minutes, days_specific
       FROM athlete_profiles WHERE user_id = $1`,
    [userId],
  );
  const profile = profileR.rows[0];
  if (!profile) {
    return {
      displayName: 'Atleta', currentWeek: 0, totalWeeks: 0,
      blockLabel: null, blockWeeksRange: null,
      today: {
        dayIndex: null, focus: null, tag: '—',
        exerciseCount: 0, estimatedMin: 0, blocked: 'awaiting_review',
      },
      stats: { streakDays: 0, compliancePct: 0 },
      nextSessions: [],
    };
  }

  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
    rm_test_blocking: boolean | null;
  }>(
    `SELECT current_week, active_skeleton_id, rm_test_blocking
       FROM athlete_program_state WHERE athlete_id = $1`,
    [userId],
  );
  const state = stateR.rows[0];
  const currentWeek = state?.current_week ?? 1;

  const totalR = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM periodization_config`,
  );
  const totalWeeks = totalR.rows[0]?.n ?? 0;

  const blockR = await pool.query<{
    block_label: string;
    lo: number; hi: number;
  }>(
    `SELECT block_label,
            (SELECT MIN(week_number) FROM periodization_config
               WHERE block_label = p.block_label) AS lo,
            (SELECT MAX(week_number) FROM periodization_config
               WHERE block_label = p.block_label) AS hi
       FROM periodization_config p WHERE week_number = $1`,
    [currentWeek],
  );
  const block = blockR.rows[0];
  const blockLabel = block?.block_label ?? null;
  const blockWeeksRange: [number, number] | null = block
    ? [block.lo, block.hi] : null;

  const tag = blockLabel ?? (profile.goal ? GOAL_LABEL[profile.goal] : '—');
  const estimatedMin = profile.exercise_minutes ?? 60;

  // Today
  const now = new Date();
  const dow = ((now.getUTCDay() + 6) % 7) + 1;
  const code = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][now.getUTCDay()];
  const isTrainingDay = (profile.days_specific ?? []).map((c) => c.toLowerCase()).includes(code);

  let todayBlocked: DashboardPayload['today']['blocked'] = null;
  let todayExerciseCount = 0;
  let todayFocus: string | null = null;
  let todayDayIndex: number | null = null;

  if (!isTrainingDay) {
    todayBlocked = 'rest_day';
  } else {
    try {
      const items = await buildTodaySession(userId, dow);
      todayExerciseCount = items.length;
      const sorted = (profile.days_specific ?? []).map((c) => {
        const order = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
        return ((order.indexOf(c.toLowerCase()) + 6) % 7) + 1;
      }).sort((a, b) => a - b);
      const idx = sorted.indexOf(dow);
      todayDayIndex = idx >= 0 ? idx + 1 : null;
    } catch (e) {
      if (e instanceof TodayBlockedError) {
        todayBlocked = e.reason === 'rm_test_required'
          ? 'rm_test_required' : 'awaiting_review';
      } else {
        throw e;
      }
    }
    if (state?.active_skeleton_id && todayBlocked === null) {
      const fr = await pool.query<{ focus: string }>(
        `SELECT focus FROM skeleton_days
           WHERE skeleton_id = $1 AND day_of_week = $2`,
        [state.active_skeleton_id, dow],
      );
      todayFocus = fr.rows[0]?.focus ?? null;
    }
  }

  // Compliance — most recent completed week, 0 if none.
  const compliance = await listCompliance(userId, 2);
  const lastCompliance = compliance.length > 0
    ? compliance[compliance.length - 1]?.avg_compliance_pct ?? 0
    : 0;

  const streakDays = await computeStreak(userId);

  // Next sessions: pre-aggregate slot counts + focus per day for the active skeleton.
  let slotsByDay: Record<number, number> = {};
  let focusByDay: Record<number, string> = {};
  if (state?.active_skeleton_id) {
    const slotsR = await pool.query<{ day_of_week: number; n: number }>(
      `SELECT day_of_week, COUNT(*)::int AS n
         FROM skeleton_slots WHERE skeleton_id = $1
        GROUP BY day_of_week`,
      [state.active_skeleton_id],
    );
    for (const row of slotsR.rows) slotsByDay[row.day_of_week] = row.n;
    const focusR = await pool.query<{ day_of_week: number; focus: string }>(
      `SELECT day_of_week, focus FROM skeleton_days WHERE skeleton_id = $1`,
      [state.active_skeleton_id],
    );
    for (const row of focusR.rows) focusByDay[row.day_of_week] = row.focus;
  }

  const nextSessions = projectNextSessions({
    now,
    daysSpecific: profile.days_specific ?? [],
    slotsByDay,
    focusByDay,
    estimatedMin,
  });

  return {
    displayName: firstName(profile.name),
    currentWeek,
    totalWeeks,
    blockLabel,
    blockWeeksRange,
    today: {
      dayIndex: todayDayIndex,
      focus: todayFocus,
      tag,
      exerciseCount: todayExerciseCount,
      estimatedMin,
      blocked: todayBlocked,
    },
    stats: { streakDays, compliancePct: Math.round(lastCompliance) },
    nextSessions,
  };
}
