# Role Collapse (coach → admin) + Superadmin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the `coach` role into `admin`, introduce a new `superadmin` role for the app owner, and rename `/coach/*` routes (frontend and backend) to `/admin/operations/*`.

**Architecture:** Single migration `023_role_collapse_coach.sql` rewrites the `users_role_check` constraint and migrates the one existing coach to admin. Backend routes/services/scripts are renamed; the existing generic `requireRole(...roles)` middleware is reused via two new helpers (`requireAdmin`, `requireSuperadmin`). Frontend introduces `RequireSuperadmin`, repurposes `RequireAdmin` to accept either tier, and reshapes the sidebar to expose an `OPERACIONES` group. The `coach_profiles` and `coach_alerts` tables keep their names — the data model is unchanged, only the role label of the owning user shifts.

**Tech Stack:** PostgreSQL 15 (CHECK constraint), Node 20 / Express 4 / TypeScript, Jest (backend), Vitest (frontend), React 19 + Vite + Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-20-role-collapse-coach-into-admin-design.md`

---

## File map

### Backend
- Create: `backend/src/db/migrations/023_role_collapse_coach.sql`
- Create: `backend/src/scripts/create-superadmin.ts`
- Modify: `backend/src/middleware/auth.ts` (role union)
- Modify: `backend/src/middleware/role.ts` (add `requireAdmin`, `requireSuperadmin` helpers)
- Modify: `backend/src/domain/types.ts` (`AuthLoginResult` role union)
- Modify: `backend/src/services/admin.service.ts` (`Role` union, Zod allowed roles, self-protection guards)
- Modify: `backend/src/routes/admin.ts` (Zod enums, switch to `requireAdmin`)
- Modify: `backend/src/routes/index.ts` (drop `/coach`, mount `/admin/operations`)
- Rename: `backend/src/routes/coach.ts` → `backend/src/routes/admin-ops.ts`
- Rename: `backend/src/services/coach.service.ts` → `backend/src/services/operations.service.ts`
- Delete: `backend/src/scripts/create-coach.ts`
- Delete: `backend/src/scripts/setup-owner-coach.ts`

### Frontend
- Create: `frontend/src/components/RequireSuperadmin.tsx`
- Modify: `frontend/src/components/RequireAdmin.tsx` (accept admin or superadmin)
- Modify: `frontend/src/types/api.ts` (`Role` union)
- Modify: `frontend/src/lib/auth-storage.ts` (role union)
- Modify: `frontend/src/App.tsx` (route table)
- Modify: `frontend/src/pages/Login.tsx` (redirect map)
- Modify: `frontend/src/components/AppShell.tsx` (rename to `OperationsShell`, update NAV paths)
- Modify: `frontend/src/components/admin/Sidebar.tsx` (add OPERACIONES group, superadmin footer chip)
- Modify: `frontend/src/components/admin/RoleBadge.tsx` (superadmin label/style)
- Modify: `frontend/src/components/admin/CreateUserDialog.tsx` (role options)
- Modify: `frontend/src/pages/admin/UserDetail.tsx` (role segmented control + self-protection)
- Modify: `frontend/src/pages/admin/Users.tsx` (role filter)
- Delete: `frontend/src/components/RequireCoach.tsx`

### Tests
- Modify: `backend/tests/integration/helpers/fixtures.ts` (replace `createCoach` with `createAdmin`, add `createSuperadmin`)
- Modify (find/replace): all 16 backend test files that sign tokens with `role: 'coach'` and hit `/coach/...` paths
- Rename test files matching `coach-*.test.ts` → `operations-*.test.ts`
- Modify: `frontend/src/test/mocks/handlers.ts` (replace `role: 'coach'`)
- Modify: `frontend/src/lib/auth-storage.test.ts` (role assertions)
- Delete: `frontend/src/components/RequireCoach.test.tsx`
- Create: `frontend/src/components/RequireSuperadmin.test.tsx`

---

## Task 1: Migration + type unions

**Goal:** Migrate the database to the new enum and update TypeScript / Zod types so every layer agrees on `'athlete' | 'admin' | 'superadmin'`. The app will be temporarily broken between this task and Task 2 because `/coach/*` mounts still reference the (now-invalid) `'coach'` enum in middleware. That gets fixed in Task 2 — commit and proceed.

**Files:**
- Create: `backend/src/db/migrations/023_role_collapse_coach.sql`
- Modify: `backend/src/middleware/auth.ts:7`
- Modify: `backend/src/domain/types.ts:154`
- Modify: `backend/src/services/admin.service.ts:12`
- Modify: `backend/src/services/admin.service.ts` (Zod enums at routes/admin.ts:55, 69 — actually in `routes/admin.ts`, see below)
- Modify: `backend/src/routes/admin.ts` (Zod enums in `listQuery`, `createBody`, `patchBody`)
- Modify: `frontend/src/types/api.ts:1`
- Modify: `frontend/src/lib/auth-storage.ts:8`

- [ ] **Step 1: Write migration `023_role_collapse_coach.sql`**

Create `backend/src/db/migrations/023_role_collapse_coach.sql`:

```sql
-- Collapse the `coach` role into `admin` and introduce `superadmin`.
-- Single client deployment: there is at most one coach user; promote them
-- in place so coach_profiles and coach_alerts rows continue to refer to a
-- valid user with role='admin'.

UPDATE users SET role = 'admin' WHERE role = 'coach';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('athlete', 'admin', 'superadmin'));
```

- [ ] **Step 2: Run migration locally and verify**

Run:

```bash
cd backend && npx tsx src/db/migrate.ts
```

Then verify:

```bash
docker compose exec -T postgres psql -U user -d mydb -c \
  "SELECT email, role FROM users ORDER BY created_at;"
docker compose exec -T postgres psql -U user -d mydb -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='users_role_check';"
```

Expected: any `tatoroblesfit@gmail.com` row now shows `role=admin`. The constraint definition shows `CHECK (role = ANY (ARRAY['athlete'::text, 'admin'::text, 'superadmin'::text]))`.

- [ ] **Step 3: Update backend type unions**

Edit `backend/src/middleware/auth.ts:7`:

```ts
export interface AuthUser {
  id: string;
  role: 'athlete' | 'admin' | 'superadmin';
}
```

Edit `backend/src/domain/types.ts:154` (search for `'athlete' | 'coach' | 'admin'`):

```ts
// inside AuthLoginResult.user
role: 'athlete' | 'admin' | 'superadmin';
```

Edit `backend/src/services/admin.service.ts:12`:

```ts
export type Role = 'athlete' | 'admin' | 'superadmin';
```

- [ ] **Step 4: Update Zod role enums in admin routes**

Edit `backend/src/routes/admin.ts` — replace every occurrence of
`z.enum(['athlete', 'coach', 'admin'])` with
`z.enum(['athlete', 'admin', 'superadmin'])`. Affects `listQuery` (around line 55),
`createBody`, and `patchBody`.

After editing, also adjust the self-protection guard in the same file
(`router.patch('/users/:id', ...)`, around lines 91–99) so that:

```ts
if (req.params.id === req.user!.id) {
  const me = req.user!;
  const wantsRoleChange =
    parsed.data.role !== undefined && parsed.data.role !== me.role;
  const wantsStatusChange =
    parsed.data.status !== undefined && parsed.data.status !== 'approved';
  if (wantsRoleChange || wantsStatusChange) {
    return res.status(400).json({ error: 'cannot_modify_self' });
  }
}
```

This generalises: an admin cannot demote themselves; a superadmin cannot
demote themselves to admin or athlete.

- [ ] **Step 5: Update frontend type unions**

Edit `frontend/src/types/api.ts:1`:

```ts
export type Role = 'athlete' | 'admin' | 'superadmin';
```

Edit `frontend/src/lib/auth-storage.ts:8` (replace the union):

```ts
role: 'athlete' | 'admin' | 'superadmin';
```

- [ ] **Step 6: Typecheck both packages**

```bash
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: both run with no output (clean). If a file references the old
`'coach'` literal (e.g. `Pending.tsx` filters `role === 'coach'`), defer
the fix to its target task — for now adjust only by widening unions, not
deleting branches. Concretely, if a TypeScript error mentions `'coach'`
being missing from `Role`, add an inline cast or temporarily widen as
needed; do NOT block this task on UI logic that gets rewritten in Task 3.

- [ ] **Step 7: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/db/migrations/023_role_collapse_coach.sql \
        backend/src/middleware/auth.ts \
        backend/src/domain/types.ts \
        backend/src/services/admin.service.ts \
        backend/src/routes/admin.ts \
        frontend/src/types/api.ts \
        frontend/src/lib/auth-storage.ts
git commit -m "feat(role): migration 023 + type unions (athlete/admin/superadmin)

- New role enum drops coach and adds superadmin
- Migration 023 promotes existing coach users to admin and rewrites
  users_role_check
- AuthUser, Role, AdminUser, AuthLoginResult unions updated
- Zod role enums in routes/admin.ts allow the new set
- Self-protection guard generalised: nobody can demote themselves

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend rename `/coach` → `/admin/operations`

**Goal:** Move the existing coach Express router and its service to live under `/api/admin/operations`, gated by `requireAdmin`. Tests are still asking for `/coach` paths and `role: 'coach'` tokens — they will fail after this task; that is expected and fixed in Task 5.

**Files:**
- Modify: `backend/src/middleware/role.ts`
- Rename: `backend/src/routes/coach.ts` → `backend/src/routes/admin-ops.ts`
- Rename: `backend/src/services/coach.service.ts` → `backend/src/services/operations.service.ts`
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/routes/admin.ts` (switch to `requireAdmin`)

- [ ] **Step 1: Add `requireAdmin` and `requireSuperadmin` helpers**

Edit `backend/src/middleware/role.ts`. After the existing `requireRole`
export, add:

```ts
export const requireAdmin = requireRole('admin', 'superadmin');
export const requireSuperadmin = requireRole('superadmin');
```

If `requireRole` is not exported with a rest-args signature, verify and
update its signature to `(...roles: AuthUser['role'][]) => RequestHandler`.

- [ ] **Step 2: Rename `routes/coach.ts` → `routes/admin-ops.ts`**

```bash
git mv backend/src/routes/coach.ts backend/src/routes/admin-ops.ts
```

Inside the new file, replace the top of the router setup:

```ts
import { requireAdmin } from '../middleware/role.js';
// ...other imports...

const router = Router();
router.use(requireAuth, requireAdmin);
```

(Replacing the previous `requireRole('coach')`.) All inner route handlers
keep their relative paths (`/athletes`, `/skeletons`, etc.); only the
mount point shifts in `routes/index.ts`.

Also update any `import` paths that referenced `coach.service` to use the
new `operations.service` filename (next step).

- [ ] **Step 3: Rename `services/coach.service.ts` → `services/operations.service.ts`**

```bash
git mv backend/src/services/coach.service.ts backend/src/services/operations.service.ts
```

In `routes/admin-ops.ts`, update imports:

```ts
import { listAthletesForCoach /* etc. */ } from '../services/operations.service.js';
```

Rename exported function `listAthletesForCoach` → `listAthletesForAdmin`.
Update internal callers (only inside `admin-ops.ts`).

In the service file body itself, only the function name changes; the SQL
that joins `coach_alerts` and `coach_profiles` stays exactly as-is.

- [ ] **Step 4: Update mount in `routes/index.ts`**

Edit `backend/src/routes/index.ts`:

```ts
import adminOps from './admin-ops.js';
// remove: import coach from './coach.js';

// remove: router.use('/coach', coach);
router.use('/admin/operations', adminOps);
```

Order of mounts: register `/admin/operations` BEFORE `/admin`. Express
walks the stack in order; `/admin/operations/...` requests must match the
operations router first, otherwise a more general `/admin` mount could
short-circuit (Express in fact greedy-matches the longer mount; ordering
is defensive).

- [ ] **Step 5: Switch `routes/admin.ts` to `requireAdmin`**

Edit `backend/src/routes/admin.ts`. Replace:

```ts
router.use(requireAuth, requireRole('admin'));
```

with:

```ts
import { requireAdmin } from '../middleware/role.js';
// ...
router.use(requireAuth, requireAdmin);
```

`requireAdmin` accepts both `admin` and `superadmin`. Existing
`requireRole` import line can be removed if unused.

- [ ] **Step 6: Typecheck and boot the backend**

```bash
cd backend && npx tsc --noEmit
```

Then in another terminal:

```bash
docker compose up -d --build backend
docker compose logs --tail 30 backend
```

Expected: backend starts, no startup error. Hitting `GET
http://localhost:5001/api/admin/operations/athletes` with a valid admin
JWT returns 200. Hitting `GET http://localhost:5001/api/coach/athletes`
returns 404 (mount is gone).

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/role.ts \
        backend/src/routes/admin-ops.ts \
        backend/src/routes/admin.ts \
        backend/src/routes/index.ts \
        backend/src/services/operations.service.ts
git rm backend/src/routes/coach.ts backend/src/services/coach.service.ts 2>/dev/null || true
git commit -m "feat(role): rename /coach → /admin/operations backend

- routes/coach.ts renamed to admin-ops.ts, mount point /admin/operations
- services/coach.service.ts renamed to operations.service.ts;
  listAthletesForCoach → listAthletesForAdmin
- New middleware helpers requireAdmin (admin+superadmin) and
  requireSuperadmin
- admin and admin-ops routers both gate via requireAdmin
- Backend tests now reference defunct /coach paths; fixed in Task 5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend rename `/coach` → `/admin/operations`

**Goal:** Move the existing coach UI under `/admin/operations`, surface it inside the admin sidebar as an `OPERACIONES` group, redirect login traffic accordingly, and stop importing `RequireCoach`.

**Files:**
- Modify: `frontend/src/components/AppShell.tsx` (rename component, update NAV)
- Modify: `frontend/src/components/RequireAdmin.tsx` (accept admin or superadmin)
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/admin/Sidebar.tsx`
- Modify: any file in `frontend/src/pages/coach/*` that hardcodes a `/coach/...` URL or that imports `AppShell`

- [ ] **Step 1: Update `RequireAdmin.tsx` to accept superadmin**

Edit `frontend/src/components/RequireAdmin.tsx` (the `if (user.role !==
'admin')` check, around line 25):

```ts
if (user.role !== 'admin' && user.role !== 'superadmin') {
  return <Navigate to="/login" replace />;
}
```

- [ ] **Step 2: Rename `AppShell` component file in place**

Keep the file at `frontend/src/components/AppShell.tsx` (existing imports
elsewhere are stable) but rename the exported symbol and update NAV
paths. Replace the top of the file:

```ts
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Home, Users, FileCheck, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const NAV: NavItem[] = [
  { to: '/admin/operations', label: 'Home', icon: Home },
  { to: '/admin/operations/athletes', label: 'Atletas', icon: Users },
  { to: '/admin/operations/skeletons', label: 'Skeletons', icon: FileCheck },
  { to: '/admin/operations/alerts', label: 'Alertas', icon: Bell },
];

export function AppShell() {
  // body unchanged
```

Inside the JSX, audit for any literal `/coach/...` strings (e.g. the
brand link, mobile-only links). Replace with the corresponding
`/admin/operations/...` path.

(Optional later cleanup: rename file to `OperationsShell.tsx` in a
follow-up; not in scope here.)

- [ ] **Step 3: Update Login redirect**

Edit `frontend/src/pages/Login.tsx` (the `if (user.role === 'admin')` /
`else if (user.role === 'coach')` block around lines 24–31):

```ts
if (user.role === 'admin' || user.role === 'superadmin') {
  navigate('/admin');
} else {
  clearAuth();
  toast.error('Esta cuenta no tiene acceso a la consola web');
}
```

- [ ] **Step 4: Rewire routes in `App.tsx`**

Edit `frontend/src/App.tsx`. Remove the import for `RequireCoach`:

```ts
// delete: import { RequireCoach } from '@/components/RequireCoach';
```

Delete the entire `<Route element={<RequireCoach>...}>` block (which
wraps the coach pages today) and re-mount the same children under
`<RequireAdmin>` with the new `/admin/operations/...` paths:

```tsx
<Route
  element={
    <RequireAdmin>
      <AppShell />
    </RequireAdmin>
  }
>
  <Route path="/admin/operations" element={<Home />} />
  <Route path="/admin/operations/athletes" element={<Athletes />} />
  <Route
    path="/admin/operations/athletes/:id"
    element={<AthleteDetail />}
  />
  <Route path="/admin/operations/skeletons" element={<Skeletons />} />
  <Route
    path="/admin/operations/skeletons/:id"
    element={<SkeletonReview />}
  />
  <Route path="/admin/operations/alerts" element={<Alerts />} />
</Route>
```

Keep the existing `/admin`, `/admin/pending`, `/admin/users`, etc. routes
intact under their existing `RequireAdmin + AdminShell` group.

If any `<Navigate from="/coach" to="/admin">` redirect makes sense as a
courtesy for bookmarks, skip it for now — old URLs simply 404.

- [ ] **Step 5: Update `Sidebar.tsx` to surface the OPERACIONES group**

Edit `frontend/src/components/admin/Sidebar.tsx`. Inside the `groups`
array, insert a new entry between `Panel` and `Gestión`:

```ts
import {
  Activity,
  AlertCircle,
  Clock,
  CreditCard,
  Dumbbell,
  FileText,
  Home as HomeIcon,
  LogOut,
  Settings,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react';

// inside the groups array, after the Panel group:
{
  label: 'Operaciones',
  items: [
    {
      key: 'ops-home',
      label: 'Home',
      icon: HomeIcon,
      to: '/admin/operations',
    },
    {
      key: 'ops-athletes',
      label: 'Atletas',
      icon: UsersIcon,
      to: '/admin/operations/athletes',
      matchPrefixes: ['/admin/operations/athletes'],
    },
    {
      key: 'ops-skeletons',
      label: 'Skeletons',
      icon: FileText,
      to: '/admin/operations/skeletons',
      matchPrefixes: ['/admin/operations/skeletons'],
    },
    {
      key: 'ops-alerts',
      label: 'Alertas',
      icon: AlertCircle,
      to: '/admin/operations/alerts',
    },
  ],
},
```

Adjust the `Home` import alias to avoid colliding with the existing
`Home` icon if it is already imported under a different name.

- [ ] **Step 6: Typecheck and boot the frontend**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
docker compose up -d --build frontend
```

Open `http://localhost:3000/admin` in a browser logged in as
`tatoroblesfit@gmail.com`. Expected: the sidebar shows the OPERACIONES
group with the four entries; `/admin/operations/athletes` renders the
same content the old `/coach/athletes` rendered. Bookmark
`http://localhost:3000/coach/athletes` returns 404 (acceptable).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AppShell.tsx \
        frontend/src/components/RequireAdmin.tsx \
        frontend/src/components/admin/Sidebar.tsx \
        frontend/src/pages/Login.tsx \
        frontend/src/App.tsx
git commit -m "feat(role): rename /coach → /admin/operations frontend

- App.tsx routes /coach/* removed; same pages now under
  /admin/operations/* gated by RequireAdmin
- AppShell NAV points to /admin/operations/*
- RequireAdmin accepts admin or superadmin
- Login redirects admin/superadmin to /admin; coach branch removed
- Sidebar gains OPERACIONES group (Home, Atletas, Skeletons, Alertas)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Superadmin scaffolding

**Goal:** Land everything the superadmin role needs *today*: a frontend guard component, a CLI script to mint one, a distinct RoleBadge variant, and a footer chip in the sidebar. Per the spec the superadmin-only billing dashboard is explicitly out of scope; this task only sets up the role so it can be granted and shown.

**Files:**
- Create: `frontend/src/components/RequireSuperadmin.tsx`
- Create: `backend/src/scripts/create-superadmin.ts`
- Modify: `frontend/src/components/admin/RoleBadge.tsx`
- Modify: `frontend/src/components/admin/Sidebar.tsx`
- Modify: `frontend/src/components/admin/CreateUserDialog.tsx` (role options)
- Modify: `frontend/src/pages/admin/Users.tsx` (role filter)
- Modify: `frontend/src/pages/admin/UserDetail.tsx` (Estado tab segmented control)

- [ ] **Step 1: Create `RequireSuperadmin.tsx`**

Create `frontend/src/components/RequireSuperadmin.tsx`:

```tsx
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';

export function RequireSuperadmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Skeleton className="h-9 w-72" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'superadmin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Add the superadmin badge variant**

Edit `frontend/src/components/admin/RoleBadge.tsx`. Replace the `LABELS`
map and badge call so it covers the new union:

```tsx
import { Badge } from '@/components/ui/badge';
import type { Role } from '@/types/api';

const LABELS: Record<Role, string> = {
  athlete: 'Atleta',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

export function RoleBadge({ role }: { role: Role }) {
  if (role === 'superadmin') {
    return <Badge variant="default">{LABELS.superadmin}</Badge>;
  }
  return <Badge variant="muted">{LABELS[role]}</Badge>;
}
```

(`variant="default"` ties to the near-black primary; we deliberately
avoid `variant="brand"` because the brand emerald is reserved for
active/commitment states per the design system rules.)

- [ ] **Step 3: Superadmin chip in the sidebar footer**

Edit `frontend/src/components/admin/Sidebar.tsx`. In the footer (where
the avatar + email + logout button live), conditionally render a chip
when the logged-in user is a superadmin:

```tsx
{user?.role === 'superadmin' && (
  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-primary-foreground">
    Super
  </span>
)}
```

Place it next to the user's name. Keep the existing logout button
intact.

- [ ] **Step 4: Update role options in `CreateUserDialog.tsx`**

Edit `frontend/src/components/admin/CreateUserDialog.tsx`. Replace:

```ts
const ROLES: Role[] = ['athlete', 'coach', 'admin'];
```

with:

```ts
const ROLES: Role[] = ['athlete', 'admin', 'superadmin'];
```

(Anywhere the dialog renders a button labelled `coach`, remove that
button — the rendering already uses `ROLES.map`, so a one-line change is
sufficient.)

- [ ] **Step 5: Update role filter in `Users.tsx`**

Edit `frontend/src/pages/admin/Users.tsx`. Replace the role segmented
control options:

```ts
<Segmented<RoleKey>
  value={role}
  onChange={onRole}
  options={[
    { key: 'all', label: 'Cualquier rol' },
    { key: 'athlete', label: 'Atletas' },
    { key: 'admin', label: 'Admins' },
    { key: 'superadmin', label: 'Superadmins' },
  ]}
/>
```

`RoleKey` already widens to the new union via `Role` import in Task 1.

- [ ] **Step 6: Update Estado tab segmented control in `UserDetail.tsx`**

Edit `frontend/src/pages/admin/UserDetail.tsx`. Locate the `Field
label="Rol"` block (inside the Estado tab) and replace the segmented
options:

```tsx
<Segmented<Role>
  value={role}
  onChange={setRole}
  options={[
    { key: 'athlete', label: 'Atleta' },
    { key: 'admin', label: 'Admin' },
    { key: 'superadmin', label: 'Superadmin' },
  ]}
/>
```

Tighten the `disabled` rule on the Guardar button: a non-superadmin
admin cannot promote anyone to superadmin. Approximately:

```ts
const cantSetSuper =
  role === 'superadmin' && me?.role !== 'superadmin';
```

…and disable the Save button when `cantSetSuper` is true; show a small
muted helper text explaining the restriction.

- [ ] **Step 7: Backend guard — only superadmin can promote to superadmin**

Edit `backend/src/routes/admin.ts`. In the `router.patch('/users/:id', ...)` handler, immediately after the existing self-protection block, add:

```ts
// Only a superadmin can promote anyone to superadmin (or demote a
// superadmin to admin/athlete).
const before = await getUser(req.params.id);
if (!before) return res.status(404).json({ error: 'not_found' });
const touchingSuperadmin =
  parsed.data.role === 'superadmin' || before.role === 'superadmin';
if (touchingSuperadmin && req.user!.role !== 'superadmin') {
  return res.status(403).json({ error: 'superadmin_only' });
}
```

Move the existing `const before = await getUser(...)` line that comes later in the handler so it is fetched only once. Add a Jest test in `backend/tests/integration/admin-routes.test.ts` (or create it if absent) covering:

1. Admin attempting to PATCH another user with `role: 'superadmin'` → 403.
2. Superadmin doing the same → 200.

- [ ] **Step 8: Create `create-superadmin.ts`**

Create `backend/src/scripts/create-superadmin.ts`:

```ts
import bcrypt from 'bcrypt';
import pool from '../db/connect.js';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('usage: tsx src/scripts/create-superadmin.ts <email> <password>');
  process.exit(1);
}

const BCRYPT_COST = 10;

async function main() {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET role='superadmin', status='approved',
                        email_verified=true,
                        email_verified_at=COALESCE(email_verified_at, NOW()),
                        password_hash=$1
         WHERE id=$2`,
      [hash, existing.rows[0].id],
    );
    console.log(`Updated existing user ${email} → superadmin/approved`);
  } else {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, role, status, email_verified, email_verified_at)
         VALUES ($1, $2, 'superadmin', 'approved', true, NOW())
         RETURNING id`,
      [email.toLowerCase(), hash],
    );
    console.log(`Created superadmin ${email} id=${r.rows[0].id}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 9: Smoke-test the script**

```bash
cd backend && npx tsx src/scripts/create-superadmin.ts mmaldonado@zennovia.com s3cret-pass
```

Verify in DB:

```bash
docker compose exec -T postgres psql -U user -d mydb -c \
  "SELECT email, role, status FROM users WHERE email='mmaldonado@zennovia.com';"
```

Expected: one row with `role=superadmin`, `status=approved`. Login as
that user; sidebar footer shows the `SUPER` chip.

- [ ] **Step 10: Typecheck and run admin route tests**

```bash
cd backend && npx tsc --noEmit
cd backend && npm test -- admin-routes
cd ../frontend && npx tsc -p tsconfig.app.json --noEmit
```

All clean / green.

- [ ] **Step 11: Commit**

```bash
git add backend/src/scripts/create-superadmin.ts \
        frontend/src/components/RequireSuperadmin.tsx \
        frontend/src/components/admin/RoleBadge.tsx \
        frontend/src/components/admin/Sidebar.tsx \
        frontend/src/components/admin/CreateUserDialog.tsx \
        frontend/src/pages/admin/Users.tsx \
        frontend/src/pages/admin/UserDetail.tsx
git commit -m "feat(role): superadmin scaffolding

- RequireSuperadmin guard component
- create-superadmin.ts CLI script (idempotent insert/update)
- RoleBadge gains a superadmin variant (primary near-black, not brand)
- Sidebar footer shows SUPER chip when logged-in user is superadmin
- CreateUserDialog, Users role filter, UserDetail Estado tab include
  the new role options
- Backend admin PATCH guard: only superadmin can promote to or demote
  from superadmin; frontend disable mirrors the rule

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tests — coach → admin

**Goal:** Bring the integration test suite back to green. Replace `createCoach` with `createAdmin`, swap every `role: 'coach'` token claim for `role: 'admin'`, retarget `/coach/...` requests at `/admin/operations/...`, and rename `coach-*.test.ts` files.

**Files:**
- Modify: `backend/tests/integration/helpers/fixtures.ts`
- Modify: every backend test file currently asserting coach behaviour (16 files identified in the spec)
- Rename: `backend/tests/integration/coach-*.test.ts` → `backend/tests/integration/operations-*.test.ts`
- Modify: `frontend/src/test/mocks/handlers.ts`
- Modify: `frontend/src/lib/auth-storage.test.ts`
- Delete: `frontend/src/components/RequireCoach.test.tsx`
- Create: `frontend/src/components/RequireSuperadmin.test.tsx`

- [ ] **Step 1: Rewrite `fixtures.ts`**

Edit `backend/tests/integration/helpers/fixtures.ts`. Replace the
`createCoach` export with two exports (keep the same return signature so
existing callers can be converted by name only):

```ts
export async function createAdmin(): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin') RETURNING id`,
    [`admin-${Date.now()}@test.local`, hash],
  );
  await pool.query(
    `INSERT INTO coach_profiles (user_id, name) VALUES ($1, $2)`,
    [rows[0].id, 'Admin Test'],
  );
  return rows[0].id;
}

export async function createSuperadmin(): Promise<string> {
  const hash = await bcrypt.hash('test-pass', 4);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'superadmin') RETURNING id`,
    [`super-${Date.now()}@test.local`, hash],
  );
  return rows[0].id;
}
```

Delete the old `createCoach` export.

`createAthlete` continues to expect a coach-equivalent owner; its
parameter is just a `string` (UUID), so callers can pass the
`createAdmin()` UUID. Update the in-file comment if it references a
"coach" relationship.

- [ ] **Step 2: Bulk find/replace in backend tests**

From `backend/tests/integration/`:

```bash
cd backend/tests/integration
# token-shape changes
grep -rl "role: 'coach'" . | xargs sed -i '' "s/role: 'coach'/role: 'admin'/g"
# fixture renames
grep -rl "createCoach" . | xargs sed -i '' 's/createCoach/createAdmin/g'
# URL changes
grep -rl "'/coach" . | xargs sed -i '' "s|'/coach|'/admin/operations|g"
grep -rl '"/coach' . | xargs sed -i '' 's|"/coach|"/admin/operations|g'
```

(macOS `sed -i ''` syntax; on GNU sed drop the `''`.)

Review the diff for false positives:

```bash
git diff --stat
git diff | grep -E '^[-+].*coach'
```

Manually inspect any line that still says `coach` outside of
`coach_profiles` / `coach_alerts` SQL — those are intentional and stay.

- [ ] **Step 3: Rename `coach-*.test.ts` files**

```bash
cd backend/tests/integration
for f in coach-*.test.ts; do
  git mv "$f" "${f/coach-/operations-}"
done
```

Inside those renamed files, fix the leading `describe('coach ...')`
title strings to read `describe('admin operations ...')`.

- [ ] **Step 4: Run backend tests**

```bash
cd backend && npm test
```

Expected: all green. Failures fall into three buckets, each with a
specific fix:

1. **Token role mismatch (403)** — find/replace missed a `role: 'coach'`
   site, fix it.
2. **404 on `/coach/...`** — find/replace missed a URL, fix it.
3. **Constraint violation** — fixture forgot to switch its INSERT from
   `'coach'` to `'admin'`; fix the SQL literal.

- [ ] **Step 5: Update frontend mocks and tests**

Edit `frontend/src/test/mocks/handlers.ts` lines 12 and 19: change the
mocked user role from `'coach'` to `'admin'`.

Edit `frontend/src/lib/auth-storage.test.ts` lines 21–22 and 27: change
the role literal from `'coach'` to `'admin'`.

Delete the obsolete coach guard test:

```bash
git rm frontend/src/components/RequireCoach.test.tsx
```

Create `frontend/src/components/RequireSuperadmin.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { RequireSuperadmin } from './RequireSuperadmin';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

let mockUser: { id: string; role: 'admin' | 'superadmin' } | null = null;

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/billing']}>
      <Routes>
        <Route path="/billing" element={children} />
        <Route path="/admin" element={<div>admin home</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSuperadmin', () => {
  it('renders children when user is superadmin', () => {
    mockUser = { id: 'u1', role: 'superadmin' };
    render(
      <Wrap>
        <RequireSuperadmin>
          <div>secret</div>
        </RequireSuperadmin>
      </Wrap>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('redirects admin to /admin', () => {
    mockUser = { id: 'u1', role: 'admin' };
    render(
      <Wrap>
        <RequireSuperadmin>
          <div>secret</div>
        </RequireSuperadmin>
      </Wrap>,
    );
    expect(screen.getByText('admin home')).toBeInTheDocument();
  });

  it('redirects unauthenticated to /login', () => {
    mockUser = null;
    render(
      <Wrap>
        <RequireSuperadmin>
          <div>secret</div>
        </RequireSuperadmin>
      </Wrap>,
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
```

(If the existing `RequireAdmin.test.tsx` uses a different mocking
pattern, mirror that pattern instead so the tooling is uniform.)

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/integration/ \
        frontend/src/test/mocks/handlers.ts \
        frontend/src/lib/auth-storage.test.ts \
        frontend/src/components/RequireSuperadmin.test.tsx
git commit -m "refactor(tests): coach → admin across integration + mocks

- fixtures.ts: replace createCoach with createAdmin, add createSuperadmin
- Bulk find/replace role: 'coach' → 'admin' across 16 backend test files
- Bulk find/replace /coach/* URLs → /admin/operations/*
- Rename coach-*.test.ts to operations-*.test.ts
- Frontend MSW handlers and auth-storage tests assert role admin
- New RequireSuperadmin.test.tsx; old RequireCoach.test.tsx removed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Cleanup

**Goal:** Remove every file that the refactor obsoleted, then verify the codebase has no lingering reference to a `coach` role.

**Files:**
- Delete: `frontend/src/components/RequireCoach.tsx`
- Delete: `backend/src/scripts/create-coach.ts`
- Delete: `backend/src/scripts/setup-owner-coach.ts`

- [ ] **Step 1: Delete the obsolete files**

```bash
git rm frontend/src/components/RequireCoach.tsx
git rm backend/src/scripts/create-coach.ts
git rm backend/src/scripts/setup-owner-coach.ts
```

- [ ] **Step 2: Hunt remaining `coach` references**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
grep -rn "'coach'" backend/src frontend/src \
  --include='*.ts' --include='*.tsx' | grep -v node_modules
grep -rn "/coach/" backend/src frontend/src \
  --include='*.ts' --include='*.tsx' | grep -v node_modules
grep -rn "RequireCoach\|AppShell.*coach" frontend/src \
  --include='*.tsx' | grep -v node_modules
```

Expected matches that are FINE (do not remove):
- `backend/src/services/operations.service.ts` referencing `coach_alerts` /
  `coach_profiles` table names in SQL strings — table names are stable.
- `backend/src/services/admin.service.ts` `LEFT JOIN coach_profiles` —
  same reasoning.
- `backend/src/db/migrations/*.sql` — historical files; never edit.
- `docs/superpowers/specs/...` — design docs reference the old word.

Anything else is a leftover and must be fixed before committing.

- [ ] **Step 3: Final typecheck**

```bash
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc -p tsconfig.app.json --noEmit
```

Both clean.

- [ ] **Step 4: Full test run**

```bash
cd backend && npm test
cd ../frontend && npm test -- --run
```

Both suites green.

- [ ] **Step 5: End-to-end smoke**

```bash
docker compose down
docker compose up -d --build
```

1. Login as the migrated coach (`tatoroblesfit@gmail.com`). Expected:
   redirected to `/admin`. Sidebar shows OPERACIONES group; clicking
   `Atletas` lands on `/admin/operations/athletes` and lists athletes.
2. Login as `mmaldonado@zennovia.com` (superadmin, created in Task 4).
   Expected: same `/admin`, but the sidebar footer shows the `SUPER`
   chip.
3. Hit `http://localhost:3000/coach/athletes` directly — expected 404
   handled by `NotFound`.

- [ ] **Step 6: Commit**

```bash
git commit -m "chore(role): delete RequireCoach + coach scripts

- frontend/src/components/RequireCoach.tsx removed (RequireAdmin covers
  the union)
- backend/src/scripts/create-coach.ts removed (superseded by create-admin)
- backend/src/scripts/setup-owner-coach.ts removed (was the bootstrap
  helper for the coach role)
- grep audit confirms no stray references to the 'coach' role remain
  outside historical migrations and the kept coach_profiles /
  coach_alerts table names

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Verification (post-Task 6)

- `git log --oneline` shows 6 new commits, one per task.
- `docker compose ps` shows backend, frontend, postgres all `healthy`.
- `cd backend && npm test` is green; `cd frontend && npm test -- --run` is green.
- Login as the migrated coach → `/admin` + OPERACIONES sidebar group renders.
- Login as the superadmin → same plus the footer chip.
- `curl http://localhost:5001/api/coach/athletes` returns 404; `curl http://localhost:5001/api/admin/operations/athletes` returns 401 without a token and 200 with an admin JWT.
- `grep -rn "role: 'coach'" backend frontend --include='*.ts' --include='*.tsx'` returns nothing.

## Out of scope (deferred per spec)

- Superadmin billing dashboard (`/admin/billing`) for the app owner's percentage revenue view.
- Impersonate / login-as.
- Permission scope table (`user_permissions`).
- JWT cache invalidation on deploy (documented in spec §7 risks; manual re-login suffices for the single coach user).
