# Single-Coach Owner Model — Design

**Date:** 2026-05-13
**Scope:** `tr-fit-web` backend + DB
**Status:** approved, pending implementation plan

## Problem

The app has a single real coach (the business owner). Currently the
backend supports any number of users with `role='coach'` and routes new
athletes to the first such user by `created_at`. In the dev DB this
points to a leftover seed user (`coach-1778522361503@test.local`),
which means the actual admin login (`test@test.com`) sees zero
athletes even though they were onboarded successfully.

The user wants:
- One canonical coach account (`tatoroblesfit@gmail.com`).
- All new athletes routed to that account.
- All existing athletes re-routed to that account.
- Admin login = canonical coach login → sees every athlete.

## Goals

- Make athlete-to-coach assignment deterministic against a single,
  configured account.
- Backfill existing data so the admin dashboard works immediately.
- Fail loudly if the configured coach is missing (instead of silently
  routing to a stranger).
- Idempotent setup script for fresh environments.

## Non-goals

- Multi-coach / team membership model (deferred; if multiple admins
  are ever required, a separate `coach_team` design lands later).
- Changes to coach-side query scoping (`WHERE coach_id = req.user.id`
  stays). All coach reads will see "their" athletes — which, in this
  model, is everyone.
- Frontend / mobile changes.
- Deleting the stale dev coaches (left in place as inert rows).
- Password rotation policy (a one-time temporary password is set; the
  owner is expected to rotate via the reset-password flow).

## Architecture

### Configuration

- New env var `OWNER_COACH_EMAIL` (required string, must be a valid
  email). Validated in `backend/src/config/env.ts` alongside the
  existing zod schema.
- `backend/env.example` updated with the new key and a comment
  pointing operators at the setup script.

### Onboarding routing

`backend/src/routes/onboarding.ts` currently runs:

```sql
SELECT id FROM users WHERE role = 'coach' ORDER BY created_at ASC LIMIT 1
```

This is replaced with:

```sql
SELECT id FROM users WHERE email = $1 AND role = 'coach'
```

The parameter is `env.OWNER_COACH_EMAIL`. If the query returns no row,
the route responds `500 { error: 'owner_coach_missing' }` and logs an
explicit error pointing at the setup script. We do not silently
fall back to a different coach — that's the exact behavior we are
fixing.

### Setup script

A new idempotent script `backend/src/scripts/setup-owner-coach.ts`
performs three actions inside one transaction:

1. **Ensure the user exists.** Look up `OWNER_COACH_EMAIL` in `users`.
   - If missing, insert with `role='coach'`, `email_verified=TRUE`,
     `email_verified_at=NOW()`, and the hashed password supplied via
     the script's CLI argument. Also insert the matching
     `coach_profiles` row.
   - If present, verify `role='coach'`. If the existing row has a
     different role, abort with a clear error (don't silently mutate).
2. **Backfill `athlete_profiles.coach_id`.** Run
   `UPDATE athlete_profiles SET coach_id = $ownerId WHERE coach_id IS DISTINCT FROM $ownerId`.
   Print the row count.
3. **Backfill `coach_alerts.coach_id`.** Same idea for the alerts
   table so any historical alerts route to the owner.
4. Commit.

CLI usage:

```bash
npx tsx src/scripts/setup-owner-coach.ts <password>
```

Password is required only when the user does not exist (creation
case). When the user is already present, the script ignores the
password argument and proceeds straight to the backfill.

### Touched files

- `backend/env.example` (new key)
- `backend/src/config/env.ts` (load `OWNER_COACH_EMAIL`)
- `backend/src/routes/onboarding.ts` (single SQL change + error path)
- `backend/src/scripts/setup-owner-coach.ts` (new)
- `backend/tests/integration/onboarding.test.ts` (assert routing to
  the env-configured coach)
- `backend/tests/unit/setup-owner-coach.test.ts` (idempotency unit
  test using a temp DB or mocked pool — see Testing below)
- `backend/.env` (local only, not committed): operator adds
  `OWNER_COACH_EMAIL=tatoroblesfit@gmail.com`

## Data flow

```
[Mobile onboarding] ──► POST /onboarding/complete
                          ├─ SELECT id FROM users WHERE email = OWNER_COACH_EMAIL AND role='coach'
                          ├─ INSERT athlete_profiles (… coach_id = owner.id …)
                          └─ AI skeleton generation

[Admin login (tatoroblesfit@gmail.com)] ──► role=coach, req.user.id = owner.id
[Coach queries] ──► WHERE coach_id = req.user.id matches every athlete
```

## Error handling

| Condition                                       | Response                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `OWNER_COACH_EMAIL` missing/invalid at boot     | Backend fails to start (zod env validation throws as today)         |
| Owner coach not in `users` during /onboarding   | `500 { error: 'owner_coach_missing' }`, logs setup-script hint      |
| Owner exists with wrong role (e.g. 'athlete')   | Setup script aborts with `WRONG_ROLE` before any update             |
| Setup script run twice                          | No-op on existing user; second backfill updates 0 rows              |

## Testing strategy

- **Integration:** Update `tests/integration/onboarding.test.ts` so
  the test fixture seeds a coach with the same email the env points
  to, and asserts the new athlete's `coach_id` equals that user. The
  existing "auto-assigns first coach" assertion is rewritten to
  "auto-assigns owner coach".
- **Unit:** A targeted test for the setup script's idempotency. Run
  twice in sequence and assert: 1 user created, 1 coach_profiles row
  created, second run touches 0 rows.
- **Manual smoke:** Run the script with the chosen password, log in
  as `tatoroblesfit@gmail.com` on the web admin, confirm the recently
  onboarded athlete is visible.

## File summary

**New (2):**
- `backend/src/scripts/setup-owner-coach.ts`
- `backend/tests/unit/setup-owner-coach.test.ts`

**Modified (4):**
- `backend/env.example`
- `backend/src/config/env.ts`
- `backend/src/routes/onboarding.ts`
- `backend/tests/integration/onboarding.test.ts`

## Operator runbook (post-merge)

1. Add to `backend/.env`:
   ```
   OWNER_COACH_EMAIL=tatoroblesfit@gmail.com
   ```
2. Restart backend.
3. Run once per environment:
   ```
   npx tsx src/scripts/setup-owner-coach.ts <password>
   ```
4. Log in to admin with the chosen credentials. Rotate the password
   via the reset-password flow at your convenience.
