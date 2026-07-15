# Active-routine editor: draft edits + explicit Save

**Date:** 2026-07-14
**Status:** Approved

## Problem

The admin active-routine editor (`/admin/rutinas/atleta/:athleteId`,
`DetailPaneActivas`) applies every edit instantly via five independent
mutations: slot patch (`PATCH /admin/rutinas/slots/:slotId`), slot create
(`POST .../slots`), slot delete (`DELETE /admin/rutinas/slots/:slotId`),
reorder (`POST .../reorder`), and change training days. The coach wants edits
staged locally and applied only when pressing an explicit **Guardar** button —
matching the pending-queue editor (`DetailPane.tsx`), which already batches
overrides/order/added/deleted client-side and applies them once on approve.

Instant apply also multiplies failure surface: today's reorder bug (wiped
`series/reps/descanso`, fixed 2026-07-14) hit live data because every drag was
an immediate write.

## Decisions (user-confirmed)

1. **Scope:** reorder, slot edit (exercise/series/reps/descanso/notes), add,
   and delete are all staged in the draft. **"Cambiar días" stays instant**
   (it is a separate dialog with its own confirmation).
2. **Unsaved changes:** sticky bar with "N cambios sin guardar" +
   **Guardar** / **Descartar**. Confirmation prompt before losing the draft
   (switching athlete, closing the tab via `beforeunload`). No localStorage
   persistence for this editor.
3. **Apply mechanism:** new atomic batch endpoint (approach A). A
   frontend-only sequential replay of existing endpoints (approach B) was
   rejected for lack of atomicity; cloning the queue's approve flow
   (approach C) was rejected for polluting skeleton history.

## Backend

### Shared helper: `applySlotEdits`

Extract the slot-edit block of `approveSkeleton`
(`backend/src/services/skeleton.service.ts`, currently: deleted → added →
overrides → reorder, lines ~149–258) into an exported helper:

```ts
export async function applySlotEdits(
  client: PoolClient,
  skeletonId: string,
  opts: {
    slotOverrides?: ApproveSkeletonOptions['slotOverrides'];
    slotOrder?: ApproveSkeletonOptions['slotOrder'];
    deletedSlotIds?: string[];
    addedSlots?: ApproveSkeletonOptions['addedSlots'];
  },
): Promise<void>
```

- Runs inside the caller's transaction (takes `client`, does not
  BEGIN/COMMIT).
- Keeps the existing order of operations and the existing behaviors:
  - added slots get `slot_index = max(existing)+1` per day, error if > 12;
  - overrides only touch scheme columns when the edit carries them;
  - reorder = delete + re-insert preserving **all** slot columns
    (`exercise_id, role, notes, series, reps, descanso`).
- `approveSkeleton` calls this helper — single implementation of slot-edit
  semantics; the reorder column-preservation bug class cannot diverge again.

### New endpoint

`POST /api/admin/rutinas/atleta/:athleteId/apply-edits` (admin-only, in
`backend/src/routes/admin-rutinas.ts`).

- **Body:** same shape as `skeletonApprovePayload`
  (`backend/src/domain/schemas.ts`): `{ slot_overrides?, slot_order?,
  deleted_slot_ids?, added_slots? }`. Reuse the existing Zod schema (rename or
  alias to reflect shared use, e.g. export `slotEditsPayload` and have
  `skeletonApprovePayload` extend/equal it).
- **Service:** new `applyEdits(athleteId, opts)` in
  `admin-rutina.service.ts`:
  1. BEGIN; `assertAthleteActiveSkeleton(client, athleteId)` (existing helper
     — 409 `skeleton_not_active` when absent, matching current slot
     endpoints).
  2. `applySlotEdits(client, skId, opts)`.
  3. Bulk weight seed for all distinct exercises now in the skeleton
     (same `INSERT ... SELECT DISTINCT ... ON CONFLICT DO NOTHING` as
     `approveSkeleton`) — covers swapped and added exercises.
  4. COMMIT. Any error → ROLLBACK → nothing applied.
- **Response:** 204. Errors: 400 `invalid_payload`, 409 when no active
  skeleton, 400/409 mapped from `AdminRutinaError` as existing routes do.
- If `slot_order` is present it must include **every** slot of the skeleton
  post add/delete (same rule the queue flow enforces); validation error
  otherwise.

Existing single-op endpoints (PATCH/POST/DELETE slot, reorder) remain for
compatibility but the activas screen stops calling them.

## Frontend

### Draft state in `DetailPaneActivas`

Mirror the queue editor's pattern (`DetailPane.tsx`):

- `overrides: Record<string, SlotOverride>` — per-slot pending edits.
- `order: RutinaSlot[] | null` — local slot list when reordered/added
  (null = server order).
- `deleted: Set<string>`, `addedIds: Set<string>` (client-generated UUIDs via
  `crypto.randomUUID()`).
- Derived `draftSlots` = server slots merged with the four pieces; feeds
  `DayCard`/`SlotRow` rendering, per-day grouping, and the 12-per-day check.
- `hasDraftChanges` = any of the four non-empty.
- **No localStorage** (explicit decision; unlike the queue editor).

### Component changes

- `SlotRow` and `DayCard` become presentational: drop `useUpdateSlot` /
  `useDeleteSlot` / `useCreateSlot`; receive callbacks (`onEdit(slotId,
  override)`, `onDelete(slotId)`, `onAdd(day, exercise)`) from
  `DetailPaneActivas`. `EditSlotPopover`'s Guardar mutates the draft only.
- Drag end (`handleDragEnd`) mutates `order` locally instead of calling the
  reorder mutation. The >12-per-day guard stays as a local toast.
- Rows with pending changes get a subtle visual marker (e.g. dot or tinted
  background) so the coach can see what's staged.

### Save bar

Sticky bottom bar inside the detail pane, visible only when
`hasDraftChanges`:

- Text: "N cambios sin guardar" (N = overrides + adds + deletes +
  (order moved ? 1 : 0) — coarse count is fine).
- **Guardar** (primary): builds the payload exactly like the queue editor
  (filter deleted from overrides/order, reindex `slot_order` 1..N per day,
  strip added slots that were deleted) and calls a new
  `useApplyRutinaEdits(athleteId)` mutation → `POST .../apply-edits` →
  on success: clear draft, invalidate detail query, success toast. On 409:
  "Rutina ya no activa". Disabled while pending.
- **Descartar**: confirmation, then reset the four draft pieces.

### Unsaved-changes guards

- `beforeunload` listener while `hasDraftChanges`.
- Switching athlete in `ListPaneActivas` (or navigating within the SPA away
  from the pane) with a dirty draft → `confirm()` before discarding.

### `has_active_session` warning

Existing banner stays; unchanged semantics (changes apply next session).

## Testing

**Backend (Jest integration, `tests/integration/`):**

- `apply-edits` happy path: combined override + add + delete + reorder in one
  call; verify final rows including preserved `series/reps/descanso` on
  untouched slots.
- Atomicity: payload whose reorder is invalid (e.g. missing a slot) after a
  valid delete → 4xx and **no** partial application.
- 409 when athlete has no active skeleton.
- `approveSkeleton` regression: existing skeletons/admin-rutinas suites stay
  green after the helper extraction.

**Frontend (Vitest):**

- Draft accumulation: edit + reorder + delete update `draftSlots` without
  firing network calls.
- Save builds correct payload (reindexing, deleted-filtering).
- Discard resets to server state.
- Save bar visibility and disabled-while-pending.

## Out of scope

- Draft persistence across reloads (localStorage) — explicitly declined.
- Staging "Cambiar días de entrenamiento".
- Deprecating/removing the single-op endpoints.
