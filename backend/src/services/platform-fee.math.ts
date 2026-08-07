// backend/src/services/platform-fee.math.ts
export interface FeeInputs {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  testflight?: boolean;
}

export interface FeeBreakdown {
  baseFeeArs: number;
  activeAthletes: number;
  grossRevenueArs: number;
  revenueSharePct: number;
  revenueShareArs: number;
  totalArs: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeFee(i: FeeInputs): FeeBreakdown {
  const testflight = i.testflight ?? false;
  const baseFeeArs = round2(testflight ? i.baseFeeArs * 0.5 : i.baseFeeArs);
  const grossRevenueArs = round2(i.grossRevenueArs);
  const revenueShareArs = testflight
    ? 0
    : round2((grossRevenueArs * i.revenueSharePct) / 100);
  const totalArs = round2(baseFeeArs + revenueShareArs);
  return {
    baseFeeArs,
    activeAthletes: i.activeAthletes,
    grossRevenueArs,
    revenueSharePct: i.revenueSharePct,
    revenueShareArs,
    totalArs,
  };
}

export function computeAdjustedBase(
  baseFeeArs: number,
  currentUsd: number,
  referenceUsd: number
): number {
  if (referenceUsd <= 0) throw new Error('referenceUsd must be > 0');
  return round2((baseFeeArs * currentUsd) / referenceUsd);
}

export function addMonthsISO(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function isAdjustmentDue(
  nextAdjustmentDate: string,
  todayISO: string
): boolean {
  return nextAdjustmentDate <= todayISO;
}

/** First day (YYYY-MM-01) of the calendar month before `todayISO`. */
export function previousMonthPeriod(todayISO: string): string {
  const [y, m] = todayISO.slice(0, 10).split('-').map(Number);
  // m is 1-based; m-2 is the previous month's 0-based UTC month index.
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

/**
 * Payment is due on the 10th of the current calendar month
 * (settles the previous month's real collections).
 */
export function paymentDueDate(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-10`;
}

/** Overdue after the due day (the 10th itself still counts as on time). */
export function isPaymentOverdue(
  todayISO: string,
  alreadyPaid: boolean
): boolean {
  if (alreadyPaid) return false;
  return todayISO.slice(0, 10) > paymentDueDate(todayISO);
}
