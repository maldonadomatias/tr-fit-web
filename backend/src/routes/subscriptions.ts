import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { createSubscription, SubscriptionError } from '../services/subscription.service.js';
import pool from '../db/connect.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

const createBody = z.object({
  tier: z.enum(['basico', 'full', 'premium']),
});

router.post('/create', async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_tier' });
  }

  const userR = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`, [req.user!.id],
  );
  const payerEmail = userR.rows[0]?.email ?? '';

  try {
    const { checkoutUrl, subscriptionId } = await createSubscription({
      athleteId: req.user!.id,
      tier: parsed.data.tier,
      payerEmail,
    });
    res.status(201).json({ checkout_url: checkoutUrl, subscription_id: subscriptionId });
  } catch (e) {
    if (e instanceof SubscriptionError) {
      return res.status(e.statusCode).json({ error: e.code });
    }
    return res.status(502).json({ error: 'payment_provider_error' });
  }
});

router.get('/me', async (req, res) => {
  const r = await pool.query(
    `SELECT tier, status, current_period_end
     FROM subscriptions
     WHERE athlete_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user!.id],
  );
  res.json({ subscription: r.rows[0] ?? null });
});

export default router;
