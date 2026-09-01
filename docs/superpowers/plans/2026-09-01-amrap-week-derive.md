# Semana 20 (AMRAP): derivar el RM teórico de la sesión — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-01 · source: claude+writing-plans -->

**Goal:** Que la semana 20 (AMRAP) registre el RM teórico sin que el atleta tenga que hacer nada extra: al terminar la sesión, el backend deriva el 1RM por Epley de la serie AMRAP que el atleta ya logueó y lo guarda en `rm_tests(program_week = 20)`.

**Architecture:** La semana 20 prescribe una serie al 85% del RM de la semana 10 con reps `AMRAP` (`periodization_config.is_amrap`, ver `db/migrations/034_amrap_periodization.sql`). `services/rm.service.ts` ya expone `recordAmrap()` (Epley + upsert), y la ruta `POST /athlete/amrap` existe — pero **nada en la app la llama**, así que `rm_tests(program_week = 20)` queda vacío y la semana 27 (`principal_rm_source = 20`) cae al fallback `missing_rm`. En vez de agregar otra pantalla y otro camino de red que tendría que sobrevivir a la cola offline, el dato ya está en `set_logs`: se deriva al cerrar la sesión, que es por donde pasan todos los sets (online y los que llegan por la cola de sync).

**Tech Stack:** Node 20, TypeScript ESM, PostgreSQL 15 (`pg`), Jest 29.

**Spec:** este documento (parte 3 del fix de las semanas de testeo; ver los otros planes en `docs/superpowers/plans/2026-09-01-*.md`).

## Global Constraints

- **No** hacer `git commit`, `git push`, `gh pr` ni tocar el remote.
- Diff mínimo, backend-only. **No** tocar `frontend/` ni el repo hermano `tr-fit-app`.
- **No** tocar `services/rm.service.ts` ni `services/epley.service.ts`: se consumen tal cual.
- **No** extender esto a las semanas 10 y 30 (`is_rm_test`). Ahí el atleta carga el RM explícitamente desde la app y derivarlo de los sets podría pisarle un valor deliberado con una serie fallida. Sólo `is_amrap`.
- Ya estás en la branch `auto-build/rm-test-week-unblock`. Trabajar ahí, no crear otra.
- Estilo: Prettier (semicolons, comillas simples, 80 cols, 2 espacios). Comentarios en castellano.
- Tests: desde `backend/` con `npm test` (nunca `npx jest` pelado). Postgres local corre en `localhost:5432` (`trfit_test`).

---

### Task 1: Derivar el AMRAP al terminar la sesión

**Files:**
- Modify: `backend/src/services/session.service.ts` (agregar una función privada y llamarla en `finishSession`, justo antes de `closeWeekIfComplete`)
- Test: `backend/tests/integration/session.test.ts`

**Interfaces:**
- Consumes: `recordAmrap({ athleteId, exerciseId, weightUsed, reps })` de `services/rm.service.ts` — devuelve `{ rmId, estimated1RM }`.
- Produces: nada público. `finishSession()` mantiene su firma y su `SessionSummary`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/integration/session.test.ts`, agregar **al final del archivo**:

```ts
async function setWeek(athleteId: string, week: number) {
  await pool.query(
    `UPDATE athlete_program_state SET current_week = $1 WHERE athlete_id = $2`,
    [week, athleteId],
  );
}

// La semana 20 es AMRAP: el atleta hace UNA serie al 85% y anota cuántas reps
// le salieron. Nada en la app postea a /athlete/amrap, así que el RM teórico
// se deriva de los sets que ya quedaron logueados.
it('finishSession derives the AMRAP 1RM on an is_amrap week', async () => {
  const { ath, principalId } = await setupAthlete();
  await setWeek(ath, 20);
  const { sessionId } = await startSession(ath, randomUUID(), { force: true });
  await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1,
    unit: 'kg', value: 100, reps: 6, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await finishSession(sessionId, ath, 'normal');

  const rm = await pool.query<{ value_kg: string; amrap_weight: string; amrap_reps: number }>(
    `SELECT value_kg::text, amrap_weight::text, amrap_reps
       FROM rm_tests
      WHERE athlete_id = $1 AND exercise_id = $2 AND program_week = 20`,
    [ath, principalId],
  );
  expect(rm.rowCount).toBe(1);
  expect(Number(rm.rows[0].amrap_weight)).toBe(100);
  expect(rm.rows[0].amrap_reps).toBe(6);
  // Epley: 100 × (1 + 6/30) = 120, redondeado según el equipamiento.
  expect(Number(rm.rows[0].value_kg)).toBeGreaterThanOrEqual(117.5);
  expect(Number(rm.rows[0].value_kg)).toBeLessThanOrEqual(122.5);
});

it('finishSession keeps the best AMRAP set when several were logged', async () => {
  const { ath, principalId } = await setupAthlete();
  await setWeek(ath, 20);
  const { sessionId } = await startSession(ath, randomUUID(), { force: true });
  // 100×6 → e1RM 120 ; 90×4 → e1RM 102. Gana el primero.
  await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1,
    unit: 'kg', value: 90, reps: 4, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 2,
    unit: 'kg', value: 100, reps: 6, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await finishSession(sessionId, ath, 'normal');

  const rm = await pool.query<{ amrap_weight: string; amrap_reps: number }>(
    `SELECT amrap_weight::text, amrap_reps FROM rm_tests
      WHERE athlete_id = $1 AND exercise_id = $2 AND program_week = 20`,
    [ath, principalId],
  );
  expect(Number(rm.rows[0].amrap_weight)).toBe(100);
  expect(rm.rows[0].amrap_reps).toBe(6);
});

it('finishSession does not record an AMRAP on a normal week', async () => {
  const { ath, principalId } = await setupAthlete();
  await setWeek(ath, 3);
  const { sessionId } = await startSession(ath, randomUUID(), { force: true });
  await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1,
    unit: 'kg', value: 100, reps: 6, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await finishSession(sessionId, ath, 'normal');

  const rm = await pool.query(
    `SELECT 1 FROM rm_tests WHERE athlete_id = $1 AND program_week = 20`,
    [ath],
  );
  expect(rm.rowCount).toBe(0);
});

it('finishSession ignores accessories and uncompleted sets on an AMRAP week', async () => {
  const { ath, accesorioId, principalId } = await setupAthlete();
  await setWeek(ath, 20);
  const { sessionId } = await startSession(ath, randomUUID(), { force: true });
  await logSet(sessionId, ath, {
    exercise_id: accesorioId, set_index: 1,
    unit: 'kg', value: 40, reps: 12, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await logSet(sessionId, ath, {
    exercise_id: principalId, set_index: 1,
    unit: 'kg', value: 100, reps: 6, completed: false,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await finishSession(sessionId, ath, 'normal');

  const rm = await pool.query(
    `SELECT 1 FROM rm_tests WHERE athlete_id = $1 AND program_week = 20`,
    [ath],
  );
  expect(rm.rowCount).toBe(0);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/session.test.ts
```

Expected: los dos primeros tests nuevos FALLAN (`expected 1, received 0` — no hay fila en `rm_tests`). Los dos últimos pasan por la razón equivocada; son la red de seguridad.

- [ ] **Step 3: Implementar la derivación**

En `backend/src/services/session.service.ts`:

3a. Agregar el import de `recordAmrap` junto a los imports de servicios que ya tiene el archivo (buscá el bloque de `import ... from './...js'` arriba de todo y sumá esta línea, respetando el orden existente):

```ts
import { recordAmrap } from './rm.service.js';
```

3b. Agregar esta función **justo arriba** de `async function closeWeekIfComplete(`:

```ts
/**
 * Semana AMRAP (`periodization_config.is_amrap`): el testeo ES la sesión — una
 * serie al 85% del RM y las reps que salgan. Nada en la app postea a
 * /athlete/amrap, así que el RM teórico se deriva de los sets que el atleta ya
 * logueó. Sale de `set_logs`, que es por donde pasan todos los sets, también
 * los que llegaron tarde por la cola de sync offline.
 *
 * Corre ANTES de `closeWeekIfComplete`: esa progresión puede mover
 * `current_week` a la 21 y dejar la semana de testeo sin registrar.
 *
 * Best-effort: la sesión ya está commiteada y `recordAmrap` es un upsert por
 * (atleta, ejercicio, semana), así que se puede reintentar sin duplicar.
 */
async function recordAmrapIfTestingWeek(
  sessionId: string,
  athleteId: string,
): Promise<void> {
  const cfgR = await pool.query<{ is_amrap: boolean }>(
    `SELECT p.is_amrap
       FROM athlete_program_state s
       JOIN periodization_config p ON p.week_number = s.current_week
      WHERE s.athlete_id = $1`,
    [athleteId],
  );
  if (!cfgR.rows[0]?.is_amrap) return;

  // Mejor serie por ejercicio principal, ordenada por Epley crudo. El redondeo
  // por equipamiento lo hace recordAmrap; acá sólo hace falta el ranking.
  const bestR = await pool.query<{
    exercise_id: number; weight: string; reps: number;
  }>(
    `SELECT DISTINCT ON (sl.exercise_id)
            sl.exercise_id,
            COALESCE(sl.value, sl.weight_kg)::text AS weight,
            sl.reps
       FROM set_logs sl
       JOIN exercises e ON e.id = sl.exercise_id
      WHERE sl.session_log_id = $1
        AND sl.completed = TRUE
        AND e.is_principal = TRUE
        AND COALESCE(sl.value, sl.weight_kg) > 0
        AND sl.reps > 0
      ORDER BY sl.exercise_id,
               COALESCE(sl.value, sl.weight_kg) * (1 + sl.reps / 30.0) DESC`,
    [sessionId],
  );

  for (const row of bestR.rows) {
    await recordAmrap({
      athleteId,
      exerciseId: row.exercise_id,
      weightUsed: Number(row.weight),
      reps: row.reps,
    });
  }
}
```

3c. En `finishSession`, reemplazar el final de la función:

```ts
  // Fuera de la transacción a propósito: la progresión toma su propia conexión
  // y un advisory lock, y no tiene que poder tumbar un finish ya commiteado.
  await closeWeekIfComplete(athleteId);
  return summary;
}
```

por:

```ts
  // Fuera de la transacción a propósito: la progresión toma su propia conexión
  // y un advisory lock, y no tiene que poder tumbar un finish ya commiteado.
  try {
    await recordAmrapIfTestingWeek(sessionId, athleteId);
  } catch (e) {
    logger.error({ err: e, sessionId, athleteId }, 'amrap derivation failed');
  }
  await closeWeekIfComplete(athleteId);
  return summary;
}
```

Si `logger` **no** está importado en `session.service.ts`, agregá el import que usa el resto del backend (`import { logger } from '../utils/logger.js';` — verificá la ruta y el nombre exacto del export mirando cómo lo importa `services/progression.service.ts`) . Si ese archivo usa otra forma de loguear, seguí esa.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/session.test.ts
```

Expected: PASS, todo el archivo.

- [ ] **Step 5: Suite completa + lint**

Run (desde `backend/`):

```bash
npm test
npm run lint
```

Expected: suite entera verde y sin errores de lint nuevos en `services/session.service.ts` ni en `tests/integration/session.test.ts`.

- [ ] **Step 6: Commit** — `skip unless user asked to commit`

No commitear en este run.
