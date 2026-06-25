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
