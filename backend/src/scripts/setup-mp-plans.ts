import 'dotenv/config';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error('MP_ACCESS_TOKEN not set in .env');
  process.exit(1);
}

const PLANS = [
  { key: 'BASICO', name: 'TR-FIT Básico', amount: 10000 },
  { key: 'FULL', name: 'TR-FIT Full', amount: 25000 },
  { key: 'PREMIUM', name: 'TR-FIT Premium', amount: 70000 },
] as const;

async function createPlan(name: string, amount: number): Promise<string> {
  const res = await fetch('https://api.mercadopago.com/preapproval_plan', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: name,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'ARS',
      },
      back_url: process.env.APP_URL ?? 'http://localhost:5001',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to create plan "${name}": ${JSON.stringify(body)}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

console.log('Creating MercadoPago subscription plans...\n');

for (const plan of PLANS) {
  const id = await createPlan(plan.name, plan.amount);
  console.log(`MP_PLAN_ID_${plan.key}=${id}`);
}

console.log('\nAdd these to your .env file.');
