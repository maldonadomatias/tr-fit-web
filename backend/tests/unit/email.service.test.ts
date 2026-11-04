import { jest } from '@jest/globals';

type SendArgs = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};
const sendMail = jest.fn<(opts: SendArgs) => Promise<{ messageId: string }>>();
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport },
}));

const { sendVerifyEmail, sendPasswordResetEmail } = await import(
  '../../src/services/email.service.js'
);

const savedEnv = { ...process.env };

beforeEach(() => {
  sendMail.mockReset();
  process.env = { ...savedEnv };
});
afterAll(() => {
  process.env = savedEnv;
});

function lastCall(): SendArgs {
  return sendMail.mock.calls.at(-1)![0];
}

it('sendVerifyEmail sends the verify link from MAIL_FROM in html and text', async () => {
  sendMail.mockResolvedValue({ messageId: 'msg_1' });
  await sendVerifyEmail('user@test.local', 'token-abc');

  expect(sendMail).toHaveBeenCalledTimes(1);
  const call = lastCall();
  expect(call.from).toBe(process.env.MAIL_FROM);
  expect(call.to).toBe('user@test.local');
  expect(call.subject).toMatch(/verific/i);
  expect(call.html).toMatch(/verify-email\?token=token-abc/);
  expect(call.text).toMatch(/verify-email\?token=token-abc/);
  expect(call.text).not.toMatch(/<[a-z]/i);
});

it('sendPasswordResetEmail sends the 6-digit code in html and text', async () => {
  sendMail.mockResolvedValue({ messageId: 'msg_2' });
  await sendPasswordResetEmail('user@test.local', '123456');

  const call = lastCall();
  expect(call.subject).toMatch(/código|code/i);
  expect(call.html).toContain('123456');
  expect(call.text).toContain('123456');
  expect(call.html).not.toMatch(/reset-password\?token=/);
});

it('propagates permanent SMTP errors', async () => {
  sendMail.mockRejectedValue(
    Object.assign(new Error('Message rejected'), { responseCode: 554 })
  );
  await expect(sendVerifyEmail('x@y.z', 't')).rejects.toThrow('Message rejected');
});

it('fails the send, not the import, when SMTP is missing in production', async () => {
  jest.resetModules();
  process.env.NODE_ENV = 'production';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const fresh = await import('../../src/services/email.service.js');
  createTransport.mockClear();

  await expect(fresh.sendVerifyEmail('x@y.z', 't')).rejects.toThrow(
    /Invalid mail config:[\s\S]*SMTP_HOST/
  );
  expect(createTransport).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});
