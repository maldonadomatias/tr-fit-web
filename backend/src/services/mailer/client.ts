import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadClientConfig, type ClientConfig } from './config.js';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface MailResult {
  messageId: string;
}

/**
 * Thrown for every failed send. `code`, `responseCode` and `response` mirror
 * nodemailer's SMTP error fields; the service already masked the addresses.
 */
export class MailerError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly responseCode?: number;
  readonly response?: string;

  constructor(
    fields: {
      status?: number;
      code: string;
      responseCode?: number;
      response?: string;
    },
    options?: { cause?: unknown }
  ) {
    const detail = [fields.status, fields.code, fields.response]
      .filter((v) => v !== undefined)
      .join(' ');
    super(`Mail send failed: ${detail}`, options);
    this.name = 'MailerError';
    this.status = fields.status;
    this.code = fields.code;
    this.responseCode = fields.responseCode;
    this.response = fields.response;
  }
}

export type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

export interface MailClientDeps {
  env?: Record<string, string | undefined>;
  fetch?: (url: string, init: FetchInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
}

export const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;
// The service may retry SES three times before answering.
const TIMEOUT_MS = 60_000;

const STATUS_CODES: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function errorFor(status: number, body: Record<string, unknown>): MailerError {
  const fromService = typeof body.code === 'string' ? body.code : undefined;
  return new MailerError({
    status,
    code:
      fromService ??
      (status === 502 ? 'SES_ERROR' : undefined) ??
      STATUS_CODES[status] ??
      `MAILER_HTTP_${status}`,
    ...(typeof body.responseCode === 'number'
      ? { responseCode: body.responseCode }
      : {}),
    ...(typeof body.response === 'string' ? { response: body.response } : {}),
  });
}

export function createMailClient(deps: MailClientDeps = {}) {
  const fetchFn = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? delay;
  let config: ClientConfig | undefined;

  return {
    async sendMail(input: MailInput): Promise<MailResult> {
      // Validated on first use: a missing env fails each send, not the boot.
      config ??= loadClientConfig(deps.env ?? process.env);
      // Same key on every retry: the service sends once per key.
      const idempotencyKey = randomUUID();
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 2));
        }

        let res: Response;
        try {
          res = await fetchFn(`${config.url}/v1/send`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              'content-type': 'application/json',
              'idempotency-key': idempotencyKey,
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (err) {
          lastError = err; // network error or timeout: retry
          continue;
        }

        const body = await readJson(res);
        if (res.ok && typeof body.messageId === 'string') {
          return { messageId: body.messageId };
        }
        if (res.status === 503) {
          lastError = errorFor(503, body);
          continue;
        }
        throw errorFor(res.status, body);
      }

      throw new MailerError(
        { code: 'MAILER_UNAVAILABLE' },
        { cause: lastError }
      );
    },
  };
}
