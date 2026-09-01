# `POST /athlete/rm` con `week` derivado del servidor — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-01 · source: claude+writing-plans -->

**Goal:** Que la app pueda registrar un RM sin tener que adivinar en qué semana de programa está el atleta: `week` pasa a ser opcional en `POST /api/athlete/rm` y, cuando no viene, el backend la deriva de `athlete_program_state.current_week`.

**Architecture:** El cliente no tiene una fuente confiable de `current_week` dentro de la sesión (el payload de sesión no la lleva y el dashboard cacheado puede estar viejo). Como `rm_tests` está keyeada por `(athlete_id, exercise_id, program_week)`, un `week` equivocado corrompe las cargas prescritas de las 10 semanas siguientes. El servidor ya es dueño de ese dato: se deriva ahí. `week` explícito sigue aceptándose para no romper clientes viejos ni el admin.

**Tech Stack:** Node 20, TypeScript ESM, Express 4, Zod, PostgreSQL 15 (`pg`), Jest 29 + supertest.

**Spec:** este documento (continuación del fix de la semana de testeo; ver `docs/superpowers/plans/2026-09-01-rm-test-week-unblock.md`).

## Global Constraints

- **No** hacer `git commit`, `git push`, `gh pr` ni tocar el remote.
- Diff mínimo, backend-only. **No** tocar `frontend/` ni el repo hermano `tr-fit-app`.
- **No** cambiar `services/rm.service.ts` (su `RecordRmInput.week` sigue siendo obligatorio: `10 | 20 | 30`). La derivación vive en la ruta.
- **No** tocar `POST /athlete/amrap` en este run.
- Ya estás en la branch `auto-build/rm-test-week-unblock`. Trabajar ahí, no crear otra.
- Estilo: Prettier (semicolons, comillas simples, 80 cols, 2 espacios). Comentarios en castellano.
- Tests: desde `backend/` con `npm test` (nunca `npx jest` pelado). Postgres local ya corre en `localhost:5432` (`trfit_test`).

---

### Task 1: `week` opcional en `rmPayload` + derivación en la ruta

**Files:**
- Modify: `backend/src/domain/schemas.ts:216-220`
- Modify: `backend/src/routes/athlete.ts:246-257`
- Test: `backend/tests/integration/athlete.test.ts`

**Interfaces:**
- Consumes: `recordRm({ athleteId, exerciseId, valueKg, week })` de `services/rm.service.ts` — sin cambios.
- Produces: `POST /api/athlete/rm` acepta `{ exercise_id: number, value_kg: number, week?: 10 | 20 | 30 }`.
  - `week` presente → se usa tal cual (comportamiento actual).
  - `week` ausente → se usa `athlete_program_state.current_week` si es 10, 20 o 30.
  - `week` ausente y `current_week` no es de testeo (o no hay fila de estado) → `400 { error: 'week_not_testable' }`.

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/tests/integration/athlete.test.ts`, agregar estos tres tests **al final del archivo**, después del test existente `it('POST /api/athlete/rm — records RM', ...)`:

```ts
async function setProgramWeek(athleteId: string, week: number) {
  await pool.query(
    `UPDATE athlete_program_state SET current_week = $1 WHERE athlete_id = $2`,
    [week, athleteId],
  );
}

// La app no tiene una fuente confiable de la semana de programa adentro de la
// sesión, y rm_tests está keyeada por program_week: que la elija el servidor.
it('POST /api/athlete/rm — derives week from program state when omitted', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 10);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(201);
  const row = await pool.query<{ program_week: number }>(
    `SELECT program_week FROM rm_tests WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, pid],
  );
  expect(row.rows[0].program_week).toBe(10);
});

it('POST /api/athlete/rm — derives week 30 too', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 30);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(201);
  const row = await pool.query<{ program_week: number }>(
    `SELECT program_week FROM rm_tests WHERE athlete_id = $1 AND exercise_id = $2`,
    [ath, pid],
  );
  expect(row.rows[0].program_week).toBe(30);
});

it('POST /api/athlete/rm — 400 when the current week is not a testing week', async () => {
  const { ath, coach, skeletonId, pid } = await setup();
  await approveSkeleton(skeletonId, coach);
  await setProgramWeek(ath, 7);
  const tok = signToken({ id: ath, role: 'athlete' });
  const r = await request(app).post('/api/athlete/rm')
    .set('Authorization', `Bearer ${tok}`)
    .send({ exercise_id: pid, value_kg: 100 });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('week_not_testable');
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/athlete.test.ts
```

Expected: los dos primeros tests nuevos FALLAN con `expected 201, got 400` (hoy `week` es obligatorio en el schema). El tercero pasa por la razón equivocada — está bien, es la red de seguridad.

- [ ] **Step 3: Hacer `week` opcional en el schema**

En `backend/src/domain/schemas.ts`, reemplazar:

```ts
export const rmPayload = z.object({
  exercise_id: z.number().int().positive(),
  value_kg: z.number().min(1).max(500),
  week: z.union([z.literal(10), z.literal(20), z.literal(30)]),
});
```

por:

```ts
export const rmPayload = z.object({
  exercise_id: z.number().int().positive(),
  value_kg: z.number().min(1).max(500),
  // Opcional: la app no conoce la semana de programa de forma confiable, y
  // rm_tests está keyeada por program_week. Cuando falta, la ruta la deriva
  // de athlete_program_state. Clientes viejos la siguen mandando explícita.
  week: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
});
```

- [ ] **Step 4: Derivar la semana en la ruta**

En `backend/src/routes/athlete.ts`, reemplazar el handler completo:

```ts
router.post('/rm', async (req, res) => {
  const parsed = rmPayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordRm({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    valueKg: parsed.data.value_kg,
    week: parsed.data.week,
  });
  res.status(201).json(out);
});
```

por:

```ts
const TESTING_WEEKS = [10, 20, 30] as const;
type TestingWeek = (typeof TESTING_WEEKS)[number];

function isTestingWeek(week: number | null | undefined): week is TestingWeek {
  return TESTING_WEEKS.includes(week as TestingWeek);
}

router.post('/rm', async (req, res) => {
  const parsed = rmPayload.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'invalid_payload' });

  // Sin `week` explícita mandamos la del estado del programa: el servidor es
  // el dueño de current_week, y una semana equivocada acá corrompe las cargas
  // prescritas de todo el bloque siguiente.
  let week = parsed.data.week;
  if (week === undefined) {
    const stateR = await pool.query<{ current_week: number | null }>(
      `SELECT current_week FROM athlete_program_state WHERE athlete_id = $1`,
      [req.user!.id]
    );
    const currentWeek = stateR.rows[0]?.current_week ?? null;
    if (!isTestingWeek(currentWeek))
      return res.status(400).json({ error: 'week_not_testable' });
    week = currentWeek;
  }

  const out = await recordRm({
    athleteId: req.user!.id,
    exerciseId: parsed.data.exercise_id,
    valueKg: parsed.data.value_kg,
    week,
  });
  res.status(201).json(out);
});
```

`pool` ya está importado en ese archivo (`import pool from '../db/connect.js';`) — no agregar imports nuevos.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/athlete.test.ts
```

Expected: PASS, todo el archivo.

- [ ] **Step 6: Suite completa + lint**

Run (desde `backend/`):

```bash
npm test
npm run lint
```

Expected: suite entera verde (108 suites) y lint sin errores nuevos. Si `npm run lint` ya venía ruidoso en archivos que no tocaste, ignorá ese ruido preexistente pero **no** dejes errores nuevos en `routes/athlete.ts` ni en `domain/schemas.ts`.

- [ ] **Step 7: Commit** — `skip unless user asked to commit`

No commitear en este run.
