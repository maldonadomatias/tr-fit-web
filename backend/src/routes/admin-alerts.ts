import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listAlertsForCoach,
  markRead,
  markResolved,
  AlertError,
} from '../services/alert.service.js';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from '../services/notification.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req: Request, res: Response) => {
  const unread = req.query.unread === 'true';
  const list = await listAlertsForCoach(req.user!.id, unread);
  return res.status(200).json(list);
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await markRead(req.params.id, req.user!.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError)
      return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await markResolved(req.params.id, req.user!.id);
    pool
      .query<{ athlete_id: string; exercise_id: number | null }>(
        `SELECT athlete_id, exercise_id FROM coach_alerts WHERE id = $1`,
        [req.params.id],
      )
      .then(async (a) => {
        if (!a.rows[0]) return;
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
      })
      .catch((e) => logger.error({ err: e }, 'alert push notify failed'));
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError)
      return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

export default router;
