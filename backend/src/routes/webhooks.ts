import { Router, json } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { handleWebhookEvent, type MpWebhookPayload } from '../services/subscription.service.js';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';

const router = Router();

router.use(json({ limit: '10mb' }));

function verifyMpSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
): boolean {
  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => p.split('=')),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(v1, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

router.post('/mp', async (req, res) => {
  const xSignature = (req.headers['x-signature'] as string) ?? '';
  const xRequestId = (req.headers['x-request-id'] as string) ?? '';
  const payload = req.body as MpWebhookPayload;
  const dataId = payload?.data?.id ?? '';

  if (!verifyMpSignature(xSignature, xRequestId, dataId)) {
    logger.warn({ xSignature }, 'MP webhook signature invalid');
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const logR = await pool.query<{ processed: boolean }>(
    `INSERT INTO mp_webhook_log (event_id, payload)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING processed`,
    [dataId, JSON.stringify(payload)],
  );

  if ((logR.rowCount ?? 0) === 0) {
    return res.sendStatus(200);
  }

  try {
    await handleWebhookEvent(payload);
    await pool.query(
      `UPDATE mp_webhook_log SET processed = true WHERE event_id = $1`,
      [dataId],
    );
  } catch (e) {
    logger.error({ err: e, dataId }, 'webhook processing error');
  }

  res.sendStatus(200);
});

export default router;
