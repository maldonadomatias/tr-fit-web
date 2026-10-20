import pool from '../db/connect.js';

export interface BillingInfo {
  alias: string | null;
  cbu: string | null;
  holder: string | null;
  amount: number | null;
  currency: string;
  note: string | null;
  /** Data-maintenance price charged while an athlete is on vacation. */
  vacation_fee_ars: number;
  /** Saved promo price for a 3-month prepay. Null until the coach sets it. */
  quarterly_promo_ars: number | null;
  /** Saved promo price for a 12-month prepay. Null until the coach sets it. */
  annual_promo_ars: number | null;
}

export interface UpdateBillingInput {
  alias?: string | null;
  cbu?: string | null;
  holder?: string | null;
  amount?: number | null;
  currency?: string;
  note?: string | null;
  vacation_fee_ars?: number;
  quarterly_promo_ars?: number | null;
  annual_promo_ars?: number | null;
}

function moneyOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getBillingInfo(): Promise<BillingInfo> {
  const r = await pool.query<BillingInfo>(
    `SELECT alias, cbu, holder, amount, currency, note, vacation_fee_ars,
            quarterly_promo_ars, annual_promo_ars
       FROM billing_settings WHERE id = 1`,
  );
  const row = r.rows[0];
  if (!row) {
    return {
      alias: null, cbu: null, holder: null,
      amount: null, currency: 'ARS', note: null,
      vacation_fee_ars: 10000,
      quarterly_promo_ars: null,
      annual_promo_ars: null,
    };
  }
  return {
    ...row,
    vacation_fee_ars: Number(row.vacation_fee_ars),
    quarterly_promo_ars: moneyOrNull(row.quarterly_promo_ars),
    annual_promo_ars: moneyOrNull(row.annual_promo_ars),
  };
}

// Whitelist of updatable columns -> guards against arbitrary column injection.
const FIELDS = [
  'alias', 'cbu', 'holder', 'amount', 'currency', 'note', 'vacation_fee_ars',
  'quarterly_promo_ars', 'annual_promo_ars',
] as const;

export function buildBillingUpdate(input: UpdateBillingInput): {
  sets: string[];
  vals: unknown[];
} {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of FIELDS) {
    if (f in input) {
      vals.push((input as Record<string, unknown>)[f]);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  return { sets, vals };
}

export async function updateBillingInfo(
  input: UpdateBillingInput,
): Promise<BillingInfo> {
  const { sets, vals } = buildBillingUpdate(input);
  if (sets.length === 0) return getBillingInfo();
  await pool.query(
    `UPDATE billing_settings SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`,
    vals,
  );
  return getBillingInfo();
}
