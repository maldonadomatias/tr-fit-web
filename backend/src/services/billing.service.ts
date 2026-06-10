import pool from '../db/connect.js';

export interface BillingInfo {
  alias: string | null;
  cbu: string | null;
  holder: string | null;
  amount: number | null;
  currency: string;
  note: string | null;
}

export interface UpdateBillingInput {
  alias?: string | null;
  cbu?: string | null;
  holder?: string | null;
  amount?: number | null;
  currency?: string;
  note?: string | null;
}

export async function getBillingInfo(): Promise<BillingInfo> {
  const r = await pool.query<BillingInfo>(
    `SELECT alias, cbu, holder, amount, currency, note
       FROM billing_settings WHERE id = 1`,
  );
  return (
    r.rows[0] ?? {
      alias: null, cbu: null, holder: null,
      amount: null, currency: 'ARS', note: null,
    }
  );
}

// Whitelist of updatable columns -> guards against arbitrary column injection.
const FIELDS = ['alias', 'cbu', 'holder', 'amount', 'currency', 'note'] as const;

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
