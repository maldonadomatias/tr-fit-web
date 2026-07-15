# Activas Draft Edits + Explicit Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage all edits (reorder, edit, add, delete) in the admin active-routine editor locally and apply them atomically with an explicit Guardar button.

**Architecture:** Extract the slot-edit block of `approveSkeleton` into a shared `applySlotEdits` helper; expose it through a new atomic endpoint `POST /api/admin/rutinas/atleta/:athleteId/apply-edits`. The frontend `DetailPaneActivas` adopts the queue editor's draft pattern (`overrides / order / deleted / addedIds`), makes `SlotRow`/`DayCard` presentational, and adds a sticky Guardar/Descartar bar with unsaved-changes guards.

**Tech Stack:** Express 4 + pg + Zod (backend), React 19 + TanStack Query + dnd-kit (frontend), Jest integration tests, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-14-activas-draft-save-design.md`

## Global Constraints

- Backend tests: run from `backend/` with `TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js <file>` (plain `npx jest` breaks on ESM: TS2823 error). Requires docker container `tr-fit-web-postgres-1` running; new migrations must be applied to `trfit_test` manually (none needed for this plan).
- Frontend tests: run from `frontend/` with `npx vitest run <file>`.
- Prettier: single quotes, 80 cols, 2 spaces. TypeScript strict, ES modules (`.js` suffix on relative imports in backend).
- "Cambiar días" stays instant — do NOT stage it.
- No localStorage draft persistence in the activas editor (explicit user decision; the queue editor keeps its own).
- All user-facing copy in Spanish (rioplatense, matching existing strings).
- Existing single-op endpoints (PATCH/POST/DELETE slot, reorder) must keep working — mobile/back-compat; only the activas screen stops calling them.

---

### Task 1: Extract `applySlotEdits` helper in skeleton.service

Pure refactor — behavior identical, existing suites are the safety net.

**Files:**
- Modify: `backend/src/services/skeleton.service.ts` (approveSkeleton body, lines ~149–258)
- Tests (existing, must stay green): `backend/tests/integration/skeletons.test.ts`, `backend/tests/integration/admin-rutinas.test.ts`, `backend/tests/integration/weekly-overrides.test.ts`

**Interfaces:**
- Produces: `export async function applySlotEdits(client: PoolClient, skeletonId: string, opts: SlotEditOptions): Promise<void>` and `export interface SlotEditOptions` in `skeleton.service.ts` — consumed by Task 2.

- [ ] **Step 1: Run existing suites to establish green baseline**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/skeletons.test.ts tests/integration/admin-rutinas.test.ts
```
Expected: all pass.

- [ ] **Step 2: Extract the helper**

In `backend/src/services/skeleton.service.ts`, define above `approveSkeleton` (reusing the existing option types — move the slot-edit fields out of `ApproveSkeletonOptions` into a new exported interface that `ApproveSkeletonOptions` extends):

```ts
export interface SlotEditOptions {
  /** Per-slot overrides applied before reorder & seeding. */
  slotOverrides?: {
    slot_id: string;
    exercise_id: number;
    notes?: string | null;
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
  /** Full reordering of the skeleton's slots (every slot, new day/index). */
  slotOrder?: {
    slot_id: string;
    day_of_week: number;
    slot_index: number;
  }[];
  /** Slots removed by the admin. */
  deletedSlotIds?: string[];
  /** Brand-new slots added by the admin (client-generated id). */
  addedSlots?: {
    id: string;
    day_of_week: number;
    exercise_id: number;
    role: string;
    notes?: string | null;
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
}

export interface ApproveSkeletonOptions extends SlotEditOptions {
  startDate?: Date;
}

/**
 * Applies staged slot edits to a skeleton inside the caller's transaction:
 * deletes, then adds, then per-slot overrides, then full reorder.
 * Shared by skeleton approval and the activas apply-edits endpoint so the
 * edit semantics (incl. column preservation on reorder) never diverge.
 */
export async function applySlotEdits(
  client: PoolClient,
  skeletonId: string,
  opts: SlotEditOptions,
): Promise<void> {
  // BODY: move the four blocks currently inside approveSkeleton verbatim:
  //   1. deletedSlotIds  -> DELETE ... WHERE id = ANY(...) AND skeleton_id = ...
  //   2. addedSlots      -> per-day max(slot_index)+1, throw if > 12, INSERT
  //   3. slotOverrides   -> hasScheme ? UPDATE with series/reps/descanso : UPDATE exercise_id/notes
  //   4. slotOrder       -> DELETE ... RETURNING id, exercise_id, role, notes,
  //                         series, reps, descanso; throw if rowCount mismatch;
  //                         re-INSERT with new (day_of_week, slot_index)
  // Replace `skeletonId` variable references as needed. No other changes.
}
```

Then in `approveSkeleton`, replace those four blocks with:

```ts
await applySlotEdits(client, skeletonId, opts);
```

placed exactly where the deleted-slots block used to start (after the status check, before the supersede/approve UPDATEs).

- [ ] **Step 3: Run suites again — must stay green**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/skeletons.test.ts tests/integration/admin-rutinas.test.ts tests/integration/weekly-overrides.test.ts
```
Expected: all pass. If anything fails, the extraction changed behavior — fix the helper, not the tests.

- [ ] **Step 4: Lint + commit**

```bash
cd backend && npx eslint src/services/skeleton.service.ts
git add backend/src/services/skeleton.service.ts
git commit -m "refactor(skeleton): extract applySlotEdits helper from approveSkeleton"
```

---

### Task 2: Backend apply-edits endpoint

**Files:**
- Modify: `backend/src/domain/schemas.ts` (~line 222)
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/src/routes/admin-rutinas.ts`
- Test: `backend/tests/integration/admin-rutinas.test.ts`

**Interfaces:**
- Consumes: `applySlotEdits(client, skeletonId, opts)` + `SlotEditOptions` from Task 1; existing `assertAthleteActiveSkeleton`, `assertExerciseAvailable`, `AdminRutinaError`, `mapError` in the admin-rutina files.
- Produces: `POST /api/admin/rutinas/atleta/:athleteId/apply-edits` accepting `{ slot_overrides?, slot_order?, deleted_slot_ids?, added_slots? }` (same shape as `skeletonApprovePayload`), responding 204 — consumed by Task 3's hook.

- [ ] **Step 1: Write failing integration tests**

Append to `backend/tests/integration/admin-rutinas.test.ts` (uses existing `setupActiveRutina` helper and `aiOut` fixture — day 1: slot1 principal ex1, slot2 accesorio ex2 with series=2/reps='10x10x10'/descanso='2 min'; day 2: slot1 principal ex1):

```ts
// ── apply-edits: atomic batched draft save from the activas editor ──

describe('POST /api/admin/rutinas/atleta/:athleteId/apply-edits', () => {
  it('204 applies override + add + delete + reorder in one call', async () => {
    const { athleteId, skeletonId, tok } = await setupActiveRutina();
    const slotsR = await pool.query<{
      id: string; day_of_week: number; slot_index: number; role: string;
    }>(
      `SELECT id, day_of_week, slot_index, role FROM skeleton_slots
        WHERE skeleton_id = $1 ORDER BY day_of_week, slot_index`,
      [skeletonId],
    );
    const day1 = slotsR.rows.filter((s) => s.day_of_week === 1);
    const day2 = slotsR.rows.filter((s) => s.day_of_week === 2);
    const [d1s1, d1s2] = day1; // principal, accesorio
    const addedId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/apply-edits`)
      .set('Authorization', `Bearer ${tok}`)
      .send({
        // edit the accesorio's notes + scheme
        slot_overrides: [
          {
            slot_id: d1s2.id, exercise_id: 2, notes: 'editado',
            series: 3, reps: '8 a 10', descanso: '1 min',
          },
        ],
        // delete day-2's only slot
        deleted_slot_ids: [day2[0].id],
        // add a new accesorio on day 1
        added_slots: [
          {
            id: addedId, day_of_week: 1, exercise_id: 1,
            role: 'accesorio', notes: null,
            series: null, reps: null, descanso: null,
          },
        ],
        // final order: swap the two original day-1 slots, added slot last
        slot_order: [
          { slot_id: d1s2.id, day_of_week: 1, slot_index: 1 },
          { slot_id: d1s1.id, day_of_week: 1, slot_index: 2 },
          { slot_id: addedId, day_of_week: 1, slot_index: 3 },
        ],
      });
    expect(r.status).toBe(204);

    const after = await pool.query<{
      id: string; day_of_week: number; slot_index: number;
      notes: string | null; series: number | null;
      reps: string | null; descanso: string | null;
    }>(
      `SELECT id, day_of_week, slot_index, notes, series, reps, descanso
         FROM skeleton_slots WHERE skeleton_id = $1
        ORDER BY day_of_week, slot_index`,
      [skeletonId],
    );
    expect(after.rows).toHaveLength(3); // 2 original day-1 + 1 added, day-2 gone
    expect(after.rows.map((s) => s.id)).toEqual([d1s2.id, d1s1.id, addedId]);
    const edited = after.rows.find((s) => s.id === d1s2.id)!;
    expect(edited).toMatchObject({
      notes: 'editado', series: 3, reps: '8 a 10', descanso: '1 min',
    });
  });

  it('rolls back everything when slot_order is incomplete', async () => {
    const { athleteId, skeletonId, tok } = await setupActiveRutina();
    const slotsR = await pool.query<{ id: string; day_of_week: number }>(
      `SELECT id, day_of_week FROM skeleton_slots WHERE skeleton_id = $1`,
      [skeletonId],
    );
    const day2Slot = slotsR.rows.find((s) => s.day_of_week === 2)!;
    const aDay1Slot = slotsR.rows.find((s) => s.day_of_week === 1)!;

    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/apply-edits`)
      .set('Authorization', `Bearer ${tok}`)
      .send({
        deleted_slot_ids: [day2Slot.id],
        // Incomplete: only 1 of the 2 remaining slots listed.
        slot_order: [
          { slot_id: aDay1Slot.id, day_of_week: 1, slot_index: 1 },
        ],
      });
    expect(r.status).toBe(404); // same not_found mapping as /reorder

    // Atomicity: the delete must have been rolled back too.
    const count = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM skeleton_slots WHERE skeleton_id = $1`,
      [skeletonId],
    );
    expect(count.rows[0].c).toBe(3);
  });

  it('409 when athlete has no active skeleton', async () => {
    const adminId = await createAdmin();
    const athleteId = await createAthlete(adminId);
    const tok = signToken({ id: adminId, role: 'admin' });

    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/apply-edits`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ deleted_slot_ids: [] });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('rutina_not_active');
  });

  it('seeds athlete_exercise_weights for added exercises', async () => {
    const { athleteId, skeletonId, tok } = await setupActiveRutina();
    // exercise 3 is seeded in the test DB but not part of aiOut
    const addedId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/apply-edits`)
      .set('Authorization', `Bearer ${tok}`)
      .send({
        added_slots: [
          {
            id: addedId, day_of_week: 2, exercise_id: 3,
            role: 'accesorio', notes: null,
            series: null, reps: null, descanso: null,
          },
        ],
      });
    expect(r.status).toBe(204);
    const w = await pool.query(
      `SELECT 1 FROM athlete_exercise_weights
        WHERE athlete_id = $1 AND exercise_id = 3`,
      [athleteId],
    );
    expect(w.rowCount).toBe(1);
    void skeletonId;
  });
});
```

Note: if exercise_id 3 is not seeded in the test DB, check `tests/integration/helpers/` seeding and pick any seeded exercise id not used by `aiOut` (which uses 1 and 2).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/admin-rutinas.test.ts -t "apply-edits"
```
Expected: 4 failures, each 404 from the missing route.

- [ ] **Step 3: Implement schema, service, route**

`backend/src/domain/schemas.ts` — right after `skeletonApprovePayload`:

```ts
// The activas editor's batched draft save reuses the exact approve shape.
export const adminApplyEditsPayload = skeletonApprovePayload;
export type AdminApplyEditsInput = z.infer<typeof adminApplyEditsPayload>;
```

`backend/src/services/admin-rutina.service.ts` — add import and function:

```ts
import { applySlotEdits } from './skeleton.service.js';
import type { AdminApplyEditsInput } from '../domain/schemas.js';
```

```ts
/**
 * Atomic batched edit of the athlete's ACTIVE routine (draft save from the
 * activas editor): deletes, adds, per-slot overrides and full reorder in one
 * transaction. Mirrors the queue's approve-with-edits flow via applySlotEdits.
 */
export async function applyEdits(
  athleteId: string,
  input: AdminApplyEditsInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const skId = await assertAthleteActiveSkeleton(client, athleteId);

    // Added slots must reference live (non-archived) exercises. Overrides are
    // NOT asserted: they always carry exercise_id even when unchanged, and a
    // notes-only edit on a slot whose exercise was later archived must not 400
    // (matches approveSkeleton, which never asserts).
    for (const a of input.added_slots ?? []) {
      await assertExerciseAvailable(client, a.exercise_id);
    }

    await applySlotEdits(client, skId, {
      slotOverrides: input.slot_overrides,
      slotOrder: input.slot_order,
      deletedSlotIds: input.deleted_slot_ids,
      addedSlots: input.added_slots,
    });

    // When a full order is sent it must cover every remaining slot — same
    // contract as reorderSlots. applySlotEdits throws on unknown ids; this
    // catches the "too few" case.
    if (input.slot_order) {
      const totalR = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM skeleton_slots WHERE skeleton_id = $1`,
        [skId]
      );
      if (totalR.rows[0].c !== input.slot_order.length) {
        throw new AdminRutinaError(
          'not_found',
          'slot_order must include every slot of the skeleton'
        );
      }
    }

    // Seed weights for any exercise now in the routine (swap or add).
    await client.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
       SELECT $1, exercise_id, NULL, NULL, 'athlete_initial'
       FROM (SELECT DISTINCT exercise_id FROM skeleton_slots
              WHERE skeleton_id = $2) s
       ON CONFLICT (athlete_id, exercise_id) DO NOTHING`,
      [athleteId, skId]
    );

    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore — preserve original error
    }
    throw e;
  } finally {
    client.release();
  }
}
```

CAVEAT — order of checks: `applySlotEdits` runs its `slotOrder` block with a `rowCount !== orderIds.length` check that throws a plain `Error` for unknown ids; the count check above must run AFTER `applySlotEdits` (adds/deletes change the count). The incomplete-order test relies on this count check.

`backend/src/routes/admin-rutinas.ts` — add to imports: `adminApplyEditsPayload` from schemas, `applyEdits` from the service. Add route after the `/reorder` handler:

```ts
router.post(
  '/atleta/:athleteId/apply-edits',
  async (req: Request, res: Response) => {
    const athleteId = requireUuid(req.params.athleteId, res);
    if (!athleteId) return;
    const parsed = adminApplyEditsPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'invalid_payload', issues: parsed.error.issues });
    }
    try {
      await applyEdits(athleteId, parsed.data);
      res.status(204).end();
    } catch (e) {
      mapError(e, res);
    }
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/admin-rutinas.test.ts
```
Expected: whole file passes (new + pre-existing tests).

- [ ] **Step 5: Run full backend suite**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js
```
Expected: all suites pass.

- [ ] **Step 6: Lint + commit**

```bash
cd backend && npx eslint src/services/admin-rutina.service.ts src/routes/admin-rutinas.ts src/domain/schemas.ts
git add backend/src backend/tests
git commit -m "feat(admin): atomic apply-edits endpoint for activas draft save"
```

---

### Task 3: Frontend types + `useApplyRutinaEdits` hook

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/hooks/useAdminRutina.ts`

**Interfaces:**
- Consumes: `POST /admin/rutinas/atleta/:athleteId/apply-edits` (Task 2).
- Produces: `ApplyEditsInput` type and `useApplyRutinaEdits(athleteId: string)` mutation hook (call `.mutateAsync(input: ApplyEditsInput)`) — consumed by Task 5.

- [ ] **Step 1: Add the payload type**

In `frontend/src/types/api.ts`, next to `ReorderInput`:

```ts
// Batched draft save for the activas editor. Mirrors the queue's approve
// payload (backend adminApplyEditsPayload).
export interface ApplyEditsInput {
  slot_overrides?: {
    slot_id: string;
    exercise_id: number;
    notes?: string | null;
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
  slot_order?: {
    slot_id: string;
    day_of_week: number;
    slot_index: number;
  }[];
  deleted_slot_ids?: string[];
  added_slots?: {
    id: string;
    day_of_week: number;
    exercise_id: number;
    role: 'calentamiento' | 'principal' | 'accesorio';
    notes?: string | null;
    series?: number | null;
    reps?: string | null;
    descanso?: string | null;
  }[];
}
```

- [ ] **Step 2: Add the hook**

In `frontend/src/hooks/useAdminRutina.ts` (import `ApplyEditsInput` from `@/types/api`), after `useReorderSlots`:

```ts
export function useApplyRutinaEdits(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyEditsInput) => {
      await api.post(`/admin/rutinas/atleta/${athleteId}/apply-edits`, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/types/api.ts src/hooks/useAdminRutina.ts
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/hooks/useAdminRutina.ts
git commit -m "feat(admin): useApplyRutinaEdits hook for batched draft save"
```

---

### Task 4: Presentational SlotRow + DayCard (callbacks instead of mutations)

**Files:**
- Modify: `frontend/src/components/admin/rutinas/activas/SlotRow.tsx`
- Modify: `frontend/src/components/admin/rutinas/activas/DayCard.tsx`
- Test: `frontend/src/components/admin/rutinas/activas/SlotRow.test.tsx`

**Interfaces:**
- Produces (consumed by Task 5):
  - `SlotRow` props: `{ slot: RutinaSlot; flagged?: boolean; edited?: boolean; onEdit: (slotId: string, payload: SlotOverride) => void; onDelete: (slotId: string) => void }` (drops `athleteId`).
  - `DayCard` props: `{ dayOfWeek: number; focus: string | null; slots: RutinaSlot[]; flaggedExerciseIds: Set<number>; editedSlotIds: Set<string>; onEdit: (slotId: string, payload: SlotOverride) => void; onDelete: (slotId: string) => void; onAdd: (dayOfWeek: number, exercise: Exercise) => void }` (drops `athleteId`).
  - `SlotOverride` re-exported unchanged from `EditSlotPopover`.

- [ ] **Step 1: Update SlotRow tests to the new props (failing first)**

Rewrite `frontend/src/components/admin/rutinas/activas/SlotRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SlotRow } from './SlotRow';
import type { RutinaSlot } from '@/types/api';

function renderRow(slot: RutinaSlot, extra?: { edited?: boolean }) {
  return render(
    <TooltipProvider>
      <DndContext>
        <SortableContext
          items={[slot.id]}
          strategy={verticalListSortingStrategy}
        >
          <SlotRow
            slot={slot}
            edited={extra?.edited}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </SortableContext>
      </DndContext>
    </TooltipProvider>,
  );
}

const baseSlot: RutinaSlot = {
  id: 'slot-1',
  day_of_week: 1,
  slot_index: 0,
  exercise_id: 42,
  role: 'principal',
  notes: null,
  exercise_name: 'Sentadilla',
  muscle_group: 'cuadriceps',
  equipment: 'barra',
};

describe('SlotRow archived chip', () => {
  it('renders "Ejercicio archivado" chip when exercise_archived_at is set', () => {
    renderRow({ ...baseSlot, exercise_archived_at: '2026-05-01T00:00:00Z' });
    expect(screen.getByText('Ejercicio archivado')).toBeInTheDocument();
  });

  it('does not render chip when exercise_archived_at is null', () => {
    renderRow({ ...baseSlot, exercise_archived_at: null });
    expect(screen.queryByText('Ejercicio archivado')).not.toBeInTheDocument();
  });
});

describe('SlotRow draft marker', () => {
  it('shows pending-change marker when edited', () => {
    renderRow(baseSlot, { edited: true });
    expect(screen.getByLabelText('Cambio sin guardar')).toBeInTheDocument();
  });

  it('hides marker when not edited', () => {
    renderRow(baseSlot);
    expect(
      screen.queryByLabelText('Cambio sin guardar'),
    ).not.toBeInTheDocument();
  });
});
```

(QueryClientProvider removed on purpose — the presentational row must not need it.)

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx vitest run src/components/admin/rutinas/activas/SlotRow.test.tsx
```
Expected: FAIL (props mismatch / marker missing).

- [ ] **Step 3: Rewrite SlotRow as presentational**

Replace `frontend/src/components/admin/rutinas/activas/SlotRow.tsx` body: delete `useUpdateSlot`/`useDeleteSlot`/`toast` imports and the patch-building logic; forward the popover's payload up.

```tsx
import type { CSSProperties } from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  EditSlotPopover,
  type SlotOverride,
} from '@/components/admin/rutinas/EditSlotPopover';
import type { RutinaSlot } from '@/types/api';

export function SlotRow({
  slot,
  flagged = false,
  edited = false,
  onEdit,
  onDelete,
}: {
  slot: RutinaSlot;
  flagged?: boolean;
  edited?: boolean;
  onEdit: (slotId: string, payload: SlotOverride) => void;
  onDelete: (slotId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasScheme = slot.series != null || slot.reps || slot.descanso;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:flex-nowrap sm:px-5"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Reordenar"
      >
        <GripVertical size={14} />
      </button>
      <span className="rounded bg-muted px-2 py-0.5 text-xs">{slot.role}</span>
      <div className="flex min-w-0 flex-1 basis-[55%] flex-col gap-0.5 sm:basis-auto">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">
            {slot.exercise_name}
          </span>
          {edited ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary"
              aria-label="Cambio sin guardar"
            />
          ) : null}
          {flagged ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                  aria-label="Alerta de dolor abierta en este ejercicio"
                />
              </TooltipTrigger>
              <TooltipContent>
                Alerta de dolor abierta en este ejercicio.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {slot.exercise_archived_at ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Ejercicio archivado
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Este ejercicio fue archivado. Cambiá por una alternativa no
                archivada.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          {hasScheme ? (
            <>
              {slot.series != null ? <span>{slot.series} series</span> : null}
              {slot.reps ? <span>{slot.reps} reps</span> : null}
              {slot.descanso ? <span>desc. {slot.descanso}</span> : null}
            </>
          ) : slot.role === 'accesorio' ? (
            <span className="italic">Según periodización</span>
          ) : (
            <span className="italic">Según periodización de la semana</span>
          )}
          {slot.notes ? (
            <span className="normal-case not-italic text-foreground/70">
              · {slot.notes}
            </span>
          ) : null}
        </div>
      </div>
      <EditSlotPopover
        role={slot.role}
        currentExerciseId={slot.exercise_id}
        currentExerciseName={slot.exercise_name ?? ''}
        currentMuscleGroup={slot.muscle_group}
        currentNotes={slot.notes ?? undefined}
        currentSeries={slot.series}
        currentReps={slot.reps}
        currentDescanso={slot.descanso}
        onSave={(payload) => onEdit(slot.id, payload)}
        onDelete={() => onDelete(slot.id)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rewrite DayCard as presentational**

Replace `frontend/src/components/admin/rutinas/activas/DayCard.tsx`: drop `useCreateSlot`/`toast`, pass callbacks through, keep `nextAvailableSlotIndex` export.

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import { SlotRow } from './SlotRow';
import type { SlotOverride } from '@/components/admin/rutinas/EditSlotPopover';
import type { Exercise, RutinaSlot } from '@/types/api';

const DAY_LABEL: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export function DayCard({
  dayOfWeek,
  focus,
  slots,
  flaggedExerciseIds,
  editedSlotIds,
  onEdit,
  onDelete,
  onAdd,
}: {
  dayOfWeek: number;
  focus: string | null;
  slots: RutinaSlot[];
  flaggedExerciseIds: Set<number>;
  editedSlotIds: Set<string>;
  onEdit: (slotId: string, payload: SlotOverride) => void;
  onDelete: (slotId: string) => void;
  onAdd: (dayOfWeek: number, exercise: Exercise) => void;
}) {
  const nextIndex = nextAvailableSlotIndex(slots);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold">
          {DAY_LABEL[dayOfWeek] ?? `Día ${dayOfWeek}`}
        </h3>
        {focus && <p className="text-xs text-muted-foreground">{focus}</p>}
      </header>
      <div className="divide-y divide-border">
        {slots.length === 0 && (
          <div className="px-4 py-4 text-xs text-muted-foreground sm:px-5">
            Día sin ejercicios.
          </div>
        )}
        <SortableContext
          items={slots.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {slots.map((s) => (
            <SlotRow
              key={s.id}
              slot={s}
              flagged={flaggedExerciseIds.has(s.exercise_id)}
              edited={editedSlotIds.has(s.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      </div>
      <div className="flex flex-wrap items-center gap-y-1 px-4 py-3 sm:px-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAddOpen(true)}
          disabled={nextIndex === null}
        >
          <Plus size={14} className="mr-1" /> Agregar ejercicio
        </Button>
        {nextIndex === null && (
          <span className="ml-2 text-xs text-muted-foreground">
            Máximo 12 por día.
          </span>
        )}
        <ExerciseSwapDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSelect={(_, exercise) => onAdd(dayOfWeek, exercise)}
          title={`Agregar ejercicio al día ${dayOfWeek}`}
        />
      </div>
    </section>
  );
}

export function nextAvailableSlotIndex(
  slots: Pick<RutinaSlot, 'slot_index'>[]
) {
  const occupied = new Set(slots.map((slot) => slot.slot_index));
  for (let index = 1; index <= 12; index += 1) {
    if (!occupied.has(index)) return index;
  }
  return null;
}
```

NOTE: `ExerciseSwapDialog`'s `onSelect` signature is `(exerciseId: number, exercise: Exercise) => void` — verify against the actual file before wiring; adjust the lambda if it differs.

- [ ] **Step 5: Run tests — SlotRow tests pass; typecheck will fail on DetailPaneActivas (expected)**

```bash
cd frontend && npx vitest run src/components/admin/rutinas/activas/SlotRow.test.tsx
```
Expected: PASS. `npx tsc --noEmit` will report `DetailPaneActivas.tsx` passing removed props — Task 5 fixes it; do NOT commit yet if typecheck must stay green per your workflow — instead commit Tasks 4+5 together IF the reviewer requires green typecheck per commit. Default: proceed to Task 5 and commit there. (If committing here, note the transient breakage in the message.)

---

### Task 5: Draft state + save bar in DetailPaneActivas

**Files:**
- Modify: `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx`
- Modify: `frontend/src/components/admin/rutinas/activas/ActivasPane.tsx`
- Test: `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.test.tsx` (new)

**Interfaces:**
- Consumes: `useApplyRutinaEdits` + `ApplyEditsInput` (Task 3); `DayCard`/`SlotRow` props (Task 4); existing `useActiveRutina`, `useAlerts`, `SlotOverride`.
- Produces: `DetailPaneActivas` gains optional prop `onDirtyChange?: (dirty: boolean) => void`; `ActivasPane` uses it to guard athlete switches.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.test.tsx`. Mock the network layer at the axios-client level (match how other tests in the repo mock `@/lib/api`; adjust if the repo uses MSW):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DetailPaneActivas } from './DetailPaneActivas';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const rutinaResponse = {
  rutina: {
    profile: {
      name: 'Test Athlete',
      days_per_week: 2,
      days_specific: ['lun', 'mar'],
    },
    days: [
      { day_of_week: 1, focus: 'pecho' },
      { day_of_week: 2, focus: 'espalda' },
    ],
    slots: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        day_of_week: 1,
        slot_index: 1,
        exercise_id: 1,
        role: 'principal',
        notes: null,
        exercise_name: 'Press Banca',
        muscle_group: 'Pecho - Mayor',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        day_of_week: 1,
        slot_index: 2,
        exercise_id: 2,
        role: 'accesorio',
        notes: null,
        series: 2,
        reps: '10x10x10',
        descanso: '2 min',
        exercise_name: 'Aperturas',
        muscle_group: 'Pecho - Mayor',
      },
    ],
    has_active_session: false,
  },
  pending_skeleton_id: null,
};

function renderPane() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter>
          <DetailPaneActivas athleteId="athlete-1" />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/admin/rutinas/atleta/')) {
      return { data: rutinaResponse };
    }
    // alerts query
    return { data: { items: [] } };
  });
  vi.mocked(api.post).mockResolvedValue({ data: {} });
});

describe('DetailPaneActivas draft save', () => {
  it('does not show save bar without changes', async () => {
    renderPane();
    await screen.findByText('Press Banca');
    expect(screen.queryByText(/sin guardar/)).not.toBeInTheDocument();
  });

  it('deleting a slot stages it and Guardar sends one apply-edits call', async () => {
    const user = userEvent.setup();
    renderPane();
    await screen.findByText('Press Banca');

    // open the accesorio's edit popover and delete it
    const editButtons = screen.getAllByRole('button', { name: /editar/i });
    await user.click(editButtons[1]);
    await user.click(screen.getByRole('button', { name: /eliminar/i }));

    // slot hidden locally, no network write yet
    expect(screen.queryByText('Aperturas')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();

    // save bar visible
    expect(screen.getByText(/sin guardar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
    });
    const [url, body] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/admin/rutinas/atleta/athlete-1/apply-edits');
    expect(body.deleted_slot_ids).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('Descartar restores server state without network calls', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true);
    renderPane();
    await screen.findByText('Press Banca');

    const editButtons = screen.getAllByRole('button', { name: /editar/i });
    await user.click(editButtons[1]);
    await user.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(screen.queryByText('Aperturas')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(await screen.findByText('Aperturas')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

CAVEAT: the popover trigger's accessible name must be checked against `EditSlotPopover` (read the file; it may be an icon button labeled "Editar" or similar). Adjust the `getAllByRole` queries to the real names before running. If popover interaction proves brittle in jsdom, refactor the draft logic into a `useRutinaDraft(serverSlots)` hook in the same folder and unit-test the hook directly with `renderHook` (edit → delete → payload build), keeping one smoke test for the bar.

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && npx vitest run src/components/admin/rutinas/activas/DetailPaneActivas.test.tsx
```
Expected: FAIL (deletes still fire instantly; no save bar).

- [ ] **Step 3: Implement draft state in DetailPaneActivas**

Replace `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx` content:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveRutina, useApplyRutinaEdits } from '@/hooks/useAdminRutina';
import { useAlerts } from '@/hooks/useAlerts';
import { DayCard } from './DayCard';
import { ChangeTrainingDaysDialog } from './ChangeTrainingDaysDialog';
import type { SlotOverride } from '@/components/admin/rutinas/EditSlotPopover';
import type { Exercise, RutinaSlot, ApplyEditsInput } from '@/types/api';

export function DetailPaneActivas({
  athleteId,
  onDirtyChange,
}: {
  athleteId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [daysOpen, setDaysOpen] = useState(false);
  const { data, isLoading, error } = useActiveRutina(athleteId);
  const rutina = data?.rutina ?? null;
  const pendingSkeletonId = data?.pending_skeleton_id ?? null;
  const applyEdits = useApplyRutinaEdits(athleteId);

  // ── Draft state (mirrors the queue editor's DetailPane) ──────────────────
  const [overrides, setOverrides] = useState<Record<string, SlotOverride>>({});
  const [order, setOrder] = useState<RutinaSlot[] | null>(null);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [orderDirty, setOrderDirty] = useState(false);

  const hasDraftChanges =
    Object.keys(overrides).length > 0 ||
    deleted.size > 0 ||
    addedIds.size > 0 ||
    orderDirty;

  useEffect(() => {
    onDirtyChange?.(hasDraftChanges);
    return () => onDirtyChange?.(false);
  }, [hasDraftChanges, onDirtyChange]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!hasDraftChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDraftChanges]);

  const serverSlots = useMemo(
    () =>
      [...(rutina?.slots ?? [])].sort(
        (a, b) => a.day_of_week - b.day_of_week || a.slot_index - b.slot_index
      ),
    [rutina]
  );

  // Local order (incl. added slots) minus deletions, with overrides merged in.
  const draftSlots = useMemo(
    () =>
      (order ?? serverSlots)
        .filter((s) => !deleted.has(s.id))
        .map((s) => {
          const ov = overrides[s.id];
          if (!ov) return s;
          return {
            ...s,
            exercise_id: ov.exercise_id,
            exercise_name: ov.exercise_name,
            muscle_group: ov.muscle_group,
            notes: ov.notes ?? null,
            ...('series' in ov
              ? { series: ov.series, reps: ov.reps, descanso: ov.descanso }
              : {}),
          };
        }),
    [order, serverSlots, deleted, overrides]
  );

  const editedSlotIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(overrides));
    for (const id of addedIds) ids.add(id);
    return ids;
  }, [overrides, addedIds]);

  const { data: alertsData } = useAlerts({ status: 'open', athleteId });
  const flaggedExerciseIds = new Set<number>(
    (alertsData?.items ?? [])
      .filter((a) => a.type === 'sos_pain' && a.exercise_id != null)
      .map((a) => a.exercise_id as number)
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function resetDraft() {
    setOverrides({});
    setOrder(null);
    setDeleted(new Set());
    setAddedIds(new Set());
    setOrderDirty(false);
  }

  function onEdit(slotId: string, payload: SlotOverride) {
    // Added slots only exist locally (in `order`); fold edits into the slot.
    if (addedIds.has(slotId)) {
      const hasScheme = 'series' in payload;
      setOrder((list) =>
        (list ?? []).map((s) =>
          s.id === slotId
            ? {
                ...s,
                exercise_id: payload.exercise_id,
                exercise_name: payload.exercise_name,
                muscle_group: payload.muscle_group,
                notes: payload.notes ?? null,
                ...(hasScheme
                  ? {
                      series: payload.series ?? null,
                      reps: payload.reps ?? null,
                      descanso: payload.descanso ?? null,
                    }
                  : {}),
              }
            : s
        )
      );
      return;
    }
    setOverrides((m) => ({ ...m, [slotId]: payload }));
  }

  function onDelete(slotId: string) {
    setDeleted((s) => new Set(s).add(slotId));
  }

  function onAdd(dayOfWeek: number, exercise: Exercise) {
    const daySlots = draftSlots.filter((s) => s.day_of_week === dayOfWeek);
    if (daySlots.length >= 12) {
      toast.error('Un día no puede tener más de 12 ejercicios');
      return;
    }
    const newSlot: RutinaSlot = {
      id: crypto.randomUUID(),
      day_of_week: dayOfWeek,
      slot_index: daySlots.length + 1,
      exercise_id: exercise.id,
      role: 'accesorio',
      notes: null,
      series: null,
      reps: null,
      descanso: null,
      exercise_name: exercise.name,
      muscle_group: exercise.muscle_group,
      equipment: exercise.equipment,
    };
    setOrder((list) => [...(list ?? serverSlots), newSlot]);
    setAddedIds((s) => new Set(s).add(newSlot.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;

    const sorted = [...draftSlots];
    const movingIndex = sorted.findIndex((s) => s.id === activeId);
    const targetIndex = sorted.findIndex((s) => s.id === overId);
    if (movingIndex < 0 || targetIndex < 0) return;
    const targetDay = sorted[targetIndex].day_of_week;

    const moved = { ...sorted.splice(movingIndex, 1)[0], day_of_week: targetDay };
    const insertAt = sorted.findIndex((s) => s.id === overId);
    sorted.splice(insertAt, 0, moved);

    const counts = new Map<number, number>();
    for (const s of sorted) {
      counts.set(s.day_of_week, (counts.get(s.day_of_week) ?? 0) + 1);
    }
    if ([...counts.values()].some((n) => n > 12)) {
      toast.error('Un día no puede tener más de 12 ejercicios');
      return;
    }
    // `order` must keep deleted slots so discard can restore them; splice the
    // moved slot into the previous full order.
    setOrder(() => {
      const full = [...(order ?? serverSlots)];
      const visibleIds = sorted.map((s) => s.id);
      const hidden = full.filter((s) => !visibleIds.includes(s.id));
      return [...sorted, ...hidden];
    });
    setOrderDirty(true);
  }

  async function onSave() {
    const deleted_slot_ids = [...deleted];
    const added_slots = (order ?? [])
      .filter((s) => addedIds.has(s.id) && !deleted.has(s.id))
      .map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        exercise_id: s.exercise_id,
        role: s.role,
        notes: s.notes ?? undefined,
        series: s.series ?? null,
        reps: s.reps ?? null,
        descanso: s.descanso ?? null,
      }));
    const slot_overrides = Object.entries(overrides)
      .filter(([slot_id]) => !deleted.has(slot_id))
      .map(([slot_id, ov]) => ({
        slot_id,
        exercise_id: ov.exercise_id,
        notes: ov.notes,
        ...('series' in ov
          ? { series: ov.series, reps: ov.reps, descanso: ov.descanso }
          : {}),
      }));
    // Reindex 1..N per day, preserving local order, skipping deleted slots.
    const perDay = new Map<number, number>();
    const slot_order = order
      ? order
          .filter((s) => !deleted.has(s.id))
          .map((s) => {
            const idx = (perDay.get(s.day_of_week) ?? 0) + 1;
            perDay.set(s.day_of_week, idx);
            return { slot_id: s.id, day_of_week: s.day_of_week, slot_index: idx };
          })
      : undefined;

    const payload: ApplyEditsInput = {
      slot_overrides,
      slot_order,
      deleted_slot_ids,
      added_slots,
    };
    try {
      await applyEdits.mutateAsync(payload);
      resetDraft();
      toast.success('Cambios guardados');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) toast.error('Rutina ya no activa');
      else toast.error('No se pudieron guardar los cambios');
    }
  }

  function onDiscard() {
    if (!window.confirm('¿Descartar todos los cambios sin guardar?')) return;
    resetDraft();
  }

  if (isLoading) {
    return (
      <div className="p-7 text-sm text-muted-foreground">
        Cargando rutina...
      </div>
    );
  }
  if (error || !rutina) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <p>Este atleta aún no tiene rutina activa.</p>
        {pendingSkeletonId && (
          <Link
            to={`/admin/rutinas/${pendingSkeletonId}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Ver en cola pendiente <ExternalLink size={12} />
          </Link>
        )}
      </div>
    );
  }

  const slotsByDay = new Map<number, RutinaSlot[]>();
  for (const s of draftSlots) {
    if (!slotsByDay.has(s.day_of_week)) slotsByDay.set(s.day_of_week, []);
    slotsByDay.get(s.day_of_week)!.push(s);
  }
  const dayFocus = new Map(rutina.days.map((d) => [d.day_of_week, d.focus]));
  const days = Array.from(
    new Set<number>([
      ...rutina.days.map((d) => d.day_of_week),
      ...draftSlots.map((s) => s.day_of_week),
    ])
  ).sort((a, b) => a - b);

  const changeCount =
    Object.keys(overrides).filter((id) => !deleted.has(id)).length +
    [...addedIds].filter((id) => !deleted.has(id)).length +
    deleted.size +
    (orderDirty ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-border px-4 py-5 lg:px-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{rutina.profile.name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              <Link
                to={`/admin/users/${athleteId}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                Perfil <ExternalLink size={12} />
              </Link>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {rutina.profile.days_per_week} días/sem
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setDaysOpen(true)}>
            Cambiar días
          </Button>
        </div>
        {rutina.has_active_session && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} />
            Atleta tiene sesión en curso. Los cambios aplicarán en la próxima
            sesión.
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-6 pb-10 lg:px-7">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {days.map((d) => (
            <DayCard
              key={d}
              dayOfWeek={d}
              focus={dayFocus.get(d) ?? null}
              slots={slotsByDay.get(d) ?? []}
              flaggedExerciseIds={flaggedExerciseIds}
              editedSlotIds={editedSlotIds}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdd={onAdd}
            />
          ))}
        </DndContext>
      </div>
      {hasDraftChanges && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 lg:px-7">
          <span className="text-sm text-muted-foreground">
            {changeCount} {changeCount === 1 ? 'cambio' : 'cambios'} sin
            guardar
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={applyEdits.isPending}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={applyEdits.isPending}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
      <ChangeTrainingDaysDialog
        athleteId={athleteId}
        current={rutina.profile.days_specific}
        open={daysOpen}
        onOpenChange={setDaysOpen}
      />
    </div>
  );
}
```

IMPORTANT details for the implementer:
- `handleDragEnd`'s `setOrder` closes over `order`/`serverSlots` — keep them in the function body as written (they're from the same render; dnd-kit fires once per drop).
- `Exercise` type: check `frontend/src/types/api.ts` for the exact fields (`id`, `name`, `muscle_group`, `equipment`).
- Query invalidation on save refetches the detail; because the draft was reset first, the fresh server state renders directly.

- [ ] **Step 4: Guard athlete switches in ActivasPane**

Replace `frontend/src/components/admin/rutinas/activas/ActivasPane.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ListPaneActivas } from './ListPaneActivas';
import { DetailPaneActivas } from './DetailPaneActivas';

export function ActivasPane() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);

  function onSelect(id: string) {
    if (id === athleteId) return;
    if (
      dirty &&
      !window.confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar de atleta?')
    ) {
      return;
    }
    setDirty(false);
    navigate(`/admin/rutinas/atleta/${id}`);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
      <ListPaneActivas activeId={athleteId} onSelect={onSelect} />
      <div className="flex min-h-0 flex-col lg:overflow-hidden">
        {athleteId ? (
          <DetailPaneActivas
            key={athleteId}
            athleteId={athleteId}
            onDirtyChange={setDirty}
          />
        ) : (
          <EmptyHint />
        )}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Seleccioná un atleta para ver y editar su rutina activa.
    </div>
  );
}
```

`key={athleteId}` remounts the pane per athlete so draft state can never leak across athletes.

- [ ] **Step 5: Run new tests + full frontend suite + typecheck**

```bash
cd frontend && npx vitest run src/components/admin/rutinas/activas/ && npx tsc --noEmit && npx eslint src/components/admin/rutinas/activas src/hooks/useAdminRutina.ts
```
Expected: all pass, no type errors. `ListPaneActivas.test.tsx` must still pass (onSelect signature unchanged).

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(admin): draft edits with explicit save in activas editor"
```

---

### Task 6: End-to-end verification + cleanup

**Files:**
- No new files; verification only. Possibly remove now-unused hooks (`useUpdateSlot`, `useDeleteSlot`, `useCreateSlot`, `useReorderSlots`) IF nothing else imports them — check first.

- [ ] **Step 1: Check for dead hook usages**

```bash
cd frontend && grep -rn "useUpdateSlot\|useDeleteSlot\|useCreateSlot\|useReorderSlots" src --include='*.tsx' --include='*.ts'
```
If only `useAdminRutina.ts` defines them and nothing imports them: delete the four hooks (and their unused imports/types) from `useAdminRutina.ts`. Keep the backend endpoints (Global Constraints). If something still imports them, leave them.

- [ ] **Step 2: Run both suites**

```bash
cd backend && TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5433/trfit_test' node --experimental-vm-modules node_modules/jest/bin/jest.js
cd ../frontend && npx vitest run && npx tsc --noEmit
```
Expected: all green.

- [ ] **Step 3: Manual smoke via dev server (verify skill applies here)**

Start `npm run start:dev` from the repo root, open `http://localhost:3000/admin/rutinas/atleta/<some-athlete-id>` and verify:
1. Drag a slot → no network call fires (DevTools Network), save bar appears.
2. Edit series in the popover → staged, marker dot on the row.
3. Guardar → single `apply-edits` request, 204, UI refreshes, bar disappears, series/reps/descanso intact on untouched slots.
4. Descartar → confirm dialog, state restored.
5. Switch athlete with unsaved changes → confirm dialog.
6. Reload with unsaved changes → browser beforeunload prompt.

- [ ] **Step 4: Commit cleanup (if any)**

```bash
git add frontend/src/hooks/useAdminRutina.ts
git commit -m "chore(admin): drop unused single-op rutina mutation hooks"
```
