import bcrypt from 'bcrypt';
import pool from '../db/connect.js';
import { addCalendarMonth } from './membership.service.js';
import { resolveUnit } from './equipment-units.service.js';

const BCRYPT_COST = 10;

export class AdminError extends Error {
  constructor(public code: 'email_taken' | 'not_found' | 'cannot_modify_self') {
    super(code);
  }
}

export type Role = 'athlete' | 'admin' | 'superadmin';
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
  phone: string | null;
  subscription_tier: SubTier | null;
  subscription_status: SubStatus | null;
  current_period_end: string | null;
  membership_status:
    | 'active'
    | 'expiring'
    | 'expired'
    | 'cancelled'
    | 'paused'
    | null;
  paid_until: string | number | null;
  monthly_fee_ars: number | null;
}

export interface ListFilters {
  status?: UserStatus;
  role?: Role;
  search?: string;
}

export function buildListUsersSql(whereSql: string): string {
  return `
    SELECT
      u.id, u.email, u.role, u.status, u.email_verified, u.email_verified_at,
      u.created_at,
      COALESCE(ap.name, cp.name) AS name,
      ap.phone,
      COALESCE(u.monthly_fee_ars, ap.monthly_fee_ars) AS monthly_fee_ars,
      s.tier AS subscription_tier,
      s.status AS subscription_status,
      s.current_period_end,
      mem.status AS membership_status,
      mem.paid_until AS paid_until
    FROM users u
    LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
    LEFT JOIN coach_profiles cp ON cp.user_id = u.id
    LEFT JOIN memberships mem ON mem.user_id = u.id
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
  const sql = buildListUsersSql(whereSql);
  const r = await pool.query<AdminUserRow>(sql, params);
  // pg returns NUMERIC as string; normalize so the frontend feeOf math works.
  return r.rows.map((row) => ({
    ...row,
    monthly_fee_ars:
      row.monthly_fee_ars == null ? null : Number(row.monthly_fee_ars),
  }));
}

export async function getUser(id: string): Promise<AdminUserRow | null> {
  const r = await pool.query<AdminUserRow>(
    `SELECT
       u.id, u.email, u.role, u.status, u.email_verified, u.email_verified_at,
       u.created_at,
       COALESCE(ap.name, cp.name) AS name,
       ap.phone,
       COALESCE(u.monthly_fee_ars, ap.monthly_fee_ars) AS monthly_fee_ars,
       s.tier AS subscription_tier,
       s.status AS subscription_status,
       s.current_period_end,
       mem.status AS membership_status,
       mem.paid_until AS paid_until
     FROM users u
     LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN memberships mem ON mem.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT tier, status, current_period_end
         FROM subscriptions
        WHERE athlete_id = u.id
        ORDER BY created_at DESC
        LIMIT 1
     ) s ON TRUE
     WHERE u.id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    monthly_fee_ars:
      row.monthly_fee_ars == null ? null : Number(row.monthly_fee_ars),
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: Role;
  status?: UserStatus;
  email_verified?: boolean;
}

export async function createUser(
  input: CreateUserInput
): Promise<AdminUserRow> {
  const email = input.email.trim().toLowerCase();
  const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [
    email,
  ]);
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
    [email, hash, role, status, verified, verified ? new Date() : null]
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

export async function updateUser(
  id: string,
  patch: UpdateUserPatch
): Promise<void> {
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
        : `email_verified_at = NULL`
    );
  }
  if (!sets.length) return;

  params.push(id);
  await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params
  );
}

export interface UpsertSubInput {
  tier: SubTier;
  status: SubStatus;
  current_period_end?: string | null;
}

// Admin-managed manual subscription. Bypasses MercadoPago. Uses a synthetic
// preapproval/plan id so we don't collide with real MP rows.
/**
 * @deprecated Writes the legacy MercadoPago-shaped subscriptions table with a
 * tier. Superseded by membership.service.registerPayment (membership model);
 * tiers no longer gate anything. Kept until the admin dashboard migrates.
 */
export async function upsertManualSubscription(
  userId: string,
  input: UpsertSubInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM subscriptions
        WHERE athlete_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId]
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
        ]
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
        ]
      );
    }
    // Authorizing a subscription must also grant access. The login gate checks
    // the memberships table (paid_until), NOT subscriptions — so without this an
    // admin who "activates" a subscription still sees the athlete blocked with
    // payment_required. Mirror registerPayment: create/extend the membership and
    // flip the account to approved, in the same transaction.
    if (input.status === 'authorized') {
      const existingMem = await client.query<{
        paid_until: string | number | null;
      }>(`SELECT paid_until FROM memberships WHERE user_id = $1 FOR UPDATE`, [
        userId,
      ]);
      const paidUntil = (() => {
        if (input.current_period_end) return new Date(input.current_period_end);
        // Extend from later of current paid_until or now (renewal vs top-up).
        const cur = existingMem.rows[0]?.paid_until;
        const base =
          cur != null &&
          cur !== Infinity &&
          cur !== 'infinity' &&
          new Date(cur).getTime() > Date.now()
            ? new Date(cur)
            : new Date();
        // Renewals are calendar-month based (same day next month, clamped),
        // matching registerPayment — not +30 days, which drifts each cycle.
        return addCalendarMonth(base);
      })();
      await client.query(
        `INSERT INTO memberships (user_id, status, started_at, paid_until, updated_at)
         VALUES ($1, 'active', now(), $2, now())
         ON CONFLICT (user_id) DO UPDATE
           SET status = 'active', paid_until = $2, updated_at = now()`,
        [userId, paidUntil.toISOString()]
      );
      await client.query(`UPDATE users SET status = 'approved' WHERE id = $1`, [
        userId,
      ]);
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
    [userId]
  );
}

export type AuditType =
  | 'user_created'
  | 'user_approved'
  | 'user_rejected'
  | 'user_deleted'
  | 'role_changed'
  | 'email_verified'
  | 'email_unverified'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_authorized'
  | 'subscription_paused'
  | 'payment_registered'
  | 'membership_cancelled'
  | 'membership_paused'
  | 'membership_resumed'
  | 'athlete_fee_changed'
  | 'athlete_rm_changed'
  | 'force_logout';

export type AuditSeverity = 'brand' | 'warning' | 'destructive' | null;

export interface AuditEventRow {
  id: string;
  type: AuditType;
  actor: string;
  target: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
  severity: AuditSeverity;
  created_at: string;
}

export interface LogAuditInput {
  type: AuditType;
  actor: string;
  target?: string | null;
  target_id?: string | null;
  meta?: Record<string, unknown> | null;
  severity?: AuditSeverity;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (type, actor, target, target_id, meta, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.type,
        input.actor,
        input.target ?? null,
        input.target_id ?? null,
        input.meta ? JSON.stringify(input.meta) : null,
        input.severity ?? null,
      ]
    );
  } catch (e) {
    // Audit must not break the user-facing operation.
    // eslint-disable-next-line no-console
    console.warn('audit_log_failed', e);
  }
}

export async function setAthleteMonthlyFee(
  athleteId: string,
  feeArs: number,
  actor: string
): Promise<number> {
  const prev = await pool.query<{ monthly_fee_ars: string }>(
    `SELECT COALESCE(u.monthly_fee_ars, ap.monthly_fee_ars, 25000)::text
              AS monthly_fee_ars
       FROM users u
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
      WHERE u.id = $1 AND u.role = 'athlete'`,
    [athleteId]
  );
  if (!prev.rows[0]) throw new Error('athlete_not_found');
  const from = Number(prev.rows[0].monthly_fee_ars);
  await pool.query(
    `UPDATE users SET monthly_fee_ars = $1 WHERE id = $2`,
    [feeArs, athleteId]
  );
  await logAudit({
    type: 'athlete_fee_changed',
    actor,
    target: 'athlete',
    target_id: athleteId,
    meta: { from, to: feeArs },
  });
  return feeArs;
}

// ─── Athlete RM (rep-max) editing ────────────────────────────────
// The weight engine (engine.service) reads rm_tests.value_kg for the config's
// principal_rm_source week and multiplies by pct_rm. Lowering an RM here (e.g.
// injury/illness) directly lowers the prescribed weights for that athlete.
export interface AthleteRmRow {
  exercise_id: number;
  exercise_name: string;
  program_week: 10 | 20 | 30;
  value_kg: number;
  unit: string | null;
  coach_note: string | null;
  tested_at: string;
}

export async function listAthleteRms(
  athleteId: string
): Promise<AthleteRmRow[]> {
  const r = await pool.query<{
    exercise_id: number;
    exercise_name: string;
    program_week: 10 | 20 | 30;
    value_kg: string;
    unit: string | null;
    coach_note: string | null;
    tested_at: string;
  }>(
    `SELECT rt.exercise_id,
            e.name AS exercise_name,
            rt.program_week,
            rt.value_kg::text AS value_kg,
            rt.unit,
            rt.coach_note,
            rt.tested_at
       FROM rm_tests rt
       JOIN exercises e ON e.id = rt.exercise_id
      WHERE rt.athlete_id = $1
      ORDER BY e.name, rt.program_week`,
    [athleteId]
  );
  return r.rows.map((row) => ({ ...row, value_kg: Number(row.value_kg) }));
}

export interface SetAthleteRmInput {
  exerciseId: number;
  programWeek: 10 | 20 | 30;
  valueKg: number;
  coachNote?: string | null;
}

/**
 * Manually set (upsert) an athlete's RM for one exercise/week — the coach's
 * "bajar RM temporal" control. Audit-logged with before/after so the change is
 * traceable and the coach can restore the prior value by hand. `unit` is
 * resolved from the exercise's equipment, mirroring rm.service.recordRm.
 */
export async function setAthleteRm(
  athleteId: string,
  input: SetAthleteRmInput,
  actor: string
): Promise<AthleteRmRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exR = await client.query<{
      id: number;
      name: string;
      equipment: string;
    }>(`SELECT id, name, equipment FROM exercises WHERE id = $1`, [
      input.exerciseId,
    ]);
    if (!exR.rows[0]) throw new Error('exercise_not_found');
    const equipment = exR.rows[0].equipment ?? 'barra';
    const unit = await resolveUnit(athleteId, equipment);

    const prev = await client.query<{ value_kg: string }>(
      `SELECT value_kg::text AS value_kg FROM rm_tests
        WHERE athlete_id = $1 AND exercise_id = $2 AND program_week = $3`,
      [athleteId, input.exerciseId, input.programWeek]
    );
    const from = prev.rows[0] ? Number(prev.rows[0].value_kg) : null;

    const r = await client.query<{ tested_at: string }>(
      `INSERT INTO rm_tests
         (athlete_id, exercise_id, program_week, value_kg, value, unit, coach_note)
       VALUES ($1, $2, $3, $4, $4, $5, $6)
       ON CONFLICT (athlete_id, exercise_id, program_week)
         DO UPDATE SET value_kg = EXCLUDED.value_kg,
                       value = EXCLUDED.value,
                       unit = EXCLUDED.unit,
                       coach_note = EXCLUDED.coach_note,
                       tested_at = NOW()
       RETURNING tested_at`,
      [
        athleteId,
        input.exerciseId,
        input.programWeek,
        input.valueKg,
        unit,
        input.coachNote ?? null,
      ]
    );

    await client.query('COMMIT');

    await logAudit({
      type: 'athlete_rm_changed',
      actor,
      target: 'athlete',
      target_id: athleteId,
      severity: 'warning',
      meta: {
        exercise_id: input.exerciseId,
        exercise_name: exR.rows[0].name,
        program_week: input.programWeek,
        from,
        to: input.valueKg,
        note: input.coachNote ?? null,
      },
    });

    return {
      exercise_id: input.exerciseId,
      exercise_name: exR.rows[0].name,
      program_week: input.programWeek,
      value_kg: input.valueKg,
      unit,
      coach_note: input.coachNote ?? null,
      tested_at: r.rows[0].tested_at,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export type ActivityCategory = 'user' | 'sub' | 'auth';

const CATEGORY_TYPES: Record<ActivityCategory, AuditType[]> = {
  user: ['user_created', 'user_approved', 'user_rejected', 'user_deleted'],
  sub: [
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_authorized',
    'subscription_paused',
  ],
  auth: ['email_verified', 'email_unverified', 'role_changed', 'force_logout'],
};

export interface ActivityFilters {
  category?: ActivityCategory;
  target_id?: string;
  before?: string;
  limit?: number;
}

export async function listActivity(
  filters: ActivityFilters
): Promise<AuditEventRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.category) {
    params.push(CATEGORY_TYPES[filters.category]);
    where.push(`type = ANY($${params.length})`);
  }
  if (filters.target_id) {
    params.push(filters.target_id);
    where.push(`target_id = $${params.length}`);
  }
  if (filters.before) {
    params.push(filters.before);
    where.push(`created_at < $${params.length}`);
  }
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const sql = `
    SELECT id, type, actor, target, target_id::text, meta, severity, created_at
      FROM admin_audit_log
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT ${limit}
  `;
  const r = await pool.query<AuditEventRow>(sql, params);
  return r.rows;
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

// Per-student MRR contribution. Uses the student's real custom fee from users
// when set, falling back to the hardcoded tier price. Mirrors the
// frontend `feeOf = monthly_fee_ars ?? TIER_PRICE[tier]` logic.
function priceCase(alias = 's', feeAlias = 'u'): string {
  return `COALESCE(${feeAlias}.monthly_fee_ars,
          CASE
            WHEN ${alias}.tier = 'basico'  THEN ${TIER_PRICE_ARS.basico}
            WHEN ${alias}.tier = 'full'    THEN ${TIER_PRICE_ARS.full}
            WHEN ${alias}.tier = 'premium' THEN ${TIER_PRICE_ARS.premium}
            ELSE 0
          END)`;
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
       FROM users`
  );
  const cur = Number(signupsRes.rows[0]?.cur ?? 0);
  const prev = Number(signupsRes.rows[0]?.prev ?? 0);
  const signupsDeltaPct =
    prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

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
       ORDER BY d`
  );
  const signupsTrend = trendRes.rows.map((r) => Number(r.cnt));

  const pendingRes = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM users WHERE status = 'pending'`
  );
  const pendingCount = Number(pendingRes.rows[0]?.n ?? 0);

  const verifiedRes = await pool.query<{ total: string; verified: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE email_verified) AS verified
       FROM users
      WHERE status = 'approved'`
  );
  const totalApproved = Number(verifiedRes.rows[0]?.total ?? 0);
  const verifiedCount = Number(verifiedRes.rows[0]?.verified ?? 0);
  const verifiedPct =
    totalApproved > 0 ? Math.round((verifiedCount / totalApproved) * 100) : 0;

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
       (SELECT COUNT(*) FROM latest_30d_ago WHERE status = 'authorized') AS prev`
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
       COALESCE((SELECT SUM(${priceCase('s', 'u')})
                   FROM latest s
                   LEFT JOIN users u ON u.id = s.athlete_id
                  WHERE s.status = 'authorized'), 0) AS mrr,
       COALESCE((SELECT SUM(${priceCase('s', 'u')})
                   FROM latest_prev s
                   LEFT JOIN users u ON u.id = s.athlete_id
                  WHERE s.status = 'authorized'), 0) AS mrr_prev`
  );
  const mrr = Number(mrrRes.rows[0]?.mrr ?? 0);
  const mrrPrev = Number(mrrRes.rows[0]?.mrr_prev ?? 0);
  const mrrDeltaPct =
    mrrPrev > 0 ? ((mrr - mrrPrev) / mrrPrev) * 100 : mrr > 0 ? 100 : 0;

  const mrrTrendRes = await pool.query<{ mrr: string }>(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', NOW() - INTERVAL '11 months'),
         date_trunc('month', NOW()),
         INTERVAL '1 month'
       ) AS m
     )
     SELECT COALESCE((
       SELECT SUM(${priceCase('s', 'u')})
         FROM (
           SELECT DISTINCT ON (athlete_id) athlete_id, tier, status
             FROM subscriptions
            WHERE created_at < (months.m + INTERVAL '1 month')
            ORDER BY athlete_id, created_at DESC
         ) s
         LEFT JOIN users u ON u.id = s.athlete_id
        WHERE s.status = 'authorized'
     ), 0)::text AS mrr
     FROM months
     ORDER BY months.m`
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
       (SELECT n FROM active_start_prev) AS active_start_prev`
  );
  const cancelled = Number(churnRes.rows[0]?.cancelled ?? 0);
  const activeStart = Number(churnRes.rows[0]?.active_start ?? 0);
  const cancelledPrev = Number(churnRes.rows[0]?.cancelled_prev ?? 0);
  const activeStartPrev = Number(churnRes.rows[0]?.active_start_prev ?? 0);
  const churnPct = activeStart > 0 ? (cancelled / activeStart) * 100 : 0;
  const churnPrevPct =
    activeStartPrev > 0 ? (cancelledPrev / activeStartPrev) * 100 : 0;
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
