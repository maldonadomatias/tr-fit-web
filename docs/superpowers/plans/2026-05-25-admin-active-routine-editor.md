# Admin Active Routine Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admin to view and manually edit any athlete's active (approved) routine slot-by-slot from `/admin/rutinas` with in-place persistence.

**Architecture:** Extend `/admin/rutinas` with a second tab "Activas" rendering a split-pane list + per-day editor. Backend exposes per-slot CRUD on `skeleton_slots` of the athlete's `active_skeleton_id` (status='approved') with weight-seeding side effects matching the approval flow. Frontend uses React Query with optimistic updates and `@dnd-kit` for cross-day reorder.

**Tech Stack:** Express + Zod + PostgreSQL (backend); React 19 + React Router 7 + TanStack Query + Tailwind + shadcn/ui + @dnd-kit (frontend); Jest (backend tests).

**Spec:** `docs/superpowers/specs/2026-05-25-admin-active-routine-editor-design.md`

---

## File Structure

**Backend (new):**
- `backend/src/services/admin-rutina.service.ts` — query + mutation functions, transactions, weight seeding.
- `backend/src/routes/admin-rutinas.ts` — Router with Zod-validated endpoints (separate file from existing `rutinas.ts`).
- `backend/tests/unit/admin-rutina.service.test.ts` — service unit tests against test DB.
- `backend/tests/integration/admin-rutinas.routes.test.ts` — route integration tests.

**Backend (modify):**
- `backend/src/domain/schemas.ts` — add Zod schemas for slot payloads.
- `backend/src/routes/index.ts` — mount new router at `/admin/rutinas` BEFORE existing `rutinas` queue router (paths do not collide; admin-rutinas only has `/atleta/*` and `/slots/*`).

**Frontend (new):**
- `frontend/src/hooks/useAdminRutina.ts` — React Query hooks.
- `frontend/src/components/admin/rutinas/RutinasTabs.tsx` — tab switcher (Cola / Activas).
- `frontend/src/components/admin/rutinas/activas/ListPaneActivas.tsx`
- `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx`
- `frontend/src/components/admin/rutinas/activas/DayCard.tsx`
- `frontend/src/components/admin/rutinas/activas/SlotRow.tsx`
- `frontend/src/components/admin/rutinas/activas/ExerciseSwapDialog.tsx`

**Frontend (modify):**
- `frontend/package.json` — add `@dnd-kit/core` + `@dnd-kit/sortable`.
- `frontend/src/types/api.ts` — add `ActiveAthleteRow`, `RutinaDetail`, `SlotPatch` types.
- `frontend/src/pages/admin/Rutinas.tsx` — branch on pathname to render `cola` or `activas` mode.
- `frontend/src/pages/admin/UserDetail.tsx` — add "Ver rutina activa" button.
- `frontend/src/App.tsx` — add `/admin/rutinas/atleta` and `/admin/rutinas/atleta/:athleteId` routes.

---

## Task 1: Add Zod schemas for slot payloads

**Files:**
- Modify: `backend/src/domain/schemas.ts`

- [ ] **Step 1: Open `backend/src/domain/schemas.ts`, append the following schemas**

```ts
import { z } from 'zod';

export const slotRoleEnum = z.enum(['calentamiento', 'principal', 'accesorio']);

export const adminSlotCreatePayload = z.object({
  day_of_week: z.number().int().min(1).max(7),
  slot_index: z.number().int().min(0).max(50),
  exercise_id: z.number().int().positive(),
  role: slotRoleEnum,
  notes: z.string().max(2000).nullable().optional(),
});

export const adminSlotPatchPayload = z
  .object({
    exercise_id: z.number().int().positive().optional(),
    notes: z.string().max(2000).nullable().optional(),
    slot_index: z.number().int().min(0).max(50).optional(),
    day_of_week: z.number().int().min(1).max(7).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'empty_patch',
  });

export const adminReorderPayload = z.object({
  slots: z
    .array(
      z.object({
        slot_id: z.string().uuid(),
        day_of_week: z.number().int().min(1).max(7),
        slot_index: z.number().int().min(0).max(50),
      }),
    )
    .min(1)
    .max(200),
});

export const adminListAthletesQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type AdminSlotCreate = z.infer<typeof adminSlotCreatePayload>;
export type AdminSlotPatch = z.infer<typeof adminSlotPatchPayload>;
export type AdminReorderInput = z.infer<typeof adminReorderPayload>;
```

(If `import { z } from 'zod';` is already at the top of the file, do not duplicate it.)

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add backend/src/domain/schemas.ts
git commit -m "feat(admin-rutinas): zod schemas for slot CRUD payloads"
```

---

## Task 2: Service skeleton + `listActiveAthletes`

**Files:**
- Create: `backend/src/services/admin-rutina.service.ts`
- Create: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Create service file with error class + listActiveAthletes signature**

```ts
// backend/src/services/admin-rutina.service.ts
import pool from '../db/connect.js';
import type { PoolClient } from 'pg';
import type { SkeletonSlot, AthleteSkeleton } from '../domain/types.js';

export type AdminRutinaErrorCode =
  | 'not_found'
  | 'rutina_not_active'
  | 'invalid_exercise'
  | 'empty_patch';

export class AdminRutinaError extends Error {
  constructor(public code: AdminRutinaErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface ActiveAthleteRow {
  athlete_id: string;
  name: string;
  skeleton_id: string;
  reviewed_at: string | null;
  days_per_week: number;
}

export async function listActiveAthletes(opts: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ActiveAthleteRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const q = opts.q ? `%${opts.q.toLowerCase()}%` : null;

  const params: unknown[] = [];
  let where = `s.status = 'approved' AND ps.active_skeleton_id = s.id`;
  if (q) {
    params.push(q);
    where += ` AND LOWER(ap.name) LIKE $${params.length}`;
  }

  const totalSql = `
    SELECT COUNT(*)::int AS c
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}`;
  const total = (await pool.query<{ c: number }>(totalSql, params)).rows[0].c;

  params.push(limit, offset);
  const sql = `
    SELECT s.athlete_id, ap.name, s.id AS skeleton_id,
           s.reviewed_at, ap.days_per_week
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}
     ORDER BY s.reviewed_at DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await pool.query<ActiveAthleteRow>(sql, params);
  return { items: rows, total };
}
```

- [ ] **Step 2: Write failing test**

```ts
// backend/tests/unit/admin-rutina.service.test.ts
import pool from '../../src/db/connect.js';
import {
  listActiveAthletes,
} from '../../src/services/admin-rutina.service.js';

describe('listActiveAthletes', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM athlete_program_state`);
    await pool.query(`DELETE FROM skeleton_slots`);
    await pool.query(`DELETE FROM skeleton_days`);
    await pool.query(`DELETE FROM athlete_skeletons`);
    await pool.query(`DELETE FROM athlete_profiles`);
    await pool.query(`DELETE FROM users WHERE email LIKE 'test-rutina-%'`);
  });

  afterAll(async () => { await pool.end(); });

  it('returns only athletes with approved active skeleton', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-1@x.com', 'x', 'athlete', 'active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'Juan','male',30,175,75,'medio','hipertrofia',4,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, sk.rows[0].id],
    );

    const result = await listActiveAthletes({});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      athlete_id: aid,
      name: 'Juan',
      skeleton_id: sk.rows[0].id,
      days_per_week: 4,
    });
  });

  it('filters by name search', async () => {
    // similar setup with two athletes; assert q='ana' returns 1
    const ids: string[] = [];
    for (const name of ['Ana', 'Juan']) {
      const u = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1,'x','athlete','active') RETURNING id`,
        [`test-rutina-${name}@x.com`],
      );
      const aid = u.rows[0].id;
      ids.push(aid);
      await pool.query(
        `INSERT INTO athlete_profiles
           (user_id, name, gender, age, height_cm, weight_kg, level, goal,
            days_per_week, equipment, injuries, onboarded_at)
         VALUES ($1,$2,'male',30,175,75,'medio','hipertrofia',4,
                 'gym_completo','{}',NOW())`,
        [aid, name],
      );
      const sk = await pool.query<{ id: string }>(
        `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
         VALUES ($1,'approved','ai') RETURNING id`,
        [aid],
      );
      await pool.query(
        `INSERT INTO athlete_program_state
           (athlete_id, active_skeleton_id, current_week, start_date)
         VALUES ($1,$2,1,CURRENT_DATE)`,
        [aid, sk.rows[0].id],
      );
    }

    const result = await listActiveAthletes({ q: 'ana' });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Ana');
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS for both tests.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): listActiveAthletes service + tests"
```

---

## Task 3: Service `getActiveRutina`

**Files:**
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Add interface + function**

```ts
// append to admin-rutina.service.ts
export interface RutinaDetail {
  skeleton: AthleteSkeleton;
  slots: SkeletonSlot[];
  days: { day_of_week: number; focus: string | null }[];
  profile: {
    user_id: string;
    name: string;
    days_per_week: number;
  };
  has_active_session: boolean;
}

export async function getActiveRutina(
  athleteId: string,
): Promise<RutinaDetail | null> {
  const state = await pool.query<{ active_skeleton_id: string | null }>(
    `SELECT active_skeleton_id FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  const skId = state.rows[0]?.active_skeleton_id;
  if (!skId) return null;

  const skR = await pool.query<AthleteSkeleton>(
    `SELECT * FROM athlete_skeletons WHERE id = $1 AND status = 'approved'`,
    [skId],
  );
  if (!skR.rows[0]) return null;

  const slotsR = await pool.query<SkeletonSlot>(
    `SELECT s.*, e.name AS exercise_name, e.muscle_group, e.equipment
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.skeleton_id = $1
      ORDER BY s.day_of_week, s.slot_index`,
    [skId],
  );
  const daysR = await pool.query<{ day_of_week: number; focus: string | null }>(
    `SELECT day_of_week, focus FROM skeleton_days WHERE skeleton_id = $1
      ORDER BY day_of_week`,
    [skId],
  );
  const profR = await pool.query<{
    user_id: string;
    name: string;
    days_per_week: number;
  }>(
    `SELECT user_id, name, days_per_week FROM athlete_profiles
      WHERE user_id = $1`,
    [athleteId],
  );
  const sessR = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_logs
        WHERE athlete_id = $1 AND finished_at IS NULL
     ) AS exists`,
    [athleteId],
  );

  return {
    skeleton: skR.rows[0],
    slots: slotsR.rows,
    days: daysR.rows,
    profile: profR.rows[0],
    has_active_session: sessR.rows[0].exists,
  };
}
```

- [ ] **Step 2: Add test**

```ts
// add to admin-rutina.service.test.ts
import { getActiveRutina } from '../../src/services/admin-rutina.service.js';

describe('getActiveRutina', () => {
  it('returns null when athlete has no program state', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-empty@x.com','x','athlete','active') RETURNING id`,
    );
    const r = await getActiveRutina(u.rows[0].id);
    expect(r).toBeNull();
  });

  it('returns skeleton + slots + days for approved skeleton', async () => {
    // setup athlete with approved skeleton + 2 slots + 1 day row
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-d@x.com','x','athlete','active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'Test','male',30,175,75,'medio','hipertrofia',3,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    const skId = sk.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, skId],
    );
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
    );
    const exId = ex.rows[0].id;
    await pool.query(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
       VALUES ($1,1,0,$2,'principal',null),($1,1,1,$2,'accesorio','x')`,
      [skId, exId],
    );
    await pool.query(
      `INSERT INTO skeleton_days (skeleton_id, day_of_week, focus)
       VALUES ($1, 1, 'tren superior')`,
      [skId],
    );

    const r = await getActiveRutina(aid);
    expect(r).not.toBeNull();
    expect(r!.slots).toHaveLength(2);
    expect(r!.days[0].focus).toBe('tren superior');
    expect(r!.has_active_session).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): getActiveRutina service"
```

---

## Task 4: Service `assertActiveSkeleton` helper + `createSlot`

**Files:**
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Add guard helper + createSlot**

```ts
async function assertAthleteActiveSkeleton(
  client: PoolClient,
  athleteId: string,
): Promise<string> {
  const r = await client.query<{ skeleton_id: string }>(
    `SELECT s.id AS skeleton_id
       FROM athlete_program_state ps
       JOIN athlete_skeletons s
         ON s.id = ps.active_skeleton_id AND s.status = 'approved'
      WHERE ps.athlete_id = $1`,
    [athleteId],
  );
  if (!r.rows[0]) throw new AdminRutinaError('rutina_not_active');
  return r.rows[0].skeleton_id;
}

async function assertExerciseAvailable(
  client: PoolClient,
  exerciseId: number,
): Promise<void> {
  const r = await client.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id = $1 AND archived_at IS NULL`,
    [exerciseId],
  );
  if (!r.rows[0]) throw new AdminRutinaError('invalid_exercise');
}

async function seedAthleteExerciseWeight(
  client: PoolClient,
  athleteId: string,
  exerciseId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_reps_text, updated_by)
     VALUES ($1, $2, NULL, NULL, 'athlete_initial')
     ON CONFLICT (athlete_id, exercise_id) DO NOTHING`,
    [athleteId, exerciseId],
  );
}

import type { AdminSlotCreate } from '../domain/schemas.js';

export async function createSlot(
  athleteId: string,
  input: AdminSlotCreate,
): Promise<SkeletonSlot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const skId = await assertAthleteActiveSkeleton(client, athleteId);
    await assertExerciseAvailable(client, input.exercise_id);
    const r = await client.query<SkeletonSlot>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        skId,
        input.day_of_week,
        input.slot_index,
        input.exercise_id,
        input.role,
        input.notes ?? null,
      ],
    );
    await seedAthleteExerciseWeight(client, athleteId, input.exercise_id);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Add tests**

```ts
import { createSlot, AdminRutinaError } from '../../src/services/admin-rutina.service.js';

describe('createSlot', () => {
  async function setupAthleteWithActiveSkeleton() {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-cs@x.com','x','athlete','active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'T','male',30,175,75,'medio','hipertrofia',3,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, sk.rows[0].id],
    );
    return { aid, skId: sk.rows[0].id };
  }

  it('inserts slot and seeds athlete_exercise_weights', async () => {
    const { aid } = await setupAthleteWithActiveSkeleton();
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
    );

    const slot = await createSlot(aid, {
      day_of_week: 1,
      slot_index: 0,
      exercise_id: ex.rows[0].id,
      role: 'principal',
      notes: 'fresh',
    });
    expect(slot.exercise_id).toBe(ex.rows[0].id);

    const w = await pool.query(
      `SELECT 1 FROM athlete_exercise_weights
        WHERE athlete_id = $1 AND exercise_id = $2`,
      [aid, ex.rows[0].id],
    );
    expect(w.rowCount).toBe(1);
  });

  it('throws rutina_not_active when athlete has no approved skeleton', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-no@x.com','x','athlete','active') RETURNING id`,
    );
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
    );
    await expect(
      createSlot(u.rows[0].id, {
        day_of_week: 1, slot_index: 0,
        exercise_id: ex.rows[0].id, role: 'principal', notes: null,
      }),
    ).rejects.toBeInstanceOf(AdminRutinaError);
  });

  it('throws invalid_exercise for archived/missing exercise', async () => {
    const { aid } = await setupAthleteWithActiveSkeleton();
    await expect(
      createSlot(aid, {
        day_of_week: 1, slot_index: 0,
        exercise_id: 99999999, role: 'principal', notes: null,
      }),
    ).rejects.toMatchObject({ code: 'invalid_exercise' });
  });
});
```

- [ ] **Step 3: Run + verify**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS all three new tests.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): createSlot service with weight seed"
```

---

## Task 5: Service `updateSlot`

**Files:**
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Add updateSlot**

```ts
import type { AdminSlotPatch } from '../domain/schemas.js';

async function assertSlotInActiveSkeleton(
  client: PoolClient,
  slotId: string,
): Promise<{ athleteId: string; skeletonId: string }> {
  const r = await client.query<{ athlete_id: string; skeleton_id: string }>(
    `SELECT s.athlete_id, s.id AS skeleton_id
       FROM skeleton_slots sl
       JOIN athlete_skeletons s ON s.id = sl.skeleton_id
       JOIN athlete_program_state ps
         ON ps.athlete_id = s.athlete_id
        AND ps.active_skeleton_id = s.id
      WHERE sl.id = $1 AND s.status = 'approved'`,
    [slotId],
  );
  if (!r.rows[0]) throw new AdminRutinaError('rutina_not_active');
  return {
    athleteId: r.rows[0].athlete_id,
    skeletonId: r.rows[0].skeleton_id,
  };
}

export async function updateSlot(
  slotId: string,
  patch: AdminSlotPatch,
): Promise<SkeletonSlot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { athleteId } = await assertSlotInActiveSkeleton(client, slotId);
    if (patch.exercise_id !== undefined) {
      await assertExerciseAvailable(client, patch.exercise_id);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      values.push(v);
      sets.push(`${k} = $${values.length}`);
    }
    values.push(slotId);
    const r = await client.query<SkeletonSlot>(
      `UPDATE skeleton_slots SET ${sets.join(', ')}
        WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (patch.exercise_id !== undefined) {
      await seedAthleteExerciseWeight(client, athleteId, patch.exercise_id);
    }
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Add tests**

```ts
import { updateSlot } from '../../src/services/admin-rutina.service.js';

describe('updateSlot', () => {
  async function setupSlot() {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-us@x.com','x','athlete','active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'T','male',30,175,75,'medio','hipertrofia',3,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, sk.rows[0].id],
    );
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL ORDER BY id LIMIT 2`,
    );
    const slot = await pool.query<{ id: string }>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
       VALUES ($1,1,0,$2,'principal','old') RETURNING id`,
      [sk.rows[0].id, ex.rows[0].id],
    );
    return {
      aid,
      slotId: slot.rows[0].id,
      ex1: ex.rows[0].id,
      ex2: ex.rows[1].id,
    };
  }

  it('patches notes only', async () => {
    const { slotId } = await setupSlot();
    const r = await updateSlot(slotId, { notes: 'new' });
    expect(r.notes).toBe('new');
  });

  it('swaps exercise and seeds weight row for new exercise', async () => {
    const { aid, slotId, ex2 } = await setupSlot();
    const r = await updateSlot(slotId, { exercise_id: ex2 });
    expect(r.exercise_id).toBe(ex2);
    const w = await pool.query(
      `SELECT 1 FROM athlete_exercise_weights
        WHERE athlete_id = $1 AND exercise_id = $2`,
      [aid, ex2],
    );
    expect(w.rowCount).toBe(1);
  });

  it('returns rutina_not_active when slot belongs to superseded skeleton', async () => {
    const { slotId } = await setupSlot();
    await pool.query(
      `UPDATE athlete_skeletons SET status = 'superseded'
        WHERE id = (SELECT skeleton_id FROM skeleton_slots WHERE id = $1)`,
      [slotId],
    );
    await expect(
      updateSlot(slotId, { notes: 'x' }),
    ).rejects.toMatchObject({ code: 'rutina_not_active' });
  });
});
```

- [ ] **Step 3: Run + verify**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): updateSlot service with swap seed"
```

---

## Task 6: Service `deleteSlot`

**Files:**
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Add deleteSlot**

```ts
export async function deleteSlot(slotId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertSlotInActiveSkeleton(client, slotId);
    await client.query(`DELETE FROM skeleton_slots WHERE id = $1`, [slotId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Add test**

```ts
import { deleteSlot } from '../../src/services/admin-rutina.service.js';

describe('deleteSlot', () => {
  it('removes slot when in active skeleton', async () => {
    // reuse setupSlot from updateSlot block (extract if needed)
    // ... see setupSlot helper ...
    // For copy-paste safety, inline the same setup here.
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-ds@x.com','x','athlete','active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'T','male',30,175,75,'medio','hipertrofia',3,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, sk.rows[0].id],
    );
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
    );
    const slot = await pool.query<{ id: string }>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role)
       VALUES ($1,1,0,$2,'principal') RETURNING id`,
      [sk.rows[0].id, ex.rows[0].id],
    );

    await deleteSlot(slot.rows[0].id);
    const r = await pool.query(`SELECT 1 FROM skeleton_slots WHERE id = $1`, [
      slot.rows[0].id,
    ]);
    expect(r.rowCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run + verify**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): deleteSlot service"
```

---

## Task 7: Service `reorderSlots` (transactional offset)

**Files:**
- Modify: `backend/src/services/admin-rutina.service.ts`
- Modify: `backend/tests/unit/admin-rutina.service.test.ts`

- [ ] **Step 1: Add reorderSlots**

```ts
import type { AdminReorderInput } from '../domain/schemas.js';

export async function reorderSlots(
  athleteId: string,
  input: AdminReorderInput,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const skId = await assertAthleteActiveSkeleton(client, athleteId);

    // Validate every slot_id belongs to this skeleton
    const slotIds = input.slots.map((s) => s.slot_id);
    const check = await client.query<{ id: string }>(
      `SELECT id FROM skeleton_slots
        WHERE id = ANY($1::uuid[]) AND skeleton_id = $2`,
      [slotIds, skId],
    );
    if (check.rowCount !== slotIds.length) {
      throw new AdminRutinaError('not_found', 'slot not in active skeleton');
    }

    // Bump everything by 1000 to clear unique constraint room
    await client.query(
      `UPDATE skeleton_slots
          SET slot_index = slot_index + 1000
        WHERE skeleton_id = $1`,
      [skId],
    );

    for (const s of input.slots) {
      await client.query(
        `UPDATE skeleton_slots
            SET day_of_week = $1, slot_index = $2
          WHERE id = $3`,
        [s.day_of_week, s.slot_index, s.slot_id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Add test**

```ts
import { reorderSlots } from '../../src/services/admin-rutina.service.js';

describe('reorderSlots', () => {
  it('reorders slots across days without unique violation', async () => {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ('test-rutina-rs@x.com','x','athlete','active') RETURNING id`,
    );
    const aid = u.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_profiles
         (user_id, name, gender, age, height_cm, weight_kg, level, goal,
          days_per_week, equipment, injuries, onboarded_at)
       VALUES ($1,'T','male',30,175,75,'medio','hipertrofia',3,
               'gym_completo','{}',NOW())`,
      [aid],
    );
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
       VALUES ($1,'approved','ai') RETURNING id`,
      [aid],
    );
    await pool.query(
      `INSERT INTO athlete_program_state
         (athlete_id, active_skeleton_id, current_week, start_date)
       VALUES ($1,$2,1,CURRENT_DATE)`,
      [aid, sk.rows[0].id],
    );
    const ex = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
    );
    const slots = await pool.query<{ id: string }>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role)
       VALUES ($1,1,0,$2,'principal'),
              ($1,1,1,$2,'principal'),
              ($1,2,0,$2,'principal')
       RETURNING id`,
      [sk.rows[0].id, ex.rows[0].id],
    );
    const [a, b, c] = slots.rows.map((r) => r.id);

    // Swap slot b to day 2 index 0; push c to day 2 index 1; a stays day 1 index 0
    await reorderSlots(aid, {
      slots: [
        { slot_id: a, day_of_week: 1, slot_index: 0 },
        { slot_id: b, day_of_week: 2, slot_index: 0 },
        { slot_id: c, day_of_week: 2, slot_index: 1 },
      ],
    });

    const r = await pool.query<{
      id: string;
      day_of_week: number;
      slot_index: number;
    }>(`SELECT id, day_of_week, slot_index FROM skeleton_slots ORDER BY id`);
    const m = new Map(r.rows.map((x) => [x.id, x]));
    expect(m.get(b)).toMatchObject({ day_of_week: 2, slot_index: 0 });
    expect(m.get(c)).toMatchObject({ day_of_week: 2, slot_index: 1 });
  });
});
```

- [ ] **Step 3: Run + verify**

Run: `cd backend && npm test -- admin-rutina.service`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/admin-rutina.service.ts backend/tests/unit/admin-rutina.service.test.ts
git commit -m "feat(admin-rutinas): reorderSlots transactional"
```

---

## Task 8: Router `admin-rutinas.ts`

**Files:**
- Create: `backend/src/routes/admin-rutinas.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Create router file**

```ts
// backend/src/routes/admin-rutinas.ts
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  adminListAthletesQuery,
  adminSlotCreatePayload,
  adminSlotPatchPayload,
  adminReorderPayload,
} from '../domain/schemas.js';
import {
  listActiveAthletes,
  getActiveRutina,
  createSlot,
  updateSlot,
  deleteSlot,
  reorderSlots,
  AdminRutinaError,
} from '../services/admin-rutina.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function mapError(err: unknown, res: Response): Response | void {
  if (err instanceof AdminRutinaError) {
    if (err.code === 'rutina_not_active') {
      return res.status(409).json({ error: 'rutina_not_active' });
    }
    if (err.code === 'invalid_exercise') {
      return res.status(400).json({ error: 'invalid_exercise' });
    }
    if (err.code === 'not_found') {
      return res.status(404).json({ error: 'not_found' });
    }
  }
  throw err;
}

router.get('/atleta', async (req: Request, res: Response) => {
  const parsed = adminListAthletesQuery.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  const r = await listActiveAthletes(parsed.data);
  res.json(r);
});

router.get('/atleta/:athleteId', async (req: Request, res: Response) => {
  const r = await getActiveRutina(req.params.athleteId);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});

router.post('/atleta/:athleteId/slots', async (req: Request, res: Response) => {
  const parsed = adminSlotCreatePayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const slot = await createSlot(req.params.athleteId, parsed.data);
    res.status(201).json({ slot });
  } catch (e) {
    mapError(e, res);
  }
});

router.post('/atleta/:athleteId/reorder', async (req: Request, res: Response) => {
  const parsed = adminReorderPayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    await reorderSlots(req.params.athleteId, parsed.data);
    res.status(204).end();
  } catch (e) {
    mapError(e, res);
  }
});

router.patch('/slots/:slotId', async (req: Request, res: Response) => {
  const parsed = adminSlotPatchPayload.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const slot = await updateSlot(req.params.slotId, parsed.data);
    res.json({ slot });
  } catch (e) {
    mapError(e, res);
  }
});

router.delete('/slots/:slotId', async (req: Request, res: Response) => {
  try {
    await deleteSlot(req.params.slotId);
    res.status(204).end();
  } catch (e) {
    mapError(e, res);
  }
});

export default router;
```

- [ ] **Step 2: Register router BEFORE existing rutinas in index.ts**

In `backend/src/routes/index.ts`, add import and mount at same `/admin/rutinas` path, but BEFORE the existing `rutinas` line. New router only matches `/atleta/*` and `/slots/*` so any non-matching request falls through to the queue router.

```ts
// add near other imports
import adminRutinasRouter from './admin-rutinas.js';

// CHANGE this section:
//   router.use('/admin/rutinas', rutinas);
// to:
router.use('/admin/rutinas', adminRutinasRouter);
router.use('/admin/rutinas', rutinas);
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin-rutinas.ts backend/src/routes/index.ts
git commit -m "feat(admin-rutinas): router with slot CRUD endpoints"
```

---

## Task 9: Router integration tests

**Files:**
- Create: `backend/tests/integration/admin-rutinas.routes.test.ts`

- [ ] **Step 1: Look up existing integration test pattern**

Open any existing integration test (search `find backend/tests/integration -name "*.test.ts"`). Identify how a JWT/admin token is minted in tests, how `request(app)` is set up, and reuse the same helpers. If integration directory does not yet exist, peek at how other route tests in `tests/` do it. Reuse exactly that pattern. (If you find no integration tests at all, create the helper inline using `jsonwebtoken` and the same JWT_SECRET env the app reads.)

- [ ] **Step 2: Write tests file**

```ts
// backend/tests/integration/admin-rutinas.routes.test.ts
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/db/connect.js';
import { signTestToken } from './helpers/auth.js'; // adapt to existing helper path

let adminToken: string;
let athleteId: string;
let skeletonId: string;
let slotId: string;
let exerciseId: number;

async function seedFixtures() {
  // create admin user
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status)
     VALUES ('test-admin-rt@x.com','x','admin','active') RETURNING id`,
  );
  adminToken = signTestToken({ id: admin.rows[0].id, role: 'admin' });

  // create athlete + profile + skeleton + slot
  const ath = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status)
     VALUES ('test-athlete-rt@x.com','x','athlete','active') RETURNING id`,
  );
  athleteId = ath.rows[0].id;
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id, name, gender, age, height_cm, weight_kg, level, goal,
        days_per_week, equipment, injuries, onboarded_at)
     VALUES ($1,'X','male',30,175,75,'medio','hipertrofia',3,
             'gym_completo','{}',NOW())`,
    [athleteId],
  );
  const sk = await pool.query<{ id: string }>(
    `INSERT INTO athlete_skeletons (athlete_id, status, generated_by)
     VALUES ($1,'approved','ai') RETURNING id`,
    [athleteId],
  );
  skeletonId = sk.rows[0].id;
  await pool.query(
    `INSERT INTO athlete_program_state
       (athlete_id, active_skeleton_id, current_week, start_date)
     VALUES ($1,$2,1,CURRENT_DATE)`,
    [athleteId, skeletonId],
  );
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE archived_at IS NULL LIMIT 1`,
  );
  exerciseId = ex.rows[0].id;
  const slot = await pool.query<{ id: string }>(
    `INSERT INTO skeleton_slots
       (skeleton_id, day_of_week, slot_index, exercise_id, role, notes)
     VALUES ($1,1,0,$2,'principal','seed') RETURNING id`,
    [skeletonId, exerciseId],
  );
  slotId = slot.rows[0].id;
}

beforeEach(async () => {
  await pool.query(`DELETE FROM athlete_program_state`);
  await pool.query(`DELETE FROM skeleton_slots`);
  await pool.query(`DELETE FROM skeleton_days`);
  await pool.query(`DELETE FROM athlete_skeletons`);
  await pool.query(`DELETE FROM athlete_profiles`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'test-%-rt@x.com'`);
  await seedFixtures();
});
afterAll(async () => { await pool.end(); });

describe('GET /api/admin/rutinas/atleta', () => {
  it('returns list', async () => {
    const r = await request(app)
      .get('/api/admin/rutinas/atleta')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
  });

  it('403 for non-admin', async () => {
    const ath = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email='test-athlete-rt@x.com'`,
    );
    const t = signTestToken({ id: ath.rows[0].id, role: 'athlete' });
    const r = await request(app)
      .get('/api/admin/rutinas/atleta')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(403);
  });
});

describe('PATCH /api/admin/rutinas/slots/:slotId', () => {
  it('updates notes', async () => {
    const r = await request(app)
      .patch(`/api/admin/rutinas/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'updated' });
    expect(r.status).toBe(200);
    expect(r.body.slot.notes).toBe('updated');
  });

  it('returns 409 when slot belongs to superseded skeleton', async () => {
    await pool.query(
      `UPDATE athlete_skeletons SET status='superseded' WHERE id=$1`,
      [skeletonId],
    );
    const r = await request(app)
      .patch(`/api/admin/rutinas/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'x' });
    expect(r.status).toBe(409);
  });

  it('returns 400 for invalid exercise_id', async () => {
    const r = await request(app)
      .patch(`/api/admin/rutinas/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exercise_id: 999999 });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/admin/rutinas/atleta/:athleteId/slots', () => {
  it('creates slot', async () => {
    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        day_of_week: 1,
        slot_index: 1,
        exercise_id: exerciseId,
        role: 'accesorio',
        notes: null,
      });
    expect(r.status).toBe(201);
    expect(r.body.slot.day_of_week).toBe(1);
  });
});

describe('DELETE /api/admin/rutinas/slots/:slotId', () => {
  it('deletes slot', async () => {
    const r = await request(app)
      .delete(`/api/admin/rutinas/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(204);
  });
});

describe('POST /api/admin/rutinas/atleta/:athleteId/reorder', () => {
  it('reorders', async () => {
    // create a second slot then reorder both
    const ex2 = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE archived_at IS NULL ORDER BY id OFFSET 1 LIMIT 1`,
    );
    const s2 = await pool.query<{ id: string }>(
      `INSERT INTO skeleton_slots
         (skeleton_id, day_of_week, slot_index, exercise_id, role)
       VALUES ($1,1,1,$2,'principal') RETURNING id`,
      [skeletonId, ex2.rows[0].id],
    );
    const r = await request(app)
      .post(`/api/admin/rutinas/atleta/${athleteId}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slots: [
          { slot_id: slotId, day_of_week: 1, slot_index: 1 },
          { slot_id: s2.rows[0].id, day_of_week: 1, slot_index: 0 },
        ],
      });
    expect(r.status).toBe(204);
  });
});

describe('fall-through to queue router', () => {
  it('GET /admin/rutinas/:skeletonId still hits queue router', async () => {
    // mark our skeleton as pending so queue endpoint loads it
    await pool.query(
      `UPDATE athlete_skeletons SET status='pending_review' WHERE id=$1`,
      [skeletonId],
    );
    const r = await request(app)
      .get(`/api/admin/rutinas/${skeletonId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.skeleton.id).toBe(skeletonId);
  });
});
```

- [ ] **Step 2b: Check / create `helpers/auth.ts`**

If `backend/tests/integration/helpers/auth.ts` does not exist, create it:

```ts
// backend/tests/integration/helpers/auth.ts
import jwt from 'jsonwebtoken';

export function signTestToken(payload: { id: string; role: string }): string {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}
```

Verify the JWT payload shape matches `backend/src/middleware/auth.ts` expectations (open that file and confirm fields like `id`, `role`; adjust if it uses `sub` or `userId`).

- [ ] **Step 3: Run integration tests**

Run: `cd backend && npm test -- admin-rutinas.routes`
Expected: PASS all tests.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/
git commit -m "test(admin-rutinas): integration tests for slot CRUD endpoints"
```

---

## Task 10: Frontend — install `@dnd-kit`

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install deps**

Run: `cd frontend && npm install @dnd-kit/core @dnd-kit/sortable`
Expected: package.json + lockfile updated.

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): add @dnd-kit for slot reorder"
```

---

## Task 11: Frontend — API types

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Append types**

```ts
export interface ActiveAthleteRow {
  athlete_id: string;
  name: string;
  skeleton_id: string;
  reviewed_at: string | null;
  days_per_week: number;
}

export interface RutinaSlot {
  id: string;
  skeleton_id: string;
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes: string | null;
  exercise_name?: string;
  muscle_group?: string;
  equipment?: string;
}

export interface RutinaDay {
  day_of_week: number;
  focus: string | null;
}

export interface RutinaDetail {
  skeleton: {
    id: string;
    athlete_id: string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
  };
  slots: RutinaSlot[];
  days: RutinaDay[];
  profile: { user_id: string; name: string; days_per_week: number };
  has_active_session: boolean;
}

export interface SlotCreateInput {
  day_of_week: number;
  slot_index: number;
  exercise_id: number;
  role: 'calentamiento' | 'principal' | 'accesorio';
  notes: string | null;
}

export interface SlotPatchInput {
  exercise_id?: number;
  notes?: string | null;
  slot_index?: number;
  day_of_week?: number;
}

export interface ReorderInput {
  slots: { slot_id: string; day_of_week: number; slot_index: number }[];
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(admin-rutinas): frontend types for active routine + slot CRUD"
```

---

## Task 12: Frontend — React Query hooks

**Files:**
- Create: `frontend/src/hooks/useAdminRutina.ts`

- [ ] **Step 1: Look up axios client path**

Inspect `frontend/src/lib/` for the configured axios instance (likely `api.ts` or `apiClient.ts`). Use that for all calls. Look at an existing admin hook (`useAdminUsers.ts`, `useAdminExercises.ts`) to copy the patterns for `queryKey` naming and mutation invalidation.

- [ ] **Step 2: Create hooks file**

```ts
// frontend/src/hooks/useAdminRutina.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api'; // adapt import to actual path
import type {
  ActiveAthleteRow,
  RutinaDetail,
  ReorderInput,
  SlotCreateInput,
  SlotPatchInput,
  RutinaSlot,
} from '@/types/api';

const KEYS = {
  list: (q?: string) => ['admin-rutinas', 'list', q ?? ''] as const,
  detail: (athleteId: string) =>
    ['admin-rutinas', 'detail', athleteId] as const,
};

export function useActiveAthletes(q?: string) {
  return useQuery({
    queryKey: KEYS.list(q),
    queryFn: async () => {
      const r = await api.get<{ items: ActiveAthleteRow[]; total: number }>(
        '/admin/rutinas/atleta',
        { params: q ? { q } : undefined },
      );
      return r.data;
    },
  });
}

export function useActiveRutina(athleteId: string | undefined) {
  return useQuery({
    queryKey: athleteId ? KEYS.detail(athleteId) : ['admin-rutinas', 'detail', 'none'],
    enabled: !!athleteId,
    queryFn: async () => {
      const r = await api.get<RutinaDetail>(
        `/admin/rutinas/atleta/${athleteId}`,
      );
      return r.data;
    },
  });
}

export function useCreateSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SlotCreateInput) => {
      const r = await api.post<{ slot: RutinaSlot }>(
        `/admin/rutinas/atleta/${athleteId}/slots`,
        input,
      );
      return r.data.slot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useUpdateSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slotId: string; patch: SlotPatchInput }) => {
      const r = await api.patch<{ slot: RutinaSlot }>(
        `/admin/rutinas/slots/${vars.slotId}`,
        vars.patch,
      );
      return r.data.slot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useDeleteSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string) => {
      await api.delete(`/admin/rutinas/slots/${slotId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useReorderSlots(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderInput) => {
      await api.post(
        `/admin/rutinas/atleta/${athleteId}/reorder`,
        input,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAdminRutina.ts
git commit -m "feat(admin-rutinas): React Query hooks for slot CRUD"
```

---

## Task 13: Frontend — add routes in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the two `/atleta` routes inside the admin shell block, BEFORE `/admin/rutinas/:id`**

Find this section:
```tsx
<Route path="/admin/rutinas" element={<AdminRutinas />} />
<Route path="/admin/rutinas/:id" element={<AdminRutinas />} />
```

Replace with:
```tsx
<Route path="/admin/rutinas" element={<AdminRutinas />} />
<Route path="/admin/rutinas/atleta" element={<AdminRutinas />} />
<Route path="/admin/rutinas/atleta/:athleteId" element={<AdminRutinas />} />
<Route path="/admin/rutinas/:id" element={<AdminRutinas />} />
```

(React Router 7 picks the more specific match, but listing in priority order is good hygiene.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(admin-rutinas): routes for /admin/rutinas/atleta"
```

---

## Task 14: Frontend — `RutinasTabs` component

**Files:**
- Create: `frontend/src/components/admin/rutinas/RutinasTabs.tsx`

- [ ] **Step 1: Create component**

```tsx
// frontend/src/components/admin/rutinas/RutinasTabs.tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { Segmented } from '@/components/admin/Segmented';

export function RutinasTabs() {
  const loc = useLocation();
  const navigate = useNavigate();
  const isActivas = loc.pathname.startsWith('/admin/rutinas/atleta');
  const value = isActivas ? 'activas' : 'cola';

  return (
    <div className="border-b border-border bg-card px-7 py-3">
      <Segmented
        value={value}
        onChange={(v) =>
          navigate(v === 'cola' ? '/admin/rutinas' : '/admin/rutinas/atleta')
        }
        options={[
          { label: 'Cola pendiente', value: 'cola' },
          { label: 'Activas', value: 'activas' },
        ]}
      />
    </div>
  );
}
```

(If the existing `Segmented` component has a different prop shape, open `frontend/src/components/admin/Segmented.tsx` and adapt the props. The intent is a 2-button segmented toggle.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/rutinas/RutinasTabs.tsx
git commit -m "feat(admin-rutinas): RutinasTabs segmented control"
```

---

## Task 15: Frontend — refactor `Rutinas.tsx` for tab modes

**Files:**
- Modify: `frontend/src/pages/admin/Rutinas.tsx`

- [ ] **Step 1: Wrap existing render with mode branch**

```tsx
// frontend/src/pages/admin/Rutinas.tsx
import { useLocation } from 'react-router-dom';
import { RutinasTabs } from '@/components/admin/rutinas/RutinasTabs';
import { ActivasPane } from '@/components/admin/rutinas/activas/ActivasPane';
// ... existing imports for cola mode ...

export default function Rutinas() {
  const loc = useLocation();
  const isActivas = loc.pathname.startsWith('/admin/rutinas/atleta');

  return (
    <div className="-mx-7 -my-7 flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <RutinasTabs />
      {isActivas ? <ActivasPane /> : <ColaPane />}
    </div>
  );
}

// Move existing component body into `ColaPane` defined below or in a new file.
function ColaPane() {
  // ... existing Rutinas() body that handled the queue ...
}
```

Extract the existing queue logic (everything currently inside `Rutinas()` from the `const { id } = useParams` line through the `<EmptyAllDone />` JSX return) into a local `ColaPane` component or new file `components/admin/rutinas/cola/ColaPane.tsx`. The behavior should be identical to before.

- [ ] **Step 2: Verify cola mode still works**

Run: `cd frontend && npm run dev` and visit `/admin/rutinas`. Queue should render as before. (Backend must be running.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/Rutinas.tsx frontend/src/components/admin/rutinas/
git commit -m "refactor(admin-rutinas): split Rutinas page into Cola/Activas panes"
```

---

## Task 16: Frontend — `ActivasPane` skeleton + `ListPaneActivas`

**Files:**
- Create: `frontend/src/components/admin/rutinas/activas/ActivasPane.tsx`
- Create: `frontend/src/components/admin/rutinas/activas/ListPaneActivas.tsx`

- [ ] **Step 1: Create ActivasPane**

```tsx
// frontend/src/components/admin/rutinas/activas/ActivasPane.tsx
import { useNavigate, useParams } from 'react-router-dom';
import { ListPaneActivas } from './ListPaneActivas';
import { DetailPaneActivas } from './DetailPaneActivas';

export function ActivasPane() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();

  return (
    <div className="grid flex-1 grid-cols-[340px_1fr] overflow-hidden">
      <ListPaneActivas
        activeId={athleteId}
        onSelect={(id) => navigate(`/admin/rutinas/atleta/${id}`)}
      />
      <div className="flex flex-col overflow-hidden">
        {athleteId ? (
          <DetailPaneActivas athleteId={athleteId} />
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

- [ ] **Step 2: Create ListPaneActivas**

```tsx
// frontend/src/components/admin/rutinas/activas/ListPaneActivas.tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useActiveAthletes } from '@/hooks/useAdminRutina';
import { cn } from '@/lib/utils';
import { fmtTimeAgo } from '@/lib/format';

export function ListPaneActivas({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useActiveAthletes(q.trim() || undefined);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar atleta..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
        )}
        {!isLoading && (data?.items ?? []).length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            Sin atletas con rutina activa.
          </div>
        )}
        {(data?.items ?? []).map((a) => (
          <button
            key={a.athlete_id}
            onClick={() => onSelect(a.athlete_id)}
            className={cn(
              'w-full border-b border-border px-4 py-3 text-left text-sm hover:bg-muted/50',
              activeId === a.athlete_id && 'bg-muted',
            )}
          >
            <div className="font-medium">{a.name}</div>
            <div className="text-xs text-muted-foreground">
              {a.days_per_week} días/sem ·{' '}
              {a.reviewed_at ? fmtTimeAgo(a.reviewed_at) : 'sin revisar'}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Type-check + dev-run**

Run: `cd frontend && npx tsc --noEmit` then `npm run dev`. Visit `/admin/rutinas/atleta` — list should load.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/ActivasPane.tsx \
        frontend/src/components/admin/rutinas/activas/ListPaneActivas.tsx
git commit -m "feat(admin-rutinas): activas list pane"
```

---

## Task 17: Frontend — `DetailPaneActivas` + `DayCard` read-only

**Files:**
- Create: `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx`
- Create: `frontend/src/components/admin/rutinas/activas/DayCard.tsx`

- [ ] **Step 1: Create DetailPaneActivas**

```tsx
// frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useActiveRutina } from '@/hooks/useAdminRutina';
import { DayCard } from './DayCard';

export function DetailPaneActivas({ athleteId }: { athleteId: string }) {
  const { data, isLoading, error } = useActiveRutina(athleteId);

  if (isLoading) {
    return <div className="p-7 text-sm text-muted-foreground">Cargando rutina...</div>;
  }
  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm">
        Este atleta aún no tiene rutina activa.
      </div>
    );
  }

  const slotsByDay = new Map<number, typeof data.slots>();
  for (const s of data.slots) {
    if (!slotsByDay.has(s.day_of_week)) slotsByDay.set(s.day_of_week, []);
    slotsByDay.get(s.day_of_week)!.push(s);
  }
  const dayFocus = new Map(data.days.map((d) => [d.day_of_week, d.focus]));
  const days = Array.from(
    new Set<number>([
      ...data.days.map((d) => d.day_of_week),
      ...data.slots.map((s) => s.day_of_week),
    ]),
  ).sort((a, b) => a - b);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{data.profile.name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              <Link
                to={`/admin/users/${athleteId}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                Perfil <ExternalLink size={12} />
              </Link>
            </div>
          </div>
          <Badge variant="outline">{data.profile.days_per_week} días/sem</Badge>
        </div>
        {data.has_active_session && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} />
            Atleta tiene sesión en curso. Los cambios aplicarán en la próxima sesión.
          </div>
        )}
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {days.map((d) => (
          <DayCard
            key={d}
            athleteId={athleteId}
            dayOfWeek={d}
            focus={dayFocus.get(d) ?? null}
            slots={slotsByDay.get(d) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DayCard (read-only shell)**

```tsx
// frontend/src/components/admin/rutinas/activas/DayCard.tsx
import type { RutinaSlot } from '@/types/api';

const DAY_LABEL: Record<number, string> = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
  5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
};

export function DayCard({
  athleteId,
  dayOfWeek,
  focus,
  slots,
}: {
  athleteId: string;
  dayOfWeek: number;
  focus: string | null;
  slots: RutinaSlot[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">
          {DAY_LABEL[dayOfWeek] ?? `Día ${dayOfWeek}`}
        </h3>
        {focus && (
          <p className="text-xs text-muted-foreground">{focus}</p>
        )}
      </header>
      <div className="divide-y divide-border">
        {slots.length === 0 && (
          <div className="px-5 py-4 text-xs text-muted-foreground">
            Día sin ejercicios.
          </div>
        )}
        {slots.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="rounded bg-muted px-2 py-0.5 text-xs">{s.role}</span>
            <span className="flex-1 font-medium">{s.exercise_name}</span>
            <span className="text-xs text-muted-foreground">
              {s.notes ?? ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

(Wire `athleteId` prop now even if unused — it will be consumed when we add editing in Task 19.)

- [ ] **Step 3: Type-check + dev-run**

Run: `cd frontend && npx tsc --noEmit` then `npm run dev`. Visit `/admin/rutinas/atleta/3d98bb07-e222-42f0-b497-6b10503be27a` — should show this athlete's read-only routine.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/
git commit -m "feat(admin-rutinas): activas detail pane + day cards (read-only)"
```

---

## Task 18: Frontend — `ExerciseSwapDialog`

**Files:**
- Create: `frontend/src/components/admin/rutinas/activas/ExerciseSwapDialog.tsx`

- [ ] **Step 1: Look up the existing exercise search hook**

Open `frontend/src/hooks/useAdminExercises.ts` or whatever file currently calls `GET /exercises`. We will reuse it. If the existing hook returns archived rows, add a `archived: 'false'` query param.

- [ ] **Step 2: Create dialog**

```tsx
// frontend/src/components/admin/rutinas/activas/ExerciseSwapDialog.tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdminExercises } from '@/hooks/useAdminExercises'; // adapt name

export function ExerciseSwapDialog({
  open,
  onClose,
  onSelect,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number) => void;
  title: string;
}) {
  const [q, setQ] = useState('');
  const { data } = useAdminExercises({ q: q.trim() || undefined, archived: 'false' });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar ejercicio..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border">
          {(data?.items ?? []).map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelect(ex.id);
                onClose();
              }}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{ex.name}</span>
              <span className="text-xs text-muted-foreground">
                {ex.muscle_group} · {ex.equipment}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Adjust the hook import + the `items` field name to match what `useAdminExercises` returns; verify by reading that file.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/ExerciseSwapDialog.tsx
git commit -m "feat(admin-rutinas): ExerciseSwapDialog"
```

---

## Task 19: Frontend — `SlotRow` with swap + notes

**Files:**
- Create: `frontend/src/components/admin/rutinas/activas/SlotRow.tsx`
- Modify: `frontend/src/components/admin/rutinas/activas/DayCard.tsx`

- [ ] **Step 1: Create SlotRow**

```tsx
// frontend/src/components/admin/rutinas/activas/SlotRow.tsx
import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUpdateSlot, useDeleteSlot } from '@/hooks/useAdminRutina';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import type { RutinaSlot } from '@/types/api';

export function SlotRow({
  athleteId,
  slot,
}: {
  athleteId: string;
  slot: RutinaSlot;
}) {
  const update = useUpdateSlot(athleteId);
  const remove = useDeleteSlot(athleteId);
  const [swapOpen, setSwapOpen] = useState(false);
  const [notes, setNotes] = useState(slot.notes ?? '');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync local notes when slot changes from server
  useEffect(() => setNotes(slot.notes ?? ''), [slot.notes]);

  function commitNotes() {
    if ((slot.notes ?? '') === notes) return;
    update.mutate(
      { slotId: slot.id, patch: { notes: notes || null } },
      { onError: () => toast.error('No se pudo guardar la nota') },
    );
  }

  function onNotesChange(v: string) {
    setNotes(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(commitNotes, 500);
  }

  function onSwap(newExerciseId: number) {
    update.mutate(
      { slotId: slot.id, patch: { exercise_id: newExerciseId } },
      {
        onError: (e: unknown) => {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 409) toast.error('Rutina ya no activa');
          else toast.error('No se pudo cambiar el ejercicio');
        },
      },
    );
  }

  function onDelete() {
    if (!confirm('¿Eliminar este ejercicio del día?')) return;
    remove.mutate(slot.id, {
      onError: () => toast.error('No se pudo eliminar'),
    });
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 text-sm">
      <span className="rounded bg-muted px-2 py-0.5 text-xs">{slot.role}</span>
      <button
        onClick={() => setSwapOpen(true)}
        className="flex-1 text-left font-medium hover:underline"
      >
        {slot.exercise_name}
      </button>
      <input
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        onBlur={commitNotes}
        placeholder="Notas..."
        className="w-48 rounded border border-border bg-background px-2 py-1 text-xs"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={remove.isPending}
      >
        <Trash2 size={14} />
      </Button>
      <ExerciseSwapDialog
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        onSelect={onSwap}
        title="Cambiar ejercicio"
      />
    </div>
  );
}
```

- [ ] **Step 2: Update DayCard to render SlotRow**

```tsx
// in DayCard.tsx, replace the inline slot div with:
import { SlotRow } from './SlotRow';
// ...
{slots.map((s) => (
  <SlotRow key={s.id} athleteId={athleteId} slot={s} />
))}
```

- [ ] **Step 3: Dev-test in browser**

Run: `cd frontend && npm run dev`. Visit `/admin/rutinas/atleta/3d98bb07-e222-42f0-b497-6b10503be27a`. Verify:
- Click exercise name → dialog opens, selecting another exercise updates the row.
- Edit notes → blur → row persists.
- Trash icon → confirm → row removed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/SlotRow.tsx \
        frontend/src/components/admin/rutinas/activas/DayCard.tsx
git commit -m "feat(admin-rutinas): SlotRow with swap, notes, delete"
```

---

## Task 20: Frontend — "Agregar ejercicio" per day

**Files:**
- Modify: `frontend/src/components/admin/rutinas/activas/DayCard.tsx`

- [ ] **Step 1: Add footer button + create-dialog wiring**

```tsx
// at top of DayCard.tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCreateSlot } from '@/hooks/useAdminRutina';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';

// inside DayCard component, after the existing slots map:
function DayFooter({
  athleteId,
  dayOfWeek,
  nextIndex,
}: {
  athleteId: string;
  dayOfWeek: number;
  nextIndex: number;
}) {
  const create = useCreateSlot(athleteId);
  const [open, setOpen] = useState(false);

  function onPick(exerciseId: number) {
    create.mutate(
      {
        day_of_week: dayOfWeek,
        slot_index: nextIndex,
        exercise_id: exerciseId,
        role: 'accesorio',
        notes: null,
      },
      {
        onError: () => toast.error('No se pudo agregar el ejercicio'),
      },
    );
  }

  return (
    <div className="px-5 py-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={create.isPending}
      >
        <Plus size={14} className="mr-1" /> Agregar ejercicio
      </Button>
      <ExerciseSwapDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onPick}
        title={`Agregar ejercicio al día ${dayOfWeek}`}
      />
    </div>
  );
}

// In DayCard's render, after the slot list, add:
<DayFooter
  athleteId={athleteId}
  dayOfWeek={dayOfWeek}
  nextIndex={slots.length}
/>
```

- [ ] **Step 2: Browser test**

Click "Agregar ejercicio" → pick one → row appears with role `accesorio`. Edit role afterwards via swap is not yet supported (out of scope).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/DayCard.tsx
git commit -m "feat(admin-rutinas): add-exercise button per day"
```

---

## Task 21: Frontend — dnd-kit reorder

**Files:**
- Modify: `frontend/src/components/admin/rutinas/activas/DetailPaneActivas.tsx`
- Modify: `frontend/src/components/admin/rutinas/activas/DayCard.tsx`
- Modify: `frontend/src/components/admin/rutinas/activas/SlotRow.tsx`

- [ ] **Step 1: Wrap detail pane with DndContext and per-slot SortableContext per day**

In `DetailPaneActivas.tsx`:

```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { useReorderSlots } from '@/hooks/useAdminRutina';
// ...

const reorder = useReorderSlots(athleteId);
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

function handleDragEnd(e: DragEndEvent) {
  if (!e.over || !data) return;
  const activeId = String(e.active.id);
  const overId = String(e.over.id);
  if (activeId === overId) return;

  // Build flat slots list ordered (day, slot_index)
  const sorted = [...data.slots].sort(
    (a, b) =>
      a.day_of_week - b.day_of_week || a.slot_index - b.slot_index,
  );
  const movingIndex = sorted.findIndex((s) => s.id === activeId);
  const targetIndex = sorted.findIndex((s) => s.id === overId);
  if (movingIndex < 0 || targetIndex < 0) return;
  const target = sorted[targetIndex];

  // Move active into target's day at target's slot_index
  const moved = sorted.splice(movingIndex, 1)[0];
  moved.day_of_week = target.day_of_week;
  sorted.splice(targetIndex, 0, moved);

  // Reindex per day
  const byDay = new Map<number, string[]>();
  for (const s of sorted) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s.id);
  }
  const payload = {
    slots: Array.from(byDay.entries()).flatMap(([day, ids]) =>
      ids.map((id, idx) => ({
        slot_id: id,
        day_of_week: day,
        slot_index: idx,
      })),
    ),
  };
  reorder.mutate(payload, {
    onError: () => toast.error('No se pudo reordenar'),
  });
}

// Wrap the days .map in:
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  {/* existing days rendering */}
</DndContext>
```

- [ ] **Step 2: Make `DayCard` use `SortableContext`**

```tsx
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
// inside DayCard render:
<SortableContext
  items={slots.map((s) => s.id)}
  strategy={verticalListSortingStrategy}
>
  {slots.map((s) => (
    <SlotRow key={s.id} athleteId={athleteId} slot={s} />
  ))}
</SortableContext>
```

- [ ] **Step 3: Make `SlotRow` sortable**

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
  id: slot.id,
});
const style: React.CSSProperties = {
  transform: CSS.Transform.toString(transform),
  transition,
};

// in render, root div:
<div ref={setNodeRef} style={style} className="...">
  <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
    <GripVertical size={14} />
  </button>
  {/* rest of row */}
</div>
```

- [ ] **Step 4: Browser test**

Drag rows within and across days. Verify reorder persists after page refresh.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/rutinas/activas/
git commit -m "feat(admin-rutinas): drag-and-drop slot reorder"
```

---

## Task 22: Frontend — link from `UserDetail`

**Files:**
- Modify: `frontend/src/pages/admin/UserDetail.tsx`

- [ ] **Step 1: Add a button in the header area**

Open `UserDetail.tsx`. Find where header buttons live (near the back link / action area). Add:

```tsx
import { Dumbbell } from 'lucide-react';
// ...
<Button asChild variant="outline" size="sm">
  <Link to={`/admin/rutinas/atleta/${user.id}`}>
    <Dumbbell size={14} className="mr-1" /> Ver rutina activa
  </Link>
</Button>
```

Place it near other header actions. Pick the visual treatment that matches existing buttons (look at sibling examples first; do not invent new styles).

- [ ] **Step 2: Browser test**

Visit `/admin/users/3d98bb07-e222-42f0-b497-6b10503be27a`. Click "Ver rutina activa". Should land on `/admin/rutinas/atleta/3d98bb07-...` with the routine visible.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/UserDetail.tsx
git commit -m "feat(admin-rutinas): link from UserDetail to active routine editor"
```

---

## Task 23: Manual end-to-end smoke

**Files:** none.

- [ ] **Step 1: Run full stack**

Run: `npm run start:dev` (from project root).

- [ ] **Step 2: Smoke checklist** — perform each action in `http://localhost:3000`:

  1. Visit `/admin/rutinas`. Tab "Cola pendiente" highlighted. Existing queue still works (open one, approve/reject still routes correctly).
  2. Click tab "Activas". Lands on `/admin/rutinas/atleta`. List loads.
  3. Click first athlete. Detail loads with day cards.
  4. Click an exercise name → swap dialog → pick another → row updates.
  5. Edit a note → blur → reload page → note persists.
  6. Click "Agregar ejercicio" → pick one → new row appears.
  7. Drag a row across days → release → reload → order persists.
  8. Click trash icon → confirm → row removed.
  9. Visit `/admin/users/3d98bb07-e222-42f0-b497-6b10503be27a` → click "Ver rutina activa" → land on correct page.
  10. Open browser devtools network tab. Confirm no failed requests during the flow.

- [ ] **Step 3: Run all tests**

Run: `cd backend && npm test && cd ../frontend && npm test`
Expected: all green.

- [ ] **Step 4: Final commit (if any patch made during smoke)**

```bash
git add -A
git commit -m "chore(admin-rutinas): smoke-test fixes" # only if changes were needed
```

---

## Self-Review Notes

- **Spec coverage:** All endpoints, services, side effects (weight seeding, active-session banner, archived-exercise filter), and routes from the spec are mapped to tasks 1–22. Audit log is explicitly deferred (v2) per spec.
- **No placeholders:** every code step contains complete code or an explicit reference to a file the engineer should read first (e.g., existing admin hooks, integration test helpers).
- **Type consistency:** `RutinaDetail`, `RutinaSlot`, `SlotPatchInput`, `SlotCreateInput`, `ReorderInput` types are defined in Task 11 and consumed in Tasks 12, 17, 19, 21 by the same names.
- **Order of registration:** Task 8 explicitly mounts the new admin router BEFORE the existing queue router so the `/atleta` and `/slots` paths take priority while `/:id` falls through to queue handlers. Verified collision-free with `/pending`, `/:id`, `/:id/approve`, `/:id/reject`.
- **Reorder unique-index handling:** Task 7's transactional +1000 offset matches the unique constraint `(skeleton_id, day_of_week, slot_index)` confirmed in migration `005_skeletons.sql`.
