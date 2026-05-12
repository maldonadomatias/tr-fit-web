import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockHandleWebhookEvent = jest.fn<() => Promise<void>>();
jest.unstable_mockModule('../../src/services/subscription.service.js', () => ({
  createSubscription: jest.fn(),
  handleWebhookEvent: mockHandleWebhookEvent,
  SubscriptionError: class SubscriptionError extends Error {
    constructor(msg: string, public statusCode: number, public code: string) {
      super(msg);
    }
  },
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const requestMod = await import('supertest');
const request = requestMod.default;
const appMod = await import('../../src/app.js');
const app = appMod.default;

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET!;

function makeSignature(dataId: string, requestId: string): string {
  const ts = Date.now().toString();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

const validPayload = {
  type: 'subscription_preapproval',
  data: { id: 'pre-webhook-123' },
};

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); mockHandleWebhookEvent.mockReset(); });
afterAll(async () => { await closePool(); });

describe('POST /webhooks/mp', () => {
  it('processes valid webhook and returns 200', async () => {
    mockHandleWebhookEvent.mockResolvedValueOnce(undefined);
    const requestId = 'req-abc';
    const sig = makeSignature(validPayload.data.id, requestId);

    const r = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', sig)
      .set('x-request-id', requestId)
      .send(validPayload);

    expect(r.status).toBe(200);
    expect(mockHandleWebhookEvent).toHaveBeenCalledWith(validPayload);
  });

  it('logs event to mp_webhook_log', async () => {
    mockHandleWebhookEvent.mockResolvedValueOnce(undefined);
    const requestId = 'req-log';
    const sig = makeSignature(validPayload.data.id, requestId);

    await request(app)
      .post('/webhooks/mp')
      .set('x-signature', sig)
      .set('x-request-id', requestId)
      .send({ ...validPayload, id: 9999 });

    const r = await pool.query(
      `SELECT 1 FROM mp_webhook_log WHERE event_id = $1`, [validPayload.data.id],
    );
    expect(r.rowCount).toBe(1);
  });

  it('returns 401 for invalid signature', async () => {
    const r = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', 'ts=123,v1=badsig')
      .set('x-request-id', 'req-bad')
      .send(validPayload);

    expect(r.status).toBe(401);
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 200 on duplicate event_id without reprocessing', async () => {
    await pool.query(
      `INSERT INTO mp_webhook_log (event_id, payload, processed)
       VALUES ($1, '{}', true)`,
      [validPayload.data.id],
    );
    const requestId = 'req-dup';
    const sig = makeSignature(validPayload.data.id, requestId);

    const r = await request(app)
      .post('/webhooks/mp')
      .set('x-signature', sig)
      .set('x-request-id', requestId)
      .send(validPayload);

    expect(r.status).toBe(200);
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
  });
});
