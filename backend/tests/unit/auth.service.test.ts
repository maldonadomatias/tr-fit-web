import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send },
    })),
    __mockSend: send,
  };
});

const { hashPassword, comparePassword } = await import(
  '../../src/services/auth.service.js'
);

describe('hashPassword / comparePassword', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('hunter2!');
    expect(hash).not.toBe('hunter2!');
    expect(await comparePassword('hunter2!', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('hunter2!');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });

  it('different calls produce different hashes (salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});
