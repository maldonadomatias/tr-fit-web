import { jest } from '@jest/globals';

// The real mail client runs; only the HTTP call to the mail service is faked.
type FetchInit = { headers: Record<string, string>; body: string };
const fetchMock = jest.fn<(url: string, init: FetchInit) => Promise<Response>>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const savedEnv = { ...process.env };
process.env.MAILER_URL = 'http://mailer:3000';
process.env.MAILER_API_KEY = 'mk_test';

const { sendVerifyEmail, sendPasswordResetEmail } = await import(
  '../../src/services/email.service.js'
);

function ok(): Response {
  return new Response(JSON.stringify({ messageId: 'msg_1' }), { status: 200 });
}

function lastBody(): Record<string, string> {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
}

beforeEach(() => {
  fetchMock.mockReset();
});
afterAll(() => {
  process.env = savedEnv;
});

it('sendVerifyEmail posts the verify link in html and text to the mail service', async () => {
  fetchMock.mockResolvedValue(ok());
  await sendVerifyEmail('user@test.local', 'token-abc');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://mailer:3000/v1/send');
  expect(init.headers.authorization).toBe('Bearer mk_test');
  const body = lastBody();
  expect(body).not.toHaveProperty('from');
  expect(body.to).toBe('user@test.local');
  expect(body.subject).toMatch(/verific/i);
  expect(body.html).toMatch(/verify-email\?token=token-abc/);
  expect(body.text).toMatch(/verify-email\?token=token-abc/);
  expect(body.text).not.toMatch(/<[a-z]/i);
});

it('sendPasswordResetEmail sends the 6-digit code in html and text', async () => {
  fetchMock.mockResolvedValue(ok());
  await sendPasswordResetEmail('user@test.local', '123456');

  const body = lastBody();
  expect(body.subject).toMatch(/código|code/i);
  expect(body.html).toContain('123456');
  expect(body.text).toContain('123456');
  expect(body.html).not.toMatch(/reset-password\?token=/);
});

it('propagates SES rejections with the SMTP fields', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 'EMESSAGE',
        responseCode: 554,
        response: '554 Message rejected: u***@test.local',
      }),
      { status: 502 }
    )
  );
  await expect(sendVerifyEmail('x@y.z', 't')).rejects.toMatchObject({
    name: 'MailerError',
    status: 502,
    code: 'EMESSAGE',
    responseCode: 554,
  });
});

it('fails the send, not the import, when the mail service is not configured', async () => {
  jest.resetModules();
  delete process.env.MAILER_URL;
  delete process.env.MAILER_API_KEY;
  const fresh = await import('../../src/services/email.service.js');

  await expect(fresh.sendVerifyEmail('x@y.z', 't')).rejects.toThrow(
    'Invalid mail config: MAILER_URL, MAILER_API_KEY'
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
