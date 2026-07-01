import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { sendCoachPainAlert } from './email.service.js';
import {
  isActionAllowedForType,
  PAYLOAD_SCHEMA_BY_ACTION,
  type AlertResolutionAction,
  type AlertType,
} from '../domain/alert-actions.js';
import { enqueueRegenJob } from './skeleton-regen.service.js';

export class AlertError extends Error {
  constructor(public reason: 'no_coach_assigned' | 'not_found' | 'forbidden') {
    super(reason);
  }
}

// Persisted client state can carry a session_log_id whose row is gone
// (DB reset, env switch, manual delete). FK would 500 the alert. Pain
// content matters more than the link — drop the link if it's stale.
async function resolveSessionLogId(
  athleteId: string,
  sessionLogId: string | undefined,
): Promise<string | null> {
  if (!sessionLogId) return null;
  const r = await pool.query(
    `SELECT 1 FROM session_logs WHERE id = $1 AND athlete_id = $2`,
    [sessionLogId, athleteId],
  );
  if (r.rowCount) return sessionLogId;
  logger.warn(
    { athleteId, sessionLogId },
    'alert references unknown session_log; storing alert with NULL session_log_id',
  );
  return null;
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

  const sessionLogId = await resolveSessionLogId(
    input.athleteId, input.sessionLogId,
  );
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_pain', 'red', $3, $4, $5::jsonb) RETURNING id`,
    [input.athleteId, athlete.coach_id, input.exerciseId,
     sessionLogId,
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

  const sessionLogId = await resolveSessionLogId(
    input.athleteId, input.sessionLogId,
  );
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_machine', 'info', $3, $4, $5::jsonb) RETURNING id`,
    [input.athleteId, coachId, input.exerciseId,
     sessionLogId,
     JSON.stringify({ switched_to_exercise_id: input.switchedToExerciseId })],
  );
  return { alertId: ins.rows[0].id };
}

export interface ListAlertsOpts {
  status?: 'open' | 'resolved' | 'all';
  type?: string;
  severity?: string;
  athleteId?: string;
  limit?: number;
  page?: number;
}

export async function listAlertsForCoach(
  coachId: string,
  opts: ListAlertsOpts | boolean = {},
): Promise<unknown[]> {
  const o: ListAlertsOpts = typeof opts === 'boolean'
    ? { status: opts ? 'open' : 'all' }
    : opts;
  const where: string[] = ['ca.coach_id = $1'];
  const params: unknown[] = [coachId];
  const push = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace('$$', `$${params.length}`));
  };
  if (o.status === 'open') where.push('ca.resolved_at IS NULL');
  if (o.status === 'resolved') where.push('ca.resolved_at IS NOT NULL');
  if (o.type) push('ca.type = $$', o.type);
  if (o.severity) push('ca.severity = $$', o.severity);
  if (o.athleteId) push('ca.athlete_id = $$', o.athleteId);

  const limit = Math.max(1, Math.min(o.limit ?? 50, 200));
  const offset = ((o.page ?? 1) - 1) * limit;
  params.push(limit, offset);

  const r = await pool.query(
    `SELECT ca.id, ca.type, ca.severity, ca.payload, ca.created_at,
            ca.read_at, ca.resolved_at, ca.athlete_id, ca.exercise_id,
            ca.resolution_action, ca.resolution_note,
            resolver.email AS resolved_by_email,
            ap.name AS athlete_name, e.name AS exercise_name
       FROM coach_alerts ca
       JOIN athlete_profiles ap ON ap.user_id = ca.athlete_id
       LEFT JOIN exercises e ON e.id = ca.exercise_id
       LEFT JOIN users resolver ON resolver.id = ca.resolved_by
      WHERE ${where.join(' AND ')}
      ORDER BY ca.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
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

export class ResolveAlertError extends Error {
  constructor(
    public reason:
      | 'not_found'
      | 'invalid_action'
      | 'invalid_payload'
      | 'already_resolved'
      | 'missing_state',
  ) {
    super(reason);
  }
}

export interface ResolveAlertInput {
  action: AlertResolutionAction;
  payload: Record<string, unknown>;
  note?: string;
}

export async function resolveAlert(
  alertId: string,
  coachId: string,
  input: ResolveAlertInput,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query<{
      id: string; type: AlertType; athlete_id: string;
      exercise_id: number | null; payload: Record<string, unknown>;
      resolution_action: string | null;
    }>(
      `SELECT id, type, athlete_id, exercise_id, payload, resolution_action
         FROM coach_alerts WHERE id = $1 AND coach_id = $2 FOR UPDATE`,
      [alertId, coachId],
    );
    const alert = r.rows[0];
    if (!alert) throw new ResolveAlertError('not_found');
    if (alert.resolution_action) throw new ResolveAlertError('already_resolved');

    if (!isActionAllowedForType(alert.type, input.action)) {
      throw new ResolveAlertError('invalid_action');
    }
    const schema = PAYLOAD_SCHEMA_BY_ACTION[input.action];
    const parsed = schema.safeParse(input.payload);
    if (!parsed.success) throw new ResolveAlertError('invalid_payload');
    const payload = parsed.data as Record<string, unknown>;

    // Side-effects per action.
    if (
      input.action === 'swap_exercise' ||
      input.action === 'skip_week' ||
      input.action === 'reduce_intensity' ||
      input.action === 'approve_switch'
    ) {
      const stR = await client.query<{ current_week: number }>(
        `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
        [alert.athlete_id],
      );
      const state = stR.rows[0];
      if (!state) throw new ResolveAlertError('missing_state');

      const origExerciseId = alert.exercise_id;
      if (!origExerciseId) throw new ResolveAlertError('invalid_action');

      let overrideType: 'swap' | 'skip' | 'reduce_intensity';
      let replacementExerciseId: number | null = null;
      let intensityPayload: Record<string, unknown> = {};

      if (input.action === 'swap_exercise') {
        overrideType = 'swap';
        replacementExerciseId = (payload as { replacement_exercise_id: number })
          .replacement_exercise_id;
      } else if (input.action === 'skip_week') {
        overrideType = 'skip';
      } else if (input.action === 'reduce_intensity') {
        overrideType = 'reduce_intensity';
        intensityPayload = payload;
      } else {
        // approve_switch: read switched_to_exercise_id from the original alert payload,
        // not from the request. Prevents the coach from approving a different swap
        // than what the athlete actually did.
        const switched = (alert.payload as { switched_to_exercise_id?: number })
          .switched_to_exercise_id;
        if (!switched) throw new ResolveAlertError('invalid_payload');
        overrideType = 'swap';
        replacementExerciseId = switched;
      }

      // Reject override-of-override on the same week/exercise.
      const dup = await client.query(
        `SELECT 1 FROM weekly_overrides
          WHERE athlete_id = $1
            AND program_week <= $2 AND expires_after_week >= $2
            AND original_exercise_id = $3
          LIMIT 1`,
        [alert.athlete_id, state.current_week, origExerciseId],
      );
      if ((dup.rowCount ?? 0) > 0) {
        throw new ResolveAlertError('already_resolved');
      }

      await client.query(
        `INSERT INTO weekly_overrides
           (athlete_id, program_week, day_of_week, original_exercise_id,
            replacement_exercise_id, override_type, intensity_payload,
            source_alert_id, created_by, expires_after_week)
         VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
        [
          alert.athlete_id, state.current_week, origExerciseId,
          replacementExerciseId, overrideType,
          JSON.stringify(intensityPayload), alert.id, coachId,
          state.current_week,
        ],
      );
    }
    // revert_switch / reschedule_rm / skip_rm_block / acknowledge / note_only:
    // audit-only.

    await client.query(
      `UPDATE coach_alerts
          SET resolution_action = $1,
              resolution_payload = $2::jsonb,
              resolution_note = $3,
              resolved_at = NOW(),
              resolved_by = $4
        WHERE id = $5`,
      [input.action, JSON.stringify(payload), input.note ?? null, coachId, alert.id],
    );

    await client.query('COMMIT');

    // Post-commit side-effects (cannot be in-tx because they use their own
    // DB connections / external services).
    if (input.action === 'regen_skeleton') {
      try {
        await enqueueRegenJob(alert.athlete_id);
      } catch (e) {
        logger.error(
          { err: e, alertId: alert.id },
          'enqueueRegenJob failed post-commit; alert is resolved but regen was not enqueued',
        );
        // Do NOT rethrow — the alert is already resolved. Coach can re-trigger
        // regen separately or via the admin rutina page.
      }
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export interface CreateNoMachineAlertInput {
  athleteId: string;
  exerciseId: number;
  replacementExerciseId: number | null;
  sessionLogId?: string;
}

export async function createNoMachineAlert(
  input: CreateNoMachineAlertInput,
): Promise<{ alertId: string }> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [input.athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) throw new AlertError('no_coach_assigned');

  const sessionLogId = await resolveSessionLogId(
    input.athleteId, input.sessionLogId,
  );
  // No replacement found → coach must resolve manually → bump severity.
  const severity = input.replacementExerciseId === null ? 'yellow' : 'info';
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, 'sos_no_machine', $3, $4, $5, $6::jsonb) RETURNING id`,
    [input.athleteId, coachId, severity, input.exerciseId, sessionLogId,
     JSON.stringify({ replacement_exercise_id: input.replacementExerciseId })],
  );
  return { alertId: ins.rows[0].id };
}

export async function createProgramResetAlert(
  athleteId: string,
): Promise<{ alertId: string }> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) throw new AlertError('no_coach_assigned');

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, payload)
     VALUES ($1, $2, 'program_reset', 'info', '{}'::jsonb) RETURNING id`,
    [athleteId, coachId],
  );
  return { alertId: ins.rows[0].id };
}
