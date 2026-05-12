import { jest } from '@jest/globals';

const mockCreate = jest.fn<() => Promise<{ checkoutUrl: string; subscriptionId: string }>>();
jest.unstable_mockModule('../../src/services/subscription.service.js', () => ({
  createSubscription: mockCreate,
  handleWebhookEvent: jest.fn(),
  SubscriptionError: class SubscriptionError extends Error {
    constructor(msg: string, public statusCode: number, public code: string) {
      super(msg);
    }
  },
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const { signToken } = await import('../../src/middleware/auth.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); mockCreate.mockReset(); });
afterAll(async () => { await closePool(); });

describe('POST /api/subscriptions/create', () => {
  it('returns 201 with checkout_url', async () => {
    mockCreate.mockResolvedValueOnce({
      checkoutUrl: 'https://mp.com/checkout',
      subscriptionId: 'sub-uuid',
    });
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app)
      .post('/api/subscriptions/create')
      .set('Authorization', `Bearer ${tok}`)
      .send({ tier: 'full' });
    expect(r.status).toBe(201);
    expect(r.body.checkout_url).toBe('https://mp.com/checkout');
    expect(r.body.subscription_id).toBe('sub-uuid');
  });

  it('returns 400 for invalid tier', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app)
      .post('/api/subscriptions/create')
      .set('Authorization', `Bearer ${tok}`)
      .send({ tier: 'vip' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_tier');
  });

  it('returns 409 when already subscribed', async () => {
    const { SubscriptionError } = await import('../../src/services/subscription.service.js');
    mockCreate.mockRejectedValueOnce(
      new SubscriptionError('Already subscribed', 409, 'already_subscribed'),
    );
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app)
      .post('/api/subscriptions/create')
      .set('Authorization', `Bearer ${tok}`)
      .send({ tier: 'full' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('already_subscribed');
  });

  it('returns 401 unauthenticated', async () => {
    const r = await request(app).post('/api/subscriptions/create').send({ tier: 'full' });
    expect(r.status).toBe(401);
  });

  it('returns 403 for coach role', async () => {
    const c = await createCoach();
    const tok = signToken({ id: c, role: 'coach' });
    const r = await request(app)
      .post('/api/subscriptions/create')
      .set('Authorization', `Bearer ${tok}`)
      .send({ tier: 'full' });
    expect(r.status).toBe(403);
  });
});

describe('GET /api/subscriptions/me', () => {
  it('returns null when no subscription', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app)
      .get('/api/subscriptions/me')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.subscription).toBeNull();
  });

  it('returns active subscription', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO subscriptions
         (athlete_id, tier, mp_preapproval_id, mp_plan_id, status)
       VALUES ($1,'premium','pre-xyz','plan-premium','authorized')`,
      [a],
    );
    const tok = signToken({ id: a, role: 'athlete' });
    const r = await request(app)
      .get('/api/subscriptions/me')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.subscription.tier).toBe('premium');
    expect(r.body.subscription.status).toBe('authorized');
  });
});
