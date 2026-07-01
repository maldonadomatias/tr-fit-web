# Async Routine Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move routine regeneration out of the HTTP request into a durable, restart-safe background job so locking the phone or backgrounding the app never fails a regeneration.

**Architecture:** `POST /athlete/skeleton/regenerate` enqueues a row in a new `skeleton_regen_jobs` table and returns `202` instantly. An in-process `setInterval` worker claims queued jobs (`FOR UPDATE SKIP LOCKED`), runs the existing OpenAI generation, creates the `pending_review` skeleton on success, retries transient failures up to 3 times, and a reaper requeues jobs orphaned by a crash. The app polls `GET /athlete/me`, which now returns a `regenState` enum instead of a `pendingReview` boolean.

**Tech Stack:** Backend — Node 20, Express 4, TypeScript (ESM), PostgreSQL 15 (`pg`), Jest (ts-jest ESM, integration tests against a live `trfit_test` DB). App — React Native / Expo, TypeScript, Jest + `@testing-library/react-native`.

## Global Constraints

- Two repos. Backend: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web` (paths relative to `backend/` unless noted). App: `/Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app`.
- Backend integration tests require Postgres `trfit_test` at `postgres://postgres:postgres@localhost:5432/trfit_test` (already running). Tests connect via `tests/jest.setup.ts`.
- **New migrations are NOT auto-applied to the test DB.** `ensureMigrated` only runs migrations when base tables are missing. After creating migration `048`, apply it explicitly: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/trfit_test npm run db:migrate` (from `backend/`). The migrate runner tracks applied files, so this applies only the new one. Do this before running any test that touches `skeleton_regen_jobs`.
- Backend test runner: `npm test` = `node --experimental-vm-modules node_modules/jest/bin/jest.js`. Single file: `npm test -- <path>`; single case add `-t '<name>'`.
- Local ESM imports use the `.js` extension; single quotes, semicolons, 2-space indent.
- Exact 409 copy (unchanged from the prior feature): `Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.`
- Skeleton status enum: `'pending_review' | 'approved' | 'rejected' | 'superseded'`.
- Job status enum: `'queued' | 'running' | 'done' | 'failed'`.
- `regenState` enum (`/athlete/me` + app): `'idle' | 'generating' | 'pending_review' | 'failed'`.
- Constants (define in `src/workers/regen-worker.ts`, exported for tests): `MAX_JOB_ATTEMPTS = 3`, `STUCK_RUNNING_MS = 300000`, `RETRY_BACKOFF_MS = 30000`, `WORKER_TICK_MS = 5000`.

---

## File Structure

**Backend (`tr-fit-web/backend`)**
- `src/db/migrations/048_skeleton_regen_jobs.sql` — new job table + indexes.
- `src/services/skeleton-regen.service.ts` — refactor: `enqueueRegenJob(athleteId)` + `runRegenJob(athleteId)`; keep `PendingReviewExistsError`; remove the sync `regenerateSkeleton`.
- `src/workers/regen-worker.ts` — `regenTick()` (reaper + claim + run) + `startRegenWorker()` + constants.
- `src/routes/athlete.ts` — regenerate route → enqueue + `202`; `/me` → `regenState`.
- `src/services/alert.service.ts:330` — swap `regenerateSkeleton` → `enqueueRegenJob`.
- `src/index.ts` — start the worker beside the crons.
- Tests: `tests/integration/migration-048.test.ts`, rewrite `tests/integration/skeleton-regen-service.test.ts`, new `tests/integration/regen-worker.test.ts`, update `tests/integration/athlete-routes.test.ts`, update `tests/integration/alerts.test.ts`.

**App (`tr-fit-app`)**
- `lib/athlete-profile.ts` — `pendingReview` → `regenState`.
- `app/(app)/athlete/profile.tsx` — button states per `regenState`, `performRegen` accepts 202, success copy.
- `__tests__/athlete-profile.test.ts` — update assertions.

---

## Task 1: Migration — `skeleton_regen_jobs` table

**Files:**
- Create: `backend/src/db/migrations/048_skeleton_regen_jobs.sql`
- Test: `backend/tests/integration/migration-048.test.ts`

**Interfaces:**
- Produces: table `skeleton_regen_jobs(id, athlete_id, status, attempts, last_error, created_at, started_at, finished_at, next_attempt_at)` with `status CHECK ('queued','running','done','failed')`.

- [ ] **Step 1: Write the migration**

Create `backend/src/db/migrations/048_skeleton_regen_jobs.sql`:

```sql
CREATE TABLE IF NOT EXISTS skeleton_regen_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regen_jobs_claim
  ON skeleton_regen_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_regen_jobs_athlete_status
  ON skeleton_regen_jobs(athlete_id, status);
```

- [ ] **Step 2: Apply the migration to the test DB**

Run: `cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/trfit_test npm run db:migrate`
Expected: output shows `048_skeleton_regen_jobs` applied (or "already applied" on a re-run). No error.

- [ ] **Step 3: Write the migration test**

Create `backend/tests/integration/migration-048.test.ts` (mirror the shape of `tests/integration/migration-030.test.ts`):

```typescript
export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 048 skeleton_regen_jobs', () => {
  it('accepts a queued job row with defaults', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const r = await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')
       RETURNING attempts, next_attempt_at, created_at`,
      [a],
    );
    expect(r.rows[0].attempts).toBe(0);
    expect(r.rows[0].next_attempt_at).toBeDefined();
  });

  it('rejects an off-list status', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await expect(
      pool.query(
        `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'bogus')`,
        [a],
      ),
    ).rejects.toThrow();
  });

  it('cascades on athlete delete', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')`, [a],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [a]);
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM skeleton_regen_jobs WHERE athlete_id = $1`, [a],
    );
    expect(r.rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 4: Add the table to the test-DB reset truncation list**

`resetDatabase` in `backend/tests/integration/helpers/test-db.ts` `TRUNCATE`s a fixed table list; the new table must be included so tests start clean. Add `skeleton_regen_jobs,` to the `TRUNCATE TABLE` list (put it right after the `skeleton_regen_log,` line):

```
      skeleton_regen_jobs,
      skeleton_regen_log,
```

- [ ] **Step 5: Run the migration test**

Run: `cd backend && npm test -- tests/integration/migration-048.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 6: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/db/migrations/048_skeleton_regen_jobs.sql backend/tests/integration/migration-048.test.ts backend/tests/integration/helpers/test-db.ts
git commit -m "feat(regen): add skeleton_regen_jobs table"
```

---

## Task 2: Enqueue + runRegenJob refactor + route returns 202

**Files:**
- Modify: `backend/src/services/skeleton-regen.service.ts` (full rewrite of the service body; keep `PendingReviewExistsError`)
- Modify: `backend/src/routes/athlete.ts:45-60`
- Modify: `backend/src/services/alert.service.ts:10,330`
- Test: rewrite `backend/tests/integration/skeleton-regen-service.test.ts`; update `backend/tests/integration/athlete-routes.test.ts`

**Interfaces:**
- Consumes: `generateSkeleton` (`./openai.service.js`), `createPendingSkeleton` (`./skeleton.service.js`), `listExercisesForAthlete` (`./exercise.service.js`), `pool`.
- Produces:
  - `class PendingReviewExistsError extends Error` (kept, `statusCode = 409`).
  - `enqueueRegenJob(athleteId: string): Promise<{ jobId: string }>` — throws `PendingReviewExistsError` if an active job (`queued`/`running`) OR a `pending_review` skeleton exists; else inserts a `queued` job.
  - `runRegenJob(athleteId: string): Promise<{ skeletonId: string | null }>` — the generation body (advisory lock → profile → exercises → `generateSkeleton` → `createPendingSkeleton` → `skeleton_regen_log` insert). If a `pending_review` skeleton already exists, returns `{ skeletonId: null }` without generating (idempotent).
  - The sync `regenerateSkeleton` export is removed.

- [ ] **Step 1: Rewrite the service test for the async model**

Replace the entire body of `backend/tests/integration/skeleton-regen-service.test.ts`. Keep the top-of-file mock of `openai.service` and the `ensureFirstExercise`/`setTier` helpers; import the new functions. New content:

```typescript
import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal', notes: null }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { enqueueRegenJob, runRegenJob, PendingReviewExistsError } =
  await import('../../src/services/skeleton-regen.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    rationale: 'r',
    days: [{ day_index: 1, focus: 'f',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal', notes: null }] }],
  });
});
afterAll(async () => { await closePool(); });

async function ensureFirstExercise() {
  const r = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  if (r.rows[0]) return;
  await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_pattern,
                            is_principal, is_unilateral, level_min)
     VALUES ('Sentadilla','pierna','barra','squat',true,false,'principiante')
     ON CONFLICT DO NOTHING`,
  );
}

describe('enqueueRegenJob', () => {
  it('creates a queued job and does not generate synchronously', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    expect(jobId).toBeDefined();
    const job = await pool.query<{ status: string }>(
      `SELECT status FROM skeleton_regen_jobs WHERE id = $1`, [jobId],
    );
    expect(job.rows[0].status).toBe('queued');
    expect(mockGenerate).not.toHaveBeenCalled();
    const sk = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].n).toBe(0);
  });

  it('rejects a second enqueue while a job is active', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await enqueueRegenJob(a);
    await expect(enqueueRegenJob(a)).rejects.toBeInstanceOf(PendingReviewExistsError);
  });

  it('rejects enqueue while a pending_review skeleton exists', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES ($1,'pending_review','ai','{}'::jsonb,'x')`,
      [a],
    );
    await expect(enqueueRegenJob(a)).rejects.toBeInstanceOf(PendingReviewExistsError);
  });
});

describe('runRegenJob', () => {
  it('generates, creates a pending_review skeleton, logs approved_gen', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { skeletonId } = await runRegenJob(a);
    expect(skeletonId).toBeTruthy();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const sk = await pool.query<{ status: string }>(
      `SELECT status FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(sk.rows[0].status).toBe('pending_review');
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log WHERE athlete_id = $1`, [a],
    );
    expect(log.rows[0].result).toBe('approved_gen');
  });

  it('is idempotent when a pending_review skeleton already exists', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES ($1,'pending_review','ai','{}'::jsonb,'x')`,
      [a],
    );
    const { skeletonId } = await runRegenJob(a);
    expect(skeletonId).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts`
Expected: FAIL — `enqueueRegenJob`/`runRegenJob` are not exported.

- [ ] **Step 3: Rewrite the service**

Replace the body of `backend/src/services/skeleton-regen.service.ts` with:

```typescript
import pool from '../db/connect.js';
import { generateSkeleton } from './openai.service.js';
import { createPendingSkeleton } from './skeleton.service.js';
import { listExercisesForAthlete } from './exercise.service.js';
import type { AthleteProfile } from '../domain/types.js';

export class PendingReviewExistsError extends Error {
  statusCode = 409;
  constructor() {
    super('pending_review skeleton or active regen job already exists');
    this.name = 'PendingReviewExistsError';
  }
}

// Enqueue a background regeneration job. Rejects if the athlete already has an
// active job (queued/running) or a pending_review skeleton awaiting the coach.
export async function enqueueRegenJob(
  athleteId: string,
): Promise<{ jobId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [athleteId]);

    const active = await client.query<{ exists: boolean }>(
      `SELECT (
         EXISTS(SELECT 1 FROM skeleton_regen_jobs
                 WHERE athlete_id = $1 AND status IN ('queued','running'))
         OR
         EXISTS(SELECT 1 FROM athlete_skeletons
                 WHERE athlete_id = $1 AND status = 'pending_review')
       ) AS exists`,
      [athleteId],
    );
    if (active.rows[0].exists) {
      throw new PendingReviewExistsError();
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status)
       VALUES ($1, 'queued') RETURNING id`,
      [athleteId],
    );
    await client.query('COMMIT');
    return { jobId: ins.rows[0].id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Run the actual generation for one athlete. Used by the worker. Idempotent:
// if a pending_review skeleton already exists, returns { skeletonId: null }.
export async function runRegenJob(
  athleteId: string,
): Promise<{ skeletonId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [athleteId]);

    const pendingR = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM athlete_skeletons
         WHERE athlete_id = $1 AND status = 'pending_review'
       ) AS exists`,
      [athleteId],
    );
    if (pendingR.rows[0].exists) {
      await client.query('COMMIT');
      return { skeletonId: null };
    }

    const profileR = await client.query<AthleteProfile>(
      `SELECT * FROM athlete_profiles WHERE user_id = $1`, [athleteId],
    );
    const profile = profileR.rows[0];
    const exercises = await listExercisesForAthlete(profile, athleteId);
    const ai = await generateSkeleton({ profile, exercises });
    const { skeletonId } = await createPendingSkeleton(
      {
        athleteId,
        generationPrompt: { profile, exercises_count: exercises.length, source: 'regen' },
        generationRationale: ai.rationale,
      },
      ai,
    );
    await client.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [athleteId],
    );
    await client.query('COMMIT');
    return { skeletonId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
```

Note: `createPendingSkeleton` opens its own connection/transaction (existing behavior, unchanged); the advisory lock here serializes per athlete exactly as the old code did.

- [ ] **Step 4: Run the service test to verify it passes**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts`
Expected: PASS (all `enqueueRegenJob` + `runRegenJob` cases).

- [ ] **Step 5: Update the route to enqueue and return 202**

In `backend/src/routes/athlete.ts`, change the import on line 12:

```typescript
import { enqueueRegenJob, PendingReviewExistsError } from '../services/skeleton-regen.service.js';
```

Replace the handler (lines 45-60):

```typescript
router.post('/skeleton/regenerate', async (req, res) => {
  // Enqueue a background job; generation runs in the worker, not the request.
  try {
    const { jobId } = await enqueueRegenJob(req.user!.id);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (e) {
    if (e instanceof PendingReviewExistsError) {
      return res.status(409).json({
        message: 'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
      });
    }
    throw e;
  }
});
```

- [ ] **Step 6: Update the alert-service caller**

In `backend/src/services/alert.service.ts` line 10, change the import:

```typescript
import { enqueueRegenJob } from './skeleton-regen.service.js';
```

At line ~330 replace the call (keep the surrounding post-commit try/catch and log message intent):

```typescript
        await enqueueRegenJob(alert.athlete_id);
```

If the adjacent catch log says "regenerateSkeleton failed", update the text to "enqueueRegenJob failed post-commit; alert is resolved but regen was not enqueued".

- [ ] **Step 7: Update the route test (201/skeletonId → 202/jobId)**

In `backend/tests/integration/athlete-routes.test.ts`, the regenerate 409 test from the prior feature drove `POST /athlete/skeleton/regenerate` expecting `201`. Update the success expectation to `202` and body `{ jobId }`, and keep the 409-on-second assertion. Find the existing test and change:

```typescript
    const first = await request(app)
      .post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(first.status).toBe(202);
    expect(first.body.jobId).toBeDefined();

    const second = await request(app)
      .post('/api/athlete/skeleton/regenerate')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(second.status).toBe(409);
    expect(second.body.message).toBe(
      'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.',
    );
```

(Match the file's actual auth/agent variables — inspect first; the snippet shows the shape, not necessarily the exact variable names.)

- [ ] **Step 8: Run the affected backend tests**

Run: `cd backend && npm test -- tests/integration/skeleton-regen-service.test.ts tests/integration/athlete-routes.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/skeleton-regen.service.ts backend/src/routes/athlete.ts backend/src/services/alert.service.ts backend/tests/integration/skeleton-regen-service.test.ts backend/tests/integration/athlete-routes.test.ts
git commit -m "feat(regen): enqueue background job instead of generating in-request"
```

---

## Task 3: Worker — claim, run, retry, reap

**Files:**
- Create: `backend/src/workers/regen-worker.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/tests/integration/regen-worker.test.ts`; update `backend/tests/integration/alerts.test.ts`

**Interfaces:**
- Consumes: `runRegenJob(athleteId)` and `PendingReviewExistsError` from `skeleton-regen.service.js`; `pool`.
- Produces:
  - `regenTick(): Promise<void>` — one reaper+claim+run cycle; never throws.
  - `startRegenWorker(): void` — starts a `setInterval(regenTick, WORKER_TICK_MS)`; idempotent.
  - Exported constants `MAX_JOB_ATTEMPTS`, `STUCK_RUNNING_MS`, `RETRY_BACKOFF_MS`, `WORKER_TICK_MS`.

- [ ] **Step 1: Write the worker test**

Create `backend/tests/integration/regen-worker.test.ts`:

```typescript
import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal', notes: null }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { enqueueRegenJob } = await import('../../src/services/skeleton-regen.service.js');
const { regenTick, MAX_JOB_ATTEMPTS } =
  await import('../../src/workers/regen-worker.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    rationale: 'r',
    days: [{ day_index: 1, focus: 'f',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal', notes: null }] }],
  });
});
afterAll(async () => { await closePool(); });

async function ensureFirstExercise() {
  const r = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  if (r.rows[0]) return;
  await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_pattern,
                            is_principal, is_unilateral, level_min)
     VALUES ('Sentadilla','pierna','barra','squat',true,false,'principiante')
     ON CONFLICT DO NOTHING`,
  );
}
async function jobStatus(jobId: string) {
  const r = await pool.query<{ status: string; attempts: number }>(
    `SELECT status, attempts FROM skeleton_regen_jobs WHERE id = $1`, [jobId],
  );
  return r.rows[0];
}
// Simulate the backoff window elapsing so the next tick can re-claim.
async function makeClaimable(jobId: string) {
  await pool.query(
    `UPDATE skeleton_regen_jobs SET next_attempt_at = now() WHERE id = $1`, [jobId],
  );
}

describe('regenTick', () => {
  it('claims a queued job, generates, creates skeleton, marks done', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);

    await regenTick();

    expect((await jobStatus(jobId)).status).toBe('done');
    const sk = await pool.query<{ status: string }>(
      `SELECT status FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].status).toBe('pending_review');
  });

  it('requeues with incremented attempts on a transient failure', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    mockGenerate.mockRejectedValueOnce(new Error('openai down'));

    await regenTick();

    const s = await jobStatus(jobId);
    expect(s.status).toBe('queued');
    expect(s.attempts).toBe(1);
    const sk = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].n).toBe(0);
  });

  it('marks failed after MAX_JOB_ATTEMPTS transient failures', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    mockGenerate.mockRejectedValue(new Error('openai down'));

    for (let i = 0; i < MAX_JOB_ATTEMPTS; i++) {
      await makeClaimable(jobId);
      await regenTick();
    }

    const s = await jobStatus(jobId);
    expect(s.status).toBe('failed');
    expect(s.attempts).toBe(MAX_JOB_ATTEMPTS);
  });

  it('reaps a stuck running job back to queued', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    await pool.query(
      `UPDATE skeleton_regen_jobs
          SET status='running', started_at = now() - interval '6 minutes'
        WHERE id = $1`,
      [jobId],
    );

    await regenTick();

    // Reaper requeues it, then the same tick may claim+run it → done.
    expect(['queued', 'done', 'running']).toContain((await jobStatus(jobId)).status);
    const s2 = await jobStatus(jobId);
    expect(s2.status).not.toBe('failed');
  });

  it('is a no-op when there are no queued jobs', async () => {
    await expect(regenTick()).resolves.toBeUndefined();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/integration/regen-worker.test.ts`
Expected: FAIL — `regen-worker.js` module does not exist.

- [ ] **Step 3: Write the worker**

Create `backend/src/workers/regen-worker.ts`:

```typescript
import pool from '../db/connect.js';
import logger from '../utils/logger.js';
import { runRegenJob } from '../services/skeleton-regen.service.js';

export const MAX_JOB_ATTEMPTS = 3;
export const STUCK_RUNNING_MS = 300000;
export const RETRY_BACKOFF_MS = 30000;
export const WORKER_TICK_MS = 5000;

let interval: ReturnType<typeof setInterval> | null = null;

// One reaper + claim + run cycle. Never throws (logs and swallows).
export async function regenTick(): Promise<void> {
  try {
    // Reaper: a running job older than STUCK_RUNNING_MS is treated as crashed.
    await pool.query(
      `UPDATE skeleton_regen_jobs
          SET status = 'queued', next_attempt_at = now()
        WHERE status = 'running'
          AND started_at < now() - ($1::int * interval '1 millisecond')`,
      [STUCK_RUNNING_MS],
    );

    // Claim one runnable job atomically.
    const claim = await pool.query<{ id: string; athlete_id: string; attempts: number }>(
      `UPDATE skeleton_regen_jobs
          SET status = 'running', started_at = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM skeleton_regen_jobs
           WHERE status = 'queued' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
       RETURNING id, athlete_id, attempts`,
    );
    const job = claim.rows[0];
    if (!job) return;

    try {
      await runRegenJob(job.athlete_id);
      await pool.query(
        `UPDATE skeleton_regen_jobs
            SET status = 'done', finished_at = now()
          WHERE id = $1`,
        [job.id],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (job.attempts < MAX_JOB_ATTEMPTS) {
        await pool.query(
          `UPDATE skeleton_regen_jobs
              SET status = 'queued', last_error = $2,
                  next_attempt_at = now() + ($3::int * interval '1 millisecond')
            WHERE id = $1`,
          [job.id, msg, RETRY_BACKOFF_MS],
        );
        logger.warn({ jobId: job.id, attempts: job.attempts }, 'regen job retry');
      } else {
        await pool.query(
          `UPDATE skeleton_regen_jobs
              SET status = 'failed', last_error = $2, finished_at = now()
            WHERE id = $1`,
          [job.id, msg],
        );
        logger.error({ jobId: job.id }, 'regen job failed permanently');
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'regenTick failed');
  }
}

export function startRegenWorker(): void {
  if (interval) return;
  interval = setInterval(() => { void regenTick(); }, WORKER_TICK_MS);
  logger.info('regen worker started');
}
```

- [ ] **Step 4: Run the worker test to verify it passes**

Run: `cd backend && npm test -- tests/integration/regen-worker.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Wire the worker into index.ts**

In `backend/src/index.ts`, add the import next to the other worker imports:

```typescript
import { startRegenWorker } from './workers/regen-worker.js';
```

Add the start call inside the existing `if (process.env.NODE_ENV !== 'test')` block:

```typescript
if (process.env.NODE_ENV !== 'test') {
  startProgressionCron();
  startNotificationCron();
  startMembershipCron();
  startPlatformFeeCron();
  startRegenWorker();
}
```

- [ ] **Step 6: Update the alerts test for the async model**

`backend/tests/integration/alerts.test.ts` covers `resolveAlert`, which now enqueues instead of generating. Inspect the file: any assertion that a skeleton exists (or that `generateSkeleton` was called) right after `resolveAlert` must change to assert a `queued` job exists for the athlete instead. Concretely, after the resolve call:

```typescript
    const job = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM skeleton_regen_jobs
        WHERE athlete_id = $1 AND status = 'queued'`,
      [athleteId],
    );
    expect(job.rows[0].n).toBe(1);
```

If the file has no such post-regen assertion (it only checks the alert is resolved), leave it unchanged. Run the file to confirm either way (Step 7).

- [ ] **Step 7: Run worker + alerts tests**

Run: `cd backend && npm test -- tests/integration/regen-worker.test.ts tests/integration/alerts.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/workers/regen-worker.ts backend/src/index.ts backend/tests/integration/regen-worker.test.ts backend/tests/integration/alerts.test.ts
git commit -m "feat(regen): background worker to run, retry, and reap regen jobs"
```

---

## Task 4: `GET /athlete/me` returns `regenState`

**Files:**
- Modify: `backend/src/routes/athlete.ts` (`GET /me`, the `pendingReview` block)
- Test: `backend/tests/integration/athlete-routes.test.ts`

**Interfaces:**
- Consumes: `pool`, `skeleton_regen_jobs`, `athlete_skeletons`.
- Produces: `GET /athlete/me` returns `regenState: 'idle' | 'generating' | 'pending_review' | 'failed'` (replaces `pendingReview`).

- [ ] **Step 1: Write the failing test**

In `backend/tests/integration/athlete-routes.test.ts`, replace the prior `pendingReview` test with (match the file's auth/agent pattern):

```typescript
  it('GET /athlete/me reports regenState across the lifecycle', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const token = signToken(a); // use the file's real token helper

    const me = () => request(app).get('/api/athlete/me')
      .set('Authorization', `Bearer ${token}`);

    expect((await me()).body.regenState).toBe('idle');

    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1,'queued')`, [a],
    );
    expect((await me()).body.regenState).toBe('generating');

    await pool.query(`UPDATE skeleton_regen_jobs SET status='done', finished_at=now()
                       WHERE athlete_id=$1`, [a]);
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES ($1,'pending_review','ai','{}'::jsonb,'x')`, [a],
    );
    expect((await me()).body.regenState).toBe('pending_review');

    await pool.query(`UPDATE athlete_skeletons SET status='superseded' WHERE athlete_id=$1`, [a]);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status, finished_at)
       VALUES ($1,'failed', now())`, [a],
    );
    expect((await me()).body.regenState).toBe('failed');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- tests/integration/athlete-routes.test.ts -t 'regenState'`
Expected: FAIL — `regenState` undefined.

- [ ] **Step 3: Implement `regenState` in `GET /me`**

In `backend/src/routes/athlete.ts` `GET /me`, replace the `pendingR` block and the `pendingReview` response field. Compute `regenState`:

```typescript
  const stateR2 = await pool.query<{
    active: boolean; pending: boolean; failed: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM skeleton_regen_jobs
               WHERE athlete_id = $1 AND status IN ('queued','running')) AS active,
       EXISTS(SELECT 1 FROM athlete_skeletons
               WHERE athlete_id = $1 AND status = 'pending_review') AS pending,
       (SELECT status FROM skeleton_regen_jobs
          WHERE athlete_id = $1
          ORDER BY created_at DESC LIMIT 1) = 'failed' AS failed`,
    [userId],
  );
  const rs = stateR2.rows[0];
  const regenState = rs.active
    ? 'generating'
    : rs.pending
      ? 'pending_review'
      : rs.failed
        ? 'failed'
        : 'idle';
```

Then in the response object, replace `pendingReview: pendingR.rows[0].exists,` with `regenState,`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- tests/integration/athlete-routes.test.ts -t 'regenState'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/routes/athlete.ts backend/tests/integration/athlete-routes.test.ts
git commit -m "feat(athlete): report regenState on GET /athlete/me"
```

---

## Task 5: App — `regenState` in the hook

**Files:**
- Modify: `tr-fit-app/lib/athlete-profile.ts`
- Test: `tr-fit-app/__tests__/athlete-profile.test.ts`

**Interfaces:**
- Consumes: `GET /athlete/me` now returns `regenState` (Task 4).
- Produces: `useAthleteProfile()` returns `{ profile, loading, regenState }` where `regenState: 'idle' | 'generating' | 'pending_review' | 'failed'` (default `'idle'`).

- [ ] **Step 1: Update + add failing tests**

In `tr-fit-app/__tests__/athlete-profile.test.ts`:

(a) In `PROFILE_PAYLOAD`, replace `pendingReview: true` (added by the prior feature) with:

```typescript
  regenState: 'pending_review',
```

(b) Update the exact-shape assertion (the `expect(result.current).toEqual({...})` line) to:

```typescript
    expect(result.current).toEqual({ profile: null, loading: true, regenState: 'idle' });
```

(c) Replace the prior `pendingReview` hook cases with:

```typescript
  it('exposes regenState from the API payload', async () => {
    (api.apiGet as jest.Mock).mockResolvedValueOnce(PROFILE_PAYLOAD);
    const { result } = renderHook(() => useAthleteProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.regenState).toBe('pending_review');
  });

  it('defaults regenState to idle on API error', async () => {
    (api.apiGet as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAthleteProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.regenState).toBe('idle');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test -- __tests__/athlete-profile.test.ts`
Expected: FAIL — `regenState` undefined; shape mismatch.

- [ ] **Step 3: Implement in the hook**

In `tr-fit-app/lib/athlete-profile.ts`, add the type and replace `pendingReview` with `regenState`:

```typescript
export type RegenState = 'idle' | 'generating' | 'pending_review' | 'failed';

interface MeResponse {
  profile: AthleteProfileData | null;
  programState: unknown;
  skeletonStatus: string | null;
  regenState?: RegenState;
  blockedReason: string | null;
}
```

Update the hook (it currently uses `useFocusEffect` with `pendingReview` state from the prior feature) to track `regenState` instead:

```typescript
export function useAthleteProfile(): {
  profile: AthleteProfileData | null;
  loading: boolean;
  regenState: RegenState;
} {
  const [profile, setProfile] = useState<AthleteProfileData | null>(null);
  const [regenState, setRegenState] = useState<RegenState>('idle');
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      apiGet<MeResponse>('/athlete/me')
        .then((r) => {
          if (cancelled) return;
          setProfile(r.profile ?? null);
          setRegenState(r.regenState ?? 'idle');
        })
        .catch(() => {
          if (cancelled) return;
          setProfile(null);
          setRegenState('idle');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, []),
  );
  return { profile, loading, regenState };
}
```

(If the prior feature left this hook on a mount-only `useEffect`, use `useFocusEffect` as shown — it matches the sibling hooks and was the intended state.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test -- __tests__/athlete-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add lib/athlete-profile.ts __tests__/athlete-profile.test.ts
git commit -m "feat(profile): expose regenState from useAthleteProfile"
```

---

## Task 6: App — button states + 202 + copy

**Files:**
- Modify: `tr-fit-app/app/(app)/athlete/profile.tsx`

**Interfaces:**
- Consumes: `useAthleteProfile()` → `regenState` (Task 5); `SettingsRow` `disabled` prop (already added by the prior feature).
- Produces: user-facing behavior only.

- [ ] **Step 1: Wire regenState into the screen**

In `tr-fit-app/app/(app)/athlete/profile.tsx`, destructure `regenState` from the hook (replacing the prior `pendingReview`):

```typescript
  const { profile, loading: profileLoading, regenState } = useAthleteProfile();
```

Add a derived disabled flag and the button config. Replace the "Regenerar plan" `SettingsRow` (the block the prior feature edited) with:

```tsx
        <SettingsRow
          icon={RefreshCw}
          label="Regenerar plan"
          sub={
            regenState === 'generating'
              ? 'Generando tu plan…'
              : regenState === 'pending_review'
                ? 'Rutina en revisión'
                : regenState === 'failed'
                  ? 'No pudimos generar tu plan. Reintentá.'
                  : regenerating
                    ? 'Generando…'
                    : 'Crear un plan nuevo automáticamente'
          }
          tone="brand"
          divider
          disabled={regenState === 'generating' || regenState === 'pending_review'}
          onPress={
            regenState === 'generating' || regenState === 'pending_review'
              ? notifyPendingReview
              : handleRegen
          }
        />
```

Update the `notifyPendingReview` helper (added by the prior feature) so its copy is generic to both waiting states:

```typescript
  function notifyPendingReview() {
    Alert.alert(
      'En proceso',
      regenState === 'generating'
        ? 'Estamos generando tu plan. En breve estará listo.'
        : 'Ya tenés una rutina en revisión. Esperá la aprobación de tu coach.',
    );
  }
```

- [ ] **Step 2: Update performRegen success copy + accept 202**

In `performRegen`, `apiPost` already resolves on any 2xx (including 202), so no status check is needed. Update the success alert copy:

```typescript
      await apiPost('/athlete/skeleton/regenerate', {});
      Alert.alert('Generando tu plan', 'Estamos creando tu nuevo plan. En breve estará listo.');
```

Keep the existing `catch` branches (403 / 409 / 429 / else) unchanged.

- [ ] **Step 3: Type-check + repo check**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npm run ai:check`
Expected: no new type errors in `profile.tsx`; `ai:check` clean for the touched file. (The repo has pre-existing unrelated tsc noise in some `__tests__` files — confirm via git stash that any error is not in `profile.tsx`.)

- [ ] **Step 4: Run the app profile test (regression)**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test -- __tests__/athlete-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add "app/(app)/athlete/profile.tsx"
git commit -m "feat(profile): reflect regenState (generating/pending/failed) on regenerate button"
```

---

## Task 7: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Backend full suite**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test`
Expected: The new/updated suites pass. Pre-existing failures unrelated to this work (confirmed on `main`): `engine.service`, `migration-013`, `onboarding`, `session-routes`, `session`, `sync` — these 6 may still fail identically; anything else failing must be reconciled with this change.

- [ ] **Step 2: App full suite**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npm test`
Expected: PASS (all suites).

- [ ] **Step 3: Backend build**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm run build`
Expected: clean TypeScript compile (no references to the removed `regenerateSkeleton`).

---

## Self-Review Notes

- **Spec coverage:** job table → Task 1; enqueue + 202 + guard-incl-active-job + alert caller → Task 2; worker claim/retry/reap + wiring → Task 3; `regenState` on `/me` → Task 4; app hook → Task 5; app button/copy → Task 6; regression → Task 7. Reaper, retry, idempotent `runRegenJob`, and claim atomicity are all covered by Task 3 tests.
- **Integration with prior feature:** the `pendingReview` boolean is fully replaced by `regenState` (backend Task 4, app Tasks 5-6); the 409 guard is broadened to active jobs (Task 2); admin cola dedup is untouched (still only sees success-created `pending_review` skeletons).
- **Removed symbol:** `regenerateSkeleton` is deleted; both callers (route, alert.service) are updated in Task 2; Task 7 Step 3 build catches any missed reference.
- **Type consistency:** `enqueueRegenJob → { jobId }`, `runRegenJob → { skeletonId: string | null }`, `regenState` enum, and job status strings are identical across service, worker, route, and tests.
- **Test-DB caveat:** migration 048 is applied explicitly (Task 1 Step 2) and added to the truncation list (Task 1 Step 4) — without both, every `skeleton_regen_jobs` test would fail.
