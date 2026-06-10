import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import { getBillingInfo, updateBillingInfo } from '../services/billing.service.js';
import { getMembership } from '../services/membership.service.js';

const router = Router();

// Público: la pantalla de login (sin token) lee los datos de pago.
router.get('/info', async (_req, res) => {
  res.json(await getBillingInfo());
});

// Auth: estado de membresía del atleta para el banner in-app.
router.get('/status', requireAuth, async (req, res) => {
  const m = await getMembership(req.user!.id);
  res.json({ paid_until: m?.paid_until ?? null });
});

const updateBody = z.object({
  alias: z.string().nullable().optional(),
  cbu: z.string().nullable().optional(),
  holder: z.string().nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  currency: z.string().optional(),
  note: z.string().nullable().optional(),
});

router.put('/admin/info', requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  res.json(await updateBillingInfo(parsed.data));
});

export default router;
