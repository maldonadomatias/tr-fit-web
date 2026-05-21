# Admin Exercises CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed Exercises module at `/admin/exercises` with full CRUD + soft-delete; migrate the rutinas skeleton builder from a hardcoded TS catalog to the DB-backed API.

**Architecture:** Backend adds an `archived_at` column to the existing `exercises` table, a dedicated admin router/service for CRUD, and extends the existing `/exercises` router to be readable by admin (for skeleton-builder consumption). Frontend mirrors the `Users.tsx` pattern: table + filter bar + create/edit dialog, fed by React Query hooks. The hardcoded catalog file is deleted.

**Tech Stack:** Backend = Node + Express + pg + zod + Vitest (real DB integration tests). Frontend = React + Vite + TanStack Query + shadcn/ui + react-hook-form + zod + lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-21-admin-exercises-crud-design.md`

---

## Phase 0 — Pre-flight investigation

The skeleton builder currently uses a hardcoded TS catalog (`frontend/src/lib/exercisesCatalog.ts`) with IDs 1..30 and `muscle_group` values like `'pecho'`. The real `exercises` table appears already populated (per `backend/tests/integration/alternatives.test.ts` queries against `'Pecho - Mayor'`, etc.). We must confirm whether saved skeletons reference real DB IDs or hardcoded TS IDs before deleting the hardcoded catalog.

### Task 0.1: Verify exercises table state and skeleton references

**Files:**
- Read-only: `backend/src/db/migrations/003_exercises.sql`
- Read-only: any migration that creates `skeleton_slots` / `slots` (search `backend/src/db/migrations/` for `exercise_id`)

- [ ] **Step 1: Query DB state**

Run against a representative environment (local dev DB at minimum, prod-replica if available):

```bash
psql "$DATABASE_URL" -c "SELECT count(*) AS total, min(id) AS min_id, max(id) AS max_id FROM exercises;"
psql "$DATABASE_URL" -c "SELECT id, name, muscle_group, equipment, movement_pattern FROM exercises ORDER BY id LIMIT 10;"
```

- [ ] **Step 2: Find skeleton-slot table referencing exercise_id**

Run:
```bash
grep -rn "exercise_id" backend/src/db/migrations/
```

Identify the table (likely `skeleton_slots` or similar). Query a sample:
```bash
psql "$DATABASE_URL" -c "SELECT DISTINCT exercise_id FROM skeleton_slots LIMIT 20;"
```

- [ ] **Step 3: Cross-reference**

If all `exercise_id` values returned by skeleton_slots exist in `exercises.id` → safe to proceed with cutover. If not → file a follow-up bug and reconcile data before continuing.

Record findings in the PR description. No commit for this task.

---

## Phase 1 — Backend: migration

### Task 1.1: Add `archived_at` migration

**Files:**
- Create: `backend/src/db/migrations/024_exercises_archived.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_exercises_active
  ON exercises(id) WHERE archived_at IS NULL;
```

- [ ] **Step 2: Run migration locally**

Run: `npm run -w backend migrate`
Expected: log line `Executed migration: 024_exercises_archived.sql`. No errors.

- [ ] **Step 3: Verify column exists**

Run: `psql "$DATABASE_URL" -c "\d exercises"`
Expected: column `archived_at` of type `timestamp with time zone`, nullable.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/024_exercises_archived.sql
git commit -m "feat(db): add archived_at to exercises for soft-delete"
```

---

## Phase 2 — Backend: service layer (TDD)

### Task 2.1: Service file scaffold + types

**Files:**
- Create: `backend/src/services/admin-exercise.service.ts`

- [ ] **Step 1: Write the types + error class**

```typescript
import pool from '../db/connect.js';

export type Equipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';

export type MovementPattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';

export type Level = 'principiante' | 'intermedio' | 'avanzado';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: Level;
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
  archived_at: string | null;
}

export type CreateExerciseInput = Omit<Exercise, 'id' | 'archived_at'>;
export type UpdateExerciseInput = Partial<CreateExerciseInput>;

export interface ListExercisesFilters {
  q?: string;
  muscle_group?: string;
  equipment?: Equipment;
  movement_pattern?: MovementPattern;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export class ExerciseError extends Error {
  constructor(public code: 'not_found' | 'name_taken') {
    super(code);
  }
}

const SELECT_COLS = `
  id, name, muscle_group, equipment, movement_pattern,
  is_principal, is_unilateral, level_min,
  contraindicated_for, default_increment_kg, alternatives_ids,
  video_url, illustration_url, archived_at
`;
```

- [ ] **Step 2: Commit scaffold**

```bash
git add backend/src/services/admin-exercise.service.ts
git commit -m "feat(exercises): scaffold admin-exercise service types"
```

### Task 2.2: `listExercises` — failing test first

**Files:**
- Test: `backend/tests/integration/admin-exercises.test.ts`
- Modify: `backend/src/services/admin-exercise.service.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';
import {
  listExercises,
  createExercise,
  updateExercise,
  archiveExercise,
  restoreExercise,
  getExercise,
  ExerciseError,
  type CreateExerciseInput,
} from '../../src/services/admin-exercise.service.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

const baseInput: CreateExerciseInput = {
  name: 'Test Press Banca',
  muscle_group: 'Pecho',
  equipment: 'barra',
  movement_pattern: 'push_h',
  is_principal: true,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 2.5,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
};

describe('listExercises', () => {
  it('returns rows filtered by q (case-insensitive substring on name)', async () => {
    await createExercise({ ...baseInput, name: 'AAA Press Banca' });
    await createExercise({ ...baseInput, name: 'BBB Sentadilla' });
    const result = await listExercises({ q: 'press' });
    expect(result.items.map(e => e.name)).toContain('AAA Press Banca');
    expect(result.items.map(e => e.name)).not.toContain('BBB Sentadilla');
  });

  it('excludes archived by default', async () => {
    const a = await createExercise({ ...baseInput, name: 'Active One' });
    const b = await createExercise({ ...baseInput, name: 'Archived One' });
    await archiveExercise(b.id);
    const result = await listExercises({});
    const names = result.items.map(e => e.name);
    expect(names).toContain('Active One');
    expect(names).not.toContain('Archived One');
  });

  it('includes archived when archived=all', async () => {
    const b = await createExercise({ ...baseInput, name: 'Archived Two' });
    await archiveExercise(b.id);
    const result = await listExercises({ archived: 'all' });
    expect(result.items.map(e => e.name)).toContain('Archived Two');
  });

  it('returns only archived when archived=true', async () => {
    await createExercise({ ...baseInput, name: 'Active Z' });
    const b = await createExercise({ ...baseInput, name: 'Archived Z' });
    await archiveExercise(b.id);
    const result = await listExercises({ archived: 'true' });
    const names = result.items.map(e => e.name);
    expect(names).toContain('Archived Z');
    expect(names).not.toContain('Active Z');
  });

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await createExercise({ ...baseInput, name: `Bulk ${i}` });
    }
    const page1 = await listExercises({ q: 'Bulk', limit: 2, offset: 0 });
    const page2 = await listExercises({ q: 'Bulk', limit: 2, offset: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.items.map(e => e.id)).not.toEqual(page2.items.map(e => e.id));
    expect(page1.total).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, verify fails**

Run: `npm run -w backend test -- admin-exercises.test.ts`
Expected: FAIL — functions not implemented yet.

- [ ] **Step 3: Implement `listExercises` + `getExercise` + minimal mutation stubs**

Append to `admin-exercise.service.ts`:

```typescript
export async function listExercises(
  f: ListExercisesFilters,
): Promise<{ items: Exercise[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  const archived = f.archived ?? 'false';
  if (archived === 'false') where.push(`archived_at IS NULL`);
  else if (archived === 'true') where.push(`archived_at IS NOT NULL`);

  if (f.q) {
    params.push(`%${f.q.toLowerCase()}%`);
    where.push(`LOWER(name) LIKE $${params.length}`);
  }
  if (f.muscle_group) {
    params.push(f.muscle_group);
    where.push(`muscle_group = $${params.length}`);
  }
  if (f.equipment) {
    params.push(f.equipment);
    where.push(`equipment = $${params.length}`);
  }
  if (f.movement_pattern) {
    params.push(f.movement_pattern);
    where.push(`movement_pattern = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(f.limit ?? 50, 200);
  const offset = f.offset ?? 0;

  const totalQ = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM exercises ${whereSql}`,
    params,
  );
  const total = parseInt(totalQ.rows[0]?.count ?? '0', 10);

  params.push(limit);
  params.push(offset);
  const rowsQ = await pool.query<Exercise>(
    `SELECT ${SELECT_COLS}
       FROM exercises
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items: rowsQ.rows.map(normalize), total };
}

export async function getExercise(id: number): Promise<Exercise> {
  const r = await pool.query<Exercise>(
    `SELECT ${SELECT_COLS} FROM exercises WHERE id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new ExerciseError('not_found');
  return normalize(r.rows[0]);
}

function normalize(row: Exercise): Exercise {
  return {
    ...row,
    default_increment_kg: Number(row.default_increment_kg),
  };
}
```

- [ ] **Step 4: Implement `createExercise` (needed by tests)**

```typescript
export async function createExercise(input: CreateExerciseInput): Promise<Exercise> {
  try {
    const r = await pool.query<Exercise>(
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          is_principal, is_unilateral, level_min,
          contraindicated_for, default_increment_kg, alternatives_ids,
          video_url, illustration_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SELECT_COLS}`,
      [
        input.name, input.muscle_group, input.equipment, input.movement_pattern,
        input.is_principal, input.is_unilateral, input.level_min,
        input.contraindicated_for, input.default_increment_kg, input.alternatives_ids,
        input.video_url, input.illustration_url,
      ],
    );
    return normalize(r.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new ExerciseError('name_taken');
    }
    throw err;
  }
}
```

- [ ] **Step 5: Implement `archiveExercise` (needed by tests)**

```typescript
export async function archiveExercise(id: number): Promise<void> {
  const r = await pool.query(
    `UPDATE exercises SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
  if (r.rowCount === 0) {
    const exists = await pool.query(`SELECT 1 FROM exercises WHERE id = $1`, [id]);
    if (exists.rowCount === 0) throw new ExerciseError('not_found');
  }
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm run -w backend test -- admin-exercises.test.ts -t listExercises`
Expected: PASS all 5 cases.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/admin-exercise.service.ts backend/tests/integration/admin-exercises.test.ts
git commit -m "feat(exercises): listExercises + createExercise + archiveExercise"
```

### Task 2.3: `updateExercise` + `restoreExercise`

**Files:**
- Modify: `backend/tests/integration/admin-exercises.test.ts`
- Modify: `backend/src/services/admin-exercise.service.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```typescript
describe('updateExercise', () => {
  it('updates only supplied fields', async () => {
    const created = await createExercise(baseInput);
    const updated = await updateExercise(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.muscle_group).toBe(baseInput.muscle_group);
  });

  it('throws name_taken on duplicate', async () => {
    await createExercise({ ...baseInput, name: 'Existing' });
    const b = await createExercise({ ...baseInput, name: 'Other' });
    await expect(updateExercise(b.id, { name: 'Existing' }))
      .rejects.toThrow(ExerciseError);
  });

  it('throws not_found for missing id', async () => {
    await expect(updateExercise(999999, { name: 'x' }))
      .rejects.toThrow(ExerciseError);
  });
});

describe('restoreExercise', () => {
  it('clears archived_at', async () => {
    const x = await createExercise({ ...baseInput, name: 'ToRestore' });
    await archiveExercise(x.id);
    const restored = await restoreExercise(x.id);
    expect(restored.archived_at).toBeNull();
  });

  it('no-op when already active', async () => {
    const x = await createExercise({ ...baseInput, name: 'AlreadyActive' });
    const restored = await restoreExercise(x.id);
    expect(restored.archived_at).toBeNull();
  });

  it('throws not_found for missing id', async () => {
    await expect(restoreExercise(999999)).rejects.toThrow(ExerciseError);
  });
});

describe('archiveExercise idempotency', () => {
  it('second archive is no-op (does not throw)', async () => {
    const x = await createExercise({ ...baseInput, name: 'TwiceArchive' });
    await archiveExercise(x.id);
    await expect(archiveExercise(x.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm run -w backend test -- admin-exercises.test.ts -t updateExercise`
Expected: FAIL — `updateExercise` and `restoreExercise` not implemented.

- [ ] **Step 3: Implement `updateExercise`**

Append to `admin-exercise.service.ts`:

```typescript
export async function updateExercise(
  id: number,
  patch: UpdateExerciseInput,
): Promise<Exercise> {
  const keys = Object.keys(patch) as Array<keyof UpdateExerciseInput>;
  if (keys.length === 0) return getExercise(id);

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of keys) {
    params.push(patch[k]);
    sets.push(`${k} = $${params.length}`);
  }
  params.push(id);

  try {
    const r = await pool.query<Exercise>(
      `UPDATE exercises SET ${sets.join(', ')}
         WHERE id = $${params.length}
       RETURNING ${SELECT_COLS}`,
      params,
    );
    if (!r.rows[0]) throw new ExerciseError('not_found');
    return normalize(r.rows[0]);
  } catch (err: unknown) {
    if (err instanceof ExerciseError) throw err;
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new ExerciseError('name_taken');
    }
    throw err;
  }
}
```

- [ ] **Step 4: Implement `restoreExercise`**

```typescript
export async function restoreExercise(id: number): Promise<Exercise> {
  const r = await pool.query<Exercise>(
    `UPDATE exercises SET archived_at = NULL
       WHERE id = $1
     RETURNING ${SELECT_COLS}`,
    [id],
  );
  if (!r.rows[0]) throw new ExerciseError('not_found');
  return normalize(r.rows[0]);
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run -w backend test -- admin-exercises.test.ts`
Expected: ALL service tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/admin-exercise.service.ts backend/tests/integration/admin-exercises.test.ts
git commit -m "feat(exercises): updateExercise + restoreExercise"
```

---

## Phase 3 — Backend: routes (TDD)

### Task 3.1: Route file scaffold + mount

**Files:**
- Create: `backend/src/routes/admin-exercises.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Create router file**

```typescript
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/role.js';
import {
  listExercises,
  getExercise,
  createExercise,
  updateExercise,
  archiveExercise,
  restoreExercise,
  ExerciseError,
} from '../services/admin-exercise.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const EquipmentEnum = z.enum([
  'barra', 'mancuerna', 'maquina', 'polea', 'smith',
  'bw', 'pesa_rusa', 'elastico', 'disco',
]);
const PatternEnum = z.enum([
  'squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v',
  'isolation', 'core', 'cardio',
]);
const LevelEnum = z.enum(['principiante', 'intermedio', 'avanzado']);

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  muscle_group: z.string().trim().min(1).max(60).optional(),
  equipment: EquipmentEnum.optional(),
  movement_pattern: PatternEnum.optional(),
  archived: z.enum(['true', 'false', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  muscle_group: z.string().trim().min(1).max(60),
  equipment: EquipmentEnum,
  movement_pattern: PatternEnum,
  is_principal: z.boolean(),
  is_unilateral: z.boolean(),
  level_min: LevelEnum,
  contraindicated_for: z.array(z.string().trim().min(1)),
  default_increment_kg: z.number().min(0).max(99.99),
  alternatives_ids: z.array(z.number().int().positive()),
  video_url: z.string().url().nullable(),
  illustration_url: z.string().url().nullable(),
});

const updateBody = createBody.partial();

function mapError(err: unknown, res: Response): Response {
  if (err instanceof ExerciseError) {
    if (err.code === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (err.code === 'name_taken') return res.status(409).json({ error: 'name_taken' });
  }
  throw err;
}

router.get('/', async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', issues: parsed.error.issues });
  }
  const result = await listExercises(parsed.data);
  res.json(result);
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const exercise = await getExercise(id);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const exercise = await createExercise(parsed.data);
    res.status(201).json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  try {
    const exercise = await updateExercise(id, parsed.data);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    await archiveExercise(id);
    res.json({ archived: true });
  } catch (err) {
    mapError(err, res);
  }
});

router.post('/:id/restore', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const exercise = await restoreExercise(id);
    res.json({ exercise });
  } catch (err) {
    mapError(err, res);
  }
});

export default router;
```

- [ ] **Step 2: Mount router**

Edit `backend/src/routes/index.ts` — add import + mount before the generic `/admin` mount:

```typescript
import adminExercises from './admin-exercises.js';
// ...
router.use('/admin/exercises', adminExercises);
router.use('/admin', admin);  // existing line — leave below
```

- [ ] **Step 3: Compile to check**

Run: `npm run -w backend build`
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin-exercises.ts backend/src/routes/index.ts
git commit -m "feat(exercises): admin CRUD router with zod validation"
```

### Task 3.2: Route integration tests

**Files:**
- Modify: `backend/tests/integration/admin-exercises.test.ts`

- [ ] **Step 1: Write failing route tests**

Append to test file:

```typescript
import request from 'supertest';
import app from '../../src/app.js';
import { createAdmin, createAthlete, createSuperadmin } from './helpers/fixtures.js';
import { signToken } from '../../src/services/auth.service.js';

async function adminToken(): Promise<string> {
  const id = await createAdmin();
  return signToken({ id, role: 'admin' });
}

async function superToken(): Promise<string> {
  const id = await createSuperadmin();
  return signToken({ id, role: 'superadmin' });
}

async function athleteToken(): Promise<string> {
  const adm = await createAdmin();
  const id = await createAthlete(adm);
  return signToken({ id, role: 'athlete' });
}

describe('GET /api/admin/exercises (auth)', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/admin/exercises');
    expect(res.status).toBe(401);
  });

  it('403 as athlete', async () => {
    const t = await athleteToken();
    const res = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('200 as admin', async () => {
    const t = await adminToken();
    const res = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
  });

  it('200 as superadmin', async () => {
    const t = await superToken();
    const res = await request(app)
      .get('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/exercises', () => {
  it('201 creates exercise', async () => {
    const t = await adminToken();
    const res = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`)
      .send(baseInput);
    expect(res.status).toBe(201);
    expect(res.body.exercise.name).toBe(baseInput.name);
  });

  it('409 on duplicate name', async () => {
    const t = await adminToken();
    await createExercise(baseInput);
    const res = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`)
      .send(baseInput);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('name_taken');
  });

  it('400 on invalid enum', async () => {
    const t = await adminToken();
    const res = await request(app)
      .post('/api/admin/exercises')
      .set('Authorization', `Bearer ${t}`)
      .send({ ...baseInput, equipment: 'bogus' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/exercises/:id', () => {
  it('200 updates fields', async () => {
    const t = await adminToken();
    const created = await createExercise(baseInput);
    const res = await request(app)
      .patch(`/api/admin/exercises/${created.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.exercise.name).toBe('New Name');
  });

  it('404 for missing id', async () => {
    const t = await adminToken();
    const res = await request(app)
      .patch('/api/admin/exercises/999999')
      .set('Authorization', `Bearer ${t}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/exercises/:id', () => {
  it('200 archives and is idempotent', async () => {
    const t = await adminToken();
    const x = await createExercise(baseInput);
    const r1 = await request(app)
      .delete(`/api/admin/exercises/${x.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(r1.status).toBe(200);
    expect(r1.body.archived).toBe(true);
    const r2 = await request(app)
      .delete(`/api/admin/exercises/${x.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(r2.status).toBe(200);
  });
});

describe('POST /api/admin/exercises/:id/restore', () => {
  it('200 restores archived', async () => {
    const t = await adminToken();
    const x = await createExercise(baseInput);
    await archiveExercise(x.id);
    const res = await request(app)
      .post(`/api/admin/exercises/${x.id}/restore`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.exercise.archived_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run -w backend test -- admin-exercises.test.ts`
Expected: ALL pass.

Note: if `signToken` import path differs in this codebase, replace with whatever utility the existing route tests use (check `backend/tests/integration/helpers/` first). The fixtures already provide user creation; only the JWT helper may vary.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/admin-exercises.test.ts
git commit -m "test(exercises): integration tests for admin CRUD routes"
```

---

## Phase 4 — Backend: extend `/exercises` for admin reading

The skeleton builder (consumed by admin role) needs to list exercises. Current `backend/src/routes/exercises.ts` is `requireRole('athlete')` only. We extend it.

### Task 4.1: Add list endpoint + allow admin role

**Files:**
- Modify: `backend/src/routes/exercises.ts`
- Modify: `backend/src/services/exercise.service.ts` (verify existing `listExercises` filters archived)

- [ ] **Step 1: Inspect existing service**

Read: `backend/src/services/exercise.service.ts` — confirm signature of any `listExercises` / `listExercisesForAthlete`. If it does **not** filter `archived_at IS NULL`, patch it.

- [ ] **Step 2: Patch service to exclude archived (if not already)**

Example patch (adjust to match real signatures):

```typescript
// In backend/src/services/exercise.service.ts
// Wherever the existing list query lives, ensure it has:
//   WHERE archived_at IS NULL
// (combined with existing predicates via AND)
```

- [ ] **Step 3: Patch route file**

Replace contents of `backend/src/routes/exercises.ts`:

```typescript
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { findAlternative } from '../services/alternatives.service.js';
import { listExercises } from '../services/admin-exercise.service.js';

const router = Router();
router.use(requireAuth, requireRole('athlete', 'admin', 'superadmin'));

const listQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query' });
  }
  const result = await listExercises({
    q: parsed.data.q,
    limit: parsed.data.limit ?? 8,
    archived: 'false',
  });
  return res.json({ items: result.items });
});

router.get('/:id/alternatives', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const excludeRaw = typeof req.query.exclude === 'string' ? req.query.exclude : '';
  const excludeIds = excludeRaw
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const alt = await findAlternative(id, req.user!.id, excludeIds);
  return res.status(200).json({ alternative: alt });
});

export default router;
```

- [ ] **Step 4: Write test for new endpoint**

Append to `admin-exercises.test.ts`:

```typescript
describe('GET /api/exercises (skeleton builder consumer)', () => {
  it('returns non-archived for admin role', async () => {
    const t = await adminToken();
    const active = await createExercise({ ...baseInput, name: 'Active Skel' });
    const arch = await createExercise({ ...baseInput, name: 'Archived Skel' });
    await archiveExercise(arch.id);
    const res = await request(app)
      .get('/api/exercises?q=Skel')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((e: { name: string }) => e.name);
    expect(names).toContain('Active Skel');
    expect(names).not.toContain('Archived Skel');
  });

  it('returns non-archived for athlete role', async () => {
    const t = await athleteToken();
    await createExercise({ ...baseInput, name: 'Visible Ath' });
    const res = await request(app)
      .get('/api/exercises?q=Visible')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: { name: string }) => e.name)).toContain('Visible Ath');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm run -w backend test -- admin-exercises.test.ts`
Expected: ALL pass including the two new cases.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/exercises.ts backend/src/services/exercise.service.ts backend/tests/integration/admin-exercises.test.ts
git commit -m "feat(exercises): extend GET /exercises to admin role, filter archived"
```

---

## Phase 5 — Frontend: hooks

### Task 5.1: `useAdminExercises` hooks

**Files:**
- Create: `frontend/src/hooks/useAdminExercises.ts`
- Modify: `frontend/src/types/api.ts` (add exported types)

- [ ] **Step 1: Add types to `frontend/src/types/api.ts`**

Append:

```typescript
export type Equipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';

export type MovementPattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';

export type ExerciseLevel = 'principiante' | 'intermedio' | 'avanzado';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: ExerciseLevel;
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
  archived_at: string | null;
}
```

- [ ] **Step 2: Create hooks file**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Equipment, Exercise, MovementPattern } from '@/types/api';

export interface AdminExercisesFilters {
  q?: string;
  muscle_group?: string;
  equipment?: Equipment;
  movement_pattern?: MovementPattern;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export function useAdminExercises(filters: AdminExercisesFilters) {
  return useQuery({
    queryKey: ['admin', 'exercises', filters],
    queryFn: async () => {
      const r = await api.get<{ items: Exercise[]; total: number }>(
        '/admin/exercises',
        { params: filters },
      );
      return r.data;
    },
  });
}

export interface ExercisesSearchOptions {
  enabled?: boolean;
  limit?: number;
}

export function useExercisesSearch(q: string, opts: ExercisesSearchOptions = {}) {
  const { enabled = true, limit = 8 } = opts;
  return useQuery({
    queryKey: ['exercises', 'search', q, limit],
    enabled,
    queryFn: async () => {
      const r = await api.get<{ items: Exercise[] }>('/exercises', {
        params: q.trim() ? { q: q.trim(), limit } : { limit },
      });
      return r.data.items;
    },
  });
}

export type CreateExerciseInput = Omit<Exercise, 'id' | 'archived_at'>;
export type UpdateExerciseInput = Partial<CreateExerciseInput>;

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExerciseInput) => {
      const r = await api.post<{ exercise: Exercise }>('/admin/exercises', input);
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useUpdateExercise(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateExerciseInput) => {
      const r = await api.patch<{ exercise: Exercise }>(
        `/admin/exercises/${id}`,
        patch,
      );
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useArchiveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useRestoreExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await api.post<{ exercise: Exercise }>(
        `/admin/exercises/${id}/restore`,
      );
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npm run -w frontend typecheck` (or `tsc --noEmit` — check `frontend/package.json` for actual command).
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAdminExercises.ts frontend/src/types/api.ts
git commit -m "feat(exercises): frontend hooks for admin CRUD + search"
```

---

## Phase 6 — Frontend: dialog component

### Task 6.1: `ExerciseDialog` component

**Files:**
- Create: `frontend/src/components/admin/exercises/ExerciseDialog.tsx`

- [ ] **Step 1: Implement dialog**

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useCreateExercise,
  useUpdateExercise,
  useArchiveExercise,
  useRestoreExercise,
  type CreateExerciseInput,
} from '@/hooks/useAdminExercises';
import type { Exercise } from '@/types/api';

const EQUIPMENT = [
  'barra','mancuerna','maquina','polea','smith','bw','pesa_rusa','elastico','disco',
] as const;
const PATTERNS = [
  'squat','hinge','push_h','push_v','pull_h','pull_v','isolation','core','cardio',
] as const;
const LEVELS = ['principiante','intermedio','avanzado'] as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Requerido').max(120),
  muscle_group: z.string().trim().min(1, 'Requerido').max(60),
  equipment: z.enum(EQUIPMENT),
  movement_pattern: z.enum(PATTERNS),
  is_principal: z.boolean(),
  is_unilateral: z.boolean(),
  level_min: z.enum(LEVELS),
  contraindicated_for: z.string(), // comma-separated → parse on submit
  default_increment_kg: z.coerce.number().min(0).max(99.99),
  alternatives_ids: z.string(), // comma-separated ints → parse on submit
  video_url: z.string().url().or(z.literal('')).nullable(),
  illustration_url: z.string().url().or(z.literal('')).nullable(),
});

type FormValues = z.infer<typeof schema>;

function exerciseToForm(e: Exercise | null): FormValues {
  if (!e) {
    return {
      name: '', muscle_group: '',
      equipment: 'barra', movement_pattern: 'isolation', level_min: 'principiante',
      is_principal: false, is_unilateral: false,
      contraindicated_for: '', default_increment_kg: 2.5,
      alternatives_ids: '', video_url: '', illustration_url: '',
    };
  }
  return {
    name: e.name, muscle_group: e.muscle_group,
    equipment: e.equipment, movement_pattern: e.movement_pattern, level_min: e.level_min,
    is_principal: e.is_principal, is_unilateral: e.is_unilateral,
    contraindicated_for: e.contraindicated_for.join(', '),
    default_increment_kg: e.default_increment_kg,
    alternatives_ids: e.alternatives_ids.join(', '),
    video_url: e.video_url ?? '',
    illustration_url: e.illustration_url ?? '',
  };
}

function formToPayload(v: FormValues): CreateExerciseInput {
  return {
    name: v.name,
    muscle_group: v.muscle_group,
    equipment: v.equipment,
    movement_pattern: v.movement_pattern,
    is_principal: v.is_principal,
    is_unilateral: v.is_unilateral,
    level_min: v.level_min,
    contraindicated_for: v.contraindicated_for
      .split(',').map((s) => s.trim()).filter(Boolean),
    default_increment_kg: Number(v.default_increment_kg),
    alternatives_ids: v.alternatives_ids
      .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0),
    video_url: v.video_url && v.video_url !== '' ? v.video_url : null,
    illustration_url: v.illustration_url && v.illustration_url !== '' ? v.illustration_url : null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise | null; // null = create mode
}

export function ExerciseDialog({ open, onOpenChange, exercise }: Props) {
  const isEdit = exercise !== null;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: exerciseToForm(exercise),
  });

  useEffect(() => {
    form.reset(exerciseToForm(exercise));
  }, [exercise, form]);

  const create = useCreateExercise();
  const update = useUpdateExercise(exercise?.id ?? 0);
  const archive = useArchiveExercise();
  const restore = useRestoreExercise();

  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const isArchived = exercise?.archived_at != null;

  async function onSubmit(values: FormValues) {
    const payload = formToPayload(values);
    try {
      if (isEdit && exercise) {
        await update.mutateAsync(payload);
        toast.success('Cambios guardados');
      } else {
        await create.mutateAsync(payload);
        toast.success('Ejercicio creado');
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (code === 'name_taken') {
        form.setError('name', { message: 'Ya existe un ejercicio con ese nombre' });
      } else {
        toast.error('No se pudo guardar');
      }
    }
  }

  async function handleArchive() {
    if (!exercise) return;
    await archive.mutateAsync(exercise.id);
    toast.success('Archivado');
    setArchiveConfirm(false);
    onOpenChange(false);
  }

  async function handleRestore() {
    if (!exercise) return;
    await restore.mutateAsync(exercise.id);
    toast.success('Restaurado');
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar ejercicio' : 'Nuevo ejercicio'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
            {/* Column 1 */}
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="muscle_group">Grupo muscular</Label>
                <Input id="muscle_group" {...form.register('muscle_group')} />
              </div>
              <div>
                <Label>Equipo</Label>
                <Select
                  value={form.watch('equipment')}
                  onValueChange={(v) => form.setValue('equipment', v as FormValues['equipment'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Patrón</Label>
                <Select
                  value={form.watch('movement_pattern')}
                  onValueChange={(v) => form.setValue('movement_pattern', v as FormValues['movement_pattern'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nivel mínimo</Label>
                <Select
                  value={form.watch('level_min')}
                  onValueChange={(v) => form.setValue('level_min', v as FormValues['level_min'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="inc">Incremento por defecto (kg)</Label>
                <Input id="inc" type="number" step="0.5" {...form.register('default_increment_kg')} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch('is_principal')}
                    onCheckedChange={(c) => form.setValue('is_principal', c === true)}
                  />
                  Principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch('is_unilateral')}
                    onCheckedChange={(c) => form.setValue('is_unilateral', c === true)}
                  />
                  Unilateral
                </label>
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="contra">Contraindicaciones (separadas por coma)</Label>
                <Input id="contra" {...form.register('contraindicated_for')} placeholder="lumbar, rodilla" />
              </div>
              <div>
                <Label htmlFor="alts">IDs de alternativas (separados por coma)</Label>
                <Input id="alts" {...form.register('alternatives_ids')} placeholder="12, 18, 23" />
              </div>
              <div>
                <Label htmlFor="vid">Video URL</Label>
                <Input id="vid" type="url" {...form.register('video_url')} />
              </div>
              <div>
                <Label htmlFor="ill">Ilustración URL</Label>
                <Input id="ill" type="url" {...form.register('illustration_url')} />
                {form.watch('illustration_url') && (
                  <img
                    src={form.watch('illustration_url') ?? ''}
                    alt=""
                    className="mt-2 h-24 w-24 rounded-md border object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
            </div>

            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {isEdit && !isArchived && (
                <Button type="button" variant="outline" onClick={() => setArchiveConfirm(true)}>
                  Archivar
                </Button>
              )}
              {isEdit && isArchived && (
                <Button type="button" variant="outline" onClick={handleRestore}>
                  Restaurar
                </Button>
              )}
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {isEdit ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archivar ejercicio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se ocultará del catálogo. El historial queda intacto. ¿Confirmar?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveConfirm(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleArchive}>Archivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run -w frontend typecheck`
Expected: no errors. If `@hookform/resolvers` is not yet a dep, install it:
```bash
npm i -w frontend @hookform/resolvers
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/exercises/ExerciseDialog.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(exercises): create/edit dialog with full schema form"
```

---

## Phase 7 — Frontend: page

### Task 7.1: `Exercises` page

**Files:**
- Create: `frontend/src/pages/admin/Exercises.tsx`

- [ ] **Step 1: Implement page**

```tsx
import { useMemo, useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/admin/PageHeader';
import { ExerciseDialog } from '@/components/admin/exercises/ExerciseDialog';
import {
  useAdminExercises,
  useArchiveExercise,
  useRestoreExercise,
} from '@/hooks/useAdminExercises';
import type { Equipment, Exercise, MovementPattern } from '@/types/api';
import { cn } from '@/lib/utils';

const EQUIPMENT: Equipment[] = [
  'barra','mancuerna','maquina','polea','smith','bw','pesa_rusa','elastico','disco',
];
const PATTERNS: MovementPattern[] = [
  'squat','hinge','push_h','push_v','pull_h','pull_v','isolation','core','cardio',
];

export default function Exercises() {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>('all');
  const [eq, setEq] = useState<Equipment | 'all'>('all');
  const [pattern, setPattern] = useState<MovementPattern | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 50;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);

  const filters = useMemo(() => ({
    q: q.trim() || undefined,
    muscle_group: muscle === 'all' ? undefined : muscle,
    equipment: eq === 'all' ? undefined : eq,
    movement_pattern: pattern === 'all' ? undefined : pattern,
    archived: (showArchived ? 'all' : 'false') as 'all' | 'false',
    limit,
    offset: page * limit,
  }), [q, muscle, eq, pattern, showArchived, page]);

  const query = useAdminExercises(filters);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const muscleGroups = useMemo(() => {
    const set = new Set(items.map((e) => e.muscle_group));
    return Array.from(set).sort();
  }, [items]);

  const archive = useArchiveExercise();
  const restore = useRestoreExercise();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(e: Exercise) {
    setEditing(e);
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        eyebrow="02 — Gestión"
        title="Ejercicios"
        sub={<span className="text-sm text-muted-foreground">{total} ejercicios</span>}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1 size-4" /> Nuevo ejercicio
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Buscar por nombre…"
            className="w-64 pl-8"
          />
        </div>
        <Select value={muscle} onValueChange={(v) => { setMuscle(v); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Grupo muscular" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los grupos</SelectItem>
            {muscleGroups.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={eq} onValueChange={(v) => { setEq(v as Equipment | 'all'); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Equipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={pattern} onValueChange={(v) => { setPattern(v as MovementPattern | 'all'); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Patrón" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="ml-2 flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={(c) => { setShowArchived(c); setPage(0); }} />
          Mostrar archivados
        </label>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Patrón</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Unilateral</TableHead>
            <TableHead>Nivel</TableHead>
            <TableHead className="w-24">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
              </TableRow>
            ))
          )}
          {!query.isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                No hay ejercicios. Crea uno con el botón de arriba.
              </TableCell>
            </TableRow>
          )}
          {items.map((e) => {
            const archived = e.archived_at != null;
            return (
              <TableRow
                key={e.id}
                className={cn('cursor-pointer', archived && 'opacity-50')}
                onClick={() => openEdit(e)}
              >
                <TableCell className="font-medium">
                  {e.name}
                  {archived && <Badge variant="secondary" className="ml-2">Archivado</Badge>}
                </TableCell>
                <TableCell>{e.muscle_group}</TableCell>
                <TableCell>{e.equipment}</TableCell>
                <TableCell>{e.movement_pattern}</TableCell>
                <TableCell>{e.is_principal ? 'Sí' : '—'}</TableCell>
                <TableCell>{e.is_unilateral ? 'Sí' : '—'}</TableCell>
                <TableCell>{e.level_min}</TableCell>
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                      <Pencil className="size-4" />
                    </Button>
                    {archived ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => restore.mutate(e.id)}
                        aria-label="Restaurar"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => archive.mutate(e.id)}
                        aria-label="Archivar"
                      >
                        <Archive className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            página {page + 1} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </Button>
        </div>
      )}

      <ExerciseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exercise={editing}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run -w frontend typecheck`
Expected: no errors. If `PageHeader` has different prop shape, adjust to match.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/Exercises.tsx
git commit -m "feat(exercises): admin list page with filters + pagination"
```

### Task 7.2: Wire route in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add import + route**

Edit `frontend/src/App.tsx`:

```tsx
import AdminExercises from '@/pages/admin/Exercises';
```

Inside the `<RequireAdmin>` route block, add (e.g. after the `rutinas` routes):

```tsx
<Route path="/admin/exercises" element={<AdminExercises />} />
```

- [ ] **Step 2: Run dev server, verify route loads**

Run: `npm run -w frontend dev`
Open `http://localhost:3000/admin/exercises` — page renders, table loads or shows empty state.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(exercises): route /admin/exercises"
```

### Task 7.3: Sidebar entry

**Files:**
- Modify: `frontend/src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Add nav item to Gestión group**

Locate the `Gestión` group in `Sidebar.tsx` (line ~66). Add new item between `users` and `rutinas`:

```tsx
{
  key: 'exercises',
  label: 'Ejercicios',
  icon: Dumbbell,  // already imported
  to: '/admin/exercises',
  matchPrefixes: ['/admin/exercises'],
},
```

- [ ] **Step 2: Verify in browser**

Reload dashboard — "Ejercicios" appears in sidebar under Gestión, active state highlights when on the page.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/Sidebar.tsx
git commit -m "feat(exercises): sidebar entry"
```

---

## Phase 8 — Frontend: skeleton-builder cutover

### Task 8.1: Replace hardcoded catalog in `EditSlotPopover`

**Files:**
- Modify: `frontend/src/components/admin/rutinas/EditSlotPopover.tsx`

- [ ] **Step 1: Read current file to identify usages**

Read: `frontend/src/components/admin/rutinas/EditSlotPopover.tsx` (focus on lines 1-60 with imports + the `searchExercises` call + `CatalogExercise` type usage).

- [ ] **Step 2: Apply diff**

```diff
-import {
-  searchExercises,
-  type CatalogExercise,
-} from '@/lib/exercisesCatalog';
+import { useExercisesSearch } from '@/hooks/useAdminExercises';
+import type { Exercise } from '@/types/api';
```

Replace the `useMemo`-based search:

```diff
-  const [selected, setSelected] = useState<CatalogExercise | null>(null);
+  const [selected, setSelected] = useState<Exercise | null>(null);
   // ...
-  const results = useMemo(
-    () => (open ? searchExercises(query, 8) : []),
-    [open, query],
-  );
+  const { data: results = [] } = useExercisesSearch(query, { enabled: open, limit: 8 });
```

Anywhere `CatalogExercise` is used as a type, change to `Exercise`.

- [ ] **Step 3: Type-check**

Run: `npm run -w frontend typecheck`
Expected: no errors. If the popover used fields beyond `id/name/muscle_group`, the `Exercise` type provides them; if it used the hardcoded equipment values (`gym_completo` etc.), those references must be removed because the DB enum is different.

- [ ] **Step 4: Manual smoke**

Run: `npm run -w frontend dev`
Open `/admin/rutinas`, edit a slot, open exercise picker. Verify:
- Search returns DB-backed results
- Selecting one assigns it correctly
- Existing rutinas still display their previously-assigned exercises (IDs from DB are intact)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/rutinas/EditSlotPopover.tsx
git commit -m "refactor(rutinas): consume DB-backed /exercises in skeleton builder"
```

### Task 8.2: Delete hardcoded catalog file

**Files:**
- Delete: `frontend/src/lib/exercisesCatalog.ts`

- [ ] **Step 1: Verify zero references**

Run: `grep -rn "exercisesCatalog\|CatalogExercise\|EXERCISES_CATALOG\|searchExercises" frontend/src`
Expected: no results.

- [ ] **Step 2: Delete file**

```bash
git rm frontend/src/lib/exercisesCatalog.ts
```

- [ ] **Step 3: Type-check + build**

Run: `npm run -w frontend build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(rutinas): drop hardcoded exercises catalog"
```

---

## Phase 9 — Final verification

### Task 9.1: Full test pass

- [ ] **Step 1: Backend tests**

Run: `npm run -w backend test`
Expected: ALL pass, including pre-existing tests and new `admin-exercises.test.ts`.

- [ ] **Step 2: Frontend type-check + build**

Run:
```bash
npm run -w frontend typecheck
npm run -w frontend build
```
Expected: both succeed.

- [ ] **Step 3: Manual QA checklist (run through each)**

1. Login admin → sidebar shows "Ejercicios"
2. Click "Ejercicios" → table loads
3. Click "+ Nuevo ejercicio" → dialog opens in create mode
4. Submit valid form → toast "Ejercicio creado", row appears in list
5. Click an existing row → dialog opens in edit mode with values prefilled
6. Edit name + save → toast "Cambios guardados", value updated in row
7. Try saving with a duplicate name → inline error on `name` field
8. Click archive icon on a row → row gets opacity + "Archivado" badge, disappears if filters set to non-archived
9. Toggle "Mostrar archivados" → archived rows visible
10. Click restore icon → row returns to active state
11. Filter by muscle/equipment/pattern → table narrows correctly
12. Pagination next/prev → loads correct page
13. `/admin/rutinas` → open skeleton builder → exercise picker shows DB results (not hardcoded), search filters correctly
14. Open an existing rutina with assigned exercises → assignments still resolve to real exercise names

### Task 9.2: Final commit + push

- [ ] **Step 1: Tidy**

```bash
git status
```
Expected: clean tree (everything committed).

- [ ] **Step 2: Push branch + open PR**

User decides whether to push and open PR.

---

## Notes on seed data

The spec mentions an optional seed of 30 base exercises (spec §7.2). This plan **omits** the seed because:

1. The production/dev `exercises` table is already populated (per `alternatives.test.ts` querying real muscle groups like `'Pecho - Mayor'`).
2. The hardcoded TS catalog's equipment enum (`gym_basico` etc.) does not map cleanly to the DB schema (`barra` etc.); seeding would require hand-curating each row.
3. The CRUD UI delivered here is the path forward for catalog additions.

If a future environment has an empty `exercises` table and needs bulk seed data, file a follow-up ticket. The CRUD module supports manual entry today.

---

## Notes for the implementer

- **Frequent commits**: each task ends with a commit. Don't batch.
- **DRY**: the service handles all DB work; routes are validation + auth shims; hooks wrap HTTP; the page is composition only. Don't reimplement validation in the page.
- **YAGNI**: no media uploader, no bulk import, no usage-tracking tab. Stay inside the scope of this plan.
- **Don't touch `default_increment_kg` server-side coercion**: pg returns NUMERIC as string; the service `normalize()` already handles this. Don't add coercion elsewhere.
- **Migration filename**: 024 is the next available number per the snapshot taken when this plan was written. If new migrations land before you start, increment to whatever is next.
- **Test-runner import path for `signToken`**: I assumed `backend/src/services/auth.service.ts` exports it. If not, check existing route tests (e.g. `auth.test.ts`, `session-routes.test.ts`) for the actual auth helper, and use the same pattern.
- **shadcn components used**: Dialog, Button, Input, Label, Checkbox, Select, Switch, Table, Badge, Skeleton. Present at plan-write time: dialog, badge, skeleton. **Missing — must be added before Phase 6**: `select`, `checkbox`, `switch` (verify with `ls frontend/src/components/ui/`). Run `npx shadcn-ui@latest add select checkbox switch` from `frontend/` to scaffold.
