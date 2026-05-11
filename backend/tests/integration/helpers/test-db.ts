import { execSync } from 'child_process';
import pool from '../../../src/db/connect.js';

export async function resetDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      progression_runs,
      rm_tests,
      athlete_exercise_weights,
      athlete_program_state,
      skeleton_slots,
      athlete_skeletons,
      coach_profiles,
      athlete_profiles,
      users
    RESTART IDENTITY CASCADE;
  `);
}

export async function ensureMigrated(): Promise<void> {
  // Idempotent: if migrations table not present or rows missing, run them.
  const r = await pool.query(
    `SELECT to_regclass('public.exercises') AS e,
            to_regclass('public.periodization_config') AS p`,
  );
  if (!r.rows[0].e || !r.rows[0].p) {
    execSync('npm run db:migrate', { stdio: 'inherit' });
  }
  // Ensure seed data
  const ec = await pool.query(`SELECT count(*)::int AS n FROM exercises`);
  if (ec.rows[0].n === 0) {
    execSync(
      `npx tsx src/seeds/enrich-exercises.ts && psql $DATABASE_URL -f src/seeds/exercises.sql`,
      { stdio: 'inherit' },
    );
  }
  const pc = await pool.query(`SELECT count(*)::int AS n FROM periodization_config`);
  if (pc.rows[0].n === 0) {
    execSync(
      `npx tsx src/seeds/port-periodization.ts && psql $DATABASE_URL -f src/seeds/periodization_config.sql`,
      { stdio: 'inherit' },
    );
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
