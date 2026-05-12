import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { sendCoachPainAlert } from './email.service.js';

export class AlertError extends Error {
  constructor(public reason: 'no_coach_assigned' | 'not_found' | 'forbidden') {
    super(reason);
  }
}

export interface CreatePainAlertInput {
  athleteId: string;
  exerciseId: number;
  sessionLogId?: string;
  zone: 'lumbar' | 'rodilla' | 'hombro' | 'cervical' | 'cadera' | 'otro';
  intensity: number;
}

export async function createPainAlert(
  input: CreatePainAlertInput,
): Promise<{ alertId: string; emailSendFailed: boolean }> {
  const a = await pool.query<{ name: string; coach_id: string | null }>(
    `SELECT name, coach_id FROM athlete_profiles WHERE user_id = $1`,
    [input.athleteId],
  );
  const athlete = a.rows[0];
  if (!athlete?.coach_id) throw new AlertError('no_coach_assigned');

  const c = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`, [athlete.coach_id],
  );
  const ex = await pool.query<{ name: string }>(
    `SELECT name FROM exercises WHERE id = $1`, [input.exerciseId],
  );
  if (!c.rows[0] || !ex.rows[0]) throw new AlertError('not_found');

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_pain', 'red', $3, $4, $5::jsonb) RETURNING id`,
    [input.athleteId, athlete.coach_id, input.exerciseId,
     input.sessionLogId ?? null,
     JSON.stringify({ zone: input.zone, intensity: input.intensity })],
  );

  let emailSendFailed = false;
  try {
    await sendCoachPainAlert({
      coachEmail: c.rows[0].email,
      athleteName: athlete.name,
      exerciseName: ex.rows[0].name,
      zone: input.zone,
      intensity: input.intensity,
      alertId: ins.rows[0].id,
    });
  } catch (e) {
    logger.error({ err: e, alertId: ins.rows[0].id }, 'pain alert email failed');
    emailSendFailed = true;
  }

  return { alertId: ins.rows[0].id, emailSendFailed };
}

export interface CreateMachineAlertInput {
  athleteId: string;
  exerciseId: number;
  switchedToExerciseId: number;
  sessionLogId?: string;
}

export async function createMachineAlert(
  input: CreateMachineAlertInput,
): Promise<{ alertId: string }> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [input.athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) throw new AlertError('no_coach_assigned');

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_machine', 'info', $3, $4, $5::jsonb) RETURNING id`,
    [input.athleteId, coachId, input.exerciseId,
     input.sessionLogId ?? null,
     JSON.stringify({ switched_to_exercise_id: input.switchedToExerciseId })],
  );
  return { alertId: ins.rows[0].id };
}

export async function listAlertsForCoach(
  coachId: string,
  unreadOnly: boolean,
): Promise<unknown[]> {
  const filter = unreadOnly ? `AND ca.read_at IS NULL` : '';
  const r = await pool.query(
    `SELECT ca.id, ca.type, ca.severity, ca.payload, ca.created_at,
            ca.read_at, ca.resolved_at,
            ap.name AS athlete_name, e.name AS exercise_name
       FROM coach_alerts ca
       JOIN athlete_profiles ap ON ap.user_id = ca.athlete_id
       LEFT JOIN exercises e ON e.id = ca.exercise_id
      WHERE ca.coach_id = $1 ${filter}
      ORDER BY ca.created_at DESC`,
    [coachId],
  );
  return r.rows;
}

export async function markRead(alertId: string, coachId: string): Promise<void> {
  const r = await pool.query(
    `UPDATE coach_alerts SET read_at = NOW()
      WHERE id = $1 AND coach_id = $2 AND read_at IS NULL`,
    [alertId, coachId],
  );
  if (r.rowCount === 0) throw new AlertError('not_found');
}

export async function markResolved(alertId: string, coachId: string): Promise<void> {
  const r = await pool.query(
    `UPDATE coach_alerts SET resolved_at = NOW()
      WHERE id = $1 AND coach_id = $2 AND resolved_at IS NULL`,
    [alertId, coachId],
  );
  if (r.rowCount === 0) throw new AlertError('not_found');
}
