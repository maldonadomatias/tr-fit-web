import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import pool from '../db/connect.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listUsers,
  getUser,
  updateUser,
  createUser,
  deleteUser,
  upsertManualSubscription,
  cancelSubscription,
  getStats,
  logAudit,
  listActivity,
  AdminError,
} from '../services/admin.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

async function actorEmail(req: Request): Promise<string> {
  if (!req.user) return 'system';
  const r = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [req.user.id],
  );
  return r.rows[0]?.email ?? `admin:${req.user.id.slice(0, 8)}`;
}

router.get('/stats', async (_req: Request, res: Response) => {
  const stats = await getStats();
  res.json(stats);
});

const activityQuery = z.object({
  category: z.enum(['user', 'sub', 'auth']).optional(),
  target_id: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

router.get('/activity', async (req: Request, res: Response) => {
  const parsed = activityQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query' });
  }
  const rows = await listActivity(parsed.data);
  res.json(rows);
});

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  role: z.enum(['athlete', 'admin', 'superadmin']).optional(),
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
  role: z.enum(['athlete', 'admin', 'superadmin']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  email_verified: z.boolean().optional(),
});

router.post('/users', async (req: Request, res: Response) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const user = await createUser(parsed.data);
    await logAudit({
      type: 'user_created',
      actor: await actorEmail(req),
      target: user.email,
      target_id: user.id,
      severity: 'brand',
      meta: { role: user.role, status: user.status },
    });
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
    const u = await getUser(req.params.id);
    await deleteUser(req.params.id);
    await logAudit({
      type: 'user_deleted',
      actor: await actorEmail(req),
      target: u?.email ?? null,
      target_id: req.params.id,
      severity: 'destructive',
    });
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

const patchBody = z
  .object({
    role: z.enum(['athlete', 'admin', 'superadmin']).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    email_verified: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'empty_patch' });

router.patch('/users/:id', async (req: Request, res: Response) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

  if (req.params.id === req.user!.id) {
    const me = req.user!;
    const wantsRoleChange =
      parsed.data.role !== undefined && parsed.data.role !== me.role;
    const wantsStatusChange =
      parsed.data.status !== undefined && parsed.data.status !== 'approved';
    if (wantsRoleChange || wantsStatusChange) {
      return res.status(400).json({ error: 'cannot_modify_self' });
    }
  }

  const before = await getUser(req.params.id);
  if (!before) return res.status(404).json({ error: 'not_found' });

  const touchingSuperadmin =
    parsed.data.role === 'superadmin' || before.role === 'superadmin';
  if (touchingSuperadmin && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'superadmin_only' });
  }

  await updateUser(req.params.id, parsed.data);
  const fresh = await getUser(req.params.id);

  const actor = await actorEmail(req);
  const target = fresh?.email ?? before.email;
  const target_id = req.params.id;

  if (parsed.data.status && parsed.data.status !== before.status) {
    if (parsed.data.status === 'approved') {
      await logAudit({
        type: 'user_approved',
        actor,
        target,
        target_id,
        severity: 'brand',
      });
    } else if (parsed.data.status === 'rejected') {
      await logAudit({
        type: 'user_rejected',
        actor,
        target,
        target_id,
        severity: 'destructive',
      });
    }
  }
  if (parsed.data.role && parsed.data.role !== before.role) {
    await logAudit({
      type: 'role_changed',
      actor,
      target,
      target_id,
      severity: 'warning',
      meta: { from: before.role, to: parsed.data.role },
    });
  }
  if (
    parsed.data.email_verified !== undefined &&
    parsed.data.email_verified !== before.email_verified
  ) {
    await logAudit({
      type: parsed.data.email_verified ? 'email_verified' : 'email_unverified',
      actor,
      target,
      target_id,
      severity: parsed.data.email_verified ? 'brand' : 'warning',
    });
  }

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
  const before = await getUser(req.params.id);
  await upsertManualSubscription(req.params.id, {
    tier: parsed.data.tier,
    status: parsed.data.status,
    current_period_end: parsed.data.current_period_end ?? null,
  });
  const fresh = await getUser(req.params.id);
  const actor = await actorEmail(req);
  const target = fresh?.email ?? before?.email ?? null;
  const target_id = req.params.id;
  const hadSub = !!before?.subscription_tier;
  let type:
    | 'subscription_created'
    | 'subscription_updated'
    | 'subscription_authorized'
    | 'subscription_paused'
    | 'subscription_cancelled';
  let severity: 'brand' | 'warning' | 'destructive' | null = null;
  if (!hadSub) {
    type = 'subscription_created';
    severity = 'brand';
  } else if (parsed.data.status === 'cancelled') {
    type = 'subscription_cancelled';
    severity = 'destructive';
  } else if (parsed.data.status === 'paused') {
    type = 'subscription_paused';
    severity = 'warning';
  } else if (parsed.data.status === 'authorized') {
    type = 'subscription_authorized';
    severity = 'brand';
  } else {
    type = 'subscription_updated';
  }
  await logAudit({
    type,
    actor,
    target,
    target_id,
    severity,
    meta: { tier: parsed.data.tier, status: parsed.data.status },
  });
  res.json(fresh);
});

router.delete('/users/:id/subscription', async (req: Request, res: Response) => {
  const before = await getUser(req.params.id);
  await cancelSubscription(req.params.id);
  const fresh = await getUser(req.params.id);
  await logAudit({
    type: 'subscription_cancelled',
    actor: await actorEmail(req),
    target: fresh?.email ?? before?.email ?? null,
    target_id: req.params.id,
    severity: 'destructive',
    meta: { tier: before?.subscription_tier ?? null },
  });
  res.json(fresh);
});

export default router;
