import pool from '../db/connect.js';
import { findAlternative } from './alternatives.service.js';

export class AlertContextError extends Error {
  constructor(public reason: 'not_found') { super(reason); }
}

export interface AlertContext {
  alert: {
    id: string;
    type: string;
    severity: string;
    athlete_id: string;
    athlete_name: string;
    exercise_id: number | null;
    exercise_name: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  };
  suggestedAlternative: { id: number; name: string } | null;
  painHistory: { zone: string; intensity: number; created_at: string }[];
  activeSlot: {
    skeleton_slot_id: string;
    exercise_id: number;
    day_of_week: number;
  } | null;
}

export async function getAlertContext(
  alertId: string,
  coachId: string,
): Promise<AlertContext> {
  const r = await pool.query<{
    id: string; type: string; severity: string; athlete_id: string;
    athlete_name: string; exercise_id: number | null;
    exercise_name: string | null; payload: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT ca.id, ca.type, ca.severity, ca.athlete_id,
            ap.name AS athlete_name, ca.exercise_id,
            e.name AS exercise_name, ca.payload, ca.created_at
       FROM coach_alerts ca
       JOIN athlete_profiles ap ON ap.user_id = ca.athlete_id
       LEFT JOIN exercises e ON e.id = ca.exercise_id
      WHERE ca.id = $1 AND ca.coach_id = $2`,
    [alertId, coachId],
  );
  const alert = r.rows[0];
  if (!alert) throw new AlertContextError('not_found');

  let suggestedAlternative: AlertContext['suggestedAlternative'] = null;
  if (alert.exercise_id) {
    // findAlternative signature: (exerciseId, athleteId, excludeIds?)
    const alt = await findAlternative(alert.exercise_id, alert.athlete_id);
    if (alt) suggestedAlternative = { id: alt.id, name: alt.name };
  }

  const zone = (alert.payload as { zone?: string }).zone;
  const painHistory: AlertContext['painHistory'] = [];
  if (alert.type === 'sos_pain' && zone) {
    const ph = await pool.query<{ zone: string; intensity: number; created_at: string }>(
      `SELECT payload->>'zone' AS zone,
              (payload->>'intensity')::int AS intensity,
              created_at
         FROM coach_alerts
        WHERE athlete_id = $1 AND type = 'sos_pain'
          AND payload->>'zone' = $2
          AND id != $3
        ORDER BY created_at DESC LIMIT 6`,
      [alert.athlete_id, zone, alert.id],
    );
    painHistory.push(...ph.rows);
  }

  let activeSlot: AlertContext['activeSlot'] = null;
  if (alert.exercise_id) {
    const slR = await pool.query<{
      id: string; exercise_id: number; day_of_week: number;
    }>(
      `SELECT ss.id, ss.exercise_id, ss.day_of_week
         FROM skeleton_slots ss
         JOIN athlete_program_state ap ON ap.active_skeleton_id = ss.skeleton_id
        WHERE ap.athlete_id = $1 AND ss.exercise_id = $2 LIMIT 1`,
      [alert.athlete_id, alert.exercise_id],
    );
    if (slR.rows[0]) activeSlot = {
      skeleton_slot_id: slR.rows[0].id,
      exercise_id: slR.rows[0].exercise_id,
      day_of_week: slR.rows[0].day_of_week,
    };
  }

  return { alert, suggestedAlternative, painHistory, activeSlot };
}
