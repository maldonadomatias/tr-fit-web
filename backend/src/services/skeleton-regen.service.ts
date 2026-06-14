import pool from '../db/connect.js';
import { generateSkeleton } from './openai.service.js';
import { createPendingSkeleton } from './skeleton.service.js';
import { listExercisesForAthlete } from './exercise.service.js';
import type { AthleteProfile } from '../domain/types.js';

// Tier-based regeneration limits (basico = 1 total, full = 1/month) were removed
// when the app unlocked all features client-side. Regeneration is now always
// allowed; the only failure mode is an unexpected error (which throws → 500).
export type RegenResult = { ok: true; skeletonId: string };

export async function regenerateSkeleton(athleteId: string): Promise<RegenResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Advisory lock keyed by athlete UUID — serializes concurrent regen requests per user
    // so two in-flight requests don't generate duplicate skeletons.
    // hashtext returns int4 which pg_advisory_xact_lock accepts.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [athleteId],
    );

    const profileR = await client.query<AthleteProfile>(
      `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
    );
    const profile = profileR.rows[0];
    const exercises = await listExercisesForAthlete(profile, athleteId);
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
