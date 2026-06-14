import { amrapPayload } from '../../src/domain/schemas.js';

describe('amrapPayload', () => {
  it('accepts valid input', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 8 }).success).toBe(true);
  });
  it('rejects reps < 1', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 0 }).success).toBe(false);
  });
  it('rejects weight_used < 1', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 0, reps: 5 }).success).toBe(false);
  });
  it('rejects non-integer reps', () => {
    expect(amrapPayload.safeParse({ exercise_id: 7, weight_used: 100, reps: 8.5 }).success).toBe(false);
  });
});
