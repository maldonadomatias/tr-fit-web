import { describe, it, expect } from 'vitest';
import { isAuthEndpoint, shouldHandleAuthExpiry } from './api';

describe('isAuthEndpoint', () => {
  it('flags auth endpoints', () => {
    expect(isAuthEndpoint('/auth/login')).toBe(true);
    expect(isAuthEndpoint('/auth/refresh')).toBe(true);
    expect(isAuthEndpoint('/auth/logout')).toBe(true);
  });

  it('does not flag normal endpoints', () => {
    expect(isAuthEndpoint('/platform-fee')).toBe(false);
    expect(isAuthEndpoint('/admin/users')).toBe(false);
    expect(isAuthEndpoint(undefined)).toBe(false);
  });
});

describe('shouldHandleAuthExpiry', () => {
  it('handles a 401 on a normal request (expired session)', () => {
    expect(shouldHandleAuthExpiry(401, '/platform-fee', false)).toBe(true);
  });

  it('does NOT treat a bad-login 401 as an expired session', () => {
    // Wrong credentials must surface a form error, not trigger the
    // refresh-and-redirect flow that full-page-reloads the login screen.
    expect(shouldHandleAuthExpiry(401, '/auth/login', false)).toBe(false);
  });

  it('does not loop on the refresh endpoint itself', () => {
    expect(shouldHandleAuthExpiry(401, '/auth/refresh', false)).toBe(false);
  });

  it('ignores non-401 statuses', () => {
    expect(shouldHandleAuthExpiry(403, '/platform-fee', false)).toBe(false);
    expect(shouldHandleAuthExpiry(500, '/platform-fee', false)).toBe(false);
    expect(shouldHandleAuthExpiry(undefined, '/platform-fee', false)).toBe(false);
  });

  it('does not retry a request already retried once', () => {
    expect(shouldHandleAuthExpiry(401, '/platform-fee', true)).toBe(false);
  });
});
