import pool from '../db/connect.js';
import { getConfig } from './platform-fee.service.js';
import { adRevenueForMonth, todayBA } from './community-ads.service.js';
import {
  communityRevisionDate,
  currentMonthPeriod,
} from './platform-fee.math.js';

export interface CommunitySummary {
  enabled: boolean;
  launched_on: string | null;
  revision_date: string | null;
  days_to_revision: number | null;
  ad_revenue_this_month: number;
  ad_share_this_month: number;
  avg_ad_revenue: number;
  projected_community_fee: number;
  revision_applied_at: string | null;
  community_fee_ars: number;
  threshold_ars: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) /
      86_400_000
  );

export async function communitySummary(
  todayISO?: string
): Promise<CommunitySummary> {
  const today = todayISO ?? todayBA();
  const cfg = await getConfig();
  const thisMonth = currentMonthPeriod(today);
  const adThisMonth = await adRevenueForMonth(thisMonth);
  const launched = cfg.community_launched_on;
  const revisionDate = launched ? communityRevisionDate(launched) : null;

  let avg = adThisMonth;
  if (launched) {
    const h = await pool.query<{ period: string; ad_revenue_ars: string }>(
      `SELECT period::text AS period, ad_revenue_ars FROM platform_fee_history
        WHERE period >= date_trunc('month', $1::date)::date
        ORDER BY period LIMIT 6`,
      [launched]
    );
    const months = h.rows.map((r) => Number(r.ad_revenue_ars));
    if (cfg.community_revision_applied_at) {
      avg = months.reduce((a, b) => a + b, 0) / 6;
    } else {
      const windowEnd = currentMonthPeriod(revisionDate!);
      const includeCurrent =
        thisMonth < windowEnd && !h.rows.some((r) => r.period === thisMonth);
      if (includeCurrent && months.length < 6) months.push(adThisMonth);
      avg = months.length
        ? months.reduce((a, b) => a + b, 0) / months.length
        : 0;
    }
  }
  avg = round2(avg);
  const projected = cfg.community_revision_applied_at
    ? cfg.community_fee_ars
    : avg < cfg.community_revision_threshold_ars
      ? cfg.community_fallback_fee_ars
      : cfg.community_fee_ars;

  return {
    enabled: launched !== null,
    launched_on: launched,
    revision_date: revisionDate,
    days_to_revision: revisionDate ? daysBetween(today, revisionDate) : null,
    ad_revenue_this_month: adThisMonth,
    ad_share_this_month: round2((adThisMonth * cfg.ad_share_pct) / 100),
    avg_ad_revenue: avg,
    projected_community_fee: projected,
    revision_applied_at: cfg.community_revision_applied_at,
    community_fee_ars: cfg.community_fee_ars,
    threshold_ars: cfg.community_revision_threshold_ars,
  };
}
