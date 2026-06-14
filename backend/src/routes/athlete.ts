import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { rmPayload, amrapPayload } from '../domain/schemas.js';
import pool from '../db/connect.js';
import { buildTodaySession, computeNextPendingDay, TodayBlockedError } from '../services/engine.service.js';
import { findActiveByAthlete, listSlots } from '../services/skeleton.service.js';
import { recordRm, recordAmrap } from '../services/rm.service.js';
import { getUserTier } from '../services/tier.service.js';
import { regenerateSkeleton } from '../services/skeleton-regen.service.js';
import { buildDashboard } from '../services/dashboard.service.js';
import { buildPlan } from '../services/plan.service.js';
import { buildAthleteStats } from '../services/athlete-stats.service.js';
import { excludeExercise, reactivateExercise, listExclusions } from '../services/exclusions.service.js';
import { resetProgramForGymChange } from '../services/program-reset.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

/**
 * @deprecated The mobile app no longer calls this endpoint — all features are
 * unlocked client-side and server-side tier gating was removed. No known caller
 * remains (the admin frontend reads subscription_tier from the admin API, not
 * this route). Kept temporarily for backward compatibility; safe to remove once
 * access logs confirm zero traffic. See docs for the payment-reconciliation plan.
 */
router.get('/me/tier', async (req, res) => {
  const tier = await getUserTier(req.user!.id);
  res.json({ plan_interest: tier });
});

router.get('/me/stats', async (req, res) => {
  const stats = await buildAthleteStats(req.user!.id);
  res.json(stats);
});

router.post('/skeleton/regenerate', async (req, res) => {
  // Tier gating removed — regeneration is always allowed for any enabled athlete.
  const result = await regenerateSkeleton(req.user!.id);
  res.status(201).json({
    skeletonId: result.skeletonId, status: 'pending_review',
  });
});

router.get('/me', async (req, res) => {
  const userId = req.user!.id;
  const profileR = await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [userId],
  );
  const stateR = await pool.query(
    `SELECT * FROM athlete_program_state WHERE athlete_id = $1`, [userId],
  );
  const profile = profileR.rows[0] ?? null;
  const state = stateR.rows[0] ?? null;
  const skeleton = await findActiveByAthlete(userId);

  let blockedReason: string | null = null;
  if (!skeleton.skeleton || skeleton.status !== 'approved') blockedReason = 'awaiting_review';
  if (state?.rm_test_blocking) blockedReason = 'rm_test_required';

  res.json({
    profile, programState: state,
    skeletonStatus: skeleton.status,
    blockedReason,
  });
});

router.get('/today', async (req, res) => {
  const userId = req.user!.id;
  const dayOfWeek = await computeNextPendingDay(userId);
  try {
    const items = await buildTodaySession(userId, dayOfWeek);
    res.json({ dayOfWeek, items });
  } catch (e) {
    if (e instanceof TodayBlockedError) {
      res.status(403).json({ error: 'blocked', reason: e.reason });
      return;
    }
    throw e;
  }
});

router.get('/skeleton/active', async (req, res) => {
  const userId = req.user!.id;
  const r = await findActiveByAthlete(userId);
  if (!r.skeleton) return res.json({ skeleton: null, slots: [], status: r.status });
  const slots = await listSlots(r.skeleton.id);
  res.json({
    skeleton: r.skeleton, slots, status: r.skeleton.status,
    rejectionFeedback: r.skeleton.rejection_feedback,
  });
});

router.post('/rm', async (req, res) => {
  const parsed = rmPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordRm({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    valueKg: parsed.data.value_kg,
    week: parsed.data.week,
  });
  res.status(201).json(out);
});

router.post('/amrap', async (req, res) => {
  const parsed = amrapPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordAmrap({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    weightUsed: parsed.data.weight_used,
    reps: parsed.data.reps,
  });
  res.status(201).json(out);
});

router.get('/dashboard', async (req, res) => {
  const payload = await buildDashboard(req.user!.id);
  res.json(payload);
});

router.get('/plan', async (req, res) => {
  const payload = await buildPlan(req.user!.id);
  res.json(payload);
});

router.get('/exclusions', async (req, res) => {
  const rows = await listExclusions(req.user!.id);
  res.json(rows);
});

router.post('/exclusions', async (req, res) => {
  const exerciseId = Number((req.body ?? {}).exercise_id);
  if (!Number.isInteger(exerciseId)) {
    return res.status(400).json({ error: 'exercise_id required' });
  }
  const sessionLogId =
    typeof (req.body ?? {}).session_log_id === 'string'
      ? (req.body as { session_log_id?: string }).session_log_id
      : undefined;
  const { replacement } = await excludeExercise(req.user!.id, exerciseId, sessionLogId);
  res.json({
    replacement: replacement
      ? {
          id: replacement.id,
          name: replacement.name,
          muscle_group: replacement.muscle_group,
          equipment: replacement.equipment,
        }
      : null,
  });
});

router.delete('/exclusions/:exerciseId', async (req, res) => {
  const exerciseId = Number(req.params.exerciseId);
  if (!Number.isInteger(exerciseId)) {
    return res.status(400).json({ error: 'invalid exerciseId' });
  }
  await reactivateExercise(req.user!.id, exerciseId);
  res.json({ ok: true });
});

router.post('/program/reset', async (req, res) => {
  await resetProgramForGymChange(req.user!.id);
  res.json({ ok: true });
});

export default router;
