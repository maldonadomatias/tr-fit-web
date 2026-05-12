import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireTier } from '../middleware/require-tier.js';
import {
  listRmHistory, listCompliance, listVolume,
  listRpeHistogram, listWeightVsSuggested,
} from '../services/progress.service.js';

const router = Router();

const weeksQuery = z.object({
  weeks: z.coerce.number().int().min(1).max(52).optional(),
});

router.get('/rms', requireAuth, requireRole('athlete'), requireTier('premium'),
  async (req, res) => {
    res.json(await listRmHistory(req.user!.id));
  });

router.get('/compliance', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = weeksQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  res.json(await listCompliance(req.user!.id, parsed.data.weeks ?? 12));
});

router.get('/volume', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = weeksQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  res.json(await listVolume(req.user!.id, parsed.data.weeks ?? 12));
});

router.get('/rpe', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = weeksQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  res.json(await listRpeHistogram(req.user!.id, parsed.data.weeks ?? 8));
});

router.get('/weight-vs-suggested', requireAuth, requireRole('athlete'),
  requireTier('premium'), async (req, res) => {
    const parsed = weeksQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
    }
    res.json(await listWeightVsSuggested(req.user!.id, parsed.data.weeks ?? 4));
  });

export default router;
