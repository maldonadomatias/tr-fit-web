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

type MockSend = jest.Mock<
  (opts: { to: string; subject: string; html: string; from: string }) => Promise<{ id: string }>
>;

const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };
const { sendVerifyEmail, sendPasswordResetEmail } = await import(
  '../../src/services/email.service.js'
);

beforeEach(() => resendMod.__mockSend.mockReset());

it('sendVerifyEmail calls Resend with verify link', async () => {
  resendMod.__mockSend.mockResolvedValue({ id: 'msg_1' });
  await sendVerifyEmail('user@test.local', 'token-abc');
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const call = resendMod.__mockSend.mock.calls[0]?.[0] as unknown as {
    to: string; subject: string; html: string;
  };
  expect(call.to).toBe('user@test.local');
  expect(call.subject).toMatch(/verific/i);
  expect(call.html).toContain('token-abc');
  expect(call.html).toMatch(/verify-email\?token=token-abc/);
});

it('sendPasswordResetEmail calls Resend with reset link', async () => {
  resendMod.__mockSend.mockResolvedValue({ id: 'msg_2' });
  await sendPasswordResetEmail('user@test.local', 'reset-xyz');
  const call = resendMod.__mockSend.mock.calls[0]?.[0] as unknown as {
    to: string; subject: string; html: string;
  };
  expect(call.subject).toMatch(/restablecer|reset/i);
  expect(call.html).toMatch(/reset-password\?token=reset-xyz/);
});

it('propagates Resend errors', async () => {
  resendMod.__mockSend.mockRejectedValue(new Error('resend down'));
  await expect(sendVerifyEmail('x@y.z', 't')).rejects.toThrow('resend down');
});
