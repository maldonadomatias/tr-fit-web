import dotenv from 'dotenv';
import pg from 'pg';
import logger from '../utils/logger.js';

// Load environment variables if not already loaded
if (!process.env.DATABASE_URL) {
  dotenv.config();
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
