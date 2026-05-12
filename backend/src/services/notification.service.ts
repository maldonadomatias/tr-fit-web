import pool from '../db/connect.js';
import { sendPush } from './push.service.js';
import { TEMPLATES } from './notification-templates.js';
import type { NotificationType, NotificationPrefs } from '../domain/types.js';
import logger from '../utils/logger.js';

const DEDUP_WINDOW_HOURS: Record<NotificationType, number> = {
  session_reminder: 12,
  session_missed: 24,
  week_start: 24,
  skeleton_approved: 1,
  sos_resolved: 1,
  rm_test_week: 24 * 7,
};

export async function notifyUser(
  userId: string,
  type: NotificationType,
  vars: Record<string, string> = {},
): Promise<void> {
  // 1. Check prefs
  const u = await pool.query<{ notification_prefs: NotificationPrefs }>(
    `SELECT notification_prefs FROM users WHERE id = $1`,
    [userId],
  );
  if (!u.rows[0]) return;
  if (!u.rows[0].notification_prefs[type]) return;

  // 2. Dedup check
  const dup = await pool.query(
    `SELECT 1 FROM notification_log
      WHERE user_id = $1 AND type = $2
        AND sent_at > now() - ($3 || ' hours')::interval
      LIMIT 1`,
    [userId, type, String(DEDUP_WINDOW_HOURS[type])],
  );
  if ((dup.rowCount ?? 0) > 0) return;

  // 3. Load tokens
  const tokens = await pool.query<{ token: string }>(
    `SELECT token FROM push_tokens WHERE user_id = $1`,
    [userId],
  );
  if (tokens.rowCount === 0) return;

  // 4. Render
  const rendered = TEMPLATES[type](vars);

  // 5. Send + cleanup
  let overall: 'sent' | 'failed' | 'token_invalid' = 'failed';
  for (const { token } of tokens.rows) {
    const status = await sendPush(token, {
      title: rendered.title,
      body: rendered.body,
      data: { route: rendered.route, ...vars },
    });
    if (status === 'token_invalid') {
      await pool
        .query(`DELETE FROM push_tokens WHERE token = $1`, [token])
        .catch((e) => logger.error({ err: e, token }, 'failed to delete invalid token'));
    }
    if (status === 'sent') overall = 'sent';
    else if (status === 'token_invalid' && overall !== 'sent') overall = 'token_invalid';
  }

  // 6. Log
  await pool.query(
    `INSERT INTO notification_log (user_id, type, payload, delivery_status)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, JSON.stringify(vars), overall],
  );
}
