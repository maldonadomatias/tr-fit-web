# Payload de `/athlete/plan` para la vista calendario — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-08-21 · source: claude+writing-plans -->

**Goal:** Que `GET /athlete/plan` devuelva las tres cosas que la nueva screen Plan del app móvil necesita y hoy no tiene — fecha de inicio del programa, tipo de bloque, y día de semana real de cada sesión — y que los bloques se agrupen por tramos contiguos en vez de por etiqueta repetida.

**Architecture:** Todo el cambio vive en `buildPlan()` (`backend/src/services/plan.service.ts`), que ya arma el payload completo desde `athlete_profiles`, `athlete_program_state`, `periodization_config`, `skeleton_slots`, `skeleton_days` y `session_logs`. Se amplían tres SELECT que ya se hacen (sin queries nuevas), se cambia el criterio de agrupación de bloques y se agregan tres campos al payload. La ruta (`backend/src/routes/athlete.ts:277`) no se toca: serializa lo que devuelve el service.

**Tech Stack:** Node 20, TypeScript 5.7 (ESM, imports con extensión `.js`), Express 4, PostgreSQL 15, `pg`, Jest + ts-jest ESM con un pool falso (sin base de datos real).

**Spec:** `/Users/matiasagustinmaldonado/Downloads/design_handoff_plan_calendario/README.md`, sección **Backend / gaps del payload**. El consumidor es `tr-fit-app` (rama `auto-build/plan-calendario`), que ya tipa estos campos como **opcionales** con fallback, así que la app vieja y la nueva siguen funcionando con o sin ellos.

## Global Constraints

- **No commits, no push, no PR.** Dejá los cambios en el working tree.
- **Ni una query nueva.** Los tres datos salen de tablas que `buildPlan()` ya consulta: agregá columnas a los `SELECT` existentes.
- **Sin migraciones.** Las columnas ya existen: `athlete_program_state.start_date` (migración 006), `periodization_config.is_deload` / `is_rm_test` (migración 004), `athlete_profiles.days_specific` (normalizada a orden de semana por la migración 060).
- **Compatibilidad hacia atrás:** los campos nuevos se agregan, ninguno se saca ni se renombra. El único cambio de forma es el `id` de los bloques (ver Task 1), que hoy sólo consume la app móvil.
- Los tests unitarios corren con un **pool falso** (`jest.unstable_mockModule` sobre `../../src/db/connect.js`). No levantes Postgres ni escribas tests de integración para esto.
- Los handlers del pool falso matchean por **prefijo del SQL normalizado**. Si cambiás un `SELECT`, **tenés que actualizar el matcher del test** o el handler deja de enganchar y la query devuelve `{ rows: [] }` en silencio — un test que pasa por la razón equivocada.
- TypeScript ESM: los imports internos llevan extensión `.js` (`'../db/connect.js'`). Mantené el estilo del archivo.
- Comandos de verificación:
  - `cd backend && npm test -- tests/unit/plan.service.test.ts`
  - `cd backend && npx tsc --noEmit`
  - `cd backend && npm run lint`
  - **No** corras la suite completa: los tests de integración necesitan una base viva.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `backend/src/services/plan.service.ts` (modificar) | Único archivo de producción que cambia: tipos del payload, tres SELECT ampliados, agrupación de bloques por tramo contiguo, mapeo de día de semana. |
| `backend/tests/unit/plan.service.test.ts` (modificar) | Fixtures del pool falso + casos nuevos. Es donde vive toda la cobertura de `buildPlan`. |

---

### Task 1: Bloques por tramo contiguo + `kind`

Hoy `buildPlan()` agrupa las semanas **por etiqueta**, y las etiquetas se repiten en el año: en el seed real (`026_seed_periodization.sql`), `HIPERTROFIA` aparece en las semanas 3–6, 11–12, 21–22 y 28, y `DESCARGA` en la 9, la 18 y la 27. El resultado es un bloque "HIPERTROFIA" de 9 semanas no consecutivas.

La barra de periodización de la app dibuja **un segmento por bloque, con ancho proporcional a su cantidad de semanas y en el orden del array**. Con la agrupación por etiqueta, esa barra no representa el año: mezcla tramos separados por meses en un solo segmento, y el "bloque actual" abarca semanas que ya pasaron. El plan real tiene 13 tramos, no 10 etiquetas.

**Files:**
- Modify: `backend/src/services/plan.service.ts` (interface `PlanBlock`, el loop de agrupación al final de `buildPlan`)
- Test: `backend/tests/unit/plan.service.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `PlanBlock.id` pasa a ser `` `${block_label}#${primeraSemanaDelTramo}` `` (único por tramo), `PlanBlock.kind: 'work' | 'deload' | 'test'`, y `currentBlockId` referencia el id del tramo que contiene `current_week`. Las Tasks 2 y 3 agregan campos al mismo payload sin tocar esto.

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/tests/unit/plan.service.test.ts`:

1. Ampliá el handler de `periodization_config` dentro de `seedBasicFixtures` para que acepte filas con banderas, con default `false`. Reemplazá el `pushHandler` de periodización por:

```ts
  pushHandler(
    (s) => s.startsWith('SELECT week_number, block_label')
        && s.includes('FROM periodization_config'),
    (opts.periodization ?? [
      { week_number: 1, block_label: 'Hipertrofia' },
      { week_number: 2, block_label: 'Hipertrofia' },
      { week_number: 3, block_label: 'Hipertrofia' },
      { week_number: 4, block_label: 'Hipertrofia' },
      { week_number: 5, block_label: 'Fuerza' },
      { week_number: 6, block_label: 'Fuerza' },
      { week_number: 7, block_label: 'Fuerza' },
      { week_number: 8, block_label: 'Fuerza' },
    ]).map((row) => ({ is_deload: false, is_rm_test: false, ...row })),
  );
```

Y ampliá el tipo del parámetro en la firma de `seedBasicFixtures`:

```ts
  periodization?: Array<{
    week_number: number;
    block_label: string;
    is_deload?: boolean;
    is_rm_test?: boolean;
  }>;
```

2. Reemplazá el test `groups weeks by block_label preserving first-seen order` por estos dos, y agregá los tres de `kind`:

```ts
  it('splits repeated labels into contiguous blocks', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Hipertrofia' },
        { week_number: 3, block_label: 'Descarga', is_deload: true },
        { week_number: 4, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks).toHaveLength(3);
    expect(r.blocks.map((b) => b.name)).toEqual(['Hipertrofia', 'Descarga', 'Hipertrofia']);
    expect(r.blocks.map((b) => b.weeks.map((w) => w.weekNumber))).toEqual([[1, 2], [3], [4]]);
  });

  it('gives each contiguous block a unique id and keeps the label as name and tag', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Descarga', is_deload: true },
        { week_number: 3, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    const ids = r.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['Hipertrofia#1', 'Descarga#2', 'Hipertrofia#3']);
    expect(r.blocks[2]!.name).toBe('Hipertrofia');
    expect(r.blocks[2]!.tag).toBe('Hipertrofia');
  });

  it('points currentBlockId at the contiguous block holding current_week', async () => {
    seedBasicFixtures({
      currentWeek: 3,
      periodization: [
        { week_number: 1, block_label: 'Hipertrofia' },
        { week_number: 2, block_label: 'Descarga', is_deload: true },
        { week_number: 3, block_label: 'Hipertrofia' },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.currentBlockId).toBe('Hipertrofia#3');
  });

  it('marks a block as test when any of its weeks is an RM test', async () => {
    seedBasicFixtures({
      periodization: [{ week_number: 1, block_label: 'Testeo RM', is_rm_test: true }],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks[0]!.kind).toBe('test');
  });

  it('marks a block as deload when any of its weeks is a deload', async () => {
    seedBasicFixtures({
      periodization: [
        { week_number: 1, block_label: 'Descarga - pre RM', is_deload: true },
      ],
    });
    const r = await buildPlan('athlete-1');
    expect(r.blocks[0]!.kind).toBe('deload');
  });

  it('defaults a block to work', async () => {
    seedBasicFixtures({});
    const r = await buildPlan('athlete-1');
    expect(r.blocks.every((b) => b.kind === 'work')).toBe(true);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: FAIL — los ids son `'Hipertrofia'` sin sufijo, hay 2 bloques en vez de 3, y `kind` es `undefined`.

- [ ] **Step 3: Implementar el cambio**

En `backend/src/services/plan.service.ts`:

1. Agregá `kind` a la interface (después de `weeks`):

```ts
export interface PlanBlock {
  id: string;
  name: string;
  tag: string;
  weeks: PlanWeek[];
  /** Para colorear la barra de periodización del app. */
  kind: 'work' | 'deload' | 'test';
}
```

2. Traé las banderas en el SELECT de periodización:

```ts
  const periodR = await pool.query<{
    week_number: number;
    block_label: string;
    is_deload: boolean;
    is_rm_test: boolean;
  }>(
    `SELECT week_number, block_label, is_deload, is_rm_test FROM periodization_config
       ORDER BY week_number ASC`,
  );
```

3. Reemplazá el bloque de agrupación (desde el comentario `// Group weeks into blocks preserving the order each block_label first appears.` hasta el `return` final) por este. Un tramo nuevo empieza cada vez que la etiqueta cambia respecto de la semana anterior:

```ts
  // Un bloque es un TRAMO CONTIGUO de semanas con la misma etiqueta. Las
  // etiquetas se repiten a lo largo del año (Hipertrofia vuelve tres veces),
  // así que agrupar por etiqueta juntaría semanas separadas por meses.
  const blocks: PlanBlock[] = [];
  let currentBlock: PlanBlock | null = null;
  let previousLabel: string | null = null;
  let currentBlockId: string | null = null;

  for (const row of periodization) {
    if (currentBlock === null || row.block_label !== previousLabel) {
      currentBlock = {
        id: `${row.block_label}#${row.week_number}`,
        name: row.block_label,
        tag: row.block_label,
        weeks: [],
        kind: 'work',
      };
      blocks.push(currentBlock);
      previousLabel = row.block_label;
    }
    // El testeo gana sobre la descarga: un tramo con RM se pinta como testeo.
    if (row.is_rm_test) currentBlock.kind = 'test';
    else if (row.is_deload && currentBlock.kind !== 'test') currentBlock.kind = 'deload';

    if (row.week_number === currentWeek) currentBlockId = currentBlock.id;

    const sessions: PlanSession[] = dayIndices.map((dow, i) => {
      const focus = focusByDay[dow];
      const title = focus ? `Día ${i + 1} · ${focus}` : `Día ${i + 1}`;
      return {
        day: i + 1,
        title,
        tag: row.block_label,
        exerciseCount: slotsByDay[dow] ?? 0,
        estimatedMin,
        done: doneSet.has(`${row.week_number}-${dow}`),
      };
    });
    currentBlock.weeks.push({ weekNumber: row.week_number, sessions });
  }

  return {
    totalWeeks: periodization.length,
    currentBlockId,
    currentWeekNumber: currentWeek,
    blocks,
  };
```

4. Borrá lo que quedó sin uso del enfoque viejo: `blockOrder`, `blockMap`, y la declaración previa de `currentBlockId`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: PASS, incluidos los tests preexistentes (`marks a session done…`, `iterates 1..days_per_week…`, etc.).

- [ ] **Step 5: Verificar tipos**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

---

### Task 2: `startDate` en el payload

Sin fecha de inicio, el calendario del app no puede poner números de día reales: cae a anclar la semana de programa en curso a la semana calendario actual, que se desalinea apenas el atleta se saltea una semana.

**Files:**
- Modify: `backend/src/services/plan.service.ts` (interface `PlanPayload`, query de `athlete_program_state`, los dos `return` tempranos y el final)
- Test: `backend/tests/unit/plan.service.test.ts`

**Interfaces:**
- Consumes: el payload de la Task 1.
- Produces: `PlanPayload.startDate: string | null` con formato `'YYYY-MM-DD'`.

- [ ] **Step 1: Escribir los tests que fallan**

1. En `seedBasicFixtures`, el handler de `athlete_program_state` matchea por prefijo del SELECT viejo. Cambialo para que enganche igual con la columna nueva, y agregá la fila:

```ts
  pushHandler(
    (s) => s.startsWith('SELECT current_week, active_skeleton_id')
        && s.includes('FROM athlete_program_state'),
    [{
      current_week: opts.currentWeek ?? 5,
      active_skeleton_id: opts.activeSkeletonId === undefined ? 'sk-1' : opts.activeSkeletonId,
      start_date: opts.startDate === undefined ? '2026-03-02' : opts.startDate,
    }],
  );
```

Y sumá `startDate?: string | null;` al tipo del parámetro `opts`.

2. Actualizá el test `returns zero defaults when no profile exists`, que compara el objeto entero:

```ts
  it('returns zero defaults when no profile exists', async () => {
    // No handlers seeded — fakePool returns empty rows for everything.
    const r = await buildPlan('ghost');
    expect(r).toEqual({
      totalWeeks: 0,
      currentBlockId: null,
      currentWeekNumber: 0,
      blocks: [],
      startDate: null,
    });
  });
```

3. Agregá los casos nuevos:

```ts
  it('returns the program start date as YYYY-MM-DD', async () => {
    seedBasicFixtures({ startDate: '2026-03-02' });
    const r = await buildPlan('athlete-1');
    expect(r.startDate).toBe('2026-03-02');
  });

  it('returns startDate null when the program state has no start date', async () => {
    seedBasicFixtures({ startDate: null });
    const r = await buildPlan('athlete-1');
    expect(r.startDate).toBeNull();
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: FAIL — `r.startDate` es `undefined`.

- [ ] **Step 3: Implementar el cambio**

En `backend/src/services/plan.service.ts`:

1. Agregá el campo a la interface:

```ts
export interface PlanPayload {
  totalWeeks: number;
  currentBlockId: string | null;
  currentWeekNumber: number;
  blocks: PlanBlock[];
  /** Inicio del programa, 'YYYY-MM-DD'. Ancla el calendario del app. */
  startDate: string | null;
}
```

2. Traé la columna. **Casteá a texto**: `pg` convierte `DATE` a un `Date` de JS en la zona del servidor, y serializarlo a JSON lo puede correr un día. `::text` devuelve exactamente `'YYYY-MM-DD'`:

```ts
  const stateR = await pool.query<{
    current_week: number | null;
    active_skeleton_id: string | null;
    start_date: string | null;
  }>(
    `SELECT current_week, active_skeleton_id, start_date::text AS start_date
       FROM athlete_program_state WHERE athlete_id = $1`,
    [userId],
  );
  const state = stateR.rows[0];
  const currentWeek = state?.current_week ?? 0;
  const startDate = state?.start_date ?? null;
```

3. Agregá `startDate` a los **tres** returns: el de "sin perfil" (`startDate: null`, porque ahí ni se consultó el estado), el de "sin periodización" (`startDate`) y el final (`startDate`).

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tipos**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

---

### Task 3: `weekday` real de cada sesión

`PlanSession.day` es el índice de la sesión (1..N), no un día de semana. La tira de 7 días del app necesita saber que "Día 3" cae, por ejemplo, un jueves. El dato ya está en `athlete_profiles.days_specific`, que la migración 060 dejó ordenado por día de semana: `days_specific[i]` es el día de la sesión `i + 1`.

**Files:**
- Modify: `backend/src/services/plan.service.ts` (interface `PlanSession`, armado de `sessions`)
- Test: `backend/tests/unit/plan.service.test.ts`

**Interfaces:**
- Consumes: el loop de bloques de la Task 1.
- Produces: `PlanSession.weekday: number | null` — `0` = lunes … `6` = domingo, `null` cuando el perfil no tiene `days_specific`.

- [ ] **Step 1: Escribir los tests que fallan**

Primero corregí el fixture: hoy hace `days_specific: opts.daysSpecific ?? [...]`, así que un `null` explícito cae en el default y el caso "perfil sin días" no se puede escribir. Cambiá esa línea del handler de `athlete_profiles` por:

```ts
      days_specific:
        opts.daysSpecific === undefined ? ['lun', 'mar', 'jue', 'sab'] : opts.daysSpecific,
```

y ampliá el tipo del parámetro a `daysSpecific?: string[] | null;`.

Después agregá los casos:

```ts
  it('maps each session to its real weekday from days_specific', async () => {
    seedBasicFixtures({ daysSpecific: ['lun', 'mar', 'jue', 'sab'], daysPerWeek: 4 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([0, 1, 3, 5]);
  });

  it('returns weekday null when the profile has no days_specific', async () => {
    // El perfil viejo guarda days_per_week pero no la lista de días.
    seedBasicFixtures({ daysSpecific: null, daysPerWeek: 3 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([null, null, null]);
  });

  it('returns weekday null for sessions beyond the stored days', async () => {
    // days_per_week quedó en 4 pero days_specific sólo tiene 2 días.
    seedBasicFixtures({ daysSpecific: ['mie', 'vie'], daysPerWeek: 4 });
    const r = await buildPlan('athlete-1');
    const week1 = r.blocks[0]!.weeks[0]!;
    expect(week1.sessions.map((s) => s.weekday)).toEqual([2, 4, null, null]);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: FAIL — `weekday` es `undefined`.

- [ ] **Step 3: Implementar el cambio**

En `backend/src/services/plan.service.ts`:

1. Agregá el campo a la interface:

```ts
export interface PlanSession {
  day: number;
  title: string;
  tag: string;
  exerciseCount: number;
  estimatedMin: number;
  done: boolean;
  /** Día de semana real: 0 = lunes … 6 = domingo. null si el perfil no lo tiene. */
  weekday: number | null;
}
```

2. Arriba del archivo, al lado de los imports, poné la tabla de códigos. Es el mismo orden que usa `src/domain/schemas.ts` y que la migración 060 dejó normalizado:

```ts
// days_specific[i] es el día de semana de la sesión i+1, guardado en este orden.
const WEEKDAY_CODES = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
```

3. Dentro de `buildPlan`, después de calcular `dayIndices`, agregá el mapeo:

```ts
  const daysSpecific = profile.days_specific ?? [];
  const weekdayForSession = (sessionNumber: number): number | null => {
    const code = daysSpecific[sessionNumber - 1];
    if (!code) return null;
    const index = WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]);
    return index < 0 ? null : index;
  };
```

4. En el `dayIndices.map(...)` del loop de bloques, agregá el campo al objeto que se devuelve:

```ts
        weekday: weekdayForSession(i + 1),
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: PASS, la suite completa del archivo.

- [ ] **Step 5: Verificar tipos y lint**

Run: `cd backend && npx tsc --noEmit && npm run lint`
Expected: sin errores de tipos; el lint sin errores nuevos.

- [ ] **Step 6: Verificar el payload de punta a punta**

Run: `cd backend && npm test -- tests/unit/plan.service.test.ts`
Expected: PASS. Después revisá a ojo que `buildPlan` devuelva las tres cosas juntas: `startDate` string, `blocks[].kind`, `blocks[].weeks[].sessions[].weekday`.

---

## Fuera de alcance (declarado)

- **Endpoint de ejercicios por día arbitrario** (`GET /athlete/plan/:week/:day`): el app resuelve el detalle con el esqueleto activo y filtra por día en memoria. Queda para cuando se quiera mostrar la prescripción histórica real de una semana pasada.
- **Carga por ejercicio** (`82,5 kg` del prototipo): requiere el motor de prescripción por semana; no entra en `buildPlan`.
- **Migraciones**: ninguna. Las tres columnas ya existen.
