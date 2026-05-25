# Admin Active Routine Editor — Design

Date: 2026-05-25
Status: Approved (brainstorm)
Author: maldona2

## Problem

Admin currently has no UI to view or edit an athlete's **active** routine. `/admin/rutinas` only shows the `pending_review` approval queue. After approval, the skeleton becomes the athlete's training program (`athlete_program_state.active_skeleton_id`), and the only way to change it is by rejecting + waiting for AI to regenerate. Admin needs to make manual per-exercise changes (swap exercise, edit notes, add/remove slots, reorder) without round-tripping through regeneration.

## Goals

- View the active (approved) routine of any athlete from the admin panel.
- Edit individual slots in place: swap exercise, edit notes, add/remove slots, reorder within and across days.
- Discoverability via `/admin/rutinas` (extended) and a deep link from `/admin/users/:id`.

## Non-goals

- Versioning / history of edits (in-place mutation; v1 has no audit trail beyond what already exists).
- Editing skeletons in status other than `approved` and currently active.
- Bulk operations across multiple athletes.
- Mobile-specific layout (matches existing admin desktop-first patterns).
- Live collaboration / optimistic locking between concurrent admins.
- Editing `skeleton_days.focus`.

## Routing

```
/admin/rutinas                      → tab "Cola", lista pending_review (existing)
/admin/rutinas/:skeletonId          → tab "Cola", detalle pending (existing)
/admin/rutinas/atleta               → tab "Activas", lista atletas con approved skeleton (new)
/admin/rutinas/atleta/:athleteId    → tab "Activas", detalle + editor (new)
```

`Rutinas.tsx` reads `useLocation()` to decide mode. Segmented control in header switches between `cola` and `activas`; switching resets to the tab's index route. `UserDetail.tsx` gains a "Ver rutina activa" button linking to `/admin/rutinas/atleta/:userId`.

## Backend

New router: `backend/src/routes/admin-rutinas.ts` mounted at `/api/admin/rutinas`, protected by `requireAuth + requireAdmin`. Registered in `backend/src/app.ts` after existing `rutinas` router. `rutinas.ts` (queue) is untouched.

### Endpoints

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/atleta` | `?q=<search>&limit=&offset=` | `{ items: ActiveAthleteRow[], total }` |
| GET | `/atleta/:athleteId` | — | `{ skeleton, slots[], days[], profile, program_state }` |
| POST | `/atleta/:athleteId/slots` | `{ day_of_week, slot_index, exercise_id, role, notes }` | `{ slot }` |
| PATCH | `/slots/:slotId` | `{ exercise_id?, notes?, slot_index?, day_of_week? }` | `{ slot }` |
| DELETE | `/slots/:slotId` | — | `204` |
| POST | `/atleta/:athleteId/reorder` | `{ slots: [{ slot_id, day_of_week, slot_index }, ...] }` | `204` |

All payloads validated with Zod schemas in `backend/src/domain/schemas.ts`.

### Service layer

`backend/src/services/admin-rutina.service.ts` exports:

- `listActiveAthletes({ q, limit, offset }): Promise<{ items, total }>`
- `getActiveRutina(athleteId): Promise<RutinaDetail | null>`
- `createSlot(athleteId, input): Promise<SkeletonSlot>`
- `updateSlot(slotId, patch): Promise<SkeletonSlot>`
- `deleteSlot(slotId): Promise<void>`
- `reorderSlots(athleteId, items): Promise<void>`

### Guards

Every mutation (create/update/delete/reorder) validates:

1. Athlete has `athlete_program_state.active_skeleton_id`.
2. Slot's `skeleton_id` (or parent skeleton being mutated) equals `active_skeleton_id`.
3. Parent skeleton's `status = 'approved'`.

Violation → HTTP 409 `{ error: 'rutina_not_active' }`.

Additional:

- `exercise_id` (on create / swap) must exist in `exercises` with `archived_at IS NULL`. Violation → 400 `{ error: 'invalid_exercise' }`.
- `slot_index` and `day_of_week` integer ranges enforced by Zod (matching existing `skeleton_slots` constraints).

### Side effects

**On swap (PATCH `exercise_id`) and on create:**

```sql
INSERT INTO athlete_exercise_weights
  (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
VALUES ($athlete_id, $new_exercise_id, NULL, NULL, 'athlete_initial')
ON CONFLICT (athlete_id, exercise_id) DO NOTHING;
```

Same pattern used on initial skeleton approval. Old exercise's weight row is not deleted (historical retention).

**On reorder:** transactional, using temporary offset to avoid `UNIQUE (skeleton_id, day_of_week, slot_index)` collision:

```sql
BEGIN;
UPDATE skeleton_slots SET slot_index = slot_index + 1000
  WHERE skeleton_id = $sk_id;
-- then per-item:
UPDATE skeleton_slots SET day_of_week = $d, slot_index = $i
  WHERE id = $slot_id;
COMMIT;
```

`day_of_week` updated in same statement so cross-day moves work.

### Audit log

Project does not currently have an `admin_activity_log` table. **Flag for v2:** add structured logging of slot mutations (actor, action, slot_id, before/after). For v1, rely on application logs via `pino`.

## Frontend

### Page-level

`frontend/src/pages/admin/Rutinas.tsx` is refactored to detect mode from `useLocation().pathname`:

- Contains `/atleta` → mode `activas`
- Otherwise → mode `cola` (existing behavior preserved)

Header receives a new segmented control (`<RutinasTabs />`) above the split-pane shell. Click on a tab navigates to its index route (`/admin/rutinas` or `/admin/rutinas/atleta`). The split-pane (`grid-cols-[340px_1fr]`) renders different `ListPane`/`DetailPane` per mode.

### Components

New directory `frontend/src/components/admin/rutinas/activas/`:

- `ListPaneActivas.tsx` — search input + filter chips + list of athletes with approved skeleton, sorted by skeleton `reviewed_at DESC`. Reuses `ListRow` visual style.
- `DetailPaneActivas.tsx` — top: header with athlete name + link to `/admin/users/:id` + days/week badge. Body: vertical list of day cards. Footer: stats.
- `DayCard.tsx` — single day. Header: `Día N · ${focus}`. Body: `SlotRow[]` + "Agregar ejercicio" button.
- `SlotRow.tsx` — drag handle + role badge + exercise dropdown trigger + notes textarea + `⋯` menu.
- `ExerciseSwapDialog.tsx` — modal listing exercises with search; supports `create` and `swap` modes. Filters `archived_at IS NULL`.

### Hooks

New file `frontend/src/hooks/useAdminRutina.ts`:

- `useActiveAthletes(search)` — `GET /admin/rutinas/atleta`
- `useActiveRutina(athleteId)` — `GET /admin/rutinas/atleta/:athleteId`
- `useCreateSlot()`, `useUpdateSlot()`, `useDeleteSlot()`, `useReorderSlots()` — mutations with optimistic updates, `onError` rollback + `toast.error`, `onSuccess` invalidate `['admin-rutina', athleteId]`.

### Drag-and-drop

Add `@dnd-kit/core` + `@dnd-kit/sortable` to `frontend/package.json` (not currently installed). Sortable items grouped by day. Cross-day drag detected by drop target's `data.dayOfWeek`. On drop: compute new ordering for affected days, fire `useReorderSlots` with bulk payload.

### Empty / error states

- Athlete with no approved skeleton: card "Este atleta aún no tiene rutina activa". If athlete has a `pending_review` skeleton, secondary link "Ver en cola pendiente" → `/admin/rutinas/:skeletonId`.
- 409 `rutina_not_active` on any mutation: `toast.error("Rutina ya no activa")` + refetch detail.
- Slot points to archived exercise: chip "Ejercicio archivado" on `SlotRow` + tooltip suggesting swap.

### Active-session warning

If athlete has a `session_logs` row with `finished_at IS NULL` (athlete in middle of a workout), `DetailPaneActivas` shows a banner: "Atleta tiene sesión en curso. Los cambios aplicarán recién en la próxima sesión." `getActiveRutina` includes `has_active_session: boolean` computed via `EXISTS (SELECT 1 FROM session_logs WHERE athlete_id=$1 AND finished_at IS NULL)`.

## Testing

### Backend (Jest)

- Integration tests in `backend/src/routes/__tests__/admin-rutinas.test.ts`:
  - GET list returns only athletes with approved skeleton.
  - GET detail returns 404 for athlete with no `active_skeleton_id`.
  - Mutations succeed on active approved skeleton.
  - Mutations return 409 when targeting `superseded`/`pending_review`/`rejected` skeleton.
  - PATCH swap inserts weight row for new exercise; idempotent on retry.
  - Reorder updates `(day_of_week, slot_index)` without unique violation.
  - Non-admin user → 403.
  - Invalid `exercise_id` (archived or nonexistent) → 400.

### Frontend (Vitest)

- `useAdminRutina` mutations: optimistic update + rollback on error.
- `SlotRow` interactions: swap dialog opens, notes debounce, delete confirmation.
- `Rutinas.tsx`: tab switching preserves correct sub-route.

## Migrations

None required. All necessary tables (`athlete_skeletons`, `skeleton_slots`, `skeleton_days`, `athlete_program_state`, `athlete_exercise_weights`, `exercises`) exist with required columns and constraints.

## Open questions / v2

- Persist audit trail (`admin_activity_log` table) of slot mutations.
- Version history / snapshot view of routine across time.
- Optimistic locking when two admins edit concurrently.
- Bulk edit (e.g., apply same swap across all days).
- Allow editing `skeleton_days.focus`.
