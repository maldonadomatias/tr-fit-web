# Design: One pending rutina per user + block app regeneration

**Date:** 2026-07-01
**Repos:** `tr-fit-web` (backend + admin frontend), `tr-fit-app` (React Native / Expo)

## Problem

Athletes can request routine regeneration repeatedly. Each call to
`POST /athlete/skeleton/regenerate` inserts a **new** `pending_review` skeleton,
so pending requests accumulate. The admin "cola de pendientes"
(`/admin/rutinas`) then shows several rows for the same athlete. It should show
**one row per user** (the latest). And in the app profile, if a pending rutina
already exists, the user must not be able to request another regeneration.

## Current behavior (verified)

- Table `athlete_skeletons` with `status IN ('pending_review','approved','rejected','superseded')`
  (`backend/src/db/migrations/005_skeletons.sql`).
- `regenerateSkeleton(athleteId)` (`backend/src/services/skeleton-regen.service.ts`):
  acquires a per-athlete advisory lock, generates via OpenAI, calls
  `createPendingSkeleton` → always inserts a new `pending_review` row. No dedup.
- Route `POST /athlete/skeleton/regenerate` (`backend/src/routes/athlete.ts:45`)
  is always allowed (tier gating removed); returns `201`.
- Admin queue `listPendingForCoach(coachId)`
  (`backend/src/services/skeleton.service.ts:323`): `WHERE status='pending_review'`,
  `ORDER BY created_at ASC` — returns every pending row.
- `GET /athlete/me` (`backend/src/routes/athlete.ts:53`) returns
  `skeletonStatus: skeleton.status` from `findActiveByAthlete`, which — when
  program state exists — reports the **active/approved** skeleton's status, NOT a
  newer pending one. So `skeletonStatus` cannot be used to detect a pending regen.
- App profile `app/(app)/athlete/profile.tsx`: "Regenerar plan" `SettingsRow`
  → `handleRegen` → `performRegen` → `apiPost('/athlete/skeleton/regenerate', {})`.
  Catch already handles `403` and `429`.
- App hook `useAthleteProfile` (`lib/athlete-profile.ts`) fetches `/athlete/me`
  but only exposes `profile` (drops `skeletonStatus`/`blockedReason`).

## Decisions

- Backend guard: **reject with 409** when a pending already exists (chosen over
  supersede-and-replace). No new pending is created while one is in review.
- App block: **disable the button** driven by an authoritative backend flag, and
  trust the backend as the source of truth (409 backstop for races).
- Admin cola: **read-time dedup** to one row per athlete (latest), rather than a
  destructive cleanup migration — fixes pre-existing accumulated duplicates safely.

## Changes

### Backend (tr-fit-web)

**1. 409 guard on regenerate**
`backend/src/services/skeleton-regen.service.ts`: after acquiring the advisory
lock (race-safe) and **before** the OpenAI call, run:
```sql
SELECT EXISTS(
  SELECT 1 FROM athlete_skeletons
  WHERE athlete_id = $1 AND status = 'pending_review'
)
```
If true, throw a typed `PendingReviewExistsError`.
`backend/src/routes/athlete.ts` `POST /skeleton/regenerate`: catch that error →
respond `409` with JSON `{ message: 'Ya tenés una rutina en revisión. Esperá a que tu coach la apruebe.' }`.
No new skeleton row and no `skeleton_regen_log` write on the blocked path.

**2. `pendingReview` flag on `/athlete/me`**
`backend/src/routes/athlete.ts` `GET /me`: add the same `EXISTS` query and
include `pendingReview: boolean` in the JSON response, alongside the existing
`skeletonStatus`/`blockedReason`.

**3. Admin cola dedup**
`backend/src/services/skeleton.service.ts` `listPendingForCoach`: return one row
per athlete (the most recent pending). Use `DISTINCT ON (s.athlete_id)` ordered by
`s.athlete_id, s.created_at DESC` in an inner query, then order the outer result
`created_at ASC` to preserve the current FIFO display. Shape of returned rows is
unchanged (`id, athlete_id, created_at, generation_rationale, athlete_name`), so
the admin frontend (`usePendingRutinas`, `PendingRutina`) needs no change.

### App (tr-fit-app)

**4. Expose `pendingReview`**
`lib/athlete-profile.ts`: add `pendingReview: boolean` to `MeResponse` and return
it from `useAthleteProfile` (default `false`).

**5. Disable the regenerate button**
`app/(app)/athlete/profile.tsx`: read `pendingReview` from the hook. On the
"Regenerar plan" `SettingsRow`:
- when `pendingReview` is true → disabled/grayed, `sub = 'Rutina en revisión'`,
  and tapping shows an info alert `'Ya tenés una rutina en revisión. Esperá la aprobación de tu coach.'` (no network call).
- `performRegen` catch: add a `409` branch showing the backend message (race backstop).

If `SettingsRow` lacks a `disabled`/dimmed affordance, add a minimal one
(reduced opacity + guarded `onPress`) following the existing component style.

## Out of scope (YAGNI)

- No supersede-on-create safety net (409-reject chosen instead).
- No destructive migration to clean historical duplicate pendings (read-time
  dedup covers display).
- No new `skeleton_regen_log.result` value for blocked attempts (would need a
  migration; low value).

## Test plan

- Backend unit/integration: regenerate with no pending → `201`; regenerate with an
  existing `pending_review` → `409`, and no second row inserted. `/athlete/me`
  returns `pendingReview: true` when a pending exists, `false` otherwise.
- `listPendingForCoach` with two `pending_review` rows for one athlete → returns a
  single row (the latest).
- App: with `pendingReview: true`, button is disabled and makes no request; alert
  shown on tap. With `false`, normal flow works.
