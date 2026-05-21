# Admin Exercises CRUD — Design

**Date:** 2026-05-21
**Status:** Approved — pending implementation plan
**Scope:** Add an admin-managed Exercises module to the dashboard, replacing the hardcoded catalog currently used by the skeleton builder.

---

## 1. Goal

Enable admins (and superadmins) to manage the global exercises catalog from `/admin/exercises` in the existing dashboard: list with filters, create, edit, soft-archive, restore. Migrate the rutinas skeleton builder to consume the same DB-backed catalog instead of the hardcoded TS file.

## 2. Context

- **Tabla `exercises`** already exists (`backend/src/db/migrations/003_exercises.sql`) with full schema: `name UNIQUE`, `muscle_group`, `equipment` (enum), `movement_pattern` (enum), `is_principal`, `is_unilateral`, `level_min`, `contraindicated_for[]`, `default_increment_kg`, `alternatives_ids[]`, `video_url`, `illustration_url`.
- **Backend API** (`backend/src/routes/exercises.ts`) currently exposes only `GET /:id/alternatives` to athlete role. No admin CRUD.
- **Frontend dashboard** is React + Vite + shadcn/ui + TanStack Query. Admin pages live in `frontend/src/pages/admin/` and follow the pattern of `Users.tsx` + `useAdminUsers.ts`.
- **Hardcoded catalog** (`frontend/src/lib/exercisesCatalog.ts`) holds 30 sample exercises with a *different* equipment enum (`gym_completo | gym_basico | casa_basica | solo_bw`) than the DB schema. Used only by `components/admin/rutinas/EditSlotPopover.tsx`.
- **Auth:** `requireRole('admin')` accepts both `admin` and `superadmin` (see `backend/src/middleware/role.ts`).

## 3. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Delete semantics | Soft-delete via `archived_at TIMESTAMPTZ` | Zero FK risk; preserves session_logs & skeleton history |
| Hardcoded catalog | Migrate to API in this PR | Avoids drift between DB and hardcoded catalogs |
| Form fields | Full schema | Admin needs control over all attributes (alternatives, contraindications, etc.) |
| List+edit UI | Table + dialog modal | Familiar (mirrors Users.tsx); simpler than split-pane |
| Permissions | `requireRole('admin')` (admin + superadmin) | Consistent with rest of dashboard |
| Rollout | Single PR, no feature flag | Module is additive; migration is zero-downtime |

## 4. Architecture

### 4.1 New files

| Path | Purpose |
|---|---|
| `backend/src/db/migrations/0NN_exercises_archived.sql` | Adds `archived_at` column + partial index |
| `backend/src/db/seeds/exercises.seed.sql` | Seeds 30 base exercises if table empty |
| `backend/src/routes/admin-exercises.ts` | Admin CRUD router mounted at `/admin/exercises` |
| `backend/src/services/admin-exercise.service.ts` | DB ops: list, create, update, archive, restore |
| `backend/tests/integration/admin-exercises.test.ts` | Route + service integration tests (real DB) |
| `frontend/src/pages/admin/Exercises.tsx` | List page (table + filter bar + pagination) |
| `frontend/src/components/admin/exercises/ExerciseDialog.tsx` | Create/edit dialog with full form |
| `frontend/src/hooks/useAdminExercises.ts` | React Query hooks (list, create, update, archive, restore, search) |

### 4.2 Modified files

| Path | Change |
|---|---|
| `backend/src/routes/exercises.ts` | Add `GET /exercises` list endpoint (readable by `admin` + `athlete`); filters out archived |
| `backend/src/app.ts` | Mount `/admin/exercises` router |
| `frontend/src/App.tsx` | Add route `/admin/exercises` under `<AdminShell>` + `<RequireAdmin>` |
| `frontend/src/components/admin-shell/*` (Sidebar/nav component — exact path resolved during impl) | Add "Ejercicios" nav item (Dumbbell icon) |
| `frontend/src/components/admin/rutinas/EditSlotPopover.tsx` | Replace `searchExercises` import with `useExercisesSearch` hook |

### 4.3 Deleted files

| Path | Reason |
|---|---|
| `frontend/src/lib/exercisesCatalog.ts` | Replaced by DB-backed API |

### 4.4 Boundaries

- **Service layer**: pure DB operations, no HTTP awareness. Throws typed errors (`'not_found' | 'name_taken'`).
- **Route layer**: auth + zod validation + maps service errors to HTTP status codes.
- **Hook layer**: React Query keys = `['admin', 'exercises', filters]`. Mutations invalidate matching keys.
- **Page layer**: composition only — no business logic.

## 5. API contract

Base: `/admin/exercises`. Middleware: `requireAuth, requireRole('admin')`.

### 5.1 `GET /admin/exercises`

Query params:
- `q?: string` — substring match on `name`
- `muscle_group?: string`
- `equipment?: enum`
- `movement_pattern?: enum`
- `archived?: 'true' | 'false' | 'all'` (default `'false'`)
- `limit?: int` (default 50, max 200)
- `offset?: int` (default 0)

Response 200:
```ts
{ items: Exercise[], total: number }
```

### 5.2 `GET /admin/exercises/:id`

- 200 → `{ exercise: Exercise }`
- 404 → `{ error: 'not_found' }`

### 5.3 `POST /admin/exercises`

Body: full `Exercise` minus `id` and `archived_at`. Validated with zod matching DB CHECK constraints.

- 201 → `{ exercise: Exercise }`
- 400 → `{ error: 'invalid_payload', issues: ZodIssue[] }`
- 409 → `{ error: 'name_taken' }`

### 5.4 `PATCH /admin/exercises/:id`

Body: partial `Exercise`. Same validations as POST.

- 200 → `{ exercise: Exercise }`
- 400 / 404 / 409 as above

### 5.5 `DELETE /admin/exercises/:id`

Soft-delete — sets `archived_at = now()`. Idempotent (re-archiving = no-op, still 200).

- 200 → `{ archived: true }`
- 404 → `{ error: 'not_found' }`

### 5.6 `POST /admin/exercises/:id/restore`

Clears `archived_at`. No-op if not archived.

- 200 → `{ exercise: Exercise }`
- 404 → `{ error: 'not_found' }`

### 5.7 Modified: `GET /exercises`

Extends existing router. Accessible by `admin` + `athlete` roles. Returns only non-archived exercises. Used by skeleton builder.

Query: `q?`, `limit?` (default 8, max 50).

Response: `{ items: Exercise[] }`.

### 5.8 `Exercise` type

```ts
{
  id: number;
  name: string;
  muscle_group: string;
  equipment: 'barra'|'mancuerna'|'maquina'|'polea'|'smith'|'bw'|'pesa_rusa'|'elastico'|'disco';
  movement_pattern: 'squat'|'hinge'|'push_h'|'push_v'|'pull_h'|'pull_v'|'isolation'|'core'|'cardio';
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: 'principiante'|'intermedio'|'avanzado';
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
  archived_at: string | null;  // ISO timestamp
}
```

## 6. UI

### 6.1 Page `/admin/exercises`

**Header:** Title "Ejercicios" + `+ Nuevo ejercicio` button (top-right, opens dialog in create mode).

**Filter bar (sticky):**
- Search input (debounced 300ms) → `q`
- Select `muscle_group` (options populated from API data)
- Select `equipment` (fixed enum)
- Select `movement_pattern` (fixed enum)
- Toggle "Mostrar archivados" → `archived=all`
- "Limpiar filtros" button when any filter active

**Table columns:**
| Nombre | Grupo | Equipo | Patrón | Principal | Unilateral | Nivel | Acciones |

- Row click → dialog in edit mode
- Archived rows: `opacity-50` + "Archivado" badge
- Actions column: edit (pencil) + archive/restore icon (based on state)
- Pagination footer: `← Anterior | página X de Y | Siguiente →`
- Empty state: "No hay ejercicios. Crea uno con el botón de arriba."
- Loading: skeleton rows

### 6.2 Dialog `ExerciseDialog.tsx`

Form via `react-hook-form` + zod resolver. Two columns md+, one column on mobile.

**Columna 1 (básico):**
- `name` (required)
- `muscle_group` (autocomplete from existing values)
- `equipment` select
- `movement_pattern` select
- `level_min` select
- `default_increment_kg` (number, step 0.5)
- `is_principal` checkbox
- `is_unilateral` checkbox

**Columna 2 (avanzado):**
- `contraindicated_for` chip input (multi-string)
- `alternatives_ids` picker — autocomplete searching other exercises by name, chips removable
- `video_url` text
- `illustration_url` text + image preview if URL valid

**Footer:**
- Create: `Cancelar | Crear`
- Edit: `Cancelar | Archivar/Restaurar | Guardar`
- Archive action shows a confirm sub-dialog: "Se ocultará del catálogo. Historial intacto. Confirmar?"
- Save state: button disabled + spinner during mutation

**Error mapping:**
- `name_taken` → inline error on `name` field: "Ya existe un ejercicio con ese nombre"
- `invalid_payload` → toast + highlight individual zod errors

**Toasts** (shadcn `useToast`): "Ejercicio creado", "Cambios guardados", "Archivado", "Restaurado".

### 6.3 Sidebar entry

Item "Ejercicios" with `Dumbbell` (lucide) icon, placed near Rutinas in the existing nav order.

## 7. Data migration

### 7.1 Equipment enum mismatch

Hardcoded catalog uses `gym_completo | gym_basico | casa_basica | solo_bw` (availability dimension). DB schema uses concrete equipment (`barra | mancuerna | ...`). The DB schema is the correct source of truth. The hardcoded values are discarded — each of the 30 sample exercises is manually mapped to a real `equipment` + `movement_pattern` in the seed file.

### 7.2 Seed file

`backend/src/db/seeds/exercises.seed.sql`:
- Inserts 30 base exercises with full mapping (manually curated, e.g. "Press banca" → `barra, push_h, principal=true`; "Sentadilla" → `barra, squat, principal=true`).
- Uses `INSERT ... ON CONFLICT (name) DO NOTHING` so it's safe to re-run.

### 7.3 Pre-flight check

Before running seed in any environment: query `SELECT count(*), max(id), array_agg(name ORDER BY id) FROM exercises;` to confirm current state. Behavior:
- If table is **empty** → seed inserts all 30 with SERIAL-assigned IDs.
- If table **already has rows** → `ON CONFLICT (name) DO NOTHING` ensures existing names (and their IDs) are preserved untouched. Skeletons that reference those IDs continue to resolve. New names from the seed are inserted with fresh SERIAL IDs.

The seed never assumes IDs match the old hardcoded TS file; the hardcoded IDs (1..30) are discarded along with the file.

### 7.4 Migration `archived_at`

```sql
ALTER TABLE exercises ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX idx_exercises_active ON exercises(id) WHERE archived_at IS NULL;
```

Additive, nullable, default NULL. Zero-downtime.

## 8. Skeleton-builder cutover

`frontend/src/components/admin/rutinas/EditSlotPopover.tsx`:

```tsx
// Before
import { searchExercises, type CatalogExercise } from '@/lib/exercisesCatalog';
const results = useMemo(() => (open ? searchExercises(query, 8) : []), [open, query]);

// After
import { useExercisesSearch } from '@/hooks/useAdminExercises';
const { data: results = [] } = useExercisesSearch(query, { enabled: open, limit: 8 });
```

`useExercisesSearch` consumes `GET /exercises?q=...&limit=8`. The `Exercise` type replaces `CatalogExercise`. Fields consumed by the popover (`id`, `name`, `muscle_group`) remain present; extra fields are ignored.

Then delete `frontend/src/lib/exercisesCatalog.ts`.

## 9. Testing

### 9.1 Backend integration tests (real DB, no mocks)

`backend/tests/integration/admin-exercises.test.ts`:
- Auth: 401 unauthenticated, 403 as `athlete`, 200 as `admin` and `superadmin`
- `GET list`: pagination (limit/offset), filters (q, muscle_group, equipment, movement_pattern), `archived` flag values
- `POST create`: valid → 201 + row exists in DB; duplicate name → 409; invalid enum → 400
- `PATCH`: partial update; rename to existing → 409; non-existent id → 404
- `DELETE`: sets `archived_at`; idempotent
- `POST restore`: clears `archived_at`; no-op when not archived
- `GET /exercises` (athlete and admin) excludes archived

### 9.2 Frontend tests

- `useAdminExercises`: correct query keys, mutations invalidate (`vitest` + `msw`)
- `ExerciseDialog`: required validation, `name_taken` error mapping, mutation payload shape
- `Exercises` page: filters trigger refetch, row click opens edit dialog, archive shows confirm sub-dialog
- Smoke: skeleton-builder popover renders API-driven results

### 9.3 Manual QA checklist

1. Login admin → sidebar shows "Ejercicios"
2. Create exercise → appears in list
3. Edit exercise → changes persist after reload
4. Archive → hidden by default, visible with "Mostrar archivados" toggle
5. Restore → reappears in active list
6. Create with existing name → inline error
7. Skeleton builder popover → DB-driven results, search by name/muscle works
8. Existing rutina still opens with its referenced exercises intact (no broken IDs)

## 10. Rollout

- Single PR, single deploy
- Migration is additive (nullable column) — zero-downtime
- Seed only runs when table empty (ON CONFLICT)
- No feature flag — all admins see the module immediately on deploy
- Rollback: `ALTER TABLE exercises DROP COLUMN archived_at` + revert code. No data loss.

## 11. Out of scope (future)

- Media uploader (upload video/image to S3 or Supabase storage)
- Bulk CSV import
- Tabs in detail view: usage history, athletes with this exercise assigned
- Coach-level private catalogs (multi-tenant exercises)
