import bcrypt from 'bcrypt';
import pool from '../db/connect.js';

const BCRYPT_COST = 10;

export class AdminError extends Error {
  constructor(public code: 'email_taken' | 'not_found' | 'cannot_modify_self') {
    super(code);
  }
}

export type Role = 'athlete' | 'coach' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type SubTier = 'basico' | 'full' | 'premium';
export type SubStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface AdminUserRow {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  email_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
  name: string | null;
  subscription_tier: SubTier | null;
  subscription_status: SubStatus | null;
  current_period_end: string | null;
}

export interface ListFilters {
  status?: UserStatus;
  role?: Role;
  search?: string;
}

export async function listUsers(filters: ListFilters): Promise<AdminUserRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    where.push(`u.status = $${params.length}`);
  }
  if (filters.role) {
    params.push(filters.role);
    where.push(`u.role = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`LOWER(u.email) LIKE $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT
      u.id, u.email, u.role, u.status, u.email_verified, u.email_verified_at,
      u.created_at,
      COALESCE(ap.name, cp.name) AS name,
      s.tier AS subscription_tier,
      s.status AS subscription_status,
      s.current_period_end
    FROM users u
    LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
    LEFT JOIN coach_profiles cp ON cp.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT tier, status, current_period_end
        FROM subscriptions
       WHERE athlete_id = u.id
       ORDER BY created_at DESC
       LIMIT 1
    ) s ON TRUE
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT 500
  `;
  const r = await pool.query<AdminUserRow>(sql, params);
  return r.rows;
}

export async function getUser(id: string): Promise<AdminUserRow | null> {
  const r = await pool.query<AdminUserRow>(
    `SELECT
       u.id, u.email, u.role, u.status, u.email_verified, u.email_verified_at,
       u.created_at,
       COALESCE(ap.name, cp.name) AS name,
       s.tier AS subscription_tier,
       s.status AS subscription_status,
       s.current_period_end
     FROM users u
     LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT tier, status, current_period_end
         FROM subscriptions
        WHERE athlete_id = u.id
        ORDER BY created_at DESC
        LIMIT 1
     ) s ON TRUE
     WHERE u.id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: Role;
  status?: UserStatus;
  email_verified?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<AdminUserRow> {
  const email = input.email.trim().toLowerCase();
  const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.rowCount && exists.rowCount > 0) {
    throw new AdminError('email_taken');
  }
  const hash = await bcrypt.hash(input.password, BCRYPT_COST);
  const role = input.role ?? 'athlete';
  const status = input.status ?? 'approved';
  const verified = input.email_verified ?? true;

  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status, email_verified, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [email, hash, role, status, verified, verified ? new Date() : null],
  );
  const fresh = await getUser(r.rows[0].id);
  if (!fresh) throw new AdminError('not_found');
  return fresh;
}

export async function deleteUser(id: string): Promise<void> {
  const r = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  if (!r.rowCount) throw new AdminError('not_found');
}

export interface UpdateUserPatch {
  role?: Role;
  status?: UserStatus;
  email_verified?: boolean;
}

export async function updateUser(id: string, patch: UpdateUserPatch): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.role !== undefined) {
    params.push(patch.role);
    sets.push(`role = $${params.length}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.email_verified !== undefined) {
    params.push(patch.email_verified);
    sets.push(`email_verified = $${params.length}`);
    sets.push(
      patch.email_verified
        ? `email_verified_at = COALESCE(email_verified_at, NOW())`
        : `email_verified_at = NULL`,
    );
  }
  if (!sets.length) return;

  params.push(id);
  await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params,
  );
}

export interface UpsertSubInput {
  tier: SubTier;
  status: SubStatus;
  current_period_end?: string | null;
}

// Admin-managed manual subscription. Bypasses MercadoPago. Uses a synthetic
// preapproval/plan id so we don't collide with real MP rows.
export async function upsertManualSubscription(
  userId: string,
  input: UpsertSubInput,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM subscriptions
        WHERE athlete_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE subscriptions
            SET tier = $1, status = $2,
                current_period_end = $3, updated_at = NOW()
          WHERE id = $4`,
        [
          input.tier,
          input.status,
          input.current_period_end ?? null,
          existing.rows[0].id,
        ],
      );
    } else {
      const synthetic = `admin_${userId}_${Date.now()}`;
      await client.query(
        `INSERT INTO subscriptions
           (athlete_id, tier, mp_preapproval_id, mp_plan_id, status,
            current_period_end)
         VALUES ($1, $2, $3, 'admin_manual', $4, $5)`,
        [
          userId,
          input.tier,
          synthetic,
          input.status,
          input.current_period_end ?? null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function cancelSubscription(userId: string): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
        SET status = 'cancelled', updated_at = NOW()
      WHERE athlete_id = $1
        AND status <> 'cancelled'`,
    [userId],
  );
}

// ARS/mes per tier. Update here if pricing changes.
export const TIER_PRICE_ARS: Record<SubTier, number> = {
  basico: 15000,
  full: 25000,
  premium: 70000,
};

export interface AdminStats {
  signups_30d: number;
  signups_delta_pct: number;
  signups_trend: number[];
  pending_count: number;
  active_subs: number;
  active_subs_delta: number;
  mrr_estimated: number;
  mrr_delta_pct: number;
  mrr_trend: number[];
  churn_pct: number;
  churn_delta_pp: number;
  verified_pct: number;
}

function priceCase(alias = 's'): string {
  return `CASE
            WHEN ${alias}.tier = 'basico'  THEN ${TIER_PRICE_ARS.basico}
            WHEN ${alias}.tier = 'full'    THEN ${TIER_PRICE_ARS.full}
            WHEN ${alias}.tier = 'premium' THEN ${TIER_PRICE_ARS.premium}
            ELSE 0
          END`;
}

export async function getStats(): Promise<AdminStats> {
  const signupsRes = await pool.query<{
    cur: string;
    prev: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS cur,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '60 days'
           AND created_at <  NOW() - INTERVAL '30 days'
       ) AS prev
       FROM users`,
  );
  const cur = Number(signupsRes.rows[0]?.cur ?? 0);
  const prev = Number(signupsRes.rows[0]?.prev ?? 0);
  const signupsDeltaPct = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

  const trendRes = await pool.query<{ cnt: string }>(
    `SELECT COALESCE(c.cnt, 0)::text AS cnt
       FROM generate_series(
         (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '29 days',
         (NOW() AT TIME ZONE 'UTC')::date,
         INTERVAL '1 day'
       ) d
       LEFT JOIN (
         SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS cnt
           FROM users
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
       ) c ON c.day = d::date
       ORDER BY d`,
  );
  const signupsTrend = trendRes.rows.map((r) => Number(r.cnt));

  const pendingRes = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM users WHERE status = 'pending'`,
  );
  const pendingCount = Number(pendingRes.rows[0]?.n ?? 0);

  const verifiedRes = await pool.query<{ total: string; verified: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE email_verified) AS verified
       FROM users
      WHERE status = 'approved'`,
  );
  const totalApproved = Number(verifiedRes.rows[0]?.total ?? 0);
  const verifiedCount = Number(verifiedRes.rows[0]?.verified ?? 0);
  const verifiedPct = totalApproved > 0
    ? Math.round((verifiedCount / totalApproved) * 100)
    : 0;

  const activeRes = await pool.query<{ cur: string; prev: string }>(
    `WITH latest AS (
       SELECT DISTINCT ON (athlete_id) athlete_id, tier, status, created_at
         FROM subscriptions
         ORDER BY athlete_id, created_at DESC
     ),
     latest_30d_ago AS (
       SELECT DISTINCT ON (athlete_id) athlete_id, status
         FROM subscriptions
        WHERE created_at < NOW() - INTERVAL '30 days'
        ORDER BY athlete_id, created_at DESC
     )
     SELECT
       (SELECT COUNT(*) FROM latest WHERE status = 'authorized') AS cur,
       (SELECT COUNT(*) FROM latest_30d_ago WHERE status = 'authorized') AS prev`,
  );
  const activeSubs = Number(activeRes.rows[0]?.cur ?? 0);
  const activeSubsPrev = Number(activeRes.rows[0]?.prev ?? 0);
  const activeSubsDelta = activeSubs - activeSubsPrev;

  const mrrRes = await pool.query<{ mrr: string; mrr_prev: string }>(
    `WITH latest AS (
       SELECT DISTINCT ON (athlete_id) athlete_id, tier, status
         FROM subscriptions
         ORDER BY athlete_id, created_at DESC
     ),
     latest_prev AS (
       SELECT DISTINCT ON (athlete_id) athlete_id, tier, status
         FROM subscriptions
        WHERE created_at < NOW() - INTERVAL '30 days'
        ORDER BY athlete_id, created_at DESC
     )
     SELECT
       COALESCE((SELECT SUM(${priceCase('s')})
                   FROM latest s WHERE s.status = 'authorized'), 0) AS mrr,
       COALESCE((SELECT SUM(${priceCase('s')})
                   FROM latest_prev s WHERE s.status = 'authorized'), 0) AS mrr_prev`,
  );
  const mrr = Number(mrrRes.rows[0]?.mrr ?? 0);
  const mrrPrev = Number(mrrRes.rows[0]?.mrr_prev ?? 0);
  const mrrDeltaPct = mrrPrev > 0
    ? ((mrr - mrrPrev) / mrrPrev) * 100
    : mrr > 0 ? 100 : 0;

  const mrrTrendRes = await pool.query<{ mrr: string }>(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', NOW() - INTERVAL '11 months'),
         date_trunc('month', NOW()),
         INTERVAL '1 month'
       ) AS m
     )
     SELECT COALESCE((
       SELECT SUM(${priceCase('s')})
         FROM (
           SELECT DISTINCT ON (athlete_id) athlete_id, tier, status
             FROM subscriptions
            WHERE created_at < (months.m + INTERVAL '1 month')
            ORDER BY athlete_id, created_at DESC
         ) s
        WHERE s.status = 'authorized'
     ), 0)::text AS mrr
     FROM months
     ORDER BY months.m`,
  );
  const mrrTrend = mrrTrendRes.rows.map((r) => Number(r.mrr));

  const churnRes = await pool.query<{
    cancelled: string;
    active_start: string;
    cancelled_prev: string;
    active_start_prev: string;
  }>(
    `WITH cur_cancelled AS (
       SELECT COUNT(*) AS n
         FROM subscriptions
        WHERE status = 'cancelled'
          AND updated_at >= NOW() - INTERVAL '30 days'
     ),
     active_start AS (
       SELECT COUNT(*) AS n FROM (
         SELECT DISTINCT ON (athlete_id) athlete_id, status
           FROM subscriptions
          WHERE created_at < NOW() - INTERVAL '30 days'
          ORDER BY athlete_id, created_at DESC
       ) s
       WHERE s.status = 'authorized'
     ),
     prev_cancelled AS (
       SELECT COUNT(*) AS n
         FROM subscriptions
        WHERE status = 'cancelled'
          AND updated_at >= NOW() - INTERVAL '60 days'
          AND updated_at <  NOW() - INTERVAL '30 days'
     ),
     active_start_prev AS (
       SELECT COUNT(*) AS n FROM (
         SELECT DISTINCT ON (athlete_id) athlete_id, status
           FROM subscriptions
          WHERE created_at < NOW() - INTERVAL '60 days'
          ORDER BY athlete_id, created_at DESC
       ) s
       WHERE s.status = 'authorized'
     )
     SELECT
       (SELECT n FROM cur_cancelled) AS cancelled,
       (SELECT n FROM active_start) AS active_start,
       (SELECT n FROM prev_cancelled) AS cancelled_prev,
       (SELECT n FROM active_start_prev) AS active_start_prev`,
  );
  const cancelled = Number(churnRes.rows[0]?.cancelled ?? 0);
  const activeStart = Number(churnRes.rows[0]?.active_start ?? 0);
  const cancelledPrev = Number(churnRes.rows[0]?.cancelled_prev ?? 0);
  const activeStartPrev = Number(churnRes.rows[0]?.active_start_prev ?? 0);
  const churnPct = activeStart > 0 ? (cancelled / activeStart) * 100 : 0;
  const churnPrevPct = activeStartPrev > 0
    ? (cancelledPrev / activeStartPrev) * 100
    : 0;
  const churnDeltaPp = churnPct - churnPrevPct;

  return {
    signups_30d: cur,
    signups_delta_pct: Number(signupsDeltaPct.toFixed(1)),
    signups_trend: signupsTrend,
    pending_count: pendingCount,
    active_subs: activeSubs,
    active_subs_delta: activeSubsDelta,
    mrr_estimated: mrr,
    mrr_delta_pct: Number(mrrDeltaPct.toFixed(1)),
    mrr_trend: mrrTrend,
    churn_pct: Number(churnPct.toFixed(1)),
    churn_delta_pp: Number(churnDeltaPp.toFixed(1)),
    verified_pct: verifiedPct,
  };
}
