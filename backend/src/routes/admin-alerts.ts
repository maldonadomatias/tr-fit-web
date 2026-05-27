import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listAlertsForCoach,
  markRead,
  resolveAlert,
  AlertError,
  ResolveAlertError,
} from '../services/alert.service.js';
import {
  getAlertContext, AlertContextError,
} from '../services/alert-context.service.js';
import { alertResolvePayload } from '../domain/schemas.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req: Request, res: Response) => {
  const status = (req.query.status as string) || 'open';
  const type = req.query.type as string | undefined;
  const severity = req.query.severity as string | undefined;
  const athleteId = req.query.athlete_id as string | undefined;
  const rawLimit = parseInt((req.query.limit as string) || '50', 10);
  const rawPage = parseInt((req.query.page as string) || '1', 10);
  const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200);
  const page = Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1);
  const items = await listAlertsForCoach(req.user!.id, {
    status: status === 'open' || status === 'resolved' || status === 'all' ? status : 'open',
    type, severity, athleteId, limit, page,
  });
  return res.status(200).json({ items, total: items.length });
});

router.get('/:id/context', async (req: Request, res: Response) => {
  try {
    const ctx = await getAlertContext(req.params.id, req.user!.id);
    return res.status(200).json(ctx);
  } catch (e) {
    if (e instanceof AlertContextError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await markRead(req.params.id, req.user!.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  const parsed = alertResolvePayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  try {
    await resolveAlert(req.params.id, req.user!.id, parsed.data);
    const ctx = await getAlertContext(req.params.id, req.user!.id);
    return res.status(200).json(ctx.alert);
  } catch (e) {
    if (e instanceof ResolveAlertError) {
      if (e.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.reason === 'invalid_action') return res.status(422).json({ error: 'invalid_action' });
      if (e.reason === 'invalid_payload') return res.status(422).json({ error: 'invalid_payload' });
      if (e.reason === 'already_resolved') return res.status(409).json({ error: 'already_resolved' });
      if (e.reason === 'missing_state') return res.status(409).json({ error: 'missing_state' });
    }
    throw e;
  }
});

export default router;
