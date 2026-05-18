import pool from '../db/connect.js';

export type Unit = 'kg' | 'ladrillos';

export class EquipmentUnitsError extends Error {
  constructor(public reason: 'invalid_equipment') { super(reason); }
}

// "ladrillos" = stack-pin plate count on selectorized cable/machine equipment.
export const DEFAULT_UNIT_BY_EQUIPMENT: Record<string, Unit> = {
  polea: 'ladrillos',
  maquina: 'ladrillos',
  barra: 'kg',
  mancuerna: 'kg',
  smith: 'kg',
  pesa_rusa: 'kg',
  disco: 'kg',
  bw: 'kg',
  elastico: 'kg',
};

export async function resolveUnit(athleteId: string, equipment: string): Promise<Unit> {
  const r = await pool.query<{ unit: Unit }>(
    `SELECT unit FROM athlete_equipment_units
       WHERE athlete_id = $1 AND equipment = $2`,
    [athleteId, equipment],
  );
  if (r.rows[0]) return r.rows[0].unit;
  return DEFAULT_UNIT_BY_EQUIPMENT[equipment] ?? 'kg';
}

export async function listUserUnits(
  athleteId: string,
): Promise<Array<{ equipment: string; unit: Unit }>> {
  const r = await pool.query<{ equipment: string; unit: Unit }>(
    `SELECT equipment, unit FROM athlete_equipment_units WHERE athlete_id = $1`,
    [athleteId],
  );
  return r.rows;
}

export async function setUserUnit(
  athleteId: string,
  equipment: string,
  unit: Unit,
): Promise<void> {
  if (!(equipment in DEFAULT_UNIT_BY_EQUIPMENT)) {
    throw new EquipmentUnitsError('invalid_equipment');
  }
  await pool.query(
    `INSERT INTO athlete_equipment_units (athlete_id, equipment, unit, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (athlete_id, equipment) DO UPDATE SET
       unit = EXCLUDED.unit, updated_at = NOW()`,
    [athleteId, equipment, unit],
  );
}
