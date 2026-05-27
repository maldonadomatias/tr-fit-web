import pool from '../db/connect.js';
import type { SkeletonSlot } from '../domain/types.js';

export interface WeeklyOverride {
  id: string;
  athlete_id: string;
  program_week: number;
  day_of_week: number | null;
  original_exercise_id: number;
  replacement_exercise_id: number | null;
  override_type: 'swap' | 'skip' | 'reduce_intensity';
  intensity_payload: Record<string, unknown>;
  source_alert_id: string | null;
  created_at: string;
  created_by: string | null;
  expires_after_week: number;
}

export interface InsertOverrideInput {
  athleteId: string;
  programWeek: number;
  dayOfWeek: number | null;
  originalExerciseId: number;
  replacementExerciseId: number | null;
  overrideType: 'swap' | 'skip' | 'reduce_intensity';
  intensityPayload: Record<string, unknown>;
  sourceAlertId: string | null;
  createdBy: string;
  expiresAfterWeek: number;
}

export async function insertOverride(
  input: InsertOverrideInput,
): Promise<{ id: string }> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO weekly_overrides
       (athlete_id, program_week, day_of_week, original_exercise_id,
        replacement_exercise_id, override_type, intensity_payload,
        source_alert_id, created_by, expires_after_week)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING id`,
    [
      input.athleteId, input.programWeek, input.dayOfWeek,
      input.originalExerciseId, input.replacementExerciseId,
      input.overrideType, JSON.stringify(input.intensityPayload),
      input.sourceAlertId, input.createdBy, input.expiresAfterWeek,
    ],
  );
  return { id: r.rows[0].id };
}

export async function hasActiveOverride(
  athleteId: string,
  programWeek: number,
  exerciseId: number,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM weekly_overrides
      WHERE athlete_id = $1
        AND program_week <= $2 AND expires_after_week >= $2
        AND original_exercise_id = $3
      LIMIT 1`,
    [athleteId, programWeek, exerciseId],
  );
  return (r.rowCount ?? 0) > 0;
}

export type SlotLike = SkeletonSlot;

export type EffectiveSlot = SlotLike & { _override?: WeeklyOverride };

export async function applyOverridesToSlots(
  athleteId: string,
  programWeek: number,
  dayOfWeek: number,
  slots: SlotLike[],
): Promise<EffectiveSlot[]> {
  if (slots.length === 0) return [];
  const ovR = await pool.query<WeeklyOverride>(
    `SELECT * FROM weekly_overrides
       WHERE athlete_id = $1
         AND program_week <= $2 AND expires_after_week >= $2
         AND (day_of_week = $3 OR day_of_week IS NULL)`,
    [athleteId, programWeek, dayOfWeek],
  );
  const ovByOrig = new Map<number, WeeklyOverride>();
  for (const o of ovR.rows) ovByOrig.set(o.original_exercise_id, o);

  const out: EffectiveSlot[] = [];
  for (const slot of slots) {
    const ov = ovByOrig.get(slot.exercise_id);
    if (!ov) { out.push(slot); continue; }
    if (ov.override_type === 'skip') continue;
    if (ov.override_type === 'swap') {
      if (ov.replacement_exercise_id === null) {
        // DB CHECK constraint guarantees this. If we reach here, the constraint is gone.
        throw new Error(`swap override ${ov.id} has null replacement_exercise_id`);
      }
      out.push({
        ...slot,
        exercise_id: ov.replacement_exercise_id,
        _override: ov,
      });
      continue;
    }
    // reduce_intensity: keep exercise, annotate
    out.push({ ...slot, _override: ov });
  }
  return out;
}
