import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { rmPayload } from '../domain/schemas.js';
import pool from '../db/connect.js';
import { buildTodaySession, TodayBlockedError } from '../services/engine.service.js';
import { findActiveByAthlete, listSlots } from '../services/skeleton.service.js';
import { recordRm } from '../services/rm.service.js';
import { getUserTier } from '../services/tier.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete'));

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
  const dayOfWeek = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
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

router.get('/me/tier', async (req, res) => {
  const tier = await getUserTier(req.user!.id);
  res.json({ plan_interest: tier });
});

export default router;
