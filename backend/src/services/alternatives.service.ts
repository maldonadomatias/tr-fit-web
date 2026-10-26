import pool from '../db/connect.js';
import type { Exercise, AthleteProfile } from '../domain/types.js';
import { athleteLevelRank } from './level-helpers.js';
import { resolveUnit, type Unit } from './equipment-units.service.js';
import {
  pickSuggestedWeight,
  suggestDropWeights,
  type SchemeWeightRow,
  type WeightScheme,
} from './progression-helpers.js';

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
  // Present only when today's slot is a dropset and this exercise has its own
  // drop history. The slot's rep count is NOT replaced.
  suggested_drops?: number[];
}

/**
 * Last completed drop series per exercise (heaviest first), plus the last
 * straight-set weight. Used when the weight row for that scheme was never
 * written — the offline sync path used to store the set and skip the
 * suggestion.
 */
async function loadLastLoggedWeights(
  athleteId: string,
  exerciseIds: number[],
): Promise<{
  drops: Map<number, { unit: string | null; values: number[] }>;
  straight: Map<number, { unit: string | null; value: number }>;
}> {
  const drops = new Map<number, { unit: string | null; values: number[] }>();
  const straight = new Map<number, { unit: string | null; value: number }>();
  if (exerciseIds.length === 0) return { drops, straight };

  const dropR = await pool.query<{
    exercise_id: number;
    drop_index: number;
    unit: string | null;
    value: number;
  }>(
    `WITH last_drop_series AS (
       SELECT DISTINCT ON (exercise_id)
              exercise_id, week, day_of_week, set_index
         FROM set_logs
        WHERE athlete_id = $1
          AND exercise_id = ANY($2::int[])
          AND drop_index IS NOT NULL
          AND completed = TRUE
          AND COALESCE(value, weight_kg) IS NOT NULL
        ORDER BY exercise_id, logged_at DESC, week DESC, set_index DESC
     )
     SELECT sl.exercise_id,
            sl.drop_index,
            sl.unit,
            COALESCE(sl.value, sl.weight_kg)::float8 AS value
       FROM set_logs sl
       JOIN last_drop_series ls
         ON sl.exercise_id = ls.exercise_id
        AND sl.week = ls.week
        AND sl.day_of_week = ls.day_of_week
        AND sl.set_index = ls.set_index
      WHERE sl.athlete_id = $1
        AND sl.drop_index IS NOT NULL
        AND sl.completed = TRUE
        AND COALESCE(sl.value, sl.weight_kg) IS NOT NULL
      ORDER BY sl.exercise_id, sl.drop_index`,
    [athleteId, exerciseIds],
  );
  for (const row of dropR.rows) {
    const entry = drops.get(row.exercise_id) ?? { unit: row.unit, values: [] };
    entry.values[row.drop_index - 1] = Number(row.value);
    drops.set(row.exercise_id, entry);
  }
  for (const [id, entry] of drops) {
    entry.values = entry.values.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    drops.set(id, entry);
  }

  const straightR = await pool.query<{
    exercise_id: number;
    unit: string | null;
    value: number;
  }>(
    `SELECT DISTINCT ON (exercise_id)
            exercise_id,
            unit,
            COALESCE(value, weight_kg)::float8 AS value
       FROM set_logs
      WHERE athlete_id = $1
        AND exercise_id = ANY($2::int[])
        AND drop_index IS NULL
        AND completed = TRUE
        AND COALESCE(value, weight_kg) IS NOT NULL
      ORDER BY exercise_id, logged_at DESC`,
    [athleteId, exerciseIds],
  );
  for (const row of straightR.rows) {
    straight.set(row.exercise_id, { unit: row.unit, value: Number(row.value) });
  }
  return { drops, straight };
}

function loggedNumber(
  row: { unit: string | null; value: number } | undefined,
  targetUnit: Unit,
): number | null {
  if (!row || !Number.isFinite(row.value)) return null;
  if (row.unit && row.unit !== targetUnit) return null;
  return row.value;
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
 *
 * `slotReps` is the prescription the athlete still has to do today. The rep
 * count is not taken from the alternative: a 4×8 stays a 4×8 even when the
 * replacement was last trained as 10x10x10. The weight still comes back —
 * from the matching ladder, or from the other one when that cell is empty
 * (ticket #142).
 */
export async function toAlternativePayloads(
  athleteId: string,
  exercises: Pick<Exercise, 'id' | 'name' | 'muscle_group' | 'equipment'>[],
  slotReps?: string | null,
): Promise<AlternativePayload[]> {
  if (exercises.length === 0) return [];
  const equipments = [...new Set(exercises.map((e) => e.equipment))];
  const unitByEquipment = new Map(
    await Promise.all(
      equipments.map(async (eq) => [eq, await resolveUnit(athleteId, eq)] as const),
    ),
  );
  const ids = exercises.map((e) => e.id);
  const wR = await pool.query<{
    exercise_id: number;
    scheme: WeightScheme;
    current_value: number | null;
    unit: Unit | null;
  }>(
    `SELECT exercise_id,
            scheme,
            COALESCE(current_value, current_weight_kg)::float8 AS current_value,
            unit
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, ids],
  );
  const wByEx = new Map<number, SchemeWeightRow[]>();
  for (const row of wR.rows) {
    const list = wByEx.get(row.exercise_id) ?? [];
    list.push({
      scheme: row.scheme,
      value: row.current_value,
      unit: row.unit,
    });
    wByEx.set(row.exercise_id, list);
  }
  const logged = await loadLastLoggedWeights(athleteId, ids);

  return exercises.map((e) => {
    const unit = unitByEquipment.get(e.equipment)!;
    const dropEntry = logged.drops.get(e.id);
    const lastDrops =
      dropEntry && (!dropEntry.unit || dropEntry.unit === unit)
        ? dropEntry.values
        : [];
    const picked = pickSuggestedWeight({
      slotReps,
      targetUnit: unit,
      weights: wByEx.get(e.id) ?? [],
      lastDrops,
      lastStraight: loggedNumber(logged.straight.get(e.id), unit),
    });
    const dropCount = (slotReps?.match(/\d+/g) ?? []).length;
    const suggestedDrops = picked.useDropGaps
      ? suggestDropWeights(dropCount, picked.value, lastDrops)
      : null;
    return {
      id: e.id,
      name: e.name,
      muscle_group: e.muscle_group,
      equipment: e.equipment,
      unit,
      suggested_value: picked.value,
      ...(suggestedDrops ? { suggested_drops: suggestedDrops } : {}),
    };
  });
}
