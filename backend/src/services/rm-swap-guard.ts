import pool from '../db/connect.js';

/**
 * Thrown when an athlete tries to swap (máquina ocupada / no tengo esta
 * máquina) a principal slot during an RM-test week. The test has to happen
 * on the same machine every cycle; the app already hides the swap, but old
 * clients and raw payloads still hit these endpoints.
 */
export class RmTestLockedError extends Error {
  constructor() {
    super('rm_test_locked');
    this.name = 'RmTestLockedError';
  }
}

export async function isRmTestPrincipal(
  athleteId: string,
  exerciseId: number,
): Promise<boolean> {
  const r = await pool.query<{ locked: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM athlete_program_state aps
         JOIN periodization_config pc ON pc.week_number = aps.current_week
         JOIN skeleton_slots ss ON ss.skeleton_id = aps.active_skeleton_id
        WHERE aps.athlete_id = $1
          AND pc.is_rm_test IS TRUE
          AND ss.exercise_id = $2
          AND ss.role = 'principal'
     ) AS locked`,
    [athleteId, exerciseId],
  );
  return r.rows[0]?.locked === true;
}

export async function assertNotRmTestSwap(
  athleteId: string,
  exerciseId: number,
): Promise<void> {
  if (await isRmTestPrincipal(athleteId, exerciseId)) {
    throw new RmTestLockedError();
  }
}
