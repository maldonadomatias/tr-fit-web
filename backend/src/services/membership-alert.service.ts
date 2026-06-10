import pool from '../db/connect.js';
import type { AlertType } from '../domain/alert-actions.js';

export function membershipAlertSeverity(type: AlertType): 'yellow' | 'red' {
  return type === 'membership_overdue' ? 'red' : 'yellow';
}

/**
 * Creates a coach_alert for a membership transition. No-op if the athlete has
 * no assigned coach. exercise_id/session_log_id are null for billing alerts.
 */
export async function createMembershipAlert(
  athleteId: string,
  type: 'membership_expiring' | 'membership_overdue',
  paidUntil: string,
): Promise<void> {
  const a = await pool.query<{ coach_id: string | null }>(
    `SELECT coach_id FROM athlete_profiles WHERE user_id = $1`,
    [athleteId],
  );
  const coachId = a.rows[0]?.coach_id;
  if (!coachId) return;
  await pool.query(
    `INSERT INTO coach_alerts
       (athlete_id, coach_id, type, severity, exercise_id, session_log_id, payload)
     VALUES ($1, $2, $3, $4, NULL, NULL, $5::jsonb)`,
    [athleteId, coachId, type, membershipAlertSeverity(type),
     JSON.stringify({ paid_until: paidUntil })],
  );
}
