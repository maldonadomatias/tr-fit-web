import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { findAlternative } from '../services/alternatives.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

router.get('/:id/alternatives', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const alt = await findAlternative(id, req.user!.id);
  return res.status(200).json({ alternative: alt });
});

export default router;
