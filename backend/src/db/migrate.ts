import dotenv from 'dotenv';

// Load environment variables FIRST, before importing anything that uses them
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

// The app connects as a role without CREATE on the schema; migrations need the
// owner. MIGRATION_DATABASE_URL carries it so only this process gets it.
// Swapped before connect.js loads, since it reads DATABASE_URL on import.
if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}
const { default: pool } = await import('./connect.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, 'migrations');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One migrator at a time: a second container booting waits here, then
    // sees everything already applied.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trfit:migrate'))");

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get executed migrations
    const executed = await client.query('SELECT name FROM migrations');
    const executedNames = new Set(executed.rows.map((r) => r.name));

    // Get migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (executedNames.has(file)) {
        logger.info(`Skipping already executed migration: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      logger.info(`Executed migration: ${file}`);
    }

    await client.query('COMMIT');
    logger.info('Migrations completed');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Migration failed');
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Migration error');
    process.exit(1);
  });
