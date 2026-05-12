import type { PlanInterest } from '../domain/types.js';
import pool from '../db/connect.js';

const RANK: Record<PlanInterest, number> = {
  basico: 0, full: 1, premium: 2,
};

export function hasTier(actual: PlanInterest, min: PlanInterest): boolean {
  return RANK[actual] >= RANK[min];
}

export async function getUserTier(userId: string): Promise<PlanInterest | null> {
  const r = await pool.query<{ plan_interest: PlanInterest | null }>(
    `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0]?.plan_interest ?? null;
}
