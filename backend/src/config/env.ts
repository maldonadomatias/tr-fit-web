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
  MP_ACCESS_TOKEN: z.string().min(1),
  MP_WEBHOOK_SECRET: z.string().min(1),
  MP_PLAN_ID_BASICO: z.string().min(1),
  MP_PLAN_ID_FULL: z.string().min(1),
  MP_PLAN_ID_PREMIUM: z.string().min(1),
  MP_BACK_URL: z.string().default('trfit://upgrade/success'),
  MP_NOTIFICATION_URL: z.string().default('http://localhost:5001/webhooks/mp'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
