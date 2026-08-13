# Elegir día pendiente — Backend Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-08-13 · source: claude+writing-plans -->

**Goal:** Que el atleta pueda arrancar cualquier día pendiente de su semana de programa, salvo que ese día repita el grupo muscular dominante de su última sesión.

**Architecture:** El día sigue validándose server-side. `computeNextPendingDay` pasa de `MAX(día)+1` al menor día sin sesión terminada esta semana, y se expone `listPendingDays` como fuente única. Un servicio nuevo deriva el grupo dominante de cada día del skeleton contando slots principales por grupo primario. `POST /sessions` acepta un campo nuevo `pick_day_of_week` (el viejo `day_of_week` sigue ignorado, para no romper builds viejas de la app) y valida pendiente + no-repite-grupo. El dashboard expone los días pendientes con su grupo dominante y un flag `blocked`.

**Tech Stack:** Node + TypeScript (ESM, imports con `.js`), Express, Zod, PostgreSQL (`pg`), Jest (`npm test` desde `backend/`, corre con `--experimental-vm-modules`).

**Spec:** `docs/superpowers/specs/2026-08-13-elegir-dia-pendiente-design.md`

## Global Constraints

- NO hacer `git commit`, `git push`, ni abrir PRs. El usuario no lo pidió en este run.
- Diffs mínimos: nada de refactors de paso ni renombres fuera de lo listado.
- Todos los imports internos llevan extensión `.js` (ESM), como el resto del repo.
- Los tests de integración corren contra Postgres real; se ejecutan con `npm test` desde `backend/`. Siempre `await ensureMigrated()` en `beforeAll` y `await resetDatabase()` en `beforeEach`, como los tests existentes.
- El servidor devuelve **códigos** de error (`day_not_pending`, `same_focus_back_to_back`), nunca texto para el usuario. La traducción al español vive en la app.
- No tocar `athlete_exercise_weights`, la lógica de progresión, ni el guard `already_trained_today`.
- No agregar migraciones: todo se deriva de tablas existentes (`skeleton_slots`, `exercises`, `session_logs`, `skeleton_days`).

## File Structure

- `backend/src/services/engine.service.ts` — MODIFICAR: `computeNextPendingDay` reescrito sobre el nuevo `listPendingDays` (export nuevo en el mismo archivo; es donde ya vive la lógica de día/semana).
- `backend/src/services/day-focus.service.ts` — CREAR: derivación del grupo dominante por día. Archivo propio porque es una responsabilidad nueva y autocontenida (lee skeleton + exercises, no sabe nada de sesiones).
- `backend/src/services/session.service.ts` — MODIFICAR: `startSession` acepta `dayOfWeek` opcional y valida.
- `backend/src/domain/schemas.ts` — MODIFICAR: `startSessionPayload` gana `pick_day_of_week`.
- `backend/src/routes/sessions.ts` — MODIFICAR: pasa `pick_day_of_week` al service.
- `backend/src/services/dashboard.service.ts` — MODIFICAR: `nextSessions` pasa a ser la lista de pendientes con `dominantGroup` + `blocked`.
- `backend/tests/integration/pending-days.test.ts` — CREAR: días pendientes + grupo dominante.
- `backend/tests/integration/session-pick-day.test.ts` — CREAR: elegir día al arrancar sesión.
- `backend/tests/integration/dashboard.test.ts` — MODIFICAR si existe, si no CREAR: pendientes en el dashboard.

---

### Task 1: Días pendientes de la semana

**Files:**
- Modify: `backend/src/services/engine.service.ts` (función `computeNextPendingDay`, al final del archivo)
- Test: `backend/tests/integration/pending-days.test.ts` (crear)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `export async function listPendingDays(athleteId: string): Promise<number[]>` — días `1..days_per_week` sin sesión terminada en la `current_week` del atleta, en orden ascendente. Array vacío si la semana está completa. `[1]` si no hay skeleton activo.
  - `export async function computeNextPendingDay(athleteId: string): Promise<number>` — sigue existiendo con la misma firma; ahora devuelve `listPendingDays()[0] ?? 1`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/integration/pending-days.test.ts`:

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { listPendingDays, computeNextPendingDay } from '../../src/services/engine.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function setup4DaySkeleton(athleteId: string, coachId: string) {
  const p = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE AND equipment='barra' LIMIT 1`,
  );
  const a = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
  );
  const ai = {
    rationale: 'r',
    days: [1, 2, 3, 4].map((d) => ({
      day_index: d, focus: `Day${d}`,
      slots: [
        { slot_index: 1, exercise_id: p.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
        { slot_index: 2, exercise_id: a.rows[0].id, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
      ],
    })),
  };
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' }, ai,
  );
  await approveSkeleton(skeletonId, coachId);
  return skeletonId;
}

/** Sesión terminada del día `day` en la semana de programa actual. */
async function finishDay(athleteId: string, skeletonId: string, day: number) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, finished_at)
     VALUES ($1, $2, $3, $4, 0, 0, gen_random_uuid(), NOW())`,
    [athleteId, skeletonId, week.rows[0].current_week, day],
  );
}

it('lists every day of the week when nothing is finished', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  await setup4DaySkeleton(ath, coach);
  expect(await listPendingDays(ath)).toEqual([1, 2, 3, 4]);
  expect(await computeNextPendingDay(ath)).toBe(1);
});

it('drops finished days and keeps the sequential order', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  expect(await listPendingDays(ath)).toEqual([2, 3, 4]);
  expect(await computeNextPendingDay(ath)).toBe(2);
});

// El bug: con MAX(día)+1, hacer el día 3 dejaba el 2 inalcanzable.
it('keeps an earlier day pending when a later one was done first', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  await finishDay(ath, sk, 3);
  expect(await listPendingDays(ath)).toEqual([2, 4]);
  expect(await computeNextPendingDay(ath)).toBe(2);
});

it('is empty when the week is complete, and the next day wraps to 1', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  for (const d of [1, 2, 3, 4]) await finishDay(ath, sk, d);
  expect(await listPendingDays(ath)).toEqual([]);
  expect(await computeNextPendingDay(ath)).toBe(1);
});

it('ignores unfinished sessions', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 4 });
  const sk = await setup4DaySkeleton(ath, coach);
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [ath],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id)
     VALUES ($1, $2, $3, 1, 0, 0, gen_random_uuid())`,
    [ath, sk, week.rows[0].current_week],
  );
  expect(await listPendingDays(ath)).toEqual([1, 2, 3, 4]);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npm test -- tests/integration/pending-days.test.ts`
Expected: FAIL — `listPendingDays is not a function` / no exportado.

- [ ] **Step 3: Implementar**

En `backend/src/services/engine.service.ts`, reemplazar el cuerpo de `computeNextPendingDay` por estas dos funciones (el JSDoc existente de `computeNextPendingDay` se conserva, ajustando la descripción):

```ts
/**
 * Días de la semana de programa que el atleta todavía no terminó, en orden.
 * Fuente única para "qué puedo entrenar hoy": la usa el arranque de sesión y
 * el dashboard. Vacío cuando la semana está completa.
 *
 * Antes esto era MAX(day_of_week) + 1, así que terminar un día fuera de orden
 * dejaba los anteriores inalcanzables para siempre. Un día postergado ahora
 * vuelve a ofrecerse.
 */
export async function listPendingDays(athleteId: string): Promise<number[]> {
  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId]
  );
  const state = stateR.rows[0];

  const profileR = await pool.query<{ days_per_week: number | null }>(
    `SELECT days_per_week FROM athlete_profiles WHERE user_id = $1`,
    [athleteId]
  );
  const daysPerWeek = profileR.rows[0]?.days_per_week ?? 7;

  if (!state || !state.active_skeleton_id) return [1];

  const doneR = await pool.query<{ day_of_week: number }>(
    `SELECT DISTINCT day_of_week
       FROM session_logs
      WHERE athlete_id = $1
        AND program_week = $2
        AND finished_at IS NOT NULL`,
    [athleteId, state.current_week ?? 0]
  );
  const done = new Set(doneR.rows.map((r) => r.day_of_week));

  const pending: number[] = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    if (!done.has(d)) pending.push(d);
  }
  return pending;
}

/**
 * Próximo día pendiente del atleta: el menor sin terminar de la semana de
 * programa. Con la semana completa vuelve al 1 (arranca el ciclo siguiente).
 */
export async function computeNextPendingDay(
  athleteId: string
): Promise<number> {
  const pending = await listPendingDays(athleteId);
  return pending[0] ?? 1;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npm test -- tests/integration/pending-days.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificar que no se rompió nada**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: tsc sin salida; suite completa en verde (101 suites / 775 tests antes de este plan; ahora suma la nueva).

---

### Task 2: Grupo dominante por día

**Files:**
- Create: `backend/src/services/day-focus.service.ts`
- Test: `backend/tests/integration/pending-days.test.ts` (agregar un `describe` al final del archivo creado en la Task 1)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `export function primaryGroup(muscleGroup: string): string` — `"Piernas - Cuadriceps"` → `"Piernas"`; sin separador devuelve el string trimmeado.
  - `export async function dominantGroupByDay(skeletonId: string): Promise<Record<number, string | null>>` — por `day_of_week`, el grupo primario con más slots `role='principal'`; a igual cantidad gana el de menor `slot_index`. Días sin principales → no aparecen en el record (el consumidor los lee como `undefined`, tratado como "sin grupo").

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `backend/tests/integration/pending-days.test.ts`:

```ts
import { primaryGroup, dominantGroupByDay } from '../../src/services/day-focus.service.js';

describe('dominantGroupByDay', () => {
  it('trims the subgroup off a muscle_group', () => {
    expect(primaryGroup('Piernas - Cuadriceps')).toBe('Piernas');
    expect(primaryGroup('Espalda')).toBe('Espalda');
    expect(primaryGroup('  Pecho - Mayor ')).toBe('Pecho');
  });

  it('picks the group with most principal slots per day', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { days_per_week: 2 });
    const legs = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = TRUE
         AND muscle_group LIKE 'Piernas%' LIMIT 2`,
    );
    const chest = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = TRUE
         AND muscle_group LIKE 'Pecho%' LIMIT 1`,
    );
    if (legs.rows.length < 2 || chest.rows.length < 1) return;
    const ai = {
      rationale: 'r',
      days: [
        {
          day_index: 1, focus: 'Piernas / Pecho',
          slots: [
            { slot_index: 1, exercise_id: legs.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
            { slot_index: 2, exercise_id: legs.rows[1].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
            { slot_index: 3, exercise_id: chest.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
          ],
        },
        {
          day_index: 2, focus: 'Pecho',
          slots: [
            { slot_index: 1, exercise_id: chest.rows[0].id, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
          ],
        },
      ],
    };
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, ai,
    );
    await approveSkeleton(skeletonId, coach);

    const byDay = await dominantGroupByDay(skeletonId);
    expect(byDay[1]).toBe('Piernas');
    expect(byDay[2]).toBe('Pecho');
  });

  it('has no dominant group for a day without principals', async () => {
    const coach = await createAdmin();
    const ath = await createAthlete(coach, { days_per_week: 2 });
    const acc = await pool.query<{ id: number }>(
      `SELECT id FROM exercises WHERE is_principal = FALSE LIMIT 1`,
    );
    const ai = {
      rationale: 'r',
      days: [1, 2].map((d) => ({
        day_index: d, focus: 'Accesorios',
        slots: [
          { slot_index: 1, exercise_id: acc.rows[0].id, role: 'accesorio' as const, notes: null, series: null, reps: null, descanso: null },
        ],
      })),
    };
    const { skeletonId } = await createPendingSkeleton(
      { athleteId: ath, generationPrompt: {}, generationRationale: 'r' }, ai,
    );
    await approveSkeleton(skeletonId, coach);
    const byDay = await dominantGroupByDay(skeletonId);
    expect(byDay[1] ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npm test -- tests/integration/pending-days.test.ts`
Expected: FAIL — no existe `src/services/day-focus.service.ts`.

- [ ] **Step 3: Implementar**

Crear `backend/src/services/day-focus.service.ts`:

```ts
import pool from '../db/connect.js';

/**
 * Grupo primario de un `muscle_group`: los subgrupos vienen como
 * "Piernas - Cuadriceps" y la separación que le importa al coach es la del
 * grupo grande ("no dos días de Piernas seguidos").
 */
export function primaryGroup(muscleGroup: string): string {
  const [head] = muscleGroup.split(' - ');
  return (head ?? muscleGroup).trim();
}

/**
 * Grupo dominante de cada día del skeleton: el grupo primario con más slots
 * PRINCIPALES; a igual cantidad gana el que aparece primero en el día.
 *
 * Se deriva de los slots en vez de leer `skeleton_days.focus` porque el focus
 * es una etiqueta compuesta ("Piernas / Espalda / Abdomen") que no sirve para
 * comparar dos días. Un día sin principales no entra en el record: no tiene
 * grupo dominante y por lo tanto nunca bloquea.
 */
export async function dominantGroupByDay(
  skeletonId: string
): Promise<Record<number, string | null>> {
  const r = await pool.query<{
    day_of_week: number;
    muscle_group: string;
    slot_index: number;
  }>(
    `SELECT s.day_of_week, e.muscle_group, s.slot_index
       FROM skeleton_slots s
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.skeleton_id = $1 AND s.role = 'principal'
      ORDER BY s.day_of_week, s.slot_index`,
    [skeletonId]
  );

  // Conteo por (día, grupo) conservando el primer slot_index de cada grupo,
  // que es el desempate.
  const byDay = new Map<number, Map<string, { n: number; firstSlot: number }>>();
  for (const row of r.rows) {
    const group = primaryGroup(row.muscle_group);
    if (!byDay.has(row.day_of_week)) byDay.set(row.day_of_week, new Map());
    const groups = byDay.get(row.day_of_week)!;
    const cur = groups.get(group);
    if (cur) cur.n += 1;
    else groups.set(group, { n: 1, firstSlot: row.slot_index });
  }

  const out: Record<number, string | null> = {};
  for (const [day, groups] of byDay) {
    let best: { group: string; n: number; firstSlot: number } | null = null;
    for (const [group, { n, firstSlot }] of groups) {
      if (
        !best ||
        n > best.n ||
        (n === best.n && firstSlot < best.firstSlot)
      ) {
        best = { group, n, firstSlot };
      }
    }
    out[day] = best?.group ?? null;
  }
  return out;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npm test -- tests/integration/pending-days.test.ts`
Expected: PASS (8 tests).

---

### Task 3: Arrancar la sesión en un día elegido

**Files:**
- Modify: `backend/src/domain/schemas.ts` (`startSessionPayload`, ~línea 397)
- Modify: `backend/src/services/session.service.ts` (`startSession`, ~línea 23)
- Modify: `backend/src/routes/sessions.ts` (handler `POST /`, ~línea 15)
- Test: `backend/tests/integration/session-pick-day.test.ts` (crear)

**Interfaces:**
- Consumes: `listPendingDays` (Task 1), `dominantGroupByDay` (Task 2).
- Produces:
  - `startSession(athleteId: string, clientId: string, opts?: { force?: boolean; dayOfWeek?: number })` — mismo retorno `{ sessionId, expectedDay, items }`.
  - Nuevos `SessionError` reasons: `'day_not_pending'`, `'same_focus_back_to_back'` (la ruta ya mapea cualquier reason desconocido a HTTP 400 con `{ error: reason }`).
  - Campo nuevo del payload: `pick_day_of_week?: number` (1..7).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/integration/session-pick-day.test.ts`:

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { startSession, SessionError } from '../../src/services/session.service.js';
import pool from '../../src/db/connect.js';
import { randomUUID } from 'node:crypto';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

/** Skeleton de 3 días: día 1 Piernas, día 2 Pecho, día 3 Piernas. */
async function setupSkeleton(athleteId: string, coachId: string) {
  const legs = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Piernas%' LIMIT 1`,
  );
  const chest = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Pecho%' LIMIT 1`,
  );
  const day = (d: number, exerciseId: number, focus: string) => ({
    day_index: d, focus,
    slots: [
      { slot_index: 1, exercise_id: exerciseId, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
    ],
  });
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [
        day(1, legs.rows[0].id, 'Piernas'),
        day(2, chest.rows[0].id, 'Pecho'),
        day(3, legs.rows[0].id, 'Piernas'),
      ],
    },
  );
  await approveSkeleton(skeletonId, coachId);
  return skeletonId;
}

async function finishDay(athleteId: string, skeletonId: string, day: number) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [athleteId],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, finished_at)
     VALUES ($1, $2, $3, $4, 0, 0, gen_random_uuid(), NOW())`,
    [athleteId, skeletonId, week.rows[0].current_week, day],
  );
}

it('starts the first pending day when no day is picked', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const out = await startSession(ath, randomUUID());
  expect(out.expectedDay).toBe(1);
});

it('starts the picked pending day', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2 });
  expect(out.expectedDay).toBe(2);
});

it('refuses a day already finished this week', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 2);
  await expect(
    startSession(ath, randomUUID(), { dayOfWeek: 2, force: true }),
  ).rejects.toMatchObject({ reason: 'day_not_pending' });
});

// La regla del coach: día 3 es Piernas igual que el día 1 recién hecho.
it('refuses a day repeating the last session dominant group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  await expect(
    startSession(ath, randomUUID(), { dayOfWeek: 3, force: true }),
  ).rejects.toMatchObject({ reason: 'same_focus_back_to_back' });
  // El día de Pecho sí se puede.
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 2, force: true });
  expect(out.expectedDay).toBe(2);
});

// Escape: si TODO lo pendiente choca, el atleta no puede quedar sin entrenar.
it('allows the repeat when every pending day shares the group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1);
  await finishDay(ath, sk, 2);
  const out = await startSession(ath, randomUUID(), { dayOfWeek: 3, force: true });
  expect(out.expectedDay).toBe(3);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npm test -- tests/integration/session-pick-day.test.ts`
Expected: FAIL — `startSession` ignora `dayOfWeek`, el 2° test devuelve `expectedDay: 1`.

- [ ] **Step 3: Ampliar el schema**

En `backend/src/domain/schemas.ts`, reemplazar `startSessionPayload`:

```ts
export const startSessionPayload = z.object({
  // Ignorado por el servidor (el día se computa server-side); se sigue
  // aceptando para que builds viejas de la app no rompan.
  day_of_week: z.number().int().min(1).max(7).optional(),
  // Día ELEGIDO por el atleta ("Entrenar este"). Campo nuevo y separado de
  // `day_of_week` justamente porque aquel viaja con basura en builds viejas.
  pick_day_of_week: z.number().int().min(1).max(7).optional(),
  client_id: z.string().uuid(),
  // Override del guard "ya entrenaste hoy" ("Entrenar de todas formas").
  force: z.boolean().optional(),
});
```

- [ ] **Step 4: Implementar la validación en el service**

En `backend/src/services/session.service.ts`:

1. Agregar a los imports de `engine.service.js` el `listPendingDays` (el archivo ya importa `computeNextPendingDay` y `buildTodaySession` desde ahí), y agregar el import nuevo:

```ts
import { dominantGroupByDay } from './day-focus.service.js';
```

2. Cambiar la firma y el bloque que resuelve el día. Reemplazar

```ts
  opts: { force?: boolean } = {},
```

por

```ts
  opts: { force?: boolean; dayOfWeek?: number } = {},
```

y reemplazar

```ts
  const dayOfWeek = await computeNextPendingDay(athleteId);
  const expectedDay = dayOfWeek;
```

por

```ts
  // El día lo decide el servidor. Sin elección explícita, el primer pendiente
  // (lo de siempre). Con elección, tiene que estar pendiente y no repetir el
  // grupo dominante de la última sesión: ese orden es la separación muscular
  // que armó el coach, y por eso no hay override.
  const pending = await listPendingDays(athleteId);
  let dayOfWeek = pending[0] ?? 1;
  if (opts.dayOfWeek != null) {
    if (!pending.includes(opts.dayOfWeek)) {
      throw new SessionError('day_not_pending');
    }
    const dominant = await dominantGroupByDay(state.active_skeleton_id);
    const lastR = await pool.query<{ day_of_week: number }>(
      `SELECT day_of_week FROM session_logs
        WHERE athlete_id = $1 AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1`,
      [athleteId],
    );
    const lastGroup = lastR.rows[0]
      ? dominant[lastR.rows[0].day_of_week] ?? null
      : null;
    const picked = dominant[opts.dayOfWeek] ?? null;
    // Si TODOS los pendientes chocan, no bloqueamos ninguno: el atleta no
    // puede quedar sin poder entrenar.
    const hasFreeAlternative = pending.some(
      (d) => (dominant[d] ?? null) !== lastGroup,
    );
    if (lastGroup && picked === lastGroup && hasFreeAlternative) {
      throw new SessionError('same_focus_back_to_back');
    }
    dayOfWeek = opts.dayOfWeek;
  }
  const expectedDay = dayOfWeek;
```

3. Verificar que el `SessionError` del archivo acepta reasons arbitrarios (es un `class SessionError extends Error` con `reason`); si el tipo del reason es una unión cerrada, agregar `'day_not_pending' | 'same_focus_back_to_back'` a esa unión.

- [ ] **Step 5: Pasar el día desde la ruta**

En `backend/src/routes/sessions.ts`, en el handler `POST /`, reemplazar

```ts
    const out = await startSession(req.user!.id, parsed.data.client_id, {
      force: parsed.data.force,
    });
```

por

```ts
    const out = await startSession(req.user!.id, parsed.data.client_id, {
      force: parsed.data.force,
      dayOfWeek: parsed.data.pick_day_of_week,
    });
```

- [ ] **Step 6: Correr los tests**

Run: `cd backend && npm test -- tests/integration/session-pick-day.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Verificar que la suite sigue verde**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: tsc sin salida; toda la suite en verde.

---

### Task 4: El dashboard expone los pendientes

**Files:**
- Modify: `backend/src/services/dashboard.service.ts` (`NextSession`, `projectNextSessions`, `buildDashboard`)
- Test: `backend/tests/integration/dashboard-pending.test.ts` (crear)

**Interfaces:**
- Consumes: `listPendingDays` (Task 1), `dominantGroupByDay` (Task 2).
- Produces: `NextSession` gana dos campos:

```ts
export interface NextSession {
  label: string;
  dayIndex: number;
  focus: string | null;
  exerciseCount: number;
  estimatedMin: number;
  dominantGroup: string | null;   // nuevo
  blocked: 'same_focus' | null;   // nuevo
}
```

`buildDashboard` devuelve en `nextSessions` los días **pendientes posteriores al de hoy**; si no queda ninguno (hoy cierra la semana), mantiene la proyección cíclica actual de 3 días con `blocked: null` y `dominantGroup` resuelto.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/integration/dashboard-pending.test.ts`:

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import { createAdmin, createAthlete } from './helpers/fixtures.js';
import { createPendingSkeleton, approveSkeleton } from '../../src/services/skeleton.service.js';
import { buildDashboard } from '../../src/services/dashboard.service.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

/** Día 1 Piernas, día 2 Pecho, día 3 Piernas. */
async function setupSkeleton(athleteId: string, coachId: string) {
  const legs = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Piernas%' LIMIT 1`,
  );
  const chest = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE is_principal = TRUE
       AND muscle_group LIKE 'Pecho%' LIMIT 1`,
  );
  const day = (d: number, exerciseId: number, focus: string) => ({
    day_index: d, focus,
    slots: [
      { slot_index: 1, exercise_id: exerciseId, role: 'principal' as const, notes: null, series: null, reps: null, descanso: null },
    ],
  });
  const { skeletonId } = await createPendingSkeleton(
    { athleteId, generationPrompt: {}, generationRationale: 'r' },
    {
      rationale: 'r',
      days: [
        day(1, legs.rows[0].id, 'Piernas'),
        day(2, chest.rows[0].id, 'Pecho'),
        day(3, legs.rows[0].id, 'Piernas'),
      ],
    },
  );
  await approveSkeleton(skeletonId, coachId);
  return skeletonId;
}

async function finishDay(athleteId: string, skeletonId: string, day: number) {
  const week = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`, [athleteId],
  );
  await pool.query(
    `INSERT INTO session_logs
       (athlete_id, skeleton_id, program_week, day_of_week,
        total_sets_target, total_sets_completed, client_id, finished_at)
     VALUES ($1, $2, $3, $4, 0, 0, gen_random_uuid(), NOW())`,
    [athleteId, skeletonId, week.rows[0].current_week, day],
  );
}

it('lists the pending days after today, with their dominant group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  await setupSkeleton(ath, coach);
  const d = await buildDashboard(ath);
  expect(d.today.dayIndex).toBe(1);
  expect(d.nextSessions.map((s) => s.dayIndex)).toEqual([2, 3]);
  expect(d.nextSessions[0].dominantGroup).toBe('Pecho');
  expect(d.nextSessions[1].dominantGroup).toBe('Piernas');
});

it('blocks a pending day repeating the last session group', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  await finishDay(ath, sk, 1); // Piernas
  const d = await buildDashboard(ath);
  // Pendientes 2 (Pecho) y 3 (Piernas). Hoy es el 2; el 3 queda bloqueado.
  expect(d.today.dayIndex).toBe(2);
  const day3 = d.nextSessions.find((s) => s.dayIndex === 3);
  expect(day3?.blocked).toBe('same_focus');
});

it('falls back to the cyclic projection when the week is done', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach, { days_per_week: 3 });
  const sk = await setupSkeleton(ath, coach);
  for (const day of [1, 2, 3]) await finishDay(ath, sk, day);
  const d = await buildDashboard(ath);
  expect(d.nextSessions.length).toBe(3);
  expect(d.nextSessions.every((s) => s.blocked === null)).toBe(true);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npm test -- tests/integration/dashboard-pending.test.ts`
Expected: FAIL — `nextSessions` trae la proyección cíclica y no tiene `dominantGroup`.

- [ ] **Step 3: Implementar**

En `backend/src/services/dashboard.service.ts`:

1. Agregar `dominantGroup` y `blocked` a la interfaz `NextSession` (ver bloque Interfaces arriba).

2. En `projectNextSessions`, agregar los campos nuevos al objeto que se pushea, con valores neutros:

```ts
    out.push({
      label: `Sesión ${i}`,
      dayIndex,
      focus: focusByDay[dayIndex] ?? null,
      exerciseCount: slotsByDay[dayIndex] ?? 0,
      estimatedMin,
      dominantGroup: null,
      blocked: null,
    });
```

`projectNextSessions` recibe un input nuevo opcional `dominantByDay?: Record<number, string | null>`; cuando viene, `dominantGroup: dominantByDay[dayIndex] ?? null`.

3. En `buildDashboard`, después de armar `slotsByDay` / `focusByDay` y antes del `return`, reemplazar el bloque que construye `nextSessions` por:

```ts
  const daysPerWeek = profile.days_per_week
    ?? (profile.days_specific?.length ?? 7);

  let dominantByDay: Record<number, string | null> = {};
  if (state?.active_skeleton_id) {
    dominantByDay = await dominantGroupByDay(state.active_skeleton_id);
  }

  // Pendientes posteriores al de hoy. Un día queda bloqueado si repite el
  // grupo dominante de la última sesión terminada — salvo que TODOS los
  // pendientes lo repitan, en cuyo caso no se bloquea ninguno.
  const pending = await listPendingDays(userId);
  const upcoming = pending.filter((d) => d !== nextDay);
  let nextSessions: NextSession[];
  if (upcoming.length > 0) {
    const lastR = await pool.query<{ day_of_week: number }>(
      `SELECT day_of_week FROM session_logs
        WHERE athlete_id = $1 AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1`,
      [userId],
    );
    const lastGroup = lastR.rows[0]
      ? dominantByDay[lastR.rows[0].day_of_week] ?? null
      : null;
    const hasFreeAlternative = pending.some(
      (d) => (dominantByDay[d] ?? null) !== lastGroup,
    );
    nextSessions = upcoming.map((dayIndex, i) => {
      const dominantGroup = dominantByDay[dayIndex] ?? null;
      const blocked: 'same_focus' | null =
        lastGroup && dominantGroup === lastGroup && hasFreeAlternative
          ? 'same_focus'
          : null;
      return {
        label: `Sesión ${i + 1}`,
        dayIndex,
        focus: focusByDay[dayIndex] ?? null,
        exerciseCount: slotsByDay[dayIndex] ?? 0,
        estimatedMin,
        dominantGroup,
        blocked,
      };
    });
  } else {
    nextSessions = projectNextSessions({
      daysPerWeek,
      currentDay: nextDay,
      slotsByDay,
      focusByDay,
      estimatedMin,
      dominantByDay,
    });
  }
```

4. Agregar los imports que falten arriba del archivo: `listPendingDays` desde `./engine.service.js` (el archivo ya importa `computeNextPendingDay`, `buildTodaySession` y `TodayBlockedError` de ahí) y `dominantGroupByDay` desde `./day-focus.service.js`.

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npm test -- tests/integration/dashboard-pending.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificación final**

Run: `cd backend && npx tsc --noEmit && npx eslint src && npm test`
Expected: tsc sin salida, eslint limpio, suite completa en verde. Si algún test viejo de dashboard asumía 3 `nextSessions` fijos, actualizarlo a la nueva semántica (pendientes) — no aflojar la aserción, cambiarla al comportamiento correcto.
