import { env } from '../config/env.js';

export interface CreatePreapprovalParams {
  planId: string;
  athleteId: string;
  payerEmail: string;
  backUrl: string;
}

export interface PreapprovalResult {
  preapprovalId: string;
  checkoutUrl: string;
}

export interface PreapprovalState {
  status: string;
  nextPaymentDate: string | null;
}

export async function createPreapproval(
  params: CreatePreapprovalParams,
): Promise<PreapprovalResult> {
  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      preapproval_plan_id: params.planId,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      external_reference: params.athleteId,
      auto_recurring: { frequency: 1, frequency_type: 'months' },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`MP API error ${res.status}: ${JSON.stringify(body)}`);
  }

  const data = (await res.json()) as { id: string; init_point: string };
  return { preapprovalId: data.id, checkoutUrl: data.init_point };
}

export async function fetchPreapproval(
  preapprovalId: string,
): Promise<PreapprovalState> {
  const res = await fetch(
    `https://api.mercadopago.com/preapproval/${preapprovalId}`,
    {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`MP API error ${res.status}: ${JSON.stringify(body)}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    next_payment_date?: string;
  };
  return { status: data.status, nextPaymentDate: data.next_payment_date ?? null };
}
