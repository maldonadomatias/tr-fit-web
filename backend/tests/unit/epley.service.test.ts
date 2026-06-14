import { estimateEpley1RM } from '../../src/services/epley.service.js';

describe('estimateEpley1RM', () => {
  // peso × (1 + reps/30); barra/smith → roundToNearest25, else Math.round
  it.each([
    [100, 8, 'barra', 127.5],   // 126.67 → 127.5
    [100, 1, 'barra', 102.5],   // 103.33 → 102.5
    [100, 0, 'barra', 100],     // 0 reps → peso (1RM)
    [60, 10, 'maquina', 80],    // 80.0
    [62.5, 5, 'mancuerna', 73], // 72.92 → 73
    [80, 8, 'smith', 102.5],    // 80*1.2667=101.33 → roundToNearest25 → 102.5
  ])('%fkg × %f reps (%s) → %f', (w, r, eq, expected) => {
    expect(estimateEpley1RM(w, r, eq)).toBe(expected);
  });
});
