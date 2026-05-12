import {
  generateToken,
  hashToken,
  isExpired,
  TOKEN_LENGTH_BYTES,
} from '../../src/services/verification.service.js';

describe('generateToken', () => {
  it('returns hex string of expected length (2 * bytes)', () => {
    const t = generateToken();
    expect(t).toMatch(/^[a-f0-9]+$/);
    expect(t).toHaveLength(TOKEN_LENGTH_BYTES * 2);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('is deterministic for same input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces different output for different input', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('output is 64 hex chars (SHA-256)', () => {
    expect(hashToken('anything')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('isExpired', () => {
  it('returns true for past timestamp', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(past)).toBe(true);
  });

  it('returns false for future timestamp', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it('accepts Date objects too', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
  });
});
