import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  setUser,
  getUser,
  clearAuth,
} from './auth-storage';

beforeEach(() => localStorage.clear());

describe('auth-storage', () => {
  it('round-trips tokens', () => {
    setTokens('a', 'b');
    expect(getAccessToken()).toBe('a');
    expect(getRefreshToken()).toBe('b');
  });

  it('round-trips user', () => {
    setUser({ id: 'x', email: 'e', role: 'coach' });
    expect(getUser()).toEqual({ id: 'x', email: 'e', role: 'coach' });
  });

  it('clearAuth wipes everything', () => {
    setTokens('a', 'b');
    setUser({ id: 'x', email: 'e', role: 'coach' });
    clearAuth();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it('getUser returns null on malformed JSON', () => {
    localStorage.setItem('auth_user', '{not json');
    expect(getUser()).toBeNull();
  });
});
