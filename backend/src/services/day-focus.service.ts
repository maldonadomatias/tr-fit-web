import pool from '../db/connect.js';

/**
 * Grupo primario de un `muscle_group`: los subgrupos vienen como
 * "Piernas - Cuadriceps" y la separación que le importa al coach es la del
 * grupo grande ("no dos días de Piernas seguidos").
 */
export function primaryGroup(muscleGroup: string): string {
  const [head] = muscleGroup.split(' - ');
  return (head ?? muscleGroup).trim();
}

/**
 * Grupo dominante de cada día del skeleton: el grupo primario con más slots
 * PRINCIPALES; a igual cantidad gana el que aparece primero en el día.
 *
 * Se deriva de los slots en vez de leer `skeleton_days.focus` porque el focus
 * es una etiqueta compuesta ("Piernas / Espalda / Abdomen") que no sirve para
 * comparar dos días. Un día sin principales no entra en el record: no tiene
 * grupo dominante y por lo tanto nunca bloquea.
 */
export async function dominantGroupByDay(
  skeletonId: string
): Promise<Record<number, string | null>> {
  const r = await pool.query<{
    day_of_week: number;
    muscle_group: string;
    slot_index: number;
  }>(
    `SELECT s.day_of_week, e.muscle_group, s.slot_index
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.skeleton_id = $1 AND s.role = 'principal'
      ORDER BY s.day_of_week, s.slot_index`,
    [skeletonId]
  );

  // Conteo por (día, grupo) conservando el primer slot_index de cada grupo,
  // que es el desempate.
  const byDay = new Map<number, Map<string, { n: number; firstSlot: number }>>();
  for (const row of r.rows) {
    const group = primaryGroup(row.muscle_group);
    if (!byDay.has(row.day_of_week)) byDay.set(row.day_of_week, new Map());
    const groups = byDay.get(row.day_of_week)!;
    const cur = groups.get(group);
    if (cur) cur.n += 1;
    else groups.set(group, { n: 1, firstSlot: row.slot_index });
  }

  const out: Record<number, string | null> = {};
  for (const [day, groups] of byDay) {
    let best: { group: string; n: number; firstSlot: number } | null = null;
    for (const [group, { n, firstSlot }] of groups) {
      if (
        !best ||
        n > best.n ||
        (n === best.n && firstSlot < best.firstSlot)
      ) {
        best = { group, n, firstSlot };
      }
    }
    out[day] = best?.group ?? null;
  }
  return out;
}
