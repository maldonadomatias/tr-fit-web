import 'dotenv/config';
import pool from '../db/connect.js';
import { hashPassword } from '../services/auth.service.js';
import { env } from '../config/env.js';

interface SetupResult {
  ownerId: string;
  created: boolean;
  athletesBackfilled: number;
  alertsBackfilled: number;
}

/**
 * Ensure a coach user exists for `OWNER_COACH_EMAIL` and re-route every
 * athlete and historical alert to that user. Idempotent: re-running with
 * the user already present is a no-op for creation and a 0-row UPDATE
 * for the backfill.
 *
 * CLI:  npx tsx src/scripts/setup-owner-coach.ts <password>
 * `<password>` is only consumed when the user does not yet exist.
 */
export async function setupOwnerCoach(passwordIfMissing: string | undefined): Promise<SetupResult> {
  const email = env.OWNER_COACH_EMAIL;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const found = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1`,
      [email],
    );

    let ownerId: string;
    let created = false;

    if (found.rowCount === 0) {
      if (!passwordIfMissing) {
        throw new Error(
          `User ${email} does not exist. Pass a password as the first CLI arg.`,
        );
      }
      const hash = await hashPassword(passwordIfMissing);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
         VALUES ($1, $2, 'coach', TRUE, NOW()) RETURNING id`,
        [email, hash],
      );
      ownerId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [ownerId, 'Owner'],
      );
      created = true;
    } else {
      const row = found.rows[0];
      if (row.role !== 'coach') {
        throw new Error(
          `User ${email} exists but has role='${row.role}'. Refusing to mutate.`,
        );
      }
      ownerId = row.id;
      // Ensure a coach_profiles row exists for legacy users.
      await client.query(
        `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [ownerId, 'Owner'],
      );
    }

    const athleteUpd = await client.query(
      `UPDATE athlete_profiles SET coach_id = $1
       WHERE coach_id IS DISTINCT FROM $1`,
      [ownerId],
    );

    const alertUpd = await client.query(
      `UPDATE coach_alerts SET coach_id = $1
       WHERE coach_id IS DISTINCT FROM $1`,
      [ownerId],
    );

    await client.query('COMMIT');
    return {
      ownerId,
      created,
      athletesBackfilled: athleteUpd.rowCount ?? 0,
      alertsBackfilled: alertUpd.rowCount ?? 0,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const password = process.argv[2];
  const result = await setupOwnerCoach(password);
  if (result.created) {
    console.log(`Created owner coach ${env.OWNER_COACH_EMAIL} (id=${result.ownerId})`);
  } else {
    console.log(`Owner coach already exists (id=${result.ownerId})`);
  }
  console.log(
    `Backfilled athletes=${result.athletesBackfilled} alerts=${result.alertsBackfilled}`,
  );
  await pool.end();
}

// Only run main() when invoked directly (not when imported by tests).
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.endsWith('setup-owner-coach.ts') || entry.endsWith('setup-owner-coach.js');
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
