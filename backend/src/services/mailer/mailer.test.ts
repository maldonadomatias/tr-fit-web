import { describe, expect, it, jest } from '@jest/globals';
import type { MailConfig } from './config.js';
import {
  buildTransportOptions,
  createMailer,
  maskEmail,
  type MailInput,
  type MailTransport,
} from './mailer.js';

const smtpConfig: MailConfig = {
  mode: 'smtp',
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  user: 'U',
  pass: 'P',
  from: 'App <no-reply@example.com>',
};

const input: MailInput = {
  to: 'juan.perez@example.com',
  subject: 'Hola',
  html: '<p>Hola</p>',
  text: 'Hola',
};

const ok = { messageId: '<abc@ses>' };

function smtpError(responseCode?: number, code?: string): Error {
  return Object.assign(new Error('smtp failure'), {
    ...(responseCode === undefined ? {} : { responseCode }),
    ...(code === undefined ? {} : { code }),
  });
}

function fakeTransport(...results: Array<{ messageId: string } | Error>) {
  const queue = [...results];
  const sendMail = jest.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error('fake transport has no queued result');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  return { sendMail };
}

function fakeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function loggedText(logger: ReturnType<typeof fakeLogger>): string {
  return JSON.stringify([
    logger.info.mock.calls,
    logger.warn.mock.calls,
    logger.error.mock.calls,
  ]);
}

function harness(results: Array<{ messageId: string } | Error>) {
  const transport = fakeTransport(...results);
  const logger = fakeLogger();
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const mailer = createMailer(smtpConfig, {
    transport: transport as unknown as MailTransport,
    logger,
    sleep,
  });
  return { transport, logger, sleeps, mailer };
}

describe('createMailer', () => {
  it('returns the messageId from the transport', async () => {
    const { transport, mailer } = harness([ok]);

    await expect(mailer.sendMail(input)).resolves.toEqual(ok);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: smtpConfig.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  });

  it('passes attachments through to the transport', async () => {
    const { transport, mailer } = harness([ok]);
    const attachments = [
      {
        filename: 'turno.ics',
        content: 'BEGIN:VCALENDAR',
        contentType: 'text/calendar',
      },
    ];

    await mailer.sendMail({ ...input, attachments });

    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments })
    );
  });

  it('retries a transient 4xx error and succeeds on the second attempt', async () => {
    const { transport, sleeps, mailer } = harness([smtpError(421), ok]);

    await expect(mailer.sendMail(input)).resolves.toEqual(ok);
    expect(transport.sendMail).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([500]);
  });

  it('retries SES throttling (454)', async () => {
    const { transport, sleeps, mailer } = harness([
      smtpError(454),
      smtpError(454),
      ok,
    ]);

    await expect(mailer.sendMail(input)).resolves.toEqual(ok);
    expect(transport.sendMail).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('retries timeouts without an SMTP response code', async () => {
    const { mailer } = harness([smtpError(undefined, 'ETIMEDOUT'), ok]);

    await expect(mailer.sendMail(input)).resolves.toEqual(ok);
  });

  it('does not retry a permanent 5xx error', async () => {
    const err = smtpError(554);
    const { transport, sleeps, mailer } = harness([err]);

    await expect(mailer.sendMail(input)).rejects.toBe(err);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('does not retry an invalid recipient', async () => {
    const { transport, mailer } = harness([smtpError(undefined, 'EENVELOPE')]);

    await expect(mailer.sendMail(input)).rejects.toBeTruthy();
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('fails after 3 attempts on repeated transient errors', async () => {
    const errors = [
      smtpError(421),
      smtpError(421),
      smtpError(421),
      smtpError(421),
    ];
    const { transport, mailer } = harness(errors);

    await expect(mailer.sendMail(input)).rejects.toBe(errors[2]);
    expect(transport.sendMail).toHaveBeenCalledTimes(3);
  });

  it('logs the masked recipient, messageId and attempt but never the body', async () => {
    const { logger, mailer } = harness([ok]);

    await mailer.sendMail({
      to: 'juan.perez@example.com',
      subject: 'Reset',
      html: '<a href="https://app.test/reset?token=SECRET123">x</a>',
      text: 'token=SECRET123',
    });

    const logged = loggedText(logger);
    expect(logged).toContain('j***@example.com');
    expect(logged).toContain('<abc@ses>');
    expect(logged).toContain('"attempt":1');
    expect(logged).not.toContain('SECRET123');
    expect(logged).not.toContain('juan.perez@example.com');
  });

  it('logs the SMTP code and response text with any address in it masked', async () => {
    const err = Object.assign(smtpError(554), {
      code: 'EMESSAGE',
      response:
        '554 Message rejected: Email address is not verified. The following identities failed the check in region US-EAST-1: juan.perez@example.com',
    });
    const { logger, mailer } = harness([err]);

    await expect(mailer.sendMail(input)).rejects.toBe(err);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EMESSAGE',
        responseCode: 554,
        response: expect.stringContaining('Email address is not verified'),
      }),
      'mail send failed'
    );
    const logged = loggedText(logger);
    expect(logged).toContain('j***@example.com');
    expect(logged).not.toContain('juan.perez@example.com');
  });

  it('log mode sends through jsonTransport without network', async () => {
    const logger = fakeLogger();
    const mailer = createMailer(
      { mode: 'log', from: smtpConfig.from },
      { logger }
    );

    const result = await mailer.sendMail({
      to: 'juan.perez@example.com',
      subject: 'Reset',
      html: '<p>token=SECRET123</p>',
      text: 'token=SECRET123',
    });

    expect(result.messageId.length).toBeGreaterThan(0);
    expect(loggedText(logger)).not.toContain('SECRET123');
  });
});

describe('buildTransportOptions', () => {
  it('uses STARTTLS on port 587 and implicit TLS on port 465', () => {
    expect(buildTransportOptions(smtpConfig)).toEqual({
      host: smtpConfig.host,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'U', pass: 'P' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    expect(buildTransportOptions({ ...smtpConfig, port: 465 })).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
    });
  });

  it('uses jsonTransport in log mode', () => {
    expect(
      buildTransportOptions({ mode: 'log', from: smtpConfig.from })
    ).toEqual({
      jsonTransport: true,
    });
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('juan.perez@example.com')).toBe('j***@example.com');
  });

  it('masks input without an @', () => {
    expect(maskEmail('nope')).toBe('***');
  });
});
