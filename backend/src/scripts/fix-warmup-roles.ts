// One-off data fix (bug 2026-07-04): skeleton_slots rows whose exercise is a
// warm-up by name (movilidad / movimiento(s) articular(es) / activación /
// entrada en calor / calentamiento) but were stored with role 'accesorio' or
// 'principal'. Those rows made the mobile app ask RPE/reps after a mobility
// drill. Cause: the AI adjuster (template-first rewrite, commit 61e5cf6)
// could re-tag warm-ups and the enforceFirstWarmup/normalize backstop was
// missing at the time.
//
// Usage:
//   tsx src/scripts/fix-warmup-roles.ts            # dry-run: lists affected rows
//   tsx src/scripts/fix-warmup-roles.ts --apply    # performs the UPDATE
//
// Idempotent: re-running after --apply matches 0 rows.

import pool from '../db/connect.js';

// Keep in sync with WARMUP_NAME_RE in src/services/warmup-rule.ts.
// Postgres ~* is case-insensitive; [oó] covers the accented "activación".
const WARMUP_NAME_SQL_RE =
  'movilidad|movimientos? articular(es)?|activaci[oó]n|entrada en calor|calentamiento';

const apply = process.argv.includes('--apply');

async function main() {
  const affected = await pool.query<{
    slot_id: string;
    skeleton_id: string;
    athlete_id: string;
    skeleton_status: string;
    day_of_week: number;
    slot_index: number;
    exercise_name: string;
    role: string;
  }>(
    `SELECT s.id AS slot_id, s.skeleton_id, k.athlete_id,
            k.status AS skeleton_status, s.day_of_week, s.slot_index,
            e.name AS exercise_name, s.role
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
       JOIN athlete_skeletons k ON k.id = s.skeleton_id
      WHERE s.role <> 'calentamiento'
        AND e.name ~* $1
      ORDER BY k.athlete_id, s.skeleton_id, s.day_of_week, s.slot_index`,
    [WARMUP_NAME_SQL_RE],
  );

  if (affected.rows.length === 0) {
    console.log('No mistagged warm-up slots found. Nothing to do.');
    await pool.end();
    return;
  }

  console.log(`Found ${affected.rows.length} mistagged warm-up slot(s):`);
  for (const r of affected.rows) {
    console.log(
      `  athlete=${r.athlete_id} skeleton=${r.skeleton_id} (${r.skeleton_status}) ` +
        `day=${r.day_of_week} slot=${r.slot_index} role=${r.role} "${r.exercise_name}"`,
    );
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to fix these rows.');
    await pool.end();
    return;
  }

  // Set role and clear the accessory set-scheme: series/reps/descanso only
  // apply to role 'accesorio' (warm-ups use the engine defaults at runtime).
  const res = await pool.query(
    `UPDATE skeleton_slots s
        SET role = 'calentamiento', series = NULL, reps = NULL, descanso = NULL
       FROM exercises e
      WHERE e.id = s.exercise_id
        AND s.role <> 'calentamiento'
        AND e.name ~* $1`,
    [WARMUP_NAME_SQL_RE],
  );
  console.log(`\nUpdated ${res.rowCount} row(s).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
