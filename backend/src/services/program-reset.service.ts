import pool from '../db/connect.js';
import { createProgramResetAlert } from './alert.service.js';

/**
 * "He cambiado de gimnasio" — rewind the program to week 1 and clear the data
 * that is gym-specific (weights, exclusions, weekly overrides). RM tests are
 * preserved as a historical strength reference.
 */
export async function resetProgramForGymChange(athleteId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE athlete_program_state
          SET current_week = 1, last_week_advanced_at = NULL, rm_test_blocking = FALSE
        WHERE athlete_id = $1`,
      [athleteId],
    );
    await client.query(`DELETE FROM athlete_exercise_weights   WHERE athlete_id = $1`, [athleteId]);
    await client.query(`DELETE FROM athlete_excluded_exercises WHERE athlete_id = $1`, [athleteId]);
    await client.query(`DELETE FROM weekly_overrides           WHERE athlete_id = $1`, [athleteId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await createProgramResetAlert(athleteId);
}
