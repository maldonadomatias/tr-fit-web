import { z } from 'zod';

export type MailConfig =
  | {
      mode: 'smtp';
      from: string;
      host: string;
      port: number;
      user: string;
      pass: string;
    }
  | { mode: 'log'; from: string };

const optionalText = z.string().min(1).optional();

const mailEnvSchema = z
  .object({
    NODE_ENV: optionalText,
    SMTP_HOST: optionalText,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optionalText,
    SMTP_PASS: optionalText,
    MAIL_FROM: optionalText,
  })
  .superRefine((data, ctx) => {
    if (!data.MAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message: 'MAIL_FROM is required',
      });
    }

    const smtpRequired =
      data.NODE_ENV === 'production' ||
      data.SMTP_HOST !== undefined ||
      data.SMTP_USER !== undefined ||
      data.SMTP_PASS !== undefined;

    if (!smtpRequired) {
      return;
    }

    if (!data.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required',
      });
    }
    if (!data.SMTP_USER) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'SMTP_USER is required',
      });
    }
    if (!data.SMTP_PASS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PASS'],
        message: 'SMTP_PASS is required',
      });
    }
  });

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

function normalizeEnv(env: Record<string, string | undefined>) {
  return {
    NODE_ENV: blankToUndefined(env.NODE_ENV),
    SMTP_HOST: blankToUndefined(env.SMTP_HOST),
    SMTP_PORT: blankToUndefined(env.SMTP_PORT),
    SMTP_USER: blankToUndefined(env.SMTP_USER),
    SMTP_PASS: blankToUndefined(env.SMTP_PASS),
    MAIL_FROM: blankToUndefined(env.MAIL_FROM),
  };
}

function issueNames(error: z.ZodError): string {
  const names: string[] = [];
  for (const issue of error.issues) {
    const name = issue.path[0];
    if (typeof name !== 'string' || names.includes(name)) {
      continue;
    }
    names.push(name);
  }
  return names.join(', ');
}

export function loadMailConfig(
  env: Record<string, string | undefined> = process.env
): MailConfig {
  const parsed = mailEnvSchema.safeParse(normalizeEnv(env));
  if (!parsed.success) {
    throw new Error(`Invalid mail config: ${issueNames(parsed.error)}`);
  }

  const { MAIL_FROM, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, NODE_ENV } =
    parsed.data;

  if (
    NODE_ENV !== 'production' &&
    SMTP_HOST === undefined &&
    SMTP_USER === undefined &&
    SMTP_PASS === undefined
  ) {
    return { mode: 'log', from: MAIL_FROM! };
  }

  return {
    mode: 'smtp',
    from: MAIL_FROM!,
    host: SMTP_HOST!,
    port: SMTP_PORT,
    user: SMTP_USER!,
    pass: SMTP_PASS!,
  };
}
