import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  skeletonRejectPayload,
  skeletonApprovePayload,
} from '../domain/schemas.js';
import {
  approveSkeleton,
  rejectSkeleton,
  discardPendingForAthlete,
  listPendingForCoach,
  findSkeleton,
  listSlots,
  createPendingSkeleton,
} from '../services/skeleton.service.js';
import { listExercisesForAthlete } from '../services/exercise.service.js';
import { generateRoutine } from '../services/routine-generation.service.js';
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { notifyUser } from '../services/notification.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/pending', async (req, res) => {
  const list = await listPendingForCoach(req.user!.id);
  res.json(list);
});

router.get('/:id', async (req, res) => {
  const sk = await findSkeleton(req.params.id);
  if (!sk) return res.status(404).json({ error: 'not_found' });
  const slots = await listSlots(sk.id);
  const profile = (
    await pool.query(`SELECT * FROM athlete_profiles WHERE user_id = $1`, [
      sk.athlete_id,
    ])
  ).rows[0] ?? null;

  // Series/reps shown at approval reflect the week the athlete will run on:
  // their current_week if a program already exists, else week 1 (fresh start).
  const stateR = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
    [sk.athlete_id],
  );
  const week = stateR.rows[0]?.current_week ?? 1;
  const cfgR = await pool.query(
    `SELECT week_number, block_label,
            principal_series, principal_reps, principal_descanso,
            accesorio_series, accesorio_reps, accesorio_descanso
       FROM periodization_config WHERE week_number = $1`,
    [week],
  );
  const periodization = cfgR.rows[0] ?? null;

  res.json({ skeleton: sk, slots, profile, periodization });
});

router.post('/:id/approve', async (req, res) => {
  const parsed = skeletonApprovePayload.safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });
  await approveSkeleton(req.params.id, req.user!.id, {
    slotOverrides: parsed.data.slot_overrides,
    slotOrder: parsed.data.slot_order,
    deletedSlotIds: parsed.data.deleted_slot_ids,
    addedSlots: parsed.data.added_slots,
  });
  pool
    .query<{ athlete_id: string }>(
      `SELECT athlete_id FROM athlete_skeletons WHERE id = $1`,
      [req.params.id],
    )
    .then((sk) => {
      if (sk.rows[0]) {
        notifyUser(sk.rows[0].athlete_id, 'skeleton_approved').catch((e) =>
          logger.error({ err: e }, 'push notify failed'),
        );
      }
    })
    .catch((e) =>
      logger.error({ err: e }, 'skeleton lookup for push failed'),
    );
  res.status(204).end();
});

router.post('/:id/discard', async (req, res) => {
  const sk = await findSkeleton(req.params.id);
  if (!sk) return res.status(404).json({ error: 'not_found' });
  if (sk.status !== 'pending_review')
    return res.status(409).json({ error: 'not_pending' });
  await discardPendingForAthlete(sk.athlete_id, req.user!.id);
  res.status(204).end();
});

router.post('/:id/reject', async (req, res) => {
  const parsed = skeletonRejectPayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });

  const sk = await findSkeleton(req.params.id);
  if (!sk) return res.status(404).json({ error: 'not_found' });

  await rejectSkeleton(sk.id, req.user!.id, parsed.data.feedback);

  const profile = (
    await pool.query(`SELECT * FROM athlete_profiles WHERE user_id = $1`, [
      sk.athlete_id,
    ])
  ).rows[0];
  const exercises = await listExercisesForAthlete(profile, sk.athlete_id);
  try {
    const gen = await generateRoutine({
      profile,
      exercises,
      rejectionFeedback: parsed.data.feedback,
    });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId: sk.athlete_id,
        generationPrompt: {
          profile, rejection_feedback: parsed.data.feedback,
          source: gen.source, template: gen.templateSource, reasons: gen.reasons,
        },
        generationRationale: gen.skeleton.rationale,
        rejectionFeedback: parsed.data.feedback,
      },
      gen.skeleton,
    );
    res.status(201).json({ newSkeletonId: skeletonId, newRutinaId: skeletonId });
  } catch (e) {
    logger.error(
      { err: e, athleteId: sk.athlete_id },
      'regen after reject failed',
    );
    res.status(502).json({ error: 'skeleton_regen_failed' });
  }
});

export default router;
