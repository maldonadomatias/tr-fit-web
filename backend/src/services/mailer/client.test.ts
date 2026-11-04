import { describe, expect, it, jest } from '@jest/globals';
import { createMailClient, MailerError, type FetchInit } from './client.js';

const env = { MAILER_URL: 'http://mailer:3000', MAILER_API_KEY: 'mk_trfit' };
const mail = {
  to: 'juan.perez@example.com',
  subject: 'Hola',
  html: '<p>Hola</p>',
  text: 'Hola',
};

type FetchFn = (url: string, init: FetchInit) => Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function networkError(code = 'ECONNREFUSED'): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

function harness(...results: Array<Response | Error>) {
  const queue = [...results];
  const fetch = jest.fn<FetchFn>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no queued response');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const client = createMailClient({
    env,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { fetch, sleeps, client };
}

const sent = () => json(200, { messageId: '<m1@ses>' });

describe('createMailClient', () => {
  it('does not validate config until the first send', async () => {
    const fetch = jest.fn<FetchFn>();
    const client = createMailClient({ env: {}, fetch });

    await expect(client.sendMail(mail)).rejects.toThrow(
      'Invalid mail config: MAILER_URL, MAILER_API_KEY'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the mail with the api key and returns the messageId', async () => {
    const { fetch, client } = harness(sent());

    await expect(client.sendMail(mail)).resolves.toEqual({
      messageId: '<m1@ses>',
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://mailer:3000/v1/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(mail);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer mk_trfit');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('retries a network error and a 503 with the same Idempotency-Key', async () => {
    const { fetch, sleeps, client } = harness(
      networkError(),
      json(503, { error: 'unavailable' }),
      sent()
    );

    await expect(client.sendMail(mail)).resolves.toEqual({
      messageId: '<m1@ses>',
    });
    expect(sleeps).toEqual([1000, 2000]);
    const keys = fetch.mock.calls.map(([, init]) =>
      new Headers(init.headers).get('idempotency-key')
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('uses a new Idempotency-Key for each sendMail call', async () => {
    const { fetch, client } = harness(sent(), sent());

    await client.sendMail(mail);
    await client.sendMail(mail);

    const keys = fetch.mock.calls.map(([, init]) =>
      new Headers(init.headers).get('idempotency-key')
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('retries a timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), {
      name: 'TimeoutError',
    });
    const { client } = harness(timeout, sent());

    await expect(client.sendMail(mail)).resolves.toEqual({
      messageId: '<m1@ses>',
    });
  });

  it('gives up after 4 attempts with MAILER_UNAVAILABLE', async () => {
    const { fetch, sleeps, client } = harness(
      networkError(),
      networkError(),
      networkError(),
      networkError(),
      sent()
    );

    await expect(client.sendMail(mail)).rejects.toMatchObject({
      name: 'MailerError',
      code: 'MAILER_UNAVAILABLE',
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('rethrows an SES error with code, responseCode and response, without retrying', async () => {
    const { fetch, client } = harness(
      json(502, {
        error: 'ses_error',
        code: 'EMESSAGE',
        responseCode: 554,
        response: '554 identities failed the check: j***@example.com',
      })
    );

    const err = (await client.sendMail(mail).catch((e) => e)) as MailerError;

    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({
      status: 502,
      code: 'EMESSAGE',
      responseCode: 554,
      response: '554 identities failed the check: j***@example.com',
    });
    expect(err.message).toContain('554 identities failed the check');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [429, 'RATE_LIMITED'],
    [500, 'MAILER_HTTP_500'],
  ])('does not retry a %s and throws %s', async (status, code) => {
    const { fetch, client } = harness(json(status, { error: 'x' }));

    await expect(client.sendMail(mail)).rejects.toMatchObject({
      status,
      code,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never puts the api key in the error', async () => {
    const { client } = harness(json(401, { error: 'unauthorized' }));

    const err = (await client.sendMail(mail).catch((e) => e)) as Error;

    expect(
      JSON.stringify({ ...err, message: err.message, stack: err.stack })
    ).not.toContain('mk_trfit');
  });
});
