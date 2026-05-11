import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { onboardingPayload } from '../domain/schemas.js';
import pool from '../db/connect.js';
import { listExercisesForAthlete } from '../services/exercise.service.js';
import { generateSkeleton } from '../services/openai.service.js';
import { createPendingSkeleton } from '../services/skeleton.service.js';
import logger from '../utils/logger.js';

const router = Router();

router.post('/complete', requireAuth, requireRole('athlete'), async (req, res) => {
  const parsed = onboardingPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const userId = req.user!.id;
  const p = parsed.data;

  const exists = await pool.query(
    `SELECT 1 FROM athlete_profiles WHERE user_id = $1`, [userId],
  );
  if (exists.rowCount && exists.rowCount > 0) {
    return res.status(409).json({ error: 'profile_already_exists' });
  }

  // Auto-assign first coach (Fase 1: single-coach model per spec Open Q #1)
  const coachR = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'coach' ORDER BY created_at ASC LIMIT 1`,
  );
  const coachId = coachR.rows[0]?.id ?? null;

  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries, coach_id,
        phone, plan_interest, training_mode, commitment, exercise_minutes,
        days_specific, referral_source, sport_focus)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
             $13,$14,$15,$16,$17,$18,$19,$20)`,
    [userId, p.name, p.gender, p.age, p.height_cm, p.weight_kg,
     p.level, p.goal, p.days_per_week, p.equipment, p.injuries, coachId,
     p.phone, p.plan_interest, p.training_mode, p.commitment, p.exercise_minutes,
     p.days_specific, p.referral_source, p.sport_focus ?? null],
  );

  // Insert measurements if any non-null value provided
  if (p.measurements) {
    const m = p.measurements;
    const hasAny = m.chest_cm != null || m.waist_cm != null || m.hip_cm != null
      || m.thigh_cm != null || m.calf_cm != null || m.bicep_cm != null;
    if (hasAny) {
      await pool.query(
        `INSERT INTO athlete_measurements
           (athlete_id, chest_cm, waist_cm, hip_cm, thigh_cm, calf_cm, bicep_cm, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'onboarding')`,
        [userId, m.chest_cm ?? null, m.waist_cm ?? null, m.hip_cm ?? null,
         m.thigh_cm ?? null, m.calf_cm ?? null, m.bicep_cm ?? null],
      );
    }
  }

  const profileR = await pool.query(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [userId],
  );
  const profile = profileR.rows[0];
  const exercises = await listExercisesForAthlete(profile);

  try {
    const ai = await generateSkeleton({ profile, exercises });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId: userId,
        generationPrompt: { profile, exercises_count: exercises.length },
        generationRationale: ai.rationale,
      },
      ai,
    );
    return res.status(201).json({ skeletonId, status: 'pending_review' });
  } catch (e) {
    logger.error({ err: e, athleteId: userId }, 'skeleton generation failed');
    // Rollback: delete measurements (FK is on users, not profile) + profile, allow retry
    await pool
      .query(
        `DELETE FROM athlete_measurements WHERE athlete_id = $1 AND source = 'onboarding'`,
        [userId],
      )
      .catch((delErr) =>
        logger.error({ err: delErr, athleteId: userId }, 'measurements rollback failed'),
      );
    await pool
      .query(`DELETE FROM athlete_profiles WHERE user_id = $1`, [userId])
      .catch((delErr) =>
        logger.error({ err: delErr, athleteId: userId }, 'profile rollback failed'),
      );
    return res.status(502).json({ error: 'skeleton_generation_failed' });
  }
});

export default router;
