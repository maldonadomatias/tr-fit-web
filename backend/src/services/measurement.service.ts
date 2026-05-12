import pool from '../db/connect.js';
import type { AthleteMeasurement } from '../domain/types.js';
import type { MeasurementPayload } from '../domain/schemas.js';

export async function createMeasurement(
  athleteId: string,
  payload: MeasurementPayload,
  source: 'onboarding' | 'manual' | 'coach' = 'manual',
): Promise<AthleteMeasurement> {
  const r = await pool.query<AthleteMeasurement>(
    `INSERT INTO athlete_measurements
       (athlete_id, chest_cm, waist_cm, hip_cm, thigh_cm, calf_cm, bicep_cm,
        body_weight_kg, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      athleteId,
      payload.chest_cm ?? null,
      payload.waist_cm ?? null,
      payload.hip_cm ?? null,
      payload.thigh_cm ?? null,
      payload.calf_cm ?? null,
      payload.bicep_cm ?? null,
      payload.body_weight_kg ?? null,
      source,
    ],
  );
  return r.rows[0];
}

export async function listMeasurements(
  athleteId: string,
  limit = 20,
): Promise<AthleteMeasurement[]> {
  const r = await pool.query<AthleteMeasurement>(
    `SELECT * FROM athlete_measurements
      WHERE athlete_id = $1
      ORDER BY measured_at DESC
      LIMIT $2`,
    [athleteId, limit],
  );
  return r.rows;
}
