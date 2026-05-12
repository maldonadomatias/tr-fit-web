import pool from '../db/connect.js';
import type { Exercise, AthleteProfile } from '../domain/types.js';
import { athleteLevelRank } from './level-helpers.js';

// NOTE: this file ranks Exercise.level_min inline inside the SQL CASE
// expression (principiante=1, intermedio=2, avanzado=3) — the equivalent
// JS map lives in exercise.service.ts. Exercise enum (3-value) is distinct
// from athlete level (5-value); see athleteLevelRank for the mapping.

const equipmentMatrix: Record<AthleteProfile['equipment'], string[]> = {
  gym_completo: ['barra', 'mancuerna', 'maquina', 'polea', 'smith',
                 'bw', 'pesa_rusa', 'elastico', 'disco'],
  gym_basico:   ['barra', 'mancuerna', 'maquina', 'bw', 'disco'],
  casa_basica:  ['mancuerna', 'pesa_rusa', 'bw', 'elastico'],
  solo_bw:      ['bw', 'elastico'],
};

export async function findAlternative(
  exerciseId: number,
  athleteId: string,
): Promise<Exercise | null> {
  const origR = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = $1`, [exerciseId],
  );
  const orig = origR.rows[0];
  if (!orig) return null;

  const profR = await pool.query<AthleteProfile>(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
  );
  const profile = profR.rows[0];
  if (!profile) return null;

  const allowedEquipment = equipmentMatrix[profile.equipment];
  const athleteLevelOrd = athleteLevelRank(profile.level);

  const r = await pool.query<Exercise>(
    `SELECT * FROM exercises
       WHERE id != $1
         AND muscle_group = $2
         AND equipment = ANY($3::text[])
         AND CASE level_min
               WHEN 'principiante' THEN 1
               WHEN 'intermedio' THEN 2
               WHEN 'avanzado' THEN 3
             END <= $4
         AND NOT (contraindicated_for && $5::text[])
       ORDER BY
         CASE WHEN equipment = $6 THEN 0 ELSE 1 END,
         id
       LIMIT 1`,
    [exerciseId, orig.muscle_group, allowedEquipment,
     athleteLevelOrd, profile.injuries, orig.equipment],
  );
  return r.rows[0] ?? null;
}
