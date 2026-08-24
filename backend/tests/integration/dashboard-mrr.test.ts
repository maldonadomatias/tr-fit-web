import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import {
  getStats,
  setAthleteMonthlyFee,
} from '../../src/services/admin.service.js';
import { registerPayment } from '../../src/services/membership.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

/** Approve + give a membership running to `paidUntil`. */
async function enable(
  coach: string,
  athlete: string,
  fee: number,
  paidUntil: string
) {
  await setAthleteMonthlyFee(athlete, fee, coach);
  await registerPayment(athlete, {
    amount: fee,
    method: 'transfer',
    paidAt: new Date().toISOString().slice(0, 10),
    coversUntil: paidUntil,
    recordedBy: coach,
  });
}

const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

describe('dashboard MRR / suscripciones activas', () => {
  it('counts only athletes whose membership is still running today', async () => {
    const coach = await createAdmin();
    const alDia = await createAthlete(coach);
    const vencida = await createAthlete(coach);
    await enable(coach, alDia, 28000, inDays(20));
    await enable(coach, vencida, 26000, inDays(10));

    let stats = await getStats();
    expect(stats.active_subs).toBe(2);
    expect(stats.mrr_estimated).toBe(54000);

    // She didn't renew: expiry falls into the past.
    await pool.query(
      `UPDATE memberships SET paid_until = $2, status = 'expired' WHERE user_id = $1`,
      [vencida, inDays(-1)]
    );

    stats = await getStats();
    expect(stats.active_subs).toBe(1);
    expect(stats.mrr_estimated).toBe(28000);
    // 1 of 2 dropped out inside the 30-day window.
    expect(stats.churn_pct).toBe(50);
  });

  it('leaves out paused and cancelled memberships', async () => {
    const coach = await createAdmin();
    const pausada = await createAthlete(coach);
    await enable(coach, pausada, 25000, inDays(20));
    await pool.query(
      `UPDATE memberships SET status = 'paused', paused_at = now() WHERE user_id = $1`,
      [pausada]
    );
    const stats = await getStats();
    expect(stats.active_subs).toBe(0);
    expect(stats.mrr_estimated).toBe(0);
  });
});
