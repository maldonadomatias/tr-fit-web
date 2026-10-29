import { describe, it, expect } from 'vitest';
import { fmtShortDate } from './format';

describe('fmtShortDate', () => {
  it('keeps the calendar day of date-only strings', () => {
    expect(fmtShortDate('2026-10-01')).toMatch(/^1 /);
  });
});
