/**
 * Seed fake "Progreso" data for a single athlete so the mobile app's
 * Progreso screen (fuerza / cuerpo / constancia) has something to render.
 *
 * Idempotent & SCOPED to one athlete: it deletes that athlete's existing
 * session_logs, set_logs, rm_tests, athlete_measurements and
 * athlete_exercise_weights, then re-inserts a fresh demo dataset.
 * Safe to run repeatedly. Only ever touches rows WHERE athlete_id = <id>.
 *
 * Run:
 *   DATABASE_URL=postgres://...  tsx src/scripts/seed-progress-demo.ts [athleteId]
 *
 * Feeds every Progreso query in services/progress.service.ts:
 *   - rm_tests                 -> RM evolution (weeks 10/20/30)
 *   - athlete_exercise_weights -> "suggested" side of weight-vs-suggested
 *   - set_logs (value/rpe)     -> weight-vs-suggested + RPE histogram
 *   - session_logs             -> compliance + volume
 *   - athlete_measurements     -> body weight + circumferences
 */
import pool from '../db/connect.js';

const DEFAULT_ATHLETE = '2894e4b3-2259-4589-9d4e-f69b66fe585d';
const athleteId = process.argv[2] ?? DEFAULT_ATHLETE;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

async function main() {
  const client = await pool.connect();
  try {
    // 1. Validate athlete
    const u = await client.query<{ id: string; role: string; email: string }>(
      'SELECT id, role, email FROM users WHERE id = $1',
      [athleteId],
    );
    if (u.rowCount === 0) throw new Error(`No user with id ${athleteId}`);
    console.log(`Seeding for ${u.rows[0].email} (role=${u.rows[0].role})`);

    // 2. Pick 6 real exercises to attach data to
    const ex = await client.query<{ id: number; name: string }>(
      'SELECT id, name FROM exercises ORDER BY id LIMIT 6',
    );
    if (ex.rowCount === 0) throw new Error('No exercises seeded in this DB');
    const exercises = ex.rows;
    console.log(`Using exercises: ${exercises.map((e) => `${e.id}:${e.name}`).join(', ')}`);

    await client.query('BEGIN');

    // 3. Ensure a skeleton (session_logs.skeleton_id is NOT NULL)
    let skeletonId: string;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM athlete_skeletons WHERE athlete_id = $1
       ORDER BY (status = 'approved') DESC, created_at DESC LIMIT 1`,
      [athleteId],
    );
    if (existing.rowCount && existing.rows[0]) {
      skeletonId = existing.rows[0].id;
      console.log(`Reusing skeleton ${skeletonId}`);
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO athlete_skeletons (athlete_id, status, generated_by, generation_prompt, generation_rationale)
         VALUES ($1, 'superseded', 'coach', '{}'::jsonb, 'demo seed')
         RETURNING id`,
        [athleteId],
      );
      skeletonId = ins.rows[0].id;
      console.log(`Created skeleton ${skeletonId}`);
    }

    // 4. Wipe prior data for this athlete (scoped)
    const wipe = async (sql: string) => (await client.query(sql, [athleteId])).rowCount;
    const wiped = {
      sets: await wipe('DELETE FROM set_logs WHERE athlete_id = $1'),
      sessions: await wipe('DELETE FROM session_logs WHERE athlete_id = $1'),
      rms: await wipe('DELETE FROM rm_tests WHERE athlete_id = $1'),
      meas: await wipe('DELETE FROM athlete_measurements WHERE athlete_id = $1'),
      weights: await wipe('DELETE FROM athlete_exercise_weights WHERE athlete_id = $1'),
    };
    console.log('Wiped prior:', wiped);

    // 5. athlete_exercise_weights — "suggested" side of weight-vs-suggested
    for (const [i, e] of exercises.entries()) {
      const suggested = 40 + i * 10; // 40,50,60,70,80,90
      await client.query(
        `INSERT INTO athlete_exercise_weights
           (athlete_id, exercise_id, current_weight_kg, current_value, unit, current_reps_text, updated_by)
         VALUES ($1,$2,$3,$3,'kg','8 a 10','coach')`,
        [athleteId, e.id, suggested],
      );
    }

    // 6. rm_tests — RM evolution at weeks 10/20/30 (use first 3 exercises)
    for (const e of exercises.slice(0, 3)) {
      const base = 50 + e.id;
      for (const [j, wk] of [10, 20, 30].entries()) {
        const value = base + j * 7.5; // climbs each test
        await client.query(
          `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg, value, unit, tested_at)
           VALUES ($1,$2,$3,$4,$4,'kg',$5)`,
          [athleteId, e.id, wk, value, iso((30 - wk) * WEEK_MS)],
        );
      }
    }

    // 7. athlete_measurements — body weight + circumferences, ~10 points over 18 weeks
    const points = 10;
    for (let p = 0; p < points; p++) {
      const t = (points - 1 - p) * 2; // weeks ago: 18,16,...,0
      const prog = p / (points - 1); // 0 -> 1 over time
      await client.query(
        `INSERT INTO athlete_measurements
           (athlete_id, measured_at, body_weight_kg, chest_cm, waist_cm, hip_cm, thigh_cm, calf_cm, bicep_cm, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual')`,
        [
          athleteId,
          iso(t * WEEK_MS),
          +(85 - prog * 5).toFixed(1),   // 85 -> 80 kg
          +(102 + prog * 3).toFixed(1),  // chest grows
          +(90 - prog * 6).toFixed(1),   // waist shrinks
          +(100 - prog * 3).toFixed(1),
          +(58 + prog * 2).toFixed(1),
          +(38 + prog * 1).toFixed(1),
          +(34 + prog * 3).toFixed(1),   // bicep grows
        ],
      );
    }

    // 8. session_logs + set_logs — 12 weekly finished sessions
    const weeks = 12;
    let totalSets = 0;
    for (let w = 0; w < weeks; w++) {
      const programWeek = w + 1;
      const startedMsAgo = (weeks - 1 - w) * WEEK_MS;
      const dayOfWeek = ((w % 5) + 1); // 1..5
      const progression = 1 + w * 0.03; // weight creeps up each week
      const compliance = 70 + Math.round(((w * 7) % 30)); // 70..99-ish
      let volume = 0;

      const sess = await client.query<{ id: string }>(
        `INSERT INTO session_logs
           (athlete_id, skeleton_id, program_week, day_of_week, started_at, finished_at,
            fatigue_rating, total_sets_target, total_sets_completed, compliance_pct, duration_seconds)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          athleteId, skeletonId, programWeek, dayOfWeek,
          iso(startedMsAgo), iso(startedMsAgo - 60 * 60 * 1000),
          ['suave', 'normal', 'exigente'][w % 3],
          exercises.length * 3, exercises.length * 3, compliance, 3600,
        ],
      );
      const sessionId = sess.rows[0].id;

      for (const [i, e] of exercises.entries()) {
        const suggested = 40 + i * 10;
        const used = +(suggested * progression).toFixed(1); // diverges from suggested
        const reps = 8 + (w % 3);
        for (let s = 0; s < 3; s++) {
          const rpe = 6 + ((w + i + s) % 5); // 6..10
          volume += used * reps;
          totalSets++;
          await client.query(
            `INSERT INTO set_logs
               (athlete_id, exercise_id, week, day_of_week, set_index, weight_kg, value, unit,
                reps, completed, rpe, session_log_id, logged_at)
             VALUES ($1,$2,$3,$4,$5,$6,$6,'kg',$7,TRUE,$8,$9,$10)`,
            [athleteId, e.id, programWeek, dayOfWeek, s + 1, used, reps, rpe, sessionId, iso(startedMsAgo)],
          );
        }
      }

      await client.query(
        'UPDATE session_logs SET total_volume_kg = $2 WHERE id = $1',
        [sessionId, +volume.toFixed(2)],
      );
    }

    await client.query('COMMIT');
    console.log(`Done. ${weeks} sessions, ${totalSets} sets, 9 RMs, ${points} measurements.`);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
