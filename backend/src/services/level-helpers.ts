import type { Level } from '../domain/types.js';

// Athlete level → exercise level rank (1=beginner, 2=intermediate, 3=advanced).
// Athlete enum is 5-value (nunca|bajo|medio|avanzado|muy_avanzado); exercise
// enum is 3-value (principiante|intermedio|avanzado). This collapses the 5
// athlete buckets onto the 3 exercise rank buckets for comparison.
export function athleteLevelRank(level: Level): number {
  if (level === 'nunca' || level === 'bajo') return 1;
  if (level === 'medio') return 2;
  return 3; // avanzado, muy_avanzado
}
