// backend/src/routes/platform-fee.ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, requireSuperadmin } from '../middleware/role.js';
import {
  getConfig,
  updateConfig,
  computeCurrent,
  getHistory,
  previewAdjustment,
  applyAdjustment,
} from '../services/platform-fee.service.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const [summary, config] = await Promise.all([computeCurrent(), getConfig()]);
  res.json({ summary, config });
});

router.get('/history', async (_req, res) => {
  res.json(await getHistory());
});

const configBody = z.object({
  base_fee_ars: z.number().nonnegative().optional(),
  reference_usd: z.number().positive().optional(),
  current_usd: z.number().positive().optional(),
  price_per_athlete_ars: z.number().nonnegative().optional(),
  revenue_share_pct: z.number().min(0).max(100).optional(),
  adjustment_interval_months: z.number().int().positive().optional(),
  next_adjustment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

router.put('/config', requireSuperadmin, async (req, res) => {
  const parsed = configBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  res.json(await updateConfig(parsed.data));
});

const dollarBody = z.object({ current_usd: z.number().positive() });

router.put('/dollar', requireSuperadmin, async (req, res) => {
  const parsed = dollarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  res.json(await updateConfig({ current_usd: parsed.data.current_usd }));
});

router.post('/adjust', requireSuperadmin, async (req, res) => {
  const parsed = dollarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }
  const applied = await previewAdjustment(parsed.data.current_usd);
  const config = await applyAdjustment(parsed.data.current_usd);
  res.json({ config, applied });
});

export default router;
