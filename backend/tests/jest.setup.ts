process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-change-me';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.MP_ACCESS_TOKEN = 'test-mp-access-token';
process.env.MP_WEBHOOK_SECRET = 'test-webhook-secret-32-chars-padded';
process.env.MP_PLAN_ID_BASICO = 'test-plan-basico';
process.env.MP_PLAN_ID_FULL = 'test-plan-full';
process.env.MP_PLAN_ID_PREMIUM = 'test-plan-premium';
process.env.MP_BACK_URL = 'trfit://upgrade/success';
process.env.MP_NOTIFICATION_URL = 'http://localhost:5001/webhooks/mp';
