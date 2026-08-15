import pool from '../db/connect.js';
import type { Exercise, AthleteProfile } from '../domain/types.js';
import { athleteLevelRank } from './level-helpers.js';
import { resolveUnit, type Unit } from './equipment-units.service.js';

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
 * or every curated one knocked out by the injury guard.
 * Curated ones skip the equipment/level filter — an admin already vouched for
 * them — but NOTHING skips the injury guard or the caller's exclude list.
 *
 * Que la rutina de hoy se coma la lista curada NO abre el barrido: devolvemos
 * vacío. "Vuelos Laterales con Mancuerna" tiene una sola curada ("Vuelo lateral
 * en polea") y el armador de rutinas los pone el mismo día, así que el exclude
 * la vaciaba y el atleta terminaba viendo press militar y face pull como
 * reemplazo de un lateral (reporte 2026-08-15). Si el admin eligió a mano, lo
 * que no listó no es alternativa: mejor "esperá la máquina" que un ejercicio
 * de otra porción del músculo.
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
    // El exclude se aplica DESPUÉS, en JS: hace falta saber si la curación
    // sobrevivió al filtro de lesiones antes de decidir si el barrido corre.
    const c = await pool.query<Exercise>(
      `SELECT * FROM exercises
         WHERE id != $1
           AND NOT (contraindicated_for && $2::text[])
           AND id = ANY($3::int[])
         ORDER BY array_position($3::int[], id)`,
      [exerciseId, profile.injuries, curatedIds],
    );
    // Curación viable: manda, aunque la rutina de hoy la deje en cero.
    if (c.rows.length) {
      return c.rows.filter((e) => !excludeIds.includes(e.id)).slice(0, limit);
    }
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

export interface AlternativePayload {
  id: number;
  name: string;
  muscle_group: string;
  equipment: string;
  unit: Unit;
  suggested_value: number | null;
}

/**
 * What the app needs to swap a slot to this exercise: its OWN unit and its OWN
 * working weight (athlete_exercise_weights), never the replaced exercise's.
 * Inheriting the replaced slot's weight put a hack's 80 kg on a leg extension
 * (athlete report 2026-08-13); each exercise carries its own history.
 *
 * A value logged under a unit that no longer matches is dropped (10 ladrillos
 * is not 10 kg) — same rule as the session engine. No history yet → null, and
 * the athlete enters the weight.
 */
export async function toAlternativePayloads(
  athleteId: string,
  exercises: Pick<Exercise, 'id' | 'name' | 'muscle_group' | 'equipment'>[],
): Promise<AlternativePayload[]> {
  if (exercises.length === 0) return [];
  const equipments = [...new Set(exercises.map((e) => e.equipment))];
  const unitByEquipment = new Map(
    await Promise.all(
      equipments.map(async (eq) => [eq, await resolveUnit(athleteId, eq)] as const),
    ),
  );
  const wR = await pool.query<{
    exercise_id: number;
    current_value: string | null;
    unit: Unit | null;
  }>(
    `SELECT exercise_id,
            COALESCE(current_value, current_weight_kg) AS current_value,
            unit
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, exercises.map((e) => e.id)],
  );
  const wByEx = new Map(wR.rows.map((r) => [r.exercise_id, r]));

  return exercises.map((e) => {
    const unit = unitByEquipment.get(e.equipment)!;
    const w = wByEx.get(e.id);
    const staleUnit = !!w?.unit && w.unit !== unit;
    return {
      id: e.id,
      name: e.name,
      muscle_group: e.muscle_group,
      equipment: e.equipment,
      unit,
      suggested_value:
        !w || staleUnit || w.current_value === null ? null : Number(w.current_value),
    };
  });
}
