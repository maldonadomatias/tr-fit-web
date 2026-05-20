import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  listUsers,
  getUser,
  updateUser,
  createUser,
  deleteUser,
  upsertManualSubscription,
  cancelSubscription,
  getStats,
  AdminError,
} from '../services/admin.service.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', async (_req: Request, res: Response) => {
  const stats = await getStats();
  res.json(stats);
});

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  role: z.enum(['athlete', 'coach', 'admin']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

router.get('/users', async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
  const users = await listUsers(parsed.data);
  res.json(users);
});

const createBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['athlete', 'coach', 'admin']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  email_verified: z.boolean().optional(),
});

router.post('/users', async (req: Request, res: Response) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const user = await createUser(parsed.data);
    return res.status(201).json(user);
  } catch (e) {
    if (e instanceof AdminError && e.code === 'email_taken') {
      return res.status(409).json({ error: 'email_already_registered' });
    }
    throw e;
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'cannot_delete_self' });
  }
  try {
    await deleteUser(req.params.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AdminError && e.code === 'not_found') {
      return res.status(404).json({ error: 'not_found' });
    }
    throw e;
  }
});

router.get('/users/:id', async (req: Request, res: Response) => {
  const u = await getUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  res.json(u);
});

const patchBody = z.object({
  role: z.enum(['athlete', 'coach', 'admin']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  email_verified: z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'empty_patch' });

router.patch('/users/:id', async (req: Request, res: Response) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

  // Guard: an admin can't demote/reject themselves to avoid lockout.
  if (req.params.id === req.user!.id) {
    const wantsRoleChange =
      parsed.data.role !== undefined && parsed.data.role !== 'admin';
    const wantsStatusChange =
      parsed.data.status !== undefined && parsed.data.status !== 'approved';
    if (wantsRoleChange || wantsStatusChange) {
      return res.status(400).json({ error: 'cannot_modify_self' });
    }
  }

  await updateUser(req.params.id, parsed.data);
  const fresh = await getUser(req.params.id);
  res.json(fresh);
});

const subBody = z.object({
  tier: z.enum(['basico', 'full', 'premium']),
  status: z.enum(['pending', 'authorized', 'paused', 'cancelled']),
  current_period_end: z.string().datetime().nullish(),
});

router.put('/users/:id/subscription', async (req: Request, res: Response) => {
  const parsed = subBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  await upsertManualSubscription(req.params.id, {
    tier: parsed.data.tier,
    status: parsed.data.status,
    current_period_end: parsed.data.current_period_end ?? null,
  });
  const fresh = await getUser(req.params.id);
  res.json(fresh);
});

router.delete('/users/:id/subscription', async (req: Request, res: Response) => {
  await cancelSubscription(req.params.id);
  const fresh = await getUser(req.params.id);
  res.json(fresh);
});

export default router;
