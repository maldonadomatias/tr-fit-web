import pool from '../db/connect.js';
import { generateSkeleton } from './openai.service.js';
import { createPendingSkeleton } from './skeleton.service.js';
import { listExercisesForAthlete } from './exercise.service.js';
import type { AthleteProfile, PlanInterest } from '../domain/types.js';

export type RegenResult =
  | { ok: true; skeletonId: string }
  | { ok: false; error: 'tier_blocked' | 'rate_limited'; message: string };

export async function regenerateSkeleton(athleteId: string): Promise<RegenResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Advisory lock keyed by athlete UUID — serializes concurrent regen requests per user.
    // hashtext returns int4 which pg_advisory_xact_lock accepts.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [athleteId],
    );

    const tier = await client.query<{ plan_interest: PlanInterest | null }>(
      `SELECT plan_interest FROM athlete_profiles WHERE user_id = $1`,
      [athleteId],
    ).then((r) => r.rows[0]?.plan_interest ?? null);

    if (tier === 'basico') {
      const count = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM skeleton_regen_log
          WHERE athlete_id = $1 AND result = 'approved_gen'`,
        [athleteId],
      );
      if (parseInt(count.rows[0].n, 10) >= 1) {
        await client.query(
          `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'tier_blocked')`,
          [athleteId],
        );
        await client.query('COMMIT');
        return {
          ok: false, error: 'tier_blocked',
          message: 'Plan básico: 1 sola regeneración. Upgradeá a Full.',
        };
      }
    }

    if (tier === 'full') {
      const count = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM skeleton_regen_log
          WHERE athlete_id = $1 AND result = 'approved_gen'
            AND requested_at > now() - interval '30 days'`,
        [athleteId],
      );
      if (parseInt(count.rows[0].n, 10) >= 1) {
        await client.query(
          `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'rate_limited')`,
          [athleteId],
        );
        await client.query('COMMIT');
        return {
          ok: false, error: 'rate_limited',
          message: 'Plan Full: 1 regeneración por mes. Esperá o upgradeá a Premium.',
        };
      }
    }

    const profileR = await client.query<AthleteProfile>(
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
    await client.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [athleteId],
    );
    await client.query('COMMIT');
    return { ok: true, skeletonId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
