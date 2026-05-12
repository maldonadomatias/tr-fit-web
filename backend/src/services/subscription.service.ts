import pool from '../db/connect.js';
import { env } from '../config/env.js';
import { createPreapproval, fetchPreapproval } from './mp.service.js';
import type { PlanInterest } from '../domain/types.js';

const PLAN_IDS: Record<PlanInterest, string> = {
  basico: env.MP_PLAN_ID_BASICO,
  full: env.MP_PLAN_ID_FULL,
  premium: env.MP_PLAN_ID_PREMIUM,
};

export class SubscriptionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
  }
}

export interface MpWebhookPayload {
  type: string;
  data: { id: string };
}

export async function createSubscription(params: {
  athleteId: string;
  tier: PlanInterest;
  payerEmail: string;
}): Promise<{ checkoutUrl: string; subscriptionId: string }> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM subscriptions
     WHERE athlete_id = $1 AND tier = $2 AND status = 'authorized'`,
    [params.athleteId, params.tier],
  );
  if ((existing.rowCount ?? 0) > 0) {
    throw new SubscriptionError('Already subscribed to this tier', 409, 'already_subscribed');
  }

  const planId = PLAN_IDS[params.tier];
  const { preapprovalId, checkoutUrl } = await createPreapproval({
    planId,
    athleteId: params.athleteId,
    payerEmail: params.payerEmail,
    backUrl: env.MP_BACK_URL,
  });

  const r = await pool.query<{ id: string }>(
    `INSERT INTO subscriptions
       (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [params.athleteId, params.tier, preapprovalId, planId],
  );

  return { checkoutUrl, subscriptionId: r.rows[0].id };
}

export async function handleWebhookEvent(payload: MpWebhookPayload): Promise<void> {
  if (payload.type !== 'subscription_preapproval') return;

  const preapprovalId = payload.data.id;

  const subR = await pool.query<{ id: string; athlete_id: string; tier: PlanInterest }>(
    `SELECT id, athlete_id, tier FROM subscriptions
     WHERE mp_preapproval_id = $1`,
    [preapprovalId],
  );
  if (subR.rowCount === 0) return;

  const sub = subR.rows[0];
  const { status, nextPaymentDate } = await fetchPreapproval(preapprovalId);

  if (status === 'authorized') {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'authorized', current_period_end = $1, updated_at = now()
       WHERE id = $2`,
      [nextPaymentDate, sub.id],
    );
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = $1 WHERE user_id = $2`,
      [sub.tier, sub.athlete_id],
    );
  } else if (status === 'paused') {
    await pool.query(
      `UPDATE subscriptions SET status = 'paused', updated_at = now() WHERE id = $1`,
      [sub.id],
    );
  } else if (status === 'cancelled') {
    await pool.query(
      `UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [sub.id],
    );
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = NULL WHERE user_id = $1`,
      [sub.athlete_id],
    );
  }
}
