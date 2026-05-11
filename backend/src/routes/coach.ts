import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { skeletonRejectPayload } from '../domain/schemas.js';
import {
  approveSkeleton, rejectSkeleton, listPendingForCoach,
  findSkeleton, listSlots, createPendingSkeleton,
} from '../services/skeleton.service.js';
import { listExercisesForAthlete } from '../services/exercise.service.js';
import { generateSkeleton } from '../services/openai.service.js';
import { listAlertsForCoach, markRead, markResolved, AlertError } from '../services/alert.service.js';
import {
  listAthletesForCoach,
  getAthleteDetailForCoach,
  CoachError,
} from '../services/coach.service.js';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';

const router = Router();
router.use(requireAuth, requireRole('coach'));

router.get('/skeletons/pending', async (req, res) => {
  const list = await listPendingForCoach(req.user!.id);
  res.json(list);
});

router.get('/skeletons/:id', async (req, res) => {
  const sk = await findSkeleton(req.params.id);
  if (!sk) return res.status(404).json({ error: 'not_found' });
  const slots = await listSlots(sk.id);
  const profile = (await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [sk.athlete_id],
  )).rows[0] ?? null;
  res.json({ skeleton: sk, slots, profile });
});

router.post('/skeletons/:id/approve', async (req, res) => {
  await approveSkeleton(req.params.id, req.user!.id);
  res.status(204).end();
});

router.post('/skeletons/:id/reject', async (req, res) => {
  const parsed = skeletonRejectPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });

  const sk = await findSkeleton(req.params.id);
  if (!sk) return res.status(404).json({ error: 'not_found' });

  await rejectSkeleton(sk.id, req.user!.id, parsed.data.feedback);

  // Re-generate
  const profile = (await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [sk.athlete_id],
  )).rows[0];
  const exercises = await listExercisesForAthlete(profile);
  try {
    const ai = await generateSkeleton({
      profile, exercises, rejectionFeedback: parsed.data.feedback,
    });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId: sk.athlete_id,
        generationPrompt: { profile, rejection_feedback: parsed.data.feedback },
        generationRationale: ai.rationale,
        rejectionFeedback: parsed.data.feedback,
      },
      ai,
    );
    res.status(201).json({ newSkeletonId: skeletonId });
  } catch (e) {
    logger.error({ err: e, athleteId: sk.athlete_id }, 'regen after reject failed');
    res.status(502).json({ error: 'skeleton_regen_failed' });
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  const unread = req.query.unread === 'true';
  const list = await listAlertsForCoach(req.user!.id, unread);
  return res.status(200).json(list);
});

router.patch('/alerts/:id/read', async (req: Request, res: Response) => {
  try {
    await markRead(req.params.id, req.user!.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.patch('/alerts/:id/resolve', async (req: Request, res: Response) => {
  try {
    await markResolved(req.params.id, req.user!.id);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof AlertError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

router.get('/athletes', async (req: Request, res: Response) => {
  const list = await listAthletesForCoach(req.user!.id);
  return res.status(200).json(list);
});

router.get('/athletes/:id', async (req: Request, res: Response) => {
  try {
    const out = await getAthleteDetailForCoach(req.user!.id, req.params.id);
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof CoachError) return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

export default router;
