import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { findAlternative } from '../services/alternatives.service.js';
import { listExercises as listExercisesAdmin } from '../services/admin-exercise.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete', 'admin', 'superadmin'));

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query' });
  }
  const result = await listExercisesAdmin({
    q: parsed.data.q,
    limit: parsed.data.limit ?? 8,
    archived: 'false',
  });
  return res.json({ items: result.items });
});

router.get('/:id/alternatives', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const excludeRaw = typeof req.query.exclude === 'string' ? req.query.exclude : '';
  const excludeIds = excludeRaw
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const alt = await findAlternative(id, req.user!.id, excludeIds);
  return res.status(200).json({ alternative: alt });
});

export default router;
