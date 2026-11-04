import { setTimeout as delay } from 'node:timers/promises';
import nodemailer from 'nodemailer';
import type {
  JSONTransportOptions,
  SMTPTransportOptions,
  Transporter,
} from 'nodemailer';
import type { Logger } from 'pino';
import type { MailConfig } from './config.js';
import logger from '../../utils/logger.js';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface MailResult {
  messageId: string;
}

export type MailTransport = Pick<Transporter, 'sendMail'>;

export interface MailerDeps {
  transport?: MailTransport;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  sleep?: (ms: number) => Promise<void>;
}

export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 500;

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ESOCKET',
  'ECONNRESET',
  'EDNS',
  'ECONNREFUSED',
]);

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
}

export function isTransientError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }

  const candidate = err as { responseCode?: unknown; code?: unknown };
  if (typeof candidate.responseCode === 'number') {
    return candidate.responseCode >= 400 && candidate.responseCode < 500;
  }

  return (
    typeof candidate.code === 'string' && TRANSIENT_CODES.has(candidate.code)
  );
}

export function buildTransportOptions(
  config: MailConfig
): SMTPTransportOptions | JSONTransportOptions {
  if (config.mode === 'log') {
    return { jsonTransport: true };
  }

  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

// SES puts the rejected address in the response text (e.g. 554 "identities
// failed the check ... user@x.com"), so mask every address before logging.
function maskEmailsIn(text: string): string {
  return text.replace(/[^\s<>"',;:]+@[^\s<>"',;]+/g, maskEmail);
}

// Callers log the rethrown error as `err`, so mask it in place too.
function maskErrorInPlace(err: unknown): void {
  if (typeof err !== 'object' || err === null) {
    return;
  }
  const fields = err as Record<string, unknown>;
  for (const key of ['message', 'response', 'stack']) {
    if (typeof fields[key] === 'string') {
      fields[key] = maskEmailsIn(fields[key]);
    }
  }
}

function smtpFields(err: unknown): {
  code?: string;
  responseCode?: number;
  response?: string;
} {
  if (typeof err !== 'object' || err === null) {
    return {};
  }

  const candidate = err as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
  };
  return {
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
    ...(typeof candidate.responseCode === 'number'
      ? { responseCode: candidate.responseCode }
      : {}),
    ...(typeof candidate.response === 'string'
      ? { response: maskEmailsIn(candidate.response) }
      : {}),
  };
}

export function createMailer(config: MailConfig, deps: MailerDeps = {}) {
  const transport =
    deps.transport ?? nodemailer.createTransport(buildTransportOptions(config));
  const log = deps.logger ?? logger.child({ module: 'mailer' });
  const sleep = deps.sleep ?? delay;

  return {
    async sendMail(input: MailInput): Promise<MailResult> {
      const masked = maskEmail(input.to);
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const info = await transport.sendMail({
            from: config.from,
            to: input.to,
            subject: input.subject,
            html: input.html,
            text: input.text,
            ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
            ...(input.attachments === undefined
              ? {}
              : { attachments: input.attachments }),
          });

          log.info(
            {
              messageId: info.messageId,
              to: masked,
              subject: input.subject,
              attempt,
              mode: config.mode,
            },
            'mail sent'
          );

          return { messageId: info.messageId };
        } catch (err) {
          maskErrorInPlace(err);
          lastError = err;
          const fields = smtpFields(err);
          const retry = isTransientError(err) && attempt < MAX_ATTEMPTS;
          if (!retry) {
            log.error({ to: masked, attempt, ...fields }, 'mail send failed');
            throw err;
          }

          log.warn(
            { to: masked, attempt, ...fields },
            'mail send failed, retrying'
          );
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }

      throw lastError;
    },
  };
}
