// backend/src/services/platform-fee.service.ts
import pool from '../db/connect.js';
import {
  computeFee,
  computeAdjustedBase,
  addMonthsISO,
  isAdjustmentDue,
} from './platform-fee.math.js';

export type BillingPhase = 'testflight' | 'production';

export interface PlatformFeeConfig {
  base_fee_ars: number;
  reference_usd: number;
  current_usd: number;
  price_per_athlete_ars: number;
  revenue_share_pct: number;
  adjustment_interval_months: number;
  next_adjustment_date: string;
  phase: BillingPhase;
  updated_at: string;
}

export interface PlatformFeeSummary {
  base_fee_ars: number;
  active_athletes: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  next_adjustment_date: string;
  adjustment_due: boolean;
  phase: BillingPhase;
}

export interface PlatformFeeHistoryRow {
  period: string;
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  usd_at_snapshot: number;
  created_at: string;
  paid_total_ars: number | null;
  paid_at: string | null;
}

export interface PlatformFeePayment {
  period: string;
  total_ars: number;
  paid_at: string;
  recorded_by: string | null;
}

export interface UpdateConfigInput {
  base_fee_ars?: number;
  reference_usd?: number;
  current_usd?: number;
  price_per_athlete_ars?: number;
  revenue_share_pct?: number;
  adjustment_interval_months?: number;
  next_adjustment_date?: string;
  phase?: BillingPhase;
}

interface ConfigRow {
  base_fee_ars: string;
  reference_usd: string;
  current_usd: string;
  price_per_athlete_ars: string;
  revenue_share_pct: string;
  adjustment_interval_months: number;
  next_adjustment_date: Date | string;
  phase: BillingPhase;
  updated_at: Date | string;
}

const toISODate = (d: Date | string): string =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

const currentPeriod = (todayISO?: string): string =>
  `${(todayISO ?? new Date().toISOString().slice(0, 10)).slice(0, 7)}-01`;

function mapConfig(r: ConfigRow): PlatformFeeConfig {
  return {
    base_fee_ars: Number(r.base_fee_ars),
    reference_usd: Number(r.reference_usd),
    current_usd: Number(r.current_usd),
    price_per_athlete_ars: Number(r.price_per_athlete_ars),
    revenue_share_pct: Number(r.revenue_share_pct),
    adjustment_interval_months: Number(r.adjustment_interval_months),
    next_adjustment_date: toISODate(r.next_adjustment_date),
    phase: r.phase,
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

const CONFIG_COLS = `base_fee_ars, reference_usd, current_usd, price_per_athlete_ars,
  revenue_share_pct, adjustment_interval_months, next_adjustment_date, phase, updated_at`;

export async function getConfig(): Promise<PlatformFeeConfig> {
  const r = await pool.query<ConfigRow>(
    `SELECT ${CONFIG_COLS} FROM platform_fee_config WHERE id = 1`
  );
  if (!r.rows[0]) throw new Error('platform_fee_config row missing');
  return mapConfig(r.rows[0]);
}

export async function getActiveAthleteRevenue(): Promise<{
  count: number;
  grossArs: number;
}> {
  const r = await pool.query<{ n: number; gross: string }>(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(ap.monthly_fee_ars), 0) AS gross
       FROM users u
       JOIN athlete_profiles ap ON ap.user_id = u.id
       JOIN memberships m ON m.user_id = u.id
      WHERE u.role = 'athlete'
        AND u.status = 'approved'
        AND (m.paid_until = 'infinity' OR m.paid_until > now())`
  );
  return {
    count: Number(r.rows[0]?.n ?? 0),
    grossArs: Number(r.rows[0]?.gross ?? 0),
  };
}

const UPDATABLE = [
  'base_fee_ars',
  'reference_usd',
  'current_usd',
  'price_per_athlete_ars',
  'revenue_share_pct',
  'adjustment_interval_months',
  'next_adjustment_date',
  'phase',
] as const;

export async function updateConfig(
  input: UpdateConfigInput
): Promise<PlatformFeeConfig> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of UPDATABLE) {
    const v = (input as Record<string, unknown>)[f];
    if (f in input && v !== undefined) {
      vals.push(v);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return getConfig();
  await pool.query(
    `UPDATE platform_fee_config SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`,
    vals
  );
  return getConfig();
}

export async function computeCurrent(
  todayISO?: string
): Promise<PlatformFeeSummary> {
  const cfg = await getConfig();
  const { count, grossArs } = await getActiveAthleteRevenue();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes: count,
    grossRevenueArs: grossArs,
    revenueSharePct: cfg.revenue_share_pct,
    testflight: cfg.phase === 'testflight',
  });
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return {
    base_fee_ars: fee.baseFeeArs,
    active_athletes: fee.activeAthletes,
    gross_revenue_ars: fee.grossRevenueArs,
    revenue_share_pct: fee.revenueSharePct,
    revenue_share_ars: fee.revenueShareArs,
    total_ars: fee.totalArs,
    next_adjustment_date: cfg.next_adjustment_date,
    adjustment_due: isAdjustmentDue(cfg.next_adjustment_date, today),
    phase: cfg.phase,
  };
}

interface PaymentRow {
  period: Date | string;
  total_ars: string;
  paid_at: Date | string;
  recorded_by: string | null;
}

function mapPayment(row: PaymentRow): PlatformFeePayment {
  return {
    period: toISODate(row.period),
    total_ars: Number(row.total_ars),
    paid_at: new Date(row.paid_at).toISOString(),
    recorded_by: row.recorded_by,
  };
}

export async function getCurrentPayment(
  todayISO?: string
): Promise<PlatformFeePayment | null> {
  const result = await pool.query<PaymentRow>(
    `SELECT period, total_ars, paid_at, recorded_by
       FROM platform_fee_payments
      WHERE period = $1`,
    [currentPeriod(todayISO)]
  );
  return result.rows[0] ? mapPayment(result.rows[0]) : null;
}

export async function recordCurrentPayment(
  recordedBy: string,
  todayISO?: string
): Promise<PlatformFeePayment | null> {
  const summary = await computeCurrent(todayISO);
  const result = await pool.query<PaymentRow>(
    `INSERT INTO platform_fee_payments (period, total_ars, recorded_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (period) DO NOTHING
     RETURNING period, total_ars, paid_at, recorded_by`,
    [currentPeriod(todayISO), summary.total_ars, recordedBy]
  );
  return result.rows[0] ? mapPayment(result.rows[0]) : null;
}

export async function previewAdjustment(
  currentUsd: number
): Promise<{ new_base_fee_ars: number }> {
  const cfg = await getConfig();
  return {
    new_base_fee_ars: computeAdjustedBase(
      cfg.base_fee_ars,
      currentUsd,
      cfg.reference_usd
    ),
  };
}

export async function applyAdjustment(
  currentUsd: number
): Promise<PlatformFeeConfig> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<ConfigRow>(
      `SELECT ${CONFIG_COLS} FROM platform_fee_config WHERE id = 1 FOR UPDATE`
    );
    if (!r.rows[0]) throw new Error('platform_fee_config row missing');
    const cfg = mapConfig(r.rows[0]);
    const newBase = computeAdjustedBase(
      cfg.base_fee_ars,
      currentUsd,
      cfg.reference_usd
    );
    const nextDate = addMonthsISO(
      cfg.next_adjustment_date,
      cfg.adjustment_interval_months
    );
    await client.query(
      `UPDATE platform_fee_config
          SET base_fee_ars = $1, reference_usd = $2, current_usd = $2,
              next_adjustment_date = $3, updated_at = now()
        WHERE id = 1`,
      [newBase, currentUsd, nextDate]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getConfig();
}

export async function snapshotMonth(periodISO: string): Promise<void> {
  const cfg = await getConfig();
  const { count, grossArs } = await getActiveAthleteRevenue();
  const fee = computeFee({
    baseFeeArs: cfg.base_fee_ars,
    activeAthletes: count,
    grossRevenueArs: grossArs,
    revenueSharePct: cfg.revenue_share_pct,
    testflight: cfg.phase === 'testflight',
  });
  await pool.query(
    `INSERT INTO platform_fee_history
       (period, base_fee_ars, active_athletes, price_per_athlete_ars,
        gross_revenue_ars, revenue_share_pct, revenue_share_ars, total_ars,
        usd_at_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (period) DO NOTHING`,
    [
      periodISO,
      fee.baseFeeArs,
      fee.activeAthletes,
      cfg.price_per_athlete_ars,
      fee.grossRevenueArs,
      fee.revenueSharePct,
      fee.revenueShareArs,
      fee.totalArs,
      cfg.reference_usd,
    ]
  );
}

interface HistoryRow {
  period: Date | string;
  base_fee_ars: string;
  active_athletes: number;
  price_per_athlete_ars: string;
  gross_revenue_ars: string;
  revenue_share_pct: string;
  revenue_share_ars: string;
  total_ars: string;
  usd_at_snapshot: string;
  created_at: Date | string;
  paid_total_ars: string | null;
  paid_at: Date | string | null;
}

export async function getHistory(limit = 24): Promise<PlatformFeeHistoryRow[]> {
  const r = await pool.query<HistoryRow>(
    `SELECT h.period, h.base_fee_ars, h.active_athletes,
            h.price_per_athlete_ars, h.gross_revenue_ars,
            h.revenue_share_pct, h.revenue_share_ars, h.total_ars,
            h.usd_at_snapshot, h.created_at,
            p.total_ars AS paid_total_ars, p.paid_at
       FROM platform_fee_history h
       LEFT JOIN platform_fee_payments p ON p.period = h.period
      ORDER BY h.period DESC
      LIMIT $1`,
    [limit]
  );
  return r.rows.map((row) => ({
    period: toISODate(row.period),
    base_fee_ars: Number(row.base_fee_ars),
    active_athletes: Number(row.active_athletes),
    price_per_athlete_ars: Number(row.price_per_athlete_ars),
    gross_revenue_ars: Number(row.gross_revenue_ars),
    revenue_share_pct: Number(row.revenue_share_pct),
    revenue_share_ars: Number(row.revenue_share_ars),
    total_ars: Number(row.total_ars),
    usd_at_snapshot: Number(row.usd_at_snapshot),
    created_at: new Date(row.created_at).toISOString(),
    paid_total_ars:
      row.paid_total_ars === null ? null : Number(row.paid_total_ars),
    paid_at: row.paid_at === null ? null : new Date(row.paid_at).toISOString(),
  }));
}

export interface FeeLogRow {
  id: string;
  athlete_id: string;
  athlete_name: string | null;
  from_ars: number;
  to_ars: number;
  actor: string;
  created_at: string;
}

export async function getFeeLog(limit = 50): Promise<FeeLogRow[]> {
  const r = await pool.query<{
    id: string;
    target_id: string;
    name: string | null;
    meta: { from?: number | string; to?: number | string } | null;
    actor: string;
    created_at: Date | string;
  }>(
    `SELECT l.id, l.target_id, l.actor, l.meta, l.created_at,
            ap.name
       FROM admin_audit_log l
       LEFT JOIN athlete_profiles ap ON ap.user_id = l.target_id
      WHERE l.type = 'athlete_fee_changed'
      ORDER BY l.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    athlete_id: row.target_id,
    athlete_name: row.name,
    from_ars: Number(row.meta?.from ?? 0),
    to_ars: Number(row.meta?.to ?? 0),
    actor: row.actor,
    created_at: new Date(row.created_at).toISOString(),
  }));
}
