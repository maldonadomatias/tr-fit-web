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

/**
 * Every alternative the athlete may swap to, best first.
 *
 * The exercise's curated `alternatives_ids` (hand-picked in admin) win
 * OUTRIGHT: when the admin listed alternatives for this exercise, the athlete
 * sees only those, in the admin's order. Padding the picker with the automatic
 * same-muscle-group sweep made the list read as "every exercise of the muscle
 * group" and buried the curated picks (coach report 2026-08-06).
 *
 * The automatic same-muscle-group query is only the fallback: no curated ids,
 * or every curated one knocked out by the injury guard / exclude list.
 * Curated ones skip the equipment/level filter — an admin already vouched for
 * them — but NOTHING skips the injury guard or the caller's exclude list.
 */
export async function findAlternatives(
  exerciseId: number,
  athleteId: string,
  excludeIds: number[] = [],
  limit = 12,
): Promise<Exercise[]> {
  const origR = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = $1`, [exerciseId],
  );
  const orig = origR.rows[0];
  if (!orig) return [];

  const profR = await pool.query<AthleteProfile>(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
  );
  const profile = profR.rows[0];
  if (!profile) return [];

  const curatedIds = orig.alternatives_ids ?? [];
  if (curatedIds.length) {
    const c = await pool.query<Exercise>(
      `SELECT * FROM exercises
         WHERE id != $1
           AND id <> ALL($2::int[])
           AND NOT (contraindicated_for && $3::text[])
           AND id = ANY($4::int[])
         ORDER BY array_position($4::int[], id)
         LIMIT $5`,
      [exerciseId, excludeIds, profile.injuries, curatedIds, limit],
    );
    if (c.rows.length) return c.rows;
  }

  const allowedEquipment = equipmentMatrix[profile.equipment];
  const athleteLevelOrd = athleteLevelRank(profile.level);

  const r = await pool.query<Exercise>(
    `SELECT * FROM exercises
       WHERE id != $1
         AND id <> ALL($7::int[])
         AND NOT (contraindicated_for && $5::text[])
         AND muscle_group = $2
         AND equipment = ANY($3::text[])
         AND CASE level_min
               WHEN 'principiante' THEN 1
               WHEN 'intermedio' THEN 2
               WHEN 'avanzado' THEN 3
             END <= $4
       ORDER BY
         CASE WHEN equipment = $6 THEN 0 ELSE 1 END,
         id
       LIMIT $8`,
    [exerciseId, orig.muscle_group, allowedEquipment,
     athleteLevelOrd, profile.injuries, orig.equipment, excludeIds,
     limit],
  );
  return r.rows;
}

export async function findAlternative(
  exerciseId: number,
  athleteId: string,
  excludeIds: number[] = [],
): Promise<Exercise | null> {
  const [first] = await findAlternatives(exerciseId, athleteId, excludeIds, 1);
  return first ?? null;
}
