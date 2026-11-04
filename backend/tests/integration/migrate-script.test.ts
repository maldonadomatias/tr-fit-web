import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);
const backendDir = process.cwd(); // jest runs from backend/

// Runs the real migration script the container runs on boot.
function migrate(env: Record<string, string>) {
  return run('npx', ['tsx', 'src/db/migrate.ts'], {
    cwd: backendDir,
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
}

const testUrl = process.env.DATABASE_URL!;
// Same database, but a user that does not exist: any connection with it fails.
const broken = new URL(testUrl);
broken.username = 'no_such_user';
broken.password = 'x';
const brokenUrl = broken.href;

it('uses MIGRATION_DATABASE_URL over DATABASE_URL', async () => {
  await expect(
    migrate({ DATABASE_URL: brokenUrl, MIGRATION_DATABASE_URL: testUrl })
  ).resolves.toBeDefined();
}, 120_000);

it('two containers booting at once on a fresh database both succeed', async () => {
  // Empty database: both runs see every migration pending and race for them.
  const fresh = new URL(testUrl);
  fresh.pathname = '/trfit_migrate_lock_test';
  const admin = new pg.Client({ connectionString: testUrl });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS trfit_migrate_lock_test');
  await admin.query('CREATE DATABASE trfit_migrate_lock_test');
  try {
    const results = await Promise.allSettled([
      migrate({ MIGRATION_DATABASE_URL: fresh.href }),
      migrate({ MIGRATION_DATABASE_URL: fresh.href }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  } finally {
    await admin.query('DROP DATABASE IF EXISTS trfit_migrate_lock_test WITH (FORCE)');
    await admin.end();
  }
}, 180_000);
