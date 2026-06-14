import { roundWeightForEquipment } from './progression-helpers.js';

/**
 * Theoretical 1RM from an AMRAP set (Epley): peso × (1 + reps/30).
 * Rounds to the nearest 2.5 for barbell/smith, else to the nearest 1.
 */
export function estimateEpley1RM(
  weightUsed: number,
  reps: number,
  equipment: string,
): number {
  const raw = weightUsed * (1 + reps / 30);
  return roundWeightForEquipment(raw, equipment);
}
