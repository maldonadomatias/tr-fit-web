import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listAlertsForCoach,
  markRead,
  markResolved,
  resolveAlert,
  AlertError,
  ResolveAlertError,
} from '../services/alert.service.js';
import {
  getAlertContext, AlertContextError,
} from '../services/alert-context.service.js';
import { alertResolvePayload } from '../domain/schemas.js';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from '../services/notification.service.js';

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

// Plain close: mark the alert resolved without a specific resolution action,
// so it leaves the open list. Used when the coach handled it out-of-band.
router.patch('/:id/resolved', async (req: Request, res: Response) => {
  try {
    await markResolved(req.params.id, req.user!.id);
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
    // Push notification (fire-and-forget, SOS alerts only)
    pool.query<{ athlete_id: string; exercise_id: number | null; type: string }>(
      `SELECT athlete_id, exercise_id, type FROM coach_alerts WHERE id = $1`,
      [req.params.id],
    ).then(async (a) => {
      if (!a.rows[0]) return;
      if (a.rows[0].type !== 'sos_pain' && a.rows[0].type !== 'sos_machine') return;
      let exerciseName: string | undefined;
      if (a.rows[0].exercise_id) {
        const ex = await pool.query<{ name: string }>(
          `SELECT name FROM exercises WHERE id = $1`,
          [a.rows[0].exercise_id],
        );
        exerciseName = ex.rows[0]?.name;
      }
      await notifyUser(
        a.rows[0].athlete_id,
        'sos_resolved',
        exerciseName ? { exerciseName } : {},
      );
    }).catch((e) => logger.error({ err: e }, 'alert push notify failed'));
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
