import { jest } from '@jest/globals';

const mockCreatePreapproval = jest.fn<() => Promise<{ preapprovalId: string; checkoutUrl: string }>>();
const mockFetchPreapproval = jest.fn<() => Promise<{ status: string; nextPaymentDate: string | null }>>();

jest.unstable_mockModule('../../src/services/mp.service.js', () => ({
  createPreapproval: mockCreatePreapproval,
  fetchPreapproval: mockFetchPreapproval,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { createSubscription, handleWebhookEvent } = await import('../../src/services/subscription.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockCreatePreapproval.mockReset();
  mockFetchPreapproval.mockReset();
  mockCreatePreapproval.mockResolvedValue({
    preapprovalId: 'pre-mock-123',
    checkoutUrl: 'https://mp.com/checkout',
  });
});
afterAll(async () => { await closePool(); });

async function athleteWithEmail(coachId: string, suffix: string) {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1,'x','athlete') RETURNING id`,
    [`sub-svc-${suffix}@t.local`],
  );
  const id = u[0].id;
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries, coach_id)
     VALUES ($1,'T','male',30,175,75,'intermedio','hipertrofia',4,'gym_completo','{}', $2)`,
    [id, coachId],
  );
  return { id, email: `sub-svc-${suffix}@t.local` };
}

describe('createSubscription', () => {
  it('inserts pending subscription and returns checkout_url', async () => {
    const c = await createCoach();
    const { id, email } = await athleteWithEmail(c, '1');
    const result = await createSubscription({ athleteId: id, tier: 'full', payerEmail: email });

    expect(result.checkoutUrl).toBe('https://mp.com/checkout');
    expect(result.subscriptionId).toBeDefined();

    const r = await pool.query<{ status: string; tier: string }>(
      `SELECT status, tier FROM subscriptions WHERE athlete_id = $1`, [id],
    );
    expect(r.rows[0]).toEqual({ status: 'pending', tier: 'full' });
  });

  it('throws 409 if authorized subscription for same tier already exists', async () => {
    const c = await createCoach();
    const { id, email } = await athleteWithEmail(c, '2');
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'full','pre-existing','plan-full','authorized')`,
      [id],
    );
    await expect(
      createSubscription({ athleteId: id, tier: 'full', payerEmail: email }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'already_subscribed' });
  });

  it('allows creating subscription if previous one is cancelled', async () => {
    const c = await createCoach();
    const { id, email } = await athleteWithEmail(c, '3');
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'full','pre-cancelled','plan-full','cancelled')`,
      [id],
    );
    const result = await createSubscription({ athleteId: id, tier: 'full', payerEmail: email });
    expect(result.checkoutUrl).toBe('https://mp.com/checkout');
  });
});

describe('handleWebhookEvent — subscription_preapproval', () => {
  it('authorized: sets plan_interest + subscription status', async () => {
    const c = await createCoach();
    const { id } = await athleteWithEmail(c, '4');
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'full','pre-auth','plan-full','pending')`,
      [id],
    );
    mockFetchPreapproval.mockResolvedValueOnce({
      status: 'authorized',
      nextPaymentDate: '2026-06-12T00:00:00.000Z',
    });

    await handleWebhookEvent({
      type: 'subscription_preapproval',
      data: { id: 'pre-auth' },
    });

    const sub = await pool.query<{ status: string; current_period_end: string }>(
      `SELECT status, current_period_end FROM subscriptions WHERE athlete_id = $1`, [id],
    );
    expect(sub.rows[0].status).toBe('authorized');
    expect(sub.rows[0].current_period_end).not.toBeNull();

    const profile = await pool.query<{ plan_interest: string }>(
      `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`, [id],
    );
    expect(profile.rows[0].plan_interest).toBe('full');
  });

  it('paused: updates subscription status but does NOT change plan_interest', async () => {
    const c = await createCoach();
    const { id } = await athleteWithEmail(c, '5');
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'full' WHERE user_id = $1`, [id],
    );
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'full','pre-pause','plan-full','authorized')`,
      [id],
    );
    mockFetchPreapproval.mockResolvedValueOnce({
      status: 'paused', nextPaymentDate: null,
    });

    await handleWebhookEvent({
      type: 'subscription_preapproval',
      data: { id: 'pre-pause' },
    });

    const sub = await pool.query<{ status: string }>(
      `SELECT status FROM subscriptions WHERE athlete_id = $1`, [id],
    );
    expect(sub.rows[0].status).toBe('paused');

    const profile = await pool.query<{ plan_interest: string }>(
      `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`, [id],
    );
    expect(profile.rows[0].plan_interest).toBe('full');
  });

  it('cancelled: sets plan_interest to NULL', async () => {
    const c = await createCoach();
    const { id } = await athleteWithEmail(c, '6');
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = 'basico' WHERE user_id = $1`, [id],
    );
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'basico','pre-cancel','plan-basico','authorized')`,
      [id],
    );
    mockFetchPreapproval.mockResolvedValueOnce({
      status: 'cancelled', nextPaymentDate: null,
    });

    await handleWebhookEvent({
      type: 'subscription_preapproval',
      data: { id: 'pre-cancel' },
    });

    const profile = await pool.query<{ plan_interest: string | null }>(
      `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`, [id],
    );
    expect(profile.rows[0].plan_interest).toBeNull();
  });

  it('unknown preapproval_id: returns without error', async () => {
    await expect(
      handleWebhookEvent({
        type: 'subscription_preapproval',
        data: { id: 'pre-unknown-xyz' },
      }),
    ).resolves.not.toThrow();
    expect(mockFetchPreapproval).not.toHaveBeenCalled();
  });

  it('non-subscription type: returns without processing', async () => {
    await handleWebhookEvent({ type: 'payment', data: { id: 'pay-123' } });
    expect(mockFetchPreapproval).not.toHaveBeenCalled();
  });
});
