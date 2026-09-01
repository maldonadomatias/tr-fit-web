# RM Test Week Unblock (semana 10 / 20) Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-01 · source: claude+writing-plans -->

**Goal:** Que un atleta en la semana de testeo de RM (semana 10 `is_rm_test`, semana 20 `is_amrap`) pueda entrenar esa semana en vez de quedar bloqueado, manteniendo el flag por ítem `'rm_test'` que la app usa para pedir el registro del RM.

**Architecture:** `buildTodaySession()` (backend/src/services/engine.service.ts) es el único choke point: lo consumen el arranque de sesión, el resume, el dashboard y `GET /athlete/today`. Hoy tira `TodayBlockedError('rm_test_required')` cuando `athlete_program_state.rm_test_blocking = TRUE`, **antes** de llegar a la rama `cfg.is_rm_test` que ya sabe construir la sesión de testeo (1x1, flag `'rm_test'`). Se elimina ese guard. `rm_test_blocking` queda como marcador informativo (lo leen `routes/athlete.ts`, `operations.service.ts`, `skeleton.service.ts`) y lo sigue limpiando `recordRm()`.

**Tech Stack:** Node 20, TypeScript ESM, Express 4, PostgreSQL 15 (`pg`), Jest 29 + ts-jest (integration tests contra Postgres real).

**Spec:** este documento (diagnóstico en el hilo de `/auto-build`; no hay spec previa en disco).

## Global Constraints

- **No** hacer `git commit`, `git push`, `gh pr` ni tocar el remote. El deny del CLI lo bloquea igual.
- Diff mínimo. Nada de refactors de paso.
- **No** tocar el frontend (`frontend/`) ni el repo `tr-fit-app` en este run. Es backend-only.
- **No** cambiar la firma pública ni el union de `TodayBlockedError` (`'awaiting_review' | 'rm_test_required' | 'no_program'`): clientes viejos todavía parsean esos strings. El valor `'rm_test_required'` simplemente deja de emitirse.
- **No** tocar `services/rm.service.ts`, `services/progression.service.ts` ni las migraciones. `rm_test_blocking` se sigue seteando y limpiando igual que hoy.
- Estilo: Prettier (semicolons, comillas simples, 80 cols, 2 espacios). Comentarios en castellano, como el resto del archivo.
- Tests: correr desde `backend/` con `npm test` (nunca `npx jest` pelado). Postgres local ya está arriba en `localhost:5432` (`trfit_test`).

---

### Task 1: Sacar el gate `rm_test_blocking` de `buildTodaySession`

**Files:**
- Modify: `backend/src/services/engine.service.ts:29-44`
- Test: `backend/tests/integration/engine.service.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `buildTodaySession(athleteId: string, dayOfWeek: number): Promise<SessionItem[]>` — mismo tipo de retorno; deja de lanzar `TodayBlockedError('rm_test_required')`. Sigue lanzando `TodayBlockedError('awaiting_review')` cuando no hay skeleton activo.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/integration/engine.service.test.ts`, agregar **justo después** del test existente `it('rm_test flag on week 10 even without RM', ...)` (está alrededor de la línea 94) este helper y estos dos tests. El helper va junto a los otros helpers de arriba del archivo (después de `setProgramWeek`), y los tests donde se indicó:

Helper (pegar debajo de la función `setProgramWeek`):

```ts
async function setRmBlocking(athleteId: string, blocking: boolean) {
  await pool.query(
    `UPDATE athlete_program_state SET rm_test_blocking = $1 WHERE athlete_id = $2`,
    [blocking, athleteId],
  );
}
```

Tests (pegar después del test `rm_test flag on week 10 even without RM`):

```ts
// El bloqueo de la semana de testeo era un deadlock: rm_test_blocking cortaba
// la sesión antes de construirla, y la única forma de limpiarlo (cargar los RM)
// vivía adentro de esa misma sesión. La semana de testeo SE ENTRENA.
it('builds the week-10 session even with rm_test_blocking = TRUE', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 10);
  await setRmBlocking(ath, true);
  const session = await buildTodaySession(ath, 1);
  expect(session.length).toBeGreaterThan(0);
  const principal = session.find((s) => s.role === 'principal')!;
  expect(principal.flag).toBe('rm_test');
  expect(principal.suggested_value).toBeNull();
  expect(principal.series).toBe(1);
  expect(principal.reps).toBe('1');
});

it('still throws awaiting_review with rm_test_blocking = TRUE but no skeleton', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  await expect(buildTodaySession(ath, 1)).rejects.toBeInstanceOf(TodayBlockedError);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `backend/`):

```bash
npm test -- tests/integration/engine.service.test.ts -t "rm_test_blocking"
```

Expected: el test `builds the week-10 session even with rm_test_blocking = TRUE` FALLA con `TodayBlockedError: rm_test_required` (rejected promise). El otro pasa.

- [ ] **Step 3: Implementar el cambio mínimo**

En `backend/src/services/engine.service.ts`, la función `buildTodaySession` empieza así:

```ts
export async function buildTodaySession(
  athleteId: string,
  dayOfWeek: number
): Promise<SessionItem[]> {
  const stateR = await pool.query<{
    current_week: number;
    rm_test_blocking: boolean;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, rm_test_blocking, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId]
  );
  if (!stateR.rows[0] || !stateR.rows[0].active_skeleton_id) {
    throw new TodayBlockedError('awaiting_review');
  }
  const state = stateR.rows[0];
  if (state.rm_test_blocking) throw new TodayBlockedError('rm_test_required');
```

Reemplazar ese bloque exacto por:

```ts
export async function buildTodaySession(
  athleteId: string,
  dayOfWeek: number
): Promise<SessionItem[]> {
  const stateR = await pool.query<{
    current_week: number;
    active_skeleton_id: string | null;
  }>(
    `SELECT current_week, active_skeleton_id
       FROM athlete_program_state WHERE athlete_id = $1`,
    [athleteId]
  );
  if (!stateR.rows[0] || !stateR.rows[0].active_skeleton_id) {
    throw new TodayBlockedError('awaiting_review');
  }
  const state = stateR.rows[0];
  // La semana de testeo (is_rm_test / is_amrap) SE ENTRENA: el testeo ES la
  // sesión. `rm_test_blocking` cortaba acá, y como el único camino para
  // limpiarlo (cargar los RM) vive dentro de esa sesión, el atleta quedaba
  // trabado para siempre en la semana 10. La bandera queda como marcador
  // informativo; el flag por ítem 'rm_test' es lo que pide el registro del RM.
```

No cambiar nada más de la función: el resto (`cfgR`, slots, exclusiones, overrides, RM map) queda igual.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/engine.service.test.ts
```

Expected: PASS, todos los tests del archivo (incluidos los dos nuevos).

- [ ] **Step 5: Verificar que no rompiste nada más**

Los unit tests mockean la query por su string exacto (`'SELECT current_week, rm_test_blocking, active_skeleton_id FROM athlete_program_state'` en `tests/unit/engine.service.test.ts` y `tests/unit/engine-amrap.test.ts`). Al sacar la columna del SELECT, esos matchers dejan de matchear y hay que actualizarlos.

- Buscar todas las ocurrencias:

```bash
grep -rn "current_week, rm_test_blocking, active_skeleton_id" tests/ src/
```

- En **cada** match de `tests/unit/`, actualizar el string del matcher a `'SELECT current_week, active_skeleton_id FROM athlete_program_state'` (mantener la forma exacta que ya usa cada handler: algunos usan `.startsWith(...)`, otros `.includes(...)` — respetar el estilo existente de cada uno) y sacar `rm_test_blocking` del objeto de la fila devuelta.
- **No** inventar cambios en `src/` fuera de `engine.service.ts`.

Después correr la suite completa:

```bash
npm test
```

Expected: PASS, suite entera verde (~723 tests). Si algún test falla por el string del SELECT, arreglar el matcher — no revertir el cambio de `engine.service.ts`.

- [ ] **Step 6: Lint + format**

Run (desde `backend/`):

```bash
npm run lint && npm run format:check
```

Expected: sin errores. Si `format:check` se queja de los archivos tocados, correr `npm run format` y volver a correr los tests.

- [ ] **Step 7: Commit** — `skip unless user asked to commit`

No commitear en este run.
