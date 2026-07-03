import cron from 'node-cron';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { GRACE_DAYS } from '../services/membership.service.js';
import {
  sendMembershipExpiringEmail, sendMembershipExpiredEmail,
} from '../services/email.service.js';
import { notifyUser } from '../services/notification.service.js';
import { createMembershipAlert } from '../services/membership-alert.service.js';

interface Row {
  user_id: string;
  email: string;
  name: string | null;
  paid_until: string;
}

/**
 * Derives membership.status from paid_until and sends one email per transition.
 * Emails fire only on the status change (active→expiring, *→expired), so the
 * one-time UPDATE is the dedupe — no separate log needed. Cancelled is never touched.
 * Never denies access on its own (login recomputes from paid_until), so a missed
 * tick only delays the email/label.
 */
export async function runMembershipTick(): Promise<void> {
  // 1. expired: past paid_until, not cancelled/expired yet
  const expired = await pool.query<Row>(
    `UPDATE memberships m
        SET status = 'expired', updated_at = now()
       FROM users u
      WHERE m.user_id = u.id
        AND m.status NOT IN ('expired', 'cancelled', 'paused')
        AND m.paid_until IS NOT NULL
        AND m.paid_until <> 'infinity'
        AND m.paid_until < now()
      RETURNING m.user_id, u.email,
                (SELECT name FROM athlete_profiles WHERE user_id = m.user_id) AS name,
                m.paid_until`,
  );

  // 2. expiring: within grace window, currently active
  const expiring = await pool.query<Row>(
    `UPDATE memberships m
        SET status = 'expiring', updated_at = now()
       FROM users u
      WHERE m.user_id = u.id
        AND m.status = 'active'
        AND m.paid_until IS NOT NULL
        AND m.paid_until <> 'infinity'
        AND m.paid_until >= now()
        AND m.paid_until <= now() + ($1 || ' days')::interval
      RETURNING m.user_id, u.email,
                (SELECT name FROM athlete_profiles WHERE user_id = m.user_id) AS name,
                m.paid_until`,
    [String(GRACE_DAYS)],
  );

  // 3. re-activate: renewed beyond grace but still flagged expiring/expired
  await pool.query(
    `UPDATE memberships
        SET status = 'active', updated_at = now()
      WHERE status IN ('expiring', 'expired')
        AND paid_until IS NOT NULL
        AND (paid_until = 'infinity' OR paid_until > now() + ($1 || ' days')::interval)`,
    [String(GRACE_DAYS)],
  );

  for (const r of expired.rows) {
    try {
      await sendMembershipExpiredEmail({ email: r.email, name: r.name ?? 'atleta' });
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership expired email failed');
    }
    try {
      await notifyUser(r.user_id, 'membership_expired');
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership expired push failed');
    }
    try {
      await createMembershipAlert(r.user_id, 'membership_overdue', r.paid_until);
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership overdue alert failed');
    }
  }
  for (const r of expiring.rows) {
    const daysLeft = Math.max(
      0, Math.ceil((new Date(r.paid_until).getTime() - Date.now()) / 86_400_000),
    );
    try {
      await sendMembershipExpiringEmail({
        email: r.email, name: r.name ?? 'atleta',
        paidUntil: new Date(r.paid_until).toISOString().slice(0, 10), daysLeft,
      });
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership expiring email failed');
    }
    try {
      await notifyUser(r.user_id, 'membership_expiring', { days: String(daysLeft) });
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership expiring push failed');
    }
    try {
      await createMembershipAlert(r.user_id, 'membership_expiring', r.paid_until);
    } catch (e) {
      logger.error({ err: e, userId: r.user_id }, 'membership expiring alert failed');
    }
  }

  logger.info(
    { expired: expired.rowCount, expiring: expiring.rowCount },
    'membership tick complete',
  );
}

let task: ReturnType<typeof cron.schedule> | null = null;

export function startMembershipCron(): void {
  if (task) return;
  // Daily at 09:00 server time.
  task = cron.schedule('0 9 * * *', () => {
    runMembershipTick().catch((e) => logger.error({ err: e }, 'membership cron failed'));
  });
  logger.info('membership cron scheduled');
}
