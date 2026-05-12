import { measurementPayload } from '../../src/domain/schemas.js';

describe('measurementPayload body_weight_kg', () => {
  it('accepts valid body_weight_kg', () => {
    expect(measurementPayload.safeParse({ body_weight_kg: 75 }).success).toBe(true);
  });
  it('rejects below 30', () => {
    expect(measurementPayload.safeParse({ body_weight_kg: 20 }).success).toBe(false);
  });
  it('rejects above 300', () => {
    expect(measurementPayload.safeParse({ body_weight_kg: 350 }).success).toBe(false);
  });
  it('optional (omitted is fine)', () => {
    expect(measurementPayload.safeParse({ chest_cm: 100 }).success).toBe(true);
  });
});
