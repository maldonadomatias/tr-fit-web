import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/services/mailer/index.js', () => {
  const send = jest.fn();
  return { sendMail: send, __mockSend: send };
});

type MockSend = jest.Mock<
  (opts: {
    to: string;
    subject: string;
    html: string;
  }) => Promise<{ messageId: string }>
>;

const mailMod = (await import('../../src/services/mailer/index.js')) as unknown as {
  __mockSend: MockSend;
};
const { sendAccountApprovedEmail } =
  await import('../../src/services/email.service.js');
const { accountApprovedTemplate } =
  await import('../../src/services/email-templates.js');

beforeEach(() => mailMod.__mockSend.mockReset());

it('accountApprovedTemplate greets the athlete and says the account is ready', () => {
  const html = accountApprovedTemplate({ name: 'Mati' });
  expect(html).toContain('Mati');
  expect(html).toMatch(/cuenta/i);
  expect(html).toMatch(/activ|lista/i);
});

it('sendAccountApprovedEmail sends to the user with an approval subject', async () => {
  mailMod.__mockSend.mockResolvedValue({ messageId: 'msg_ok' });
  await sendAccountApprovedEmail({ email: 'user@test.local', name: 'Mati' });
  expect(mailMod.__mockSend).toHaveBeenCalledTimes(1);
  const call = mailMod.__mockSend.mock.calls[0]?.[0] as unknown as {
    to: string;
    subject: string;
    html: string;
  };
  expect(call.to).toBe('user@test.local');
  expect(call.subject).toMatch(/cuenta/i);
  expect(call.html).toContain('Mati');
});

it('sendAccountApprovedEmail rejects when SMTP fails', async () => {
  mailMod.__mockSend.mockRejectedValue(
    Object.assign(new Error('smtp down'), { responseCode: 554 }) as never
  );
  await expect(
    sendAccountApprovedEmail({ email: 'x@y.z', name: 'Mati' })
  ).rejects.toThrow('smtp down');
});
