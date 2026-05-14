import pool from '../db/connect.js';

export interface PlanSession {
  day: number;
  title: string;
  tag: string;
  exerciseCount: number;
  estimatedMin: number;
  done: boolean;
}
export interface PlanWeek {
  weekNumber: number;
  sessions: PlanSession[];
}
export interface PlanBlock {
  id: string;
  name: string;
  tag: string;
  weeks: PlanWeek[];
}
export interface PlanPayload {
  totalWeeks: number;
  currentBlockId: string | null;
  currentWeekNumber: number;
  blocks: PlanBlock[];
}

export async function buildPlan(userId: string): Promise<PlanPayload> {
  const profileR = await pool.query<{
    name: string | null;
    days_per_week: number | null;
    days_specific: string[] | null;
    exercise_minutes: number | null;
  }>(
    `SELECT name, days_per_week, days_specific, exercise_minutes
       FROM athlete_profiles WHERE user_id = $1`,
    [userId],
  );
  const profile = profileR.rows[0];
  if (!profile) {
    return { totalWeeks: 0, currentBlockId: null, currentWeekNumber: 0, blocks: [] };
  }

  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [userId],
  );
  const state = stateR.rows[0];
  const currentWeek = state?.current_week ?? 0;

  const periodR = await pool.query<{ week_number: number; block_label: string }>(
    `SELECT week_number, block_label FROM periodization_config
       ORDER BY week_number ASC`,
  );
  const periodization = periodR.rows;
  if (periodization.length === 0) {
    return {
      totalWeeks: 0,
      currentBlockId: null,
      currentWeekNumber: currentWeek,
      blocks: [],
    };
  }

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

  const logsR = await pool.query<{ program_week: number; day_of_week: number }>(
    `SELECT program_week, day_of_week FROM session_logs
       WHERE athlete_id = $1 AND finished_at IS NOT NULL`,
    [userId],
  );
  const doneSet = new Set<string>();
  for (const row of logsR.rows) {
    doneSet.add(`${row.program_week}-${row.day_of_week}`);
  }

  const estimatedMin = profile.exercise_minutes ?? 60;
  const daysPerWeek = profile.days_per_week
    ?? (profile.days_specific?.length ?? 0);
  const dayIndices = Array.from({ length: daysPerWeek }, (_, i) => i + 1);

  // Group weeks into blocks preserving the order each block_label first appears.
  const blockOrder: string[] = [];
  const blockMap = new Map<string, PlanBlock>();
  let currentBlockId: string | null = null;

  for (const row of periodization) {
    if (!blockMap.has(row.block_label)) {
      blockOrder.push(row.block_label);
      blockMap.set(row.block_label, {
        id: row.block_label,
        name: row.block_label,
        tag: row.block_label,
        weeks: [],
      });
    }
    if (row.week_number === currentWeek) currentBlockId = row.block_label;

    const block = blockMap.get(row.block_label)!;
    const sessions: PlanSession[] = dayIndices.map((dow, i) => {
      const focus = focusByDay[dow];
      const title = focus ? `Día ${i + 1} · ${focus}` : `Día ${i + 1}`;
      return {
        day: i + 1,
        title,
        tag: row.block_label,
        exerciseCount: slotsByDay[dow] ?? 0,
        estimatedMin,
        done: doneSet.has(`${row.week_number}-${dow}`),
      };
    });
    block.weeks.push({ weekNumber: row.week_number, sessions });
  }

  return {
    totalWeeks: periodization.length,
    currentBlockId,
    currentWeekNumber: currentWeek,
    blocks: blockOrder.map((id) => blockMap.get(id)!),
  };
}
