process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-change-me';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/trfit_test';
