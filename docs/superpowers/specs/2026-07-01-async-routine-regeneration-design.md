# Design: Async (background) routine regeneration

**Date:** 2026-07-01
**Repos:** `tr-fit-web` (backend + admin frontend), `tr-fit-app` (React Native / Expo)
**Builds on:** `2026-07-01-single-pending-rutina-design.md` (the 409 guard + `pendingReview` flag shipped there are modified here).

## Problem

`POST /athlete/skeleton/regenerate` runs the whole generation **inside the HTTP request**: `regenerateSkeleton` calls `generateSkeleton` (OpenAI, up to 5 validation retries, worst case ~2–3 min) before responding. When the athlete locks the phone or backgrounds the app, the OS suspends the socket, the app's `fetch` rejects, and the user sees "Error, reintentá" — even though Node usually keeps running and finishes the skeleton server-side. Combined with the new 409 guard, a retry then says "Rutina en revisión", which is confusing. Generation must run in the background: the request returns immediately and the work continues regardless of the client connection, surviving a server restart.

## Current behavior (verified)

- Route `POST /athlete/skeleton/regenerate` (`backend/src/routes/athlete.ts:45`) awaits `regenerateSkeleton(athleteId)` and returns `201 { skeletonId, status: 'pending_review' }`.
- `regenerateSkeleton` (`backend/src/services/skeleton-regen.service.ts`): advisory lock → guard (reject if a `pending_review` skeleton exists) → `generateSkeleton` (synchronous OpenAI) → `createPendingSkeleton` → `INSERT skeleton_regen_log`.
- `generateSkeleton` (`backend/src/services/openai.service.ts`): `MAX_ATTEMPTS = 5` synchronous validation retries; OpenAI SDK default timeout (~10 min); no `AbortSignal`.
- No request-timeout middleware; no client-disconnect cancellation. Work continues after disconnect but the client never sees the result.
- No job/queue table. `skeleton_regen_log` is audit-only (no status). Workers are in-process `node-cron`, started in `backend/src/index.ts:19-24` guarded by `NODE_ENV !== 'test'`.
- `GET /athlete/me` returns `pendingReview: boolean` (EXISTS `pending_review` skeleton). App disables the regenerate button on it; also a 409 catch backstop.
- Admin cola `listPendingForCoach` dedups to one `pending_review` per athlete.

## Decision

Durable job table + in-process worker (chosen over fire-and-forget and over an external queue lib). The request enqueues and returns `202` instantly; a worker polls the table, generates, and creates the skeleton; a reaper recovers jobs orphaned by a crash. Matches the existing in-process worker architecture without adding a dependency.

## Data model

New migration `backend/src/db/migrations/048_skeleton_regen_jobs.sql`:

```sql
CREATE TABLE skeleton_regen_jobs (
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

-- Worker claim query: cheap lookup of the next runnable job.
CREATE INDEX idx_regen_jobs_claim
  ON skeleton_regen_jobs(status, next_attempt_at);
-- "Active job for this athlete" guard/state lookups.
CREATE INDEX idx_regen_jobs_athlete_status
  ON skeleton_regen_jobs(athlete_id, status);
```

The `athlete_skeletons` `pending_review` row is created only on generation success — so the admin cola never sees in-flight rutinas and its dedup query is unchanged.

## Constants (backend, in the worker/service module)

- `MAX_JOB_ATTEMPTS = 3` — job-level retries (transient failures: OpenAI down, network). Independent of the 5 in-request validation retries inside `generateSkeleton`, which stay as-is.
- `STUCK_RUNNING_MS = 5 * 60_000` — a `running` job older than this is treated as crashed.
- `RETRY_BACKOFF_MS = 30_000` — on a retryable failure, `next_attempt_at = now() + backoff`.
- `WORKER_TICK_MS = 5_000` — poll interval.

## Components & flow

### 1. Enqueue — `enqueueRegenJob(athleteId)` (new, in `skeleton-regen.service.ts`)

Within a transaction + the existing per-athlete advisory lock:
- Guard: reject with `PendingReviewExistsError` if **either** an active job (`status IN ('queued','running')`) **or** a `pending_review` skeleton exists for the athlete.
- Else `INSERT skeleton_regen_jobs (athlete_id, status) VALUES ($1,'queued')` and return `{ jobId }`.

Route `POST /athlete/skeleton/regenerate` becomes:
- `try { const { jobId } = await enqueueRegenJob(userId); res.status(202).json({ jobId, status: 'queued' }); }`
- `catch (PendingReviewExistsError)` → `409 { message: 'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.' }` (unchanged copy).

The synchronous `regenerateSkeleton` is refactored: its generation body (lock → profile → exercises → `generateSkeleton` → `createPendingSkeleton` → log) moves into a `runRegenJob(athleteId)` used by the worker. The `pending_review`-only guard that used to live in `regenerateSkeleton` is now the enqueue guard (broadened to include active jobs).

### 2. Worker — `backend/src/workers/regen-worker.ts` (new)

`startRegenWorker()` runs `regenTick()` every `WORKER_TICK_MS` via `setInterval` (not `node-cron` — sub-minute). Started in `index.ts` beside the crons, inside the `NODE_ENV !== 'test'` block. `regenTick()`:

1. **Reaper:** requeue crashed jobs —
   ```sql
   UPDATE skeleton_regen_jobs
      SET status = 'queued', next_attempt_at = now()
    WHERE status = 'running' AND started_at < now() - interval '5 minutes';
   ```
2. **Claim one job atomically:**
   ```sql
   UPDATE skeleton_regen_jobs
      SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM skeleton_regen_jobs
       WHERE status = 'queued' AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    )
   RETURNING id, athlete_id, attempts;
   ```
   If no row, return (idle tick).
3. **Run:** `await runRegenJob(athleteId)`.
   - Success: `UPDATE ... SET status='done', finished_at=now()`. (The skeleton + `skeleton_regen_log` row are created inside `runRegenJob`.)
   - Failure: if `attempts < MAX_JOB_ATTEMPTS` → `SET status='queued', last_error=$msg, next_attempt_at = now() + 30s`; else `SET status='failed', last_error=$msg, finished_at=now()`.

Process one job per tick (throughput is tiny; keeps it simple and bounds OpenAI concurrency). Errors are caught per-tick and logged; a tick never throws out of the interval.

Edge cases: enqueue guard ensures ≤1 active job per athlete, so the reaper/claim never race two jobs for one athlete. `runRegenJob` keeps the existing advisory lock as defense-in-depth. If `runRegenJob` itself hits `PendingReviewExistsError` (a pending skeleton appeared between enqueue and run), treat it as success (`done`) — the desired end state already exists.

### 3. Status — `GET /athlete/me`

Replace `pendingReview: boolean` with `regenState: 'idle' | 'generating' | 'pending_review' | 'failed'`, computed as:
- `generating` — an active job (`queued`/`running`) exists.
- else `pending_review` — a `pending_review` skeleton exists.
- else `failed` — the athlete's most recent job is `failed` (and no active job / pending skeleton). Cleared on next enqueue (a new `queued` job flips state to `generating`).
- else `idle`.

Precedence as listed. `blockedReason`/`skeletonStatus` unchanged.

### App (tr-fit-app)

- `useAthleteProfile` (`lib/athlete-profile.ts`): replace `pendingReview: boolean` with `regenState: RegenState` (`'idle' | 'generating' | 'pending_review' | 'failed'`, default `'idle'`); keep the `useFocusEffect` refetch. Derive a `pending = regenState === 'generating' || regenState === 'pending_review'` boolean for the button where convenient.
- `profile.tsx` "Regenerar plan" row:
  - `generating` → disabled, sub `'Generando tu plan…'`.
  - `pending_review` → disabled, sub `'Rutina en revisión'`.
  - `failed` → **enabled**, sub `'No pudimos generar tu plan. Reintentá.'`, `onPress = handleRegen`.
  - `idle` → normal.
  - `performRegen` now expects `202` on success (accept 2xx); keep the 409 backstop. Update the success alert copy from "Plan en revisión / Tu coach revisará…" to reflect generation, e.g. title "Generando tu plan" / body "Estamos creando tu nuevo plan. En breve estará listo.".
- The `useFocusEffect` refetch means navigating back/forward re-polls; a successful enqueue moves the state to `generating` on next focus. (No in-screen live polling loop is added — out of scope; the focus refetch covers the app's real navigation. If desired later, a lightweight interval while `generating` can be added.)

## Migration / rollout notes

- Backward compatibility: the route response changes `201`→`202` and body `{ skeletonId }`→`{ jobId }`. The app treats any 2xx as success and does not read `skeletonId`, so old app builds keep working (they showed an alert and polled `/athlete/me`). No admin-side change.
- `regenState` replaces `pendingReview` in the `/me` payload. Both app tasks below update in lockstep; an old app build reading `pendingReview` would get `undefined` → treated as not-pending, i.e. button not disabled, but the backend 409 still protects correctness. Acceptable.

## Testing

Backend (integration, against `trfit_test`; mock `generateSkeleton` as the existing regen test does):
- `enqueueRegenJob`: creates a `queued` job, returns 202 via the route; rejects (409) when an active job exists; rejects (409) when a `pending_review` skeleton exists.
- `regenTick` claim+run: a `queued` job → `runRegenJob` (mocked generator) → a `pending_review` skeleton is created, `skeleton_regen_log` gets `approved_gen`, job → `done`.
- Retry: generator throws once → job returns to `queued` with `attempts=1`, `next_attempt_at` in the future, `last_error` set; still no skeleton.
- Fail: generator throws on the 3rd attempt → job → `failed`, `last_error` set, no skeleton.
- Reaper: a `running` job with `started_at` 6 min ago → requeued to `queued`.
- Claim atomicity: two concurrent `regenTick` calls claim at most one distinct job each (no double-claim) — `FOR UPDATE SKIP LOCKED`.
- `GET /athlete/me`: `regenState` is `generating` with an active job, `pending_review` with a skeleton, `failed` after a failed job, `idle` otherwise.

App (Jest + RTL):
- `useAthleteProfile` exposes `regenState`, defaults `'idle'` on error/omission.
- Update the existing hook shape assertion accordingly.

## Out of scope (YAGNI)

- No external queue lib (pg-boss/BullMQ), no separate worker process.
- No live in-screen polling loop (focus refetch suffices); no push notification on generation done (coach approval already notifies).
- No `AbortSignal`/request-cancellation work — moot once generation leaves the request.
- No admin UI for the job table.
