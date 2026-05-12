import pool from '../db/connect.js';
import { getUserTier } from './tier.service.js';
import { generateSkeleton } from './openai.service.js';
import { createPendingSkeleton } from './skeleton.service.js';
import { listExercisesForAthlete } from './exercise.service.js';
import type { AthleteProfile } from '../domain/types.js';

export type RegenResult =
  | { ok: true; skeletonId: string }
  | { ok: false; error: 'tier_blocked' | 'rate_limited'; message: string };

export async function regenerateSkeleton(athleteId: string): Promise<RegenResult> {
  const tier = await getUserTier(athleteId);

  if (tier === 'basico') {
    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM skeleton_regen_log
        WHERE athlete_id = $1 AND result = 'approved_gen'`,
      [athleteId],
    );
    if (parseInt(count.rows[0].n, 10) >= 1) {
      await pool.query(
        `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'tier_blocked')`,
        [athleteId],
      );
      return {
        ok: false, error: 'tier_blocked',
        message: 'Plan básico: 1 sola regeneración. Upgradeá a Full.',
      };
    }
  }

  if (tier === 'full') {
    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM skeleton_regen_log
        WHERE athlete_id = $1 AND result = 'approved_gen'
          AND requested_at > now() - interval '30 days'`,
      [athleteId],
    );
    if (parseInt(count.rows[0].n, 10) >= 1) {
      await pool.query(
        `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'rate_limited')`,
        [athleteId],
      );
      return {
        ok: false, error: 'rate_limited',
        message: 'Plan Full: 1 regeneración por mes. Esperá o upgradeá a Premium.',
      };
    }
  }

  const profileR = await pool.query<AthleteProfile>(
    `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
  );
  const profile = profileR.rows[0];
  const exercises = await listExercisesForAthlete(profile);
  const ai = await generateSkeleton({ profile, exercises });
  const { skeletonId } = await createPendingSkeleton(
    {
      athleteId,
      generationPrompt: { profile, exercises_count: exercises.length, source: 'regen' },
      generationRationale: ai.rationale,
    },
    ai,
  );
  await pool.query(
    `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
    [athleteId],
  );
  return { ok: true, skeletonId };
}
