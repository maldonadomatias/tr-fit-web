import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  startSessionPayload, setLogPayload, syncPayload, finishSessionPayload,
} from '../domain/schemas.js';
import {
  startSession, logSet, finishSession, getActive, SessionError,
} from '../services/session.service.js';
import { syncSets } from '../services/sync.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

router.post('/', async (req: Request, res: Response) => {
  const parsed = startSessionPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  try {
    const out = await startSession(req.user!.id, parsed.data.day_of_week, parsed.data.client_id);
    return res.status(201).json(out);
  } catch (e) {
    if (e instanceof SessionError) {
      if (e.reason === 'wrong_day') {
        const expected = (e as SessionError & { expectedDay?: number }).expectedDay;
        return res.status(400).json({ error: 'wrong_day', expectedDay: expected });
      }
      if (e.reason === 'session_in_progress') return res.status(409).json({ error: 'session_in_progress' });
      if (e.reason === 'no_active_skeleton') return res.status(403).json({ error: 'no_active_skeleton' });
      return res.status(400).json({ error: e.reason });
    }
    throw e;
  }
});

router.get('/active', async (req: Request, res: Response) => {
  const out = await getActive(req.user!.id);
  return res.status(200).json(out);
});

router.post('/:id/sets', async (req: Request, res: Response) => {
  const parsed = setLogPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const out = await logSet(req.params.id, req.user!.id, parsed.data);
    return res.status(out.created ? 201 : 200).json(out);
  } catch (e) {
    if (e instanceof SessionError) {
      if (e.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.reason === 'session_finished') return res.status(400).json({ error: 'session_finished' });
    }
    throw e;
  }
});

router.patch('/:id/finish', async (req: Request, res: Response) => {
  const parsed = finishSessionPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const summary = await finishSession(req.params.id, req.user!.id, parsed.data.fatigue_rating);
    return res.status(200).json({ summary });
  } catch (e) {
    if (e instanceof SessionError) {
      if (e.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (e.reason === 'already_finished') return res.status(409).json({ error: 'already_finished' });
    }
    throw e;
  }
});

router.post('/:id/sync', async (req: Request, res: Response) => {
  const parsed = syncPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const out = await syncSets(req.user!.id, req.params.id, parsed.data.sets);
  return res.status(200).json(out);
});

export default router;
