import pool from '../db/connect.js';

// days_specific[i] es el día de semana de la sesión i+1, guardado en este orden.
const WEEKDAY_CODES = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;

export interface PlanSession {
  day: number;
  title: string;
  tag: string;
  exerciseCount: number;
  estimatedMin: number;
  done: boolean;
  /** Día de semana real: 0 = lunes … 6 = domingo. null si el perfil no lo tiene. */
  weekday: number | null;
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
  /** Para colorear la barra de periodización del app. */
  kind: 'work' | 'deload' | 'test';
}
export interface PlanPayload {
  totalWeeks: number;
  currentBlockId: string | null;
  currentWeekNumber: number;
  blocks: PlanBlock[];
  /** Inicio del programa, 'YYYY-MM-DD'. Ancla el calendario del app. */
  startDate: string | null;
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
    return { totalWeeks: 0, currentBlockId: null, currentWeekNumber: 0, blocks: [], startDate: null };
  }

  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
    start_date: string | null;
  }>(
    `SELECT current_week, active_skeleton_id, start_date::text AS start_date
       FROM athlete_program_state WHERE athlete_id = $1`,
    [userId],
  );
  const state = stateR.rows[0];
  const currentWeek = state?.current_week ?? 0;
  const startDate = state?.start_date ?? null;

  const periodR = await pool.query<{
    week_number: number;
    block_label: string;
    is_deload: boolean;
    is_rm_test: boolean;
  }>(
    `SELECT week_number, block_label, is_deload, is_rm_test FROM periodization_config
       ORDER BY week_number ASC`,
  );
  const periodization = periodR.rows;
  if (periodization.length === 0) {
    return {
      totalWeeks: 0,
      currentBlockId: null,
      currentWeekNumber: currentWeek,
      blocks: [],
      startDate,
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

  const daysSpecific = profile.days_specific ?? [];
  const weekdayForSession = (sessionNumber: number): number | null => {
    const code = daysSpecific[sessionNumber - 1];
    if (!code) return null;
    const index = WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]);
    return index < 0 ? null : index;
  };

  // Un bloque es un TRAMO CONTIGUO de semanas con la misma etiqueta. Las
  // etiquetas se repiten a lo largo del año (Hipertrofia vuelve tres veces),
  // así que agrupar por etiqueta juntaría semanas separadas por meses.
  const blocks: PlanBlock[] = [];
  let currentBlock: PlanBlock | null = null;
  let previousLabel: string | null = null;
  let currentBlockId: string | null = null;

  for (const row of periodization) {
    if (currentBlock === null || row.block_label !== previousLabel) {
      currentBlock = {
        id: `${row.block_label}#${row.week_number}`,
        name: row.block_label,
        tag: row.block_label,
        weeks: [],
        kind: 'work',
      };
      blocks.push(currentBlock);
      previousLabel = row.block_label;
    }
    // El testeo gana sobre la descarga: un tramo con RM se pinta como testeo.
    if (row.is_rm_test) currentBlock.kind = 'test';
    else if (row.is_deload && currentBlock.kind !== 'test') currentBlock.kind = 'deload';

    if (row.week_number === currentWeek) currentBlockId = currentBlock.id;

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
        weekday: weekdayForSession(i + 1),
      };
    });
    currentBlock.weeks.push({ weekNumber: row.week_number, sessions });
  }

  return {
    totalWeeks: periodization.length,
    currentBlockId,
    currentWeekNumber: currentWeek,
    blocks,
    startDate,
  };
}
