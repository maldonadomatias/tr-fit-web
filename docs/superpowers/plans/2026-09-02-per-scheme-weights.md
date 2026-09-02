# Cargas separadas por esquema (dropset vs normal) — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-09-02 · source: claude+writing-plans -->

**Goal:** Que un mismo ejercicio lleve **dos cargas independientes** cuando aparece con esquema de dropset/superserie (`10x10x10`) y con esquema normal (`3x10`), cada una con su propia escalera de reps y su propio aumento.

**Architecture:** Hoy `athlete_exercise_weights` (AEW) tiene `PRIMARY KEY (athlete_id, exercise_id)`: **un kg por ejercicio**. La migración 038 le dio a cada slot su propio `series`/`reps`/`descanso`, pero no su propio peso, así que el dropset y las series rectas del mismo ejercicio comparten celda: el bump semanal de uno sube al otro (bug reportado por el coach) y el peso logueado de un drop pisa el de las series rectas. Se agrega un discriminante `scheme` (`'normal' | 'dropset'`) a la PK. El bucket sale de la prescripción del slot (038), no del estado guardado, así que es estable.

**Tech Stack:** Node 20, TypeScript ESM, Express 4, PostgreSQL 15 (`pg`), Jest 29 + supertest. Admin web: React 19 + Vite + TanStack Query + Vitest.

**Spec:** este documento. Definición del coach (01/09/2026): *"superseries por un lado, ejercicios no dropset por el otro con sus respectivas cargas"*. La mariposa con dropset sube por `10x10x10 → 12x12x12 → 10x10x10` (+carga recién ahí); la mariposa común sigue `6→8→10→12→6` (+carga recién ahí). Las dos escaleras ya existen en `ADVANCE_REPS`; lo que falta es que cada una tenga su kg.

## Global Constraints

- **No** hacer `git commit`, `git push`, `gh pr` ni tocar el remote.
- Ya estás en la branch `auto-build/per-scheme-weights`. Trabajar ahí.
- **Sólo dos valores** de `scheme`: `'normal'` y `'dropset'`. Nada de un bucket por familia de reps.
- **No** tocar `ADVANCE_REPS`, `advanceReps`, `resolveAccessoryReps` ni `repSchemeFamily`: las escaleras ya son correctas.
- **No** tocar el repo hermano `tr-fit-app`.
- La migración corre sola en el deploy de producción: tiene que ser idempotente (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) y no puede perder datos.
- Backfill decidido por el usuario: el bucket `dropset` **arranca copiando la carga actual**, no vacío y sin descuento.
- Estilo: Prettier (semicolons, comillas simples, 80 cols, 2 espacios). Comentarios en castellano.
- Tests backend: desde `backend/` con `npm test` (nunca `npx jest` pelado). Postgres local en `localhost:5432` (`trfit_test`).
- Tests admin web: desde `frontend/` con `npm test`.

## File Structure

| Archivo | Responsabilidad tras el cambio |
|---|---|
| `backend/src/db/migrations/062_weights_per_scheme.sql` | **Nuevo.** Columna `scheme`, PK de 3 columnas, backfill del bucket dropset. |
| `backend/src/services/progression-helpers.ts` | Exporta `weightScheme(reps)`: la única definición de qué cuenta como dropset. |
| `backend/src/services/engine.service.ts` | Elige el bucket según la prescripción del slot. |
| `backend/src/services/progression.service.ts` | Sube cada bucket por su propia escalera. |
| `backend/src/services/session.service.ts` | El set logueado escribe en el bucket que corresponde (`drop_index`). |
| `backend/src/services/admin.service.ts` | Lista y edita cargas por `(ejercicio, scheme)`. |
| `backend/src/services/skeleton.service.ts`, `admin-rutina.service.ts` | Siembran el bucket que cada slot necesita. |
| `backend/src/services/alternatives.service.ts`, `progress.service.ts` | Lectores de una sola fila: fijan `scheme = 'normal'`. |
| `frontend/src/pages/admin/UserDetail.tsx`, `hooks/useAthleteWeights.ts`, `types/api.ts` | El coach ve y edita las dos cargas. |

---

### Task 1: Migración + helper `weightScheme`

**Files:**
- Create: `backend/src/db/migrations/062_weights_per_scheme.sql`
- Modify: `backend/src/services/progression-helpers.ts`
- Test: `backend/tests/integration/migration-062.test.ts` (crear), `backend/tests/unit/progression-helpers.test.ts` (si no existe, crear `backend/tests/unit/weight-scheme.test.ts`)

**Interfaces:**
- Produces: `weightScheme(reps: string | null | undefined): 'normal' | 'dropset'` exportada desde `services/progression-helpers.ts`. Devuelve `'dropset'` cuando el esquema tiene 3+ números separados por `x`/`×` (`10x10x10`, `12x12x12`, `8x6x4x6x8`); `'normal'` en cualquier otro caso, incluido `null`/vacío.
- Produces: `athlete_exercise_weights.scheme TEXT NOT NULL DEFAULT 'normal'`, PK `(athlete_id, exercise_id, scheme)`.

- [ ] **Step 1: Escribir el test del helper**

Crear `backend/tests/unit/weight-scheme.test.ts`:

```ts
import { weightScheme } from '../../src/services/progression-helpers.js';

it('treats x-separated multi-drop schemes as dropset', () => {
  expect(weightScheme('10x10x10')).toBe('dropset');
  expect(weightScheme('12x12x12')).toBe('dropset');
  expect(weightScheme('8x6x4x6x8')).toBe('dropset');
  expect(weightScheme(' 10 x 10 x 10 ')).toBe('dropset');
  expect(weightScheme('10×10×10')).toBe('dropset');
});

it('treats plain, range and fixed schemes as normal', () => {
  expect(weightScheme('10')).toBe('normal');
  expect(weightScheme('8 a 10')).toBe('normal');
  expect(weightScheme('10 a 12')).toBe('normal');
  expect(weightScheme('al fallo')).toBe('normal');
  expect(weightScheme('30 seg')).toBe('normal');
  // Dos números con x NO alcanzan: es un "3x10", no un dropset.
  expect(weightScheme('3x10')).toBe('normal');
});

it('falls back to normal when there is no prescription', () => {
  expect(weightScheme(null)).toBe('normal');
  expect(weightScheme(undefined)).toBe('normal');
  expect(weightScheme('')).toBe('normal');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `backend/`):

```bash
npm test -- tests/unit/weight-scheme.test.ts
```

Expected: FAIL — `weightScheme` no existe.

- [ ] **Step 3: Implementar el helper**

En `backend/src/services/progression-helpers.ts`, **debajo** de la función `repSchemeFamily` (que queda privada e intacta), agregar:

```ts
export type WeightScheme = 'normal' | 'dropset';

/**
 * Bucket de carga al que pertenece una prescripción.
 *
 * El coach maneja dos escaleras distintas para el MISMO ejercicio: el dropset /
 * superserie sube `10x10x10 → 12x12x12 → 10x10x10` (+carga recién ahí) y las
 * series rectas suben `6→8→10→12→6` (+carga recién ahí). Cada una lleva su
 * propio kg, así que el bucket es parte de la clave de
 * `athlete_exercise_weights`. Las pirámides con `x` (`8x6x4x6x8`) entran acá
 * también: son multi-drop.
 */
export function weightScheme(
  reps: string | null | undefined
): WeightScheme {
  const value = reps?.trim();
  if (!value) return 'normal';
  return repSchemeFamily(value).startsWith('dropset:') ? 'dropset' : 'normal';
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run (desde `backend/`):

```bash
npm test -- tests/unit/weight-scheme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Escribir el test de la migración**

Crear `backend/tests/integration/migration-062.test.ts`:

```ts
import { resetDatabase, ensureMigrated, closePool } from './helpers/test-db.js';
import pool from '../../src/db/connect.js';

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('athlete_exercise_weights is keyed by (athlete, exercise, scheme)', async () => {
  const cols = await pool.query<{ column_name: string; column_default: string | null }>(
    `SELECT column_name, column_default
       FROM information_schema.columns
      WHERE table_name = 'athlete_exercise_weights' AND column_name = 'scheme'`,
  );
  expect(cols.rowCount).toBe(1);
  expect(cols.rows[0].column_default).toContain('normal');

  const pk = await pool.query<{ column_name: string }>(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'athlete_exercise_weights'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position`,
  );
  expect(pk.rows.map((r) => r.column_name)).toEqual(
    expect.arrayContaining(['athlete_id', 'exercise_id', 'scheme']),
  );
  expect(pk.rowCount).toBe(3);
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run (desde `backend/`):

```bash
npm test -- tests/integration/migration-062.test.ts
```

Expected: FAIL — la columna `scheme` no existe.

- [ ] **Step 7: Escribir la migración**

Crear `backend/src/db/migrations/062_weights_per_scheme.sql`:

```sql
-- 062 — Una carga por (ejercicio, esquema), no una por ejercicio.
--
-- La 038 le dio a cada slot su propio set-scheme, pero el peso siguió con
-- PRIMARY KEY (athlete_id, exercise_id): la mariposa 3x10 y la mariposa
-- 10x10x10 compartían celda, así que el bump semanal de una subía la otra
-- (reportado por el coach) y el peso logueado de un drop pisaba el de las
-- series rectas.
--
-- El coach las maneja como dos escaleras independientes:
--   dropset / superserie : 10x10x10 -> 12x12x12 -> 10x10x10 (+carga)
--   normal               : 6 -> 8 -> 10 -> 12 -> 6          (+carga)

ALTER TABLE athlete_exercise_weights
  ADD COLUMN IF NOT EXISTS scheme TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athlete_exercise_weights_scheme_check'
  ) THEN
    ALTER TABLE athlete_exercise_weights
      ADD CONSTRAINT athlete_exercise_weights_scheme_check
      CHECK (scheme IN ('normal', 'dropset'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'athlete_exercise_weights_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 2
  ) THEN
    ALTER TABLE athlete_exercise_weights
      DROP CONSTRAINT athlete_exercise_weights_pkey;
    ALTER TABLE athlete_exercise_weights
      ADD CONSTRAINT athlete_exercise_weights_pkey
      PRIMARY KEY (athlete_id, exercise_id, scheme);
  END IF;
END $$;

-- Backfill: el bucket dropset arranca copiando la carga actual, para que
-- ninguna rutina activa quede sin peso sugerido el primer día. A partir de acá
-- cada escalera progresa por su lado y el coach ajusta la que quiera.
-- `current_reps_text` va NULL a propósito: la escalera del dropset arranca
-- desde la prescripción del slot, no desde el estado de las series rectas.
INSERT INTO athlete_exercise_weights
  (athlete_id, exercise_id, current_weight_kg, current_value, unit,
   current_reps_text, updated_by, scheme)
SELECT DISTINCT
       w.athlete_id, w.exercise_id, w.current_weight_kg, w.current_value,
       w.unit, NULL, w.updated_by, 'dropset'
  FROM athlete_exercise_weights w
  JOIN athlete_program_state ps ON ps.athlete_id = w.athlete_id
  JOIN skeleton_slots s
    ON s.skeleton_id = ps.active_skeleton_id
   AND s.exercise_id = w.exercise_id
 WHERE w.scheme = 'normal'
   AND s.reps ~ '^[[:space:]]*[0-9]+[[:space:]]*[x×][[:space:]]*[0-9]+[[:space:]]*[x×]'
ON CONFLICT (athlete_id, exercise_id, scheme) DO NOTHING;
```

- [ ] **Step 8: Correr los tests de la migración**

Run (desde `backend/`):

```bash
npm test -- tests/integration/migration-062.test.ts
```

Expected: PASS. Si el runner no re-corre migraciones sobre una base ya migrada, mirá cómo lo resuelven los otros `migration-0NN.test.ts` y `tests/integration/helpers/test-db.ts` y seguí ese patrón.

---

### Task 2: El motor prescribe el peso del bucket del slot

**Files:**
- Modify: `backend/src/services/engine.service.ts`
- Test: `backend/tests/integration/engine.service.test.ts`

**Interfaces:**
- Consumes: `weightScheme` del Task 1.
- Produces: `buildTodaySession` sin cambios de firma. Un slot accesorio con `reps` de dropset toma el peso de la fila `scheme = 'dropset'`; todo lo demás (principales, calentamientos, accesorios normales) toma `scheme = 'normal'`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/integration/engine.service.test.ts`, agregar al final:

```ts
// El coach maneja el dropset y las series rectas del MISMO ejercicio como dos
// cargas independientes. Antes compartían fila y el bump de una subía la otra.
it('prescribes the dropset bucket weight for a dropset slot', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 1);
  // El slot del día 1 pasa a ser un dropset 10x10x10.
  await pool.query(
    `UPDATE skeleton_slots SET reps = '10x10x10'
      WHERE exercise_id = $1 AND day_of_week = 1
        AND skeleton_id = (SELECT active_skeleton_id FROM athlete_program_state
                            WHERE athlete_id = $2)`,
    [accesorioId, ath],
  );
  await pool.query(
    `UPDATE athlete_exercise_weights SET current_weight_kg = 20, current_value = 20
      WHERE athlete_id = $1 AND exercise_id = $2 AND scheme = 'normal'`,
    [ath, accesorioId],
  );
  await pool.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_value, unit, updated_by, scheme)
     VALUES ($1, $2, 12, 12, 'kg', 'coach', 'dropset')
     ON CONFLICT (athlete_id, exercise_id, scheme) DO UPDATE
       SET current_value = EXCLUDED.current_value,
           current_weight_kg = EXCLUDED.current_weight_kg`,
    [ath, accesorioId],
  );

  const session = await buildTodaySession(ath, 1);
  const acc = session.find((s) => s.exercise.id === accesorioId)!;
  expect(acc.reps).toBe('10x10x10');
  expect(acc.suggested_value).toBe(12);
});

it('keeps the normal bucket for a plain slot of the same exercise', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { accesorioId } = await setup4DaySkeleton(ath, coach);
  await setProgramWeek(ath, 1);
  await pool.query(
    `UPDATE skeleton_slots SET reps = '10x10x10'
      WHERE exercise_id = $1 AND day_of_week = 1
        AND skeleton_id = (SELECT active_skeleton_id FROM athlete_program_state
                            WHERE athlete_id = $2)`,
    [accesorioId, ath],
  );
  await pool.query(
    `UPDATE athlete_exercise_weights SET current_weight_kg = 20, current_value = 20
      WHERE athlete_id = $1 AND exercise_id = $2 AND scheme = 'normal'`,
    [ath, accesorioId],
  );
  await pool.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_weight_kg, current_value, unit, updated_by, scheme)
     VALUES ($1, $2, 12, 12, 'kg', 'coach', 'dropset')
     ON CONFLICT (athlete_id, exercise_id, scheme) DO NOTHING`,
    [ath, accesorioId],
  );

  // El día 2 sigue siendo el slot normal del mismo ejercicio.
  const session = await buildTodaySession(ath, 2);
  const acc = session.find((s) => s.exercise.id === accesorioId)!;
  expect(acc.suggested_value).toBe(20);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `backend/`):

```bash
npm test -- tests/integration/engine.service.test.ts -t "bucket"
```

Expected: el primero FALLA (devuelve 20, el peso normal, en vez de 12).

- [ ] **Step 3: Leer las dos filas en `buildTodaySession`**

En `backend/src/services/engine.service.ts`:

3a. Sumar `weightScheme` al import que ya trae helpers de progresión:

```ts
import {
  resolveAccessoryReps,
  roundWeightForEquipment,
} from './progression-helpers.js';
```

pasa a:

```ts
import {
  resolveAccessoryReps,
  roundWeightForEquipment,
  weightScheme,
} from './progression-helpers.js';
```

3b. La query de pesos ahora trae las dos filas y se indexa por `(exercise_id, scheme)`. Reemplazar:

```ts
  const wR = await pool.query<{
    exercise_id: number;
    current_weight_kg: number | null;
    current_value: number | null;
    unit: 'kg' | 'ladrillos' | null;
    current_reps_text: string | null;
  }>(
    `SELECT exercise_id,
            COALESCE(current_value, current_weight_kg) AS current_value,
            unit,
            current_weight_kg,
            current_reps_text
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, exerciseIds]
  );
  const wByEx = new Map(wR.rows.map((r) => [r.exercise_id, r]));
```

por:

```ts
  const wR = await pool.query<{
    exercise_id: number;
    scheme: string;
    current_weight_kg: number | null;
    current_value: number | null;
    unit: 'kg' | 'ladrillos' | null;
    current_reps_text: string | null;
  }>(
    `SELECT exercise_id,
            scheme,
            COALESCE(current_value, current_weight_kg) AS current_value,
            unit,
            current_weight_kg,
            current_reps_text
       FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`,
    [athleteId, exerciseIds]
  );
  // Una carga por (ejercicio, esquema): el dropset del mismo ejercicio lleva la
  // suya. La clave se arma con la prescripción del SLOT, no con el estado
  // guardado, así que es estable aunque `current_reps_text` esté viejo.
  const wByEx = new Map(
    wR.rows.map((r) => [`${r.exercise_id}:${r.scheme}`, r])
  );
```

3c. `buildItem` recibe ese mapa. Cambiar su tipo de parámetro `wByEx` de `Map<number, {...}>` a `Map<string, {...}>` (misma forma de valor, sólo cambia la clave) y, adentro, resolver la clave. Buscá dónde `buildItem` hace el lookup (`wByEx.get(slot.exercise_id)`) y reemplazalo por:

```ts
  // Accesorios: el bucket sale de la prescripción del slot (038), con el
  // default del bloque como fallback. Principales y calentamientos son siempre
  // 'normal' — no tienen esquema de dropset.
  const scheme =
    slot.role === 'accesorio'
      ? weightScheme(slot.reps ?? cfg.accesorio_reps)
      : 'normal';
  const w = wByEx.get(`${slot.exercise_id}:${scheme}`);
```

Mantené el resto del cuerpo igual: `aewValue`, `unit`, `current_reps_text` salen de ese mismo `w`. Si el slot trae un `_override` que cambia las reps, usá **las reps efectivas del override** en `weightScheme` en vez de `slot.reps` — mirá cómo `applyOverridesToSlots` deja el slot y seguí esa forma.

- [ ] **Step 4: Correr los tests**

Run (desde `backend/`):

```bash
npm test -- tests/integration/engine.service.test.ts
```

Expected: PASS, todo el archivo. Los unit tests de `tests/unit/engine.service.test.ts` y `tests/unit/engine-amrap.test.ts` mockean queries por string: actualizá los handlers del `SELECT ... FROM athlete_exercise_weights` para que devuelvan `scheme: 'normal'` en las filas.

---

### Task 3: La progresión sube cada bucket por su escalera

**Files:**
- Modify: `backend/src/services/progression.service.ts`
- Test: `backend/tests/integration/progression.service.test.ts`

**Interfaces:**
- Consumes: `weightScheme`.
- Produces: `runWeeklyProgressionForAthlete` sin cambios de firma. `BumpRecord` suma `scheme: 'normal' | 'dropset'`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/integration/progression.service.test.ts`, agregar al final un test que:

1. arme un atleta con un accesorio que aparezca en **dos** slots: día 1 con `reps = '10x10x10'` y día 2 con `reps = '10'`;
2. deje `athlete_exercise_weights` con `scheme='normal'` en 20 kg y `scheme='dropset'` en 12 kg;
3. ponga `current_reps_text = '12x12x12'` en la fila dropset (o sea: lista para bumpear) y `'8'` en la normal (o sea: NO lista, todavía tiene que subir reps);
4. loguee todos los sets de la semana como completados para ese ejercicio;
5. corra `runWeeklyProgressionForAthlete`;
6. verifique que **la fila dropset subió de kg y volvió a `10x10x10`**, y que **la fila normal quedó en 20 kg con reps `10`**.

Copiá la forma exacta de los tests que ya están en ese archivo (helpers de skeleton, de logueo de sets y de lectura de `athlete_exercise_weights`); no inventes helpers nuevos si el archivo ya tiene uno equivalente.

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `backend/`):

```bash
npm test -- tests/integration/progression.service.test.ts
```

Expected: FAIL — hoy la progresión deduplica por ejercicio y toca una sola fila.

- [ ] **Step 3: Agrupar por (ejercicio, esquema)**

En `backend/src/services/progression.service.ts`:

3a. Sumar `weightScheme` al import de `./progression-helpers.js`.

3b. Reemplazar la deduplicación por ejercicio:

```ts
    const seen = new Set<number>();
    const accesorios = accR.rows.filter((r) => {
      if (r.slot_role !== 'accesorio') return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
```

por:

```ts
    // Un ejercicio puede aparecer con dos esquemas (10x10x10 y 3x10): cada uno
    // lleva su propia carga y su propia escalera, así que se procesan por
    // separado. Dentro de cada bucket sigue ganando el primer slot del ORDER BY
    // (el que tiene reps explícitas, del día más temprano).
    const seen = new Set<string>();
    const accesorios = accR.rows
      .filter((r) => r.slot_role === 'accesorio')
      .map((r) => ({ ...r, scheme: weightScheme(r.slot_reps) }))
      .filter((r) => {
        const key = `${r.id}:${r.scheme}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
```

3c. En el loop `for (const ex of accesorios)`, la lectura y la escritura pasan a filtrar por el bucket. Reemplazar el `WHERE` de la lectura:

```ts
          WHERE athlete_id = $1 AND exercise_id = $2`,
        [athleteId, ex.id]
```

por:

```ts
          WHERE athlete_id = $1 AND exercise_id = $2 AND scheme = $3`,
        [athleteId, ex.id, ex.scheme]
```

y el `UPDATE athlete_exercise_weights ... WHERE athlete_id = $4 AND exercise_id = $5` por uno que además filtre `AND scheme = $6`, pasando `ex.scheme`.

3d. En el `bumped.push({...})`, sumar `scheme: ex.scheme`. Agregar `scheme: 'normal' | 'dropset';` a la interfaz `BumpRecord`.

- [ ] **Step 4: Correr los tests**

Run (desde `backend/`):

```bash
npm test -- tests/integration/progression.service.test.ts tests/integration/progression-cron.test.ts
```

Expected: PASS.

---

### Task 4: El set logueado escribe en su bucket

**Files:**
- Modify: `backend/src/services/session.service.ts`
- Test: `backend/tests/integration/session.test.ts`

**Interfaces:**
- Produces: `logSet` sin cambios de firma. Un set con `drop_index` no nulo seedea la fila `scheme = 'dropset'`; uno sin `drop_index`, la `'normal'`.

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/integration/session.test.ts`, agregar al final:

```ts
// El peso del primer drop de un 10x10x10 no puede pisar la carga de las series
// rectas del mismo ejercicio (ni al revés).
it('logSet seeds the dropset bucket when the set carries a drop_index', async () => {
  const { ath, accesorioId } = await setupAthlete();
  const { sessionId } = await startSession(ath, randomUUID());
  await logSet(sessionId, ath, {
    exercise_id: accesorioId, set_index: 1, drop_index: 1,
    unit: 'kg', value: 12, reps: 10, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });
  await logSet(sessionId, ath, {
    exercise_id: accesorioId, set_index: 2,
    unit: 'kg', value: 20, reps: 10, completed: true,
    client_id: randomUUID(), client_ts: new Date().toISOString(),
  });

  const rows = await pool.query<{ scheme: string; current_value: string }>(
    `SELECT scheme, current_value::text FROM athlete_exercise_weights
      WHERE athlete_id = $1 AND exercise_id = $2 ORDER BY scheme`,
    [ath, accesorioId],
  );
  const byScheme = new Map(rows.rows.map((r) => [r.scheme, Number(r.current_value)]));
  expect(byScheme.get('dropset')).toBe(12);
  expect(byScheme.get('normal')).toBe(20);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `backend/`):

```bash
npm test -- tests/integration/session.test.ts -t "dropset bucket"
```

Expected: FAIL — hoy las dos escrituras van a la misma fila y gana la última.

- [ ] **Step 3: Elegir el bucket en `logSet`**

En `backend/src/services/session.service.ts`, en el bloque que seedea el peso, reemplazar:

```ts
  const seedsWeight = payload.drop_index == null || payload.drop_index === 1;
  if (payload.completed && payload.value != null && seedsWeight) {
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, current_value, unit, current_reps_text, updated_by)
       VALUES ($1, $2, $3, $3, $4, NULL, 'athlete_correction')
       ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
```

por:

```ts
  const seedsWeight = payload.drop_index == null || payload.drop_index === 1;
  // El bucket sale del propio set: un dropset/superserie loguea un drop_index
  // por serie, un set normal lo manda en NULL. Así el peso del primer drop no
  // pisa la carga de las series rectas del mismo ejercicio.
  const scheme = payload.drop_index == null ? 'normal' : 'dropset';
  if (payload.completed && payload.value != null && seedsWeight) {
    await pool.query(
      `INSERT INTO athlete_exercise_weights
         (athlete_id, exercise_id, current_weight_kg, current_value, unit, current_reps_text, updated_by, scheme)
       VALUES ($1, $2, $3, $3, $4, NULL, 'athlete_correction', $5)
       ON CONFLICT (athlete_id, exercise_id, scheme) DO UPDATE SET
```

y sumar `scheme` al array de parámetros (`[athleteId, payload.exercise_id, payload.value, payload.unit, scheme]`).

- [ ] **Step 4: Correr los tests**

Run (desde `backend/`):

```bash
npm test -- tests/integration/session.test.ts
```

Expected: PASS.

---

### Task 5: Seeds, lectores de una sola fila y API de admin

**Files:**
- Modify: `backend/src/services/skeleton.service.ts`, `backend/src/services/admin-rutina.service.ts`, `backend/src/services/alternatives.service.ts`, `backend/src/services/progress.service.ts`, `backend/src/services/admin.service.ts`, `backend/src/routes/admin.ts`, `backend/src/scripts/seed-progress-demo.ts`
- Test: `backend/tests/integration/admin-user-profile.test.ts` (o el archivo donde ya se testea `GET/PUT /admin/users/:id/weights`; si no existe, `backend/tests/integration/admin-weights.test.ts`)

**Interfaces:**
- Produces: `GET /api/admin/users/:id/weights` devuelve cada fila con `scheme: 'normal' | 'dropset'`.
- Produces: `PUT /api/admin/users/:id/weights` acepta `{ exercise_id, current_value, scheme? }`; `scheme` default `'normal'`.
- Produces: `AthleteWeightRow` suma `scheme`.

- [ ] **Step 1: Arreglar todos los `ON CONFLICT` de dos columnas**

Con la PK de 3 columnas, cualquier `ON CONFLICT (athlete_id, exercise_id)` explota en runtime (`no unique or exclusion constraint matching`). Buscalos:

```bash
grep -rn "ON CONFLICT (athlete_id, exercise_id)" src/
```

En **cada** match, pasar el target a `(athlete_id, exercise_id, scheme)`. Los INSERT que no nombran `scheme` caen en el default `'normal'`, que es lo correcto para los seeds de `skeleton.service.ts` y `admin-rutina.service.ts`.

Excepción: en `admin-rutina.service.ts` y `skeleton.service.ts` el seed debe crear **el bucket que cada slot necesita**, no sólo el normal. Reemplazar el `SELECT DISTINCT exercise_id` de esos seeds por uno que también derive el esquema en SQL, por ejemplo:

```sql
       SELECT $1, exercise_id, NULL, NULL, 'athlete_initial',
              CASE WHEN reps ~ '^[[:space:]]*[0-9]+[[:space:]]*[x×][[:space:]]*[0-9]+[[:space:]]*[x×]'
                   THEN 'dropset' ELSE 'normal' END
         FROM (SELECT DISTINCT exercise_id, reps FROM skeleton_slots
                WHERE skeleton_id = $2) s
```

ajustando la lista de columnas del INSERT para incluir `scheme`. Mantené el `ON CONFLICT ... DO NOTHING`.

- [ ] **Step 2: Fijar `scheme = 'normal'` en los lectores de una sola fila**

Estos leen "la" carga del ejercicio y con dos filas devolverían duplicados. Agregarles `AND scheme = 'normal'` (o el filtro equivalente dentro del CTE):

- `backend/src/services/alternatives.service.ts` — el `SELECT ... FROM athlete_exercise_weights WHERE athlete_id = $1 AND exercise_id = ANY($2::int[])`. Comentario: `// El sugerido de un swap sale de la carga normal; el dropset lo ajusta el coach.`
- `backend/src/services/progress.service.ts` — el CTE `suggested` de `listWeightVsSuggested`. Comentario: `// Una sola fila por ejercicio: el gráfico compara contra la carga normal.`

En `backend/src/services/admin-rutina.service.ts`, el `UPDATE athlete_exercise_weights SET current_reps_text = $3` que corre sobre `editedRepsByExercise` tiene que apuntar al bucket de **esas** reps: calculá `weightScheme(reps)` en TypeScript y sumá `AND scheme = $4`.

- [ ] **Step 3: Escribir el test de la API de admin**

Agregar un test de integración que:

1. cree coach + atleta con skeleton aprobado;
2. inserte dos filas de `athlete_exercise_weights` para el mismo ejercicio (`normal` 20, `dropset` 12);
3. pegue `GET /api/admin/users/:id/weights` y verifique que vuelven **dos** filas para ese ejercicio, cada una con su `scheme` y su `current_value`;
4. pegue `PUT /api/admin/users/:id/weights` con `{ exercise_id, current_value: 14, scheme: 'dropset' }` y verifique que **sólo** cambió la fila dropset (la normal sigue en 20);
5. pegue el mismo `PUT` **sin** `scheme` y verifique que cambió la fila normal.

Seguí el estilo del archivo de tests de admin que ya exista (supertest + `signToken`).

- [ ] **Step 4: Hacer scheme-aware el servicio y la ruta de admin**

En `backend/src/services/admin.service.ts`:
- `listAthleteWeights`: sumar `w.scheme` al `SELECT` y al objeto devuelto; ordenar por `e.name, w.scheme`. Sumar `scheme` a `AthleteWeightRow`.
- `SetAthleteWeightInput`: sumar `scheme?: 'normal' | 'dropset'`. Usar `input.scheme ?? 'normal'` en el `SELECT` previo (que debe filtrar por scheme), en el `INSERT ... VALUES` y en el `ON CONFLICT (athlete_id, exercise_id, scheme)`. Incluir el scheme en el `logAudit`.

En `backend/src/routes/admin.ts`, el `weightBody` de Zod suma:

```ts
  scheme: z.enum(['normal', 'dropset']).optional(),
```

y se pasa a `setAthleteWeight`.

- [ ] **Step 5: Actualizar el script de demo**

En `backend/src/scripts/seed-progress-demo.ts`, el INSERT no nombra `scheme` y cae en `'normal'`: dejalo así, pero verificá que no tenga un `ON CONFLICT` de dos columnas.

- [ ] **Step 6: Suite completa del backend**

Run (desde `backend/`):

```bash
npm test
npm run lint
```

Expected: suite entera verde. Cualquier test que rompa por la PK nueva o por filas duplicadas se arregla en el test (agregando el `scheme` que corresponda), **no** revirtiendo el cambio de producción.

---

### Task 6: El coach ve y edita las dos cargas

**Files:**
- Modify: `frontend/src/types/api.ts`, `frontend/src/hooks/useAthleteWeights.ts`, `frontend/src/pages/admin/UserDetail.tsx`
- Test: `frontend/src/pages/admin/UserDetail.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT /admin/users/:id/weights` del Task 5.

- [ ] **Step 1: Escribir el test que falla**

En `frontend/src/pages/admin/UserDetail.test.tsx`, dentro del `describe('user detail exercise weights')` que ya existe, agregar un caso que:

1. mockee dos filas del mismo ejercicio (`scheme: 'normal'` en 20 y `scheme: 'dropset'` en 12);
2. verifique que se ven las dos, y que la del dropset muestra una etiqueta `Dropset`;
3. edite la fila dropset y verifique que la mutación se llama con `{ exercise_id, current_value, scheme: 'dropset' }`.

Seguí el patrón de mocks que ya usa ese archivo (`weightMocks`, `useAthleteWeights`).

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `frontend/`):

```bash
npm test -- UserDetail
```

Expected: FAIL.

- [ ] **Step 3: Tipos y hook**

En `frontend/src/types/api.ts`, `AthleteExerciseWeight` suma:

```ts
  scheme: 'normal' | 'dropset';
```

En `frontend/src/hooks/useAthleteWeights.ts`, `SetAthleteWeightInput` suma `scheme?: 'normal' | 'dropset';` (el hook ya manda el objeto entero al PUT, así que no hace falta más).

- [ ] **Step 4: UI**

En `frontend/src/pages/admin/UserDetail.tsx`, dentro de `WeightsCard`:

- La identidad de una fila deja de ser `exercise_id`: pasa a ser `` `${w.exercise_id}:${w.scheme}` ``. Cambiar `editId` a `string | null`, el `key` del `map`, `startEdit`, la comparación `editing` y la firma de `save`.
- `save` manda `{ exercise_id, current_value: v, scheme }`.
- Al lado del nombre del ejercicio, cuando `w.scheme === 'dropset'`, mostrar una etiqueta chica con el texto `Dropset`. Usá el componente de badge/eyebrow que ya use ese archivo; si no hay uno, un `<span>` con las clases de badge que ya aparecen en la página.
- En el copy de la tarjeta, después de *"Cambialo a mano si hay que ajustar un ejercicio puntual."*, agregar: `Un ejercicio con dropset lleva dos cargas: la de las series rectas y la del dropset.`

- [ ] **Step 5: Correr los tests del admin web**

Run (desde `frontend/`):

```bash
npm test
npm run lint
```

Expected: PASS y sin errores de lint nuevos.

- [ ] **Step 6: Commit** — `skip unless user asked to commit`

No commitear en este run.
