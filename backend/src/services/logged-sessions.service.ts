import pool from '../db/connect.js';

// Coach- and athlete-facing view of what was actually logged, session by
// session. Dropset rows (several set_logs sharing a set_index, tagged with
// drop_index) are collapsed into ONE entry per series so the UI shows
// "3-2-1 lad × 10" instead of three separate rows. The grouping/label is built
// here so both the web dashboard and the app render identical text.

export interface LoggedSet {
  set_index: number;
  is_dropset: boolean;
  // Display-ready strings, e.g. weight "3-2-1 lad", reps "10" or "10-10-10".
  weight_label: string;
  reps_label: string;
  rpe: number | null;
}

export interface LoggedExercise {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  sets: LoggedSet[];
}

export interface LoggedSession {
  id: string;
  program_week: number;
  day_of_week: number;
  finished_at: string | null;
  fatigue_rating: string | null;
  exercises: LoggedExercise[];
}

function unitLabel(unit: string | null): string {
  if (unit === 'ladrillos') return 'lad';
  if (unit === 'kg') return 'kg';
  return unit ?? '';
}

function fmtWeight(n: number): string {
  // Trim a trailing ".0" / ".00" so "60.00" → "60", keep "2.5".
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export interface SetRow {
  session_log_id: string;
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  set_index: number;
  drop_index: number | null;
  value: string | null;
  unit: string | null;
  reps: number | null;
  rpe: number | null;
}

// Build the display strings for one logical series (1 row = normal set,
// 2+ rows = the drops of a dropset, ordered by drop_index). Exported for tests.
export function buildSet(rows: SetRow[]): LoggedSet {
  const ordered = [...rows].sort(
    (a, b) => (a.drop_index ?? 0) - (b.drop_index ?? 0),
  );
  const unit = unitLabel(ordered[0]?.unit ?? null);
  const isDropset = ordered.length > 1 || ordered.some((r) => r.drop_index != null);

  const weights = ordered.map((r) => (r.value == null ? null : Number(r.value)));
  const reps = ordered.map((r) => r.reps);

  let weight_label: string;
  if (weights.every((w) => w == null)) {
    weight_label = ''; // bodyweight / timed — no weight
  } else if (isDropset) {
    weight_label = `${weights.map((w) => (w == null ? '—' : fmtWeight(w))).join('-')} ${unit}`.trim();
  } else {
    weight_label = `${fmtWeight(weights[0]!)} ${unit}`.trim();
  }

  let reps_label: string;
  const repsVals = reps.map((r) => (r == null ? '—' : String(r)));
  if (isDropset) {
    reps_label = repsVals.every((r) => r === repsVals[0]) ? repsVals[0] : repsVals.join('-');
  } else {
    reps_label = repsVals[0];
  }

  // RPE: the dropset records it on the first (heaviest) drop; normal sets carry
  // it directly. Take the first non-null.
  const rpe = ordered.find((r) => r.rpe != null)?.rpe ?? null;

  return {
    set_index: ordered[0].set_index,
    is_dropset: isDropset,
    weight_label,
    reps_label,
    rpe,
  };
}

export async function getLoggedSessions(
  athleteId: string,
  limit = 20,
): Promise<LoggedSession[]> {
  const sessR = await pool.query<{
    id: string;
    program_week: number;
    day_of_week: number;
    finished_at: string | null;
    fatigue_rating: string | null;
  }>(
    `SELECT id, program_week, day_of_week,
            finished_at::text AS finished_at, fatigue_rating
       FROM session_logs
      WHERE athlete_id = $1 AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT $2`,
    [athleteId, limit],
  );
  const sessions = sessR.rows;
  if (sessions.length === 0) return [];

  const setsR = await pool.query<SetRow>(
    `SELECT sl.session_log_id, sl.exercise_id, e.name, e.muscle_group,
            sl.set_index, sl.drop_index, sl.value::text AS value,
            sl.unit, sl.reps, sl.rpe
       FROM set_logs sl
       JOIN exercises e ON e.id = sl.exercise_id
      WHERE sl.session_log_id = ANY($1::uuid[]) AND sl.completed = TRUE
      ORDER BY sl.exercise_id, sl.set_index, sl.drop_index NULLS FIRST`,
    [sessions.map((s) => s.id)],
  );

  // session_log_id → exercise_id → set_index → rows
  const bySession = new Map<string, Map<number, Map<number, SetRow[]>>>();
  const exMeta = new Map<string, { name: string; muscle_group: string | null }>();
  for (const row of setsR.rows) {
    let byEx = bySession.get(row.session_log_id);
    if (!byEx) bySession.set(row.session_log_id, (byEx = new Map()));
    let bySet = byEx.get(row.exercise_id);
    if (!bySet) byEx.set(row.exercise_id, (bySet = new Map()));
    const arr = bySet.get(row.set_index) ?? [];
    arr.push(row);
    bySet.set(row.set_index, arr);
    exMeta.set(`${row.session_log_id}:${row.exercise_id}`, {
      name: row.name,
      muscle_group: row.muscle_group,
    });
  }

  return sessions.map((s) => {
    const byEx = bySession.get(s.id);
    const exercises: LoggedExercise[] = [];
    if (byEx) {
      for (const [exerciseId, bySet] of byEx) {
        const meta = exMeta.get(`${s.id}:${exerciseId}`)!;
        const sets = [...bySet.keys()]
          .sort((a, b) => a - b)
          .map((idx) => buildSet(bySet.get(idx)!));
        exercises.push({
          exercise_id: exerciseId,
          name: meta.name,
          muscle_group: meta.muscle_group,
          sets,
        });
      }
    }
    return {
      id: s.id,
      program_week: s.program_week,
      day_of_week: s.day_of_week,
      finished_at: s.finished_at,
      fatigue_rating: s.fatigue_rating,
      exercises,
    };
  });
}
