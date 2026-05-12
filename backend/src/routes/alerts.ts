import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { alertPayload } from '../domain/schemas.js';
import {
  createPainAlert, createMachineAlert, AlertError,
} from '../services/alert.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

const alertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.user?.id;
    return uid ? `alert:${uid}` : `alert:${ipKeyGenerator(req.ip ?? '')}`;
  },
});

router.post('/', alertLimiter, async (req: Request, res: Response) => {
  const parsed = alertPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const { type, exercise_id, session_log_id, payload } = parsed.data;
  if (!exercise_id) return res.status(400).json({ error: 'missing_exercise_id' });
  try {
    if (type === 'sos_pain') {
      const p = payload as { zone: 'lumbar'|'rodilla'|'hombro'|'cervical'|'cadera'|'otro'; intensity: number };
      const out = await createPainAlert({
        athleteId: req.user!.id,
        exerciseId: exercise_id,
        sessionLogId: session_log_id,
        zone: p.zone, intensity: p.intensity,
      });
      return res.status(201).json(out);
    }
    if (type === 'sos_machine') {
      const p = payload as { switched_to_exercise_id: number };
      const out = await createMachineAlert({
        athleteId: req.user!.id,
        exerciseId: exercise_id,
        switchedToExerciseId: p.switched_to_exercise_id,
        sessionLogId: session_log_id,
      });
      return res.status(201).json(out);
    }
    return res.status(400).json({ error: 'invalid_type' });
  } catch (e) {
    if (e instanceof AlertError) {
      if (e.reason === 'no_coach_assigned') return res.status(422).json({ error: 'no_coach_assigned' });
      if (e.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
    }
    throw e;
  }
});

export default router;
