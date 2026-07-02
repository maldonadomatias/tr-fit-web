// C11 (coach-corrections-002): SERIES define session time, not exercise
// count. One serie (execution + rest + transition) takes 4.5-6 min in a real
// gym; hard ceiling 20 series per training day. Warmups count 1 serie each.
// Table confirmed by the coach (2026-07-02).
export function seriesRangeFor(minutes: number): { min: number; max: number } {
  if (minutes <= 30) return { min: 5, max: 6 };
  if (minutes <= 45) return { min: 7, max: 10 };
  if (minutes <= 60) return { min: 10, max: 14 };
  if (minutes <= 75) return { min: 12, max: 17 };
  if (minutes <= 90) return { min: 15, max: 20 };
  if (minutes <= 105) return { min: 17, max: 20 };
  return { min: 18, max: 20 };
}
