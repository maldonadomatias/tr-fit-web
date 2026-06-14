import dotenv from 'dotenv';
import pg from 'pg';
import logger from '../utils/logger.js';

// Load environment variables if not already loaded
if (!process.env.DATABASE_URL) {
  dotenv.config();
}

// SAFETY GUARD: a test process must never connect to a non-test database.
// Jest sets JEST_WORKER_ID in every worker. If we are under jest and the
// resolved DATABASE_URL does not point at a *test* database, refuse loudly —
// integration tests TRUNCATE tables, and a misresolved URL (e.g. dotenv falling
// back to the dev DB) once wiped real user data. The test DB name must contain
// "test" (e.g. trfit_test).
if (process.env.JEST_WORKER_ID !== undefined) {
  const url = process.env.DATABASE_URL ?? '';
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!/test/i.test(dbName)) {
    throw new Error(
      `db/connect.ts: refusing to run tests against non-test database "${dbName}". ` +
        `Point TEST_DATABASE_URL / DATABASE_URL at a *test* database before running jest.`,
    );
  }
}

const { Pool } = pg;

function resolveSsl(): false | { rejectUnauthorized: boolean } {
  const explicit = process.env.DB_SSL;
  if (explicit === 'false' || explicit === '0' || explicit === 'disable') {
    return false;
  }
  if (explicit === 'true' || explicit === '1') {
    return { rejectUnauthorized: false };
  }
  // Default: SSL only in production unless DATABASE_URL targets a docker-
  // internal hostname (postgres / db) which never supports SSL.
  if (process.env.NODE_ENV !== 'production') return false;
  const url = process.env.DATABASE_URL ?? '';
  if (/@(postgres|db|localhost|127\.0\.0\.1)[:/]/i.test(url)) return false;
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSsl(),
});

pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Database connection error');
});

export default pool;
