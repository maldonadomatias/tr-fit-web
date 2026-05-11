import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default('15m'),
  OPENAI_API_KEY: z.string().min(8),
  OPENAI_MODEL: z.string().default('gpt-4o-2024-08-06'),
  CRON_TZ: z.string().default('America/Argentina/Buenos_Aires'),
  PROGRESSION_CRON_SCHEDULE: z.string().default('0 23 * * 0'),
  COMPLIANCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  RESEND_API_KEY: z.string().min(8),
  EMAIL_FROM: z.string().email().default('onboarding@resend.dev'),
  APP_URL: z.string().url().default('http://localhost:5001'),
  APP_DEEP_LINK_SCHEME: z.string().default('trfit'),
  FIREBASE_SERVICE_ACCOUNT_JSON: z
    .string()
    .optional()
    .default('{"type":"service_account","project_id":"test","private_key":"-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n","client_email":"test@test.iam.gserviceaccount.com"}'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
