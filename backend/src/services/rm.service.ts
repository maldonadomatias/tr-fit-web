import pool from '../db/connect.js';

export interface RecordRmInput {
  athleteId: string;
  exerciseId: number;
  valueKg: number;
  week: 10 | 20 | 30;
}

export async function recordRm(input: RecordRmInput): Promise<{ rmId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query<{ id: string }>(
      `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (athlete_id, exercise_id, program_week)
         DO UPDATE SET value_kg = EXCLUDED.value_kg, tested_at = NOW()
       RETURNING id`,
      [input.athleteId, input.exerciseId, input.week, input.valueKg],
    );

    // Unblock: if all 7 principal exercises in skeleton have an RM for this week,
    // clear rm_test_blocking. Otherwise leave it as-is (still blocking).
    const stateR = await client.query<{ active_skeleton_id: string | null }>(
      `SELECT active_skeleton_id FROM athlete_program_state WHERE athlete_id = $1`,
      [input.athleteId],
    );
    const skeletonId = stateR.rows[0]?.active_skeleton_id;
    if (skeletonId) {
      const need = await client.query<{ exercise_id: number }>(
        `SELECT DISTINCT s.exercise_id
           FROM skeleton_slots s
           JOIN exercises e ON e.id = s.exercise_id
          WHERE s.skeleton_id = $1 AND e.is_principal = TRUE`,
        [skeletonId],
      );
      const got = await client.query<{ exercise_id: number }>(
        `SELECT exercise_id FROM rm_tests
          WHERE athlete_id = $1 AND program_week = $2`,
        [input.athleteId, input.week],
      );
      const needSet = new Set(need.rows.map((r) => r.exercise_id));
      const gotSet = new Set(got.rows.map((r) => r.exercise_id));
      const allRecorded = [...needSet].every((id) => gotSet.has(id));
      if (allRecorded) {
        await client.query(
          `UPDATE athlete_program_state
              SET rm_test_blocking = FALSE
            WHERE athlete_id = $1`,
          [input.athleteId],
        );
      }
    }

    await client.query('COMMIT');
    return { rmId: r.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
