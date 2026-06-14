import pool from '../db/connect.js';
import type { Exercise } from '../domain/types.js';
import { findAlternative } from './alternatives.service.js';
import { createNoMachineAlert } from './alert.service.js';

export interface ExclusionRow {
  exercise_id: number;
  exercise_name: string;
  replacement_exercise_id: number | null;
  replacement_name: string | null;
}

/** Map of excluded original exercise_id → replacement_exercise_id (or null). */
export async function getExclusionMap(
  athleteId: string,
): Promise<Map<number, number | null>> {
  const r = await pool.query<{ exercise_id: number; replacement_exercise_id: number | null }>(
    `SELECT exercise_id, replacement_exercise_id
       FROM athlete_excluded_exercises WHERE athlete_id = $1`,
    [athleteId],
  );
  return new Map(r.rows.map((row) => [row.exercise_id, row.replacement_exercise_id]));
}

export async function listExclusions(athleteId: string): Promise<ExclusionRow[]> {
  const r = await pool.query<ExclusionRow>(
    `SELECT e.exercise_id,
            orig.name AS exercise_name,
            e.replacement_exercise_id,
            repl.name AS replacement_name
       FROM athlete_excluded_exercises e
       JOIN exercises orig ON orig.id = e.exercise_id
       LEFT JOIN exercises repl ON repl.id = e.replacement_exercise_id
      WHERE e.athlete_id = $1
      ORDER BY e.created_at DESC`,
    [athleteId],
  );
  return r.rows;
}

export async function excludeExercise(
  athleteId: string,
  exerciseId: number,
  sessionLogId?: string,
): Promise<{ replacement: Exercise | null }> {
  const existing = await pool.query<{ replacement_exercise_id: number | null }>(
    `SELECT replacement_exercise_id FROM athlete_excluded_exercises
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [athleteId, exerciseId],
  );
  if (existing.rows[0]) {
    const replId = existing.rows[0].replacement_exercise_id;
    const repl = replId
      ? (await pool.query<Exercise>(`SELECT * FROM exercises WHERE id = $1`, [replId])).rows[0] ?? null
      : null;
    return { replacement: repl };
  }

  const excludedIds = [...(await getExclusionMap(athleteId)).keys(), exerciseId];
  const replacement = await findAlternative(exerciseId, athleteId, excludedIds);

  await pool.query(
    `INSERT INTO athlete_excluded_exercises
       (athlete_id, exercise_id, replacement_exercise_id, reason)
     VALUES ($1, $2, $3, 'no_machine')`,
    [athleteId, exerciseId, replacement?.id ?? null],
  );

  await createNoMachineAlert({
    athleteId,
    exerciseId,
    replacementExerciseId: replacement?.id ?? null,
    sessionLogId,
  });

  return { replacement };
}

export async function reactivateExercise(
  athleteId: string,
  exerciseId: number,
): Promise<void> {
  await pool.query(
    `DELETE FROM athlete_excluded_exercises
      WHERE athlete_id = $1 AND exercise_id = $2`,
    [athleteId, exerciseId],
  );
}
