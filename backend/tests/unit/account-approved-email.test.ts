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
  (opts: {
    to: string;
    subject: string;
    html: string;
    from: string;
  }) => Promise<{ id: string }>
>;

const resendMod = (await import('resend')) as unknown as {
  __mockSend: MockSend;
};
const { sendAccountApprovedEmail } =
  await import('../../src/services/email.service.js');
const { accountApprovedTemplate } =
  await import('../../src/services/email-templates.js');

beforeEach(() => resendMod.__mockSend.mockReset());

it('accountApprovedTemplate greets the athlete and says the account is ready', () => {
  const html = accountApprovedTemplate({ name: 'Mati' });
  expect(html).toContain('Mati');
  expect(html).toMatch(/cuenta/i);
  expect(html).toMatch(/activ|lista/i);
});

it('sendAccountApprovedEmail sends to the user with an approval subject', async () => {
  resendMod.__mockSend.mockResolvedValue({ id: 'msg_ok' });
  await sendAccountApprovedEmail({ email: 'user@test.local', name: 'Mati' });
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const call = resendMod.__mockSend.mock.calls[0]?.[0] as unknown as {
    to: string;
    subject: string;
    html: string;
  };
  expect(call.to).toBe('user@test.local');
  expect(call.subject).toMatch(/cuenta/i);
  expect(call.html).toContain('Mati');
});

it('sendAccountApprovedEmail rejects when Resend fails', async () => {
  resendMod.__mockSend.mockResolvedValue({
    data: null,
    error: { message: 'resend down' },
  } as never);
  await expect(
    sendAccountApprovedEmail({ email: 'x@y.z', name: 'Mati' })
  ).rejects.toThrow('resend down');
});
