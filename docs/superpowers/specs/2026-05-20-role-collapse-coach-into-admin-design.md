# Role refactor: collapse `coach` into `admin`, add `superadmin`

## Context

`tr-fit-web` ships to a single client (Tato) who acts as both the application
admin and the only coach. The current role enum
`'athlete' | 'coach' | 'admin'` mirrors a multi-coach SaaS that does not exist
in practice. The app owner (the developer) needs a separate tier for
operational tasks they do over the client's deployment (statistics, billing,
support).

This spec collapses `coach` into `admin` and introduces a `superadmin` role
for the owner.

## Goals

- Single user enum: `'athlete' | 'admin' | 'superadmin'`.
- The existing coach user becomes an admin with no functional regression: they
  still see the operations screens (athletes / skeletons / alerts).
- A `superadmin` role exists for the owner and is reserved for future global
  capabilities (billing dashboard, impersonation).
- One clean cut. No backwards-compat shims; no dead `'coach'` references left
  in code or tests.

## Non-goals (future work, called out for clarity)

- **Superadmin billing dashboard** (`/admin/billing`) — owner-facing view of
  the client's MRR so the owner can charge a percentage. Stubbed only.
- **Impersonate / login-as** — future, not in this refactor.
- **Per-scope permissions table** — out of scope; the enum is enough today.

## 1. Data model

### Migration `023_role_collapse_coach.sql`

```sql
UPDATE users SET role = 'admin' WHERE role = 'coach';

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('athlete', 'admin', 'superadmin'));
```

Idempotent if `users_role_check` is missing (check `pg_constraint` first or
guard with `IF EXISTS`). Adapt to actual constraint name.

### Tables that mention "coach" — kept as-is

- `coach_profiles` — stores name/bio for the admin acting as coach. FK to
  `users.id`; the referenced user now has `role='admin'`. Rename is high
  churn, low value.
- `coach_alerts` — alerts addressed to the admin in their coach capacity.
  `coach_id` column points to a user with `role='admin'`. No data change.

### Superadmin bootstrap

Manual one-off:

```sql
UPDATE users SET role='superadmin' WHERE email='mmaldonado@zennovia.com';
```

Plus a helper script `backend/src/scripts/create-superadmin.ts` (clone of
`create-admin.ts` with `role='superadmin'`).

## 2. Backend

### Types

- `backend/src/middleware/auth.ts:7` — `AuthUser.role: 'athlete' | 'admin' | 'superadmin'`.
- `backend/src/domain/types.ts:154` — `AuthLoginResult.user.role` same union.
- `backend/src/services/admin.service.ts:12` — `type Role` same union.

### Middleware helpers

Extend `backend/src/middleware/role.ts`:

```ts
export const requireAdmin = requireRole('admin', 'superadmin');
export const requireSuperadmin = requireRole('superadmin');
```

Existing generic `requireRole(...roles)` is reused.

### Routes

- `backend/src/routes/coach.ts` → **rename to** `backend/src/routes/admin-ops.ts`.
  - Gate changes from `requireRole('coach')` to `requireAdmin`.
  - Mount point moves from `/api/coach` to `/api/admin/operations` in
    `backend/src/routes/index.ts`.
- `backend/src/routes/admin.ts` — keeps current mount `/api/admin` and uses
  `requireAdmin` (which accepts both admin and superadmin).
- All `requireRole('athlete')` routes (athlete, profile, exercises, sessions,
  alerts, onboarding, progress, push, subscriptions) — **no change**.
- Zod enums in `admin.ts:55, 69` (`role: z.enum(['athlete', 'coach', 'admin'])`)
  → `z.enum(['athlete', 'admin', 'superadmin'])`.

### Services

- `backend/src/services/coach.service.ts` → **rename to**
  `backend/src/services/operations.service.ts`. SQL untouched (it reads
  `coach_alerts` / joins `coach_profiles`, both kept).
- `backend/src/services/admin.service.ts:55-75` `listUsers` LEFT JOIN to
  `coach_profiles` continues to work; it returns the admin's name when
  available.

### Self-protection in `admin.ts` PATCH `/users/:id`

```text
if target.id === me.id:
  if me.role === 'superadmin': reject role changes to 'admin' or 'athlete';
                               reject status changes off 'approved'
  if me.role === 'admin':      reject role changes to 'athlete' or 'superadmin';
                               reject status changes off 'approved'
```

An admin cannot promote themselves to superadmin. Only an existing
superadmin can promote another admin to superadmin.

### Auth service

- Signup default stays `'athlete'` (`auth.service.ts:56`). Web signup remains
  a no-op for athletes (they use mobile).
- Login / refresh propagate whatever `users.role` says; no branching.

### Scripts

- `backend/src/scripts/create-coach.ts` — **delete**.
- `backend/src/scripts/setup-owner-coach.ts` — **delete** (replaced by
  `create-admin.ts` already shipped).
- `backend/src/scripts/create-admin.ts` — keep as-is.
- New `backend/src/scripts/create-superadmin.ts` — clone of create-admin
  with `role='superadmin'`.

## 3. Frontend

### Types

`frontend/src/types/api.ts:1`:

```ts
export type Role = 'athlete' | 'admin' | 'superadmin';
```

`AuthUser`, `User`, `AdminUser` inherit.

### Route guards

- `frontend/src/components/RequireCoach.tsx` — **delete**.
- `frontend/src/components/RequireAdmin.tsx` — guard passes for both
  `'admin'` and `'superadmin'`.
- New `frontend/src/components/RequireSuperadmin.tsx` — clone of
  `RequireAdmin` but `role === 'superadmin'`.

### Routes (`frontend/src/App.tsx`)

All under `<RequireAdmin>`:

```
/admin                              → Dashboard
/admin/pending                      → Pending
/admin/users                        → Users
/admin/users/:id                    → UserDetail
/admin/subscriptions                → Subscriptions
/admin/activity                     → Activity
/admin/operations                   → OperationsHome (formerly /coach)
/admin/operations/athletes          → Athletes
/admin/operations/athletes/:id      → AthleteDetail
/admin/operations/skeletons         → Skeletons
/admin/operations/skeletons/:id     → SkeletonReview
/admin/operations/alerts            → Alerts
```

The `<AppShell>` wrapper used today by `/coach` is renamed to
`<OperationsShell>` and mounted under `/admin/operations`. No
`<RequireCoach>` wrapper anywhere.

### Sidebar (`frontend/src/components/admin/Sidebar.tsx`)

Three groups become four:

```
PANEL        Resumen / Pendientes / Actividad
OPERACIONES  Home / Atletas / Skeletons / Alertas (badge count)   ← new
GESTIÓN      Usuarios / Suscripciones
SISTEMA      Ajustes (soon)
```

Footer of the sidebar shows a small `Superadmin` chip when
`user.role === 'superadmin'`.

### Login redirect (`frontend/src/pages/Login.tsx:24-31`)

```ts
if (role === 'admin' || role === 'superadmin') navigate('/admin');
else if (role === 'athlete') {
  clearAuth();
  toast('Esta web es solo para administradores');
  navigate('/login');
}
```

No `coach` branch.

### Admin UI components

- `RoleBadge.tsx:10` — add `superadmin: 'Superadmin'` label, distinctive
  styling (e.g. `bg-primary text-primary-foreground` to avoid collision
  with the brand color used for "active" states).
- `CreateUserDialog.tsx:36, 55, 123` — role options become
  `['athlete', 'admin', 'superadmin']`. Default `'athlete'`.
- `pages/admin/UserDetail.tsx` Estado tab — segmented role control accepts
  the three roles; self-protection guards kick in as defined in §2.
- `pages/admin/Users.tsx` filtros — `role` segmented control offers
  Cualquier rol / Atletas / Admins / Superadmins.
- `pages/admin/Pending.tsx` "Aprobar todos los athletes" — unchanged.
  Admins/superadmins pending approval still require manual review (one at
  a time).

### Mock handlers

`frontend/src/test/mocks/handlers.ts:12, 19` — replace `role: 'coach'` with
`role: 'admin'`.

## 4. Tests

### Backend integration fixtures

`backend/tests/integration/helpers/fixtures.ts`:

- Replace `createCoach()` with `createAdmin()`. Inserts `role='admin'`,
  still writes a row in `coach_profiles` (the operations services read
  from it).
- Add `createSuperadmin()` (same pattern).
- `createAthlete()` unchanged.

### Tests using `role: 'coach'`

The 16 files identified in the exploration step (skeletons, athlete-routes,
progress-routes, coach-*, alerts-routes, onboarding, push-routes,
subscriptions-routes, etc.) all use
`signToken({ id: ..., role: 'coach' })`. Find/replace `'coach'` → `'admin'`.

URL paths in those tests that hit `/coach/...` change to
`/admin/operations/...`. Find/replace.

Test files named `coach-*.test.ts` rename to `operations-*.test.ts`.

### Frontend tests

- `RequireCoach.test.tsx` — **delete**.
- New `RequireSuperadmin.test.tsx` — clone of RequireAdmin test but
  asserts superadmin passes and admin fails.
- `auth-storage.test.ts:21-22, 27` — `'coach'` → `'admin'`.

### Auth integration tests

`backend/tests/integration/auth.test.ts` — signup tests stay (athlete is
still the default). Login tests that assert `role: 'coach'` in the
response shift to `role: 'admin'`.

## 5. Implementation plan (commits)

1. `feat(role): migration + types` — Migration 023, type unions in backend
   and frontend, Zod enums updated. App will break for `/coach/*` paths
   between this commit and #2; commit #2 lands quickly after.
2. `feat(role): rename /coach → /admin/operations backend` — Move route
   file, change mount, rename service, gate via `requireAdmin`. Delete
   `setup-owner-coach.ts`.
3. `feat(role): rename /coach → /admin/operations frontend` — Routes,
   `OperationsShell`, Login redirect, Sidebar new section.
4. `feat(role): superadmin helpers + guard` — `RequireSuperadmin`,
   `requireSuperadmin` middleware, `RoleBadge` superadmin variant,
   `create-superadmin.ts` script, sidebar footer chip.
5. `refactor(tests): coach → admin` — Fixtures, mock handlers, 16 test
   files find-replaced, file renames. Tests green.
6. `chore(role): delete RequireCoach + create-coach.ts` — Final cleanup.

## 6. Verification post-refactor

- `docker compose down && docker compose up -d --build` boots clean.
- Login as `tatoroblesfit@gmail.com` redirects to `/admin`. Sidebar shows
  `OPERACIONES` group with Athletes / Skeletons / Alerts.
- `/admin/operations/athletes` lists athletes (parity with old
  `/coach/athletes`).
- Bootstrap superadmin: `npx tsx src/scripts/create-superadmin.ts
  mmaldonado@zennovia.com <pass>`. Login as that user; sidebar footer
  shows `Superadmin` chip.
- `backend/`: `npm test` green.
- `frontend/`: `npx tsc -p tsconfig.app.json --noEmit` clean,
  `npm test` green.

## 7. Risks & rollback

- **Rollback path**: revert the 6 commits + run a migration that adds
  `'coach'` back to the CHECK constraint. The single `coach` user would
  have to be UPDATE'd back; data otherwise untouched (`coach_profiles`,
  `coach_alerts` preserved through the refactor).
- **Token invalidation**: existing JWTs encode `role: 'coach'`. After
  migration the same user is `'admin'` in DB. The next token refresh
  rotates the role (`auth.service.ts:212-218` reads from DB). Until then,
  the JWT claims `'coach'` and routes that now require `'admin'` would
  reject. Mitigation: bump JWT TTL is overkill; simply force re-login by
  invalidating refresh tokens during deploy, or accept that the single
  user logs in again. Documented but not coded as automatic.
- **Tests churn**: 16 files touched, but find/replace is mechanical.
  Risk concentrated in URL changes (`/coach` → `/admin/operations`).

## Open questions

None. All design decisions confirmed with the user during brainstorming.
