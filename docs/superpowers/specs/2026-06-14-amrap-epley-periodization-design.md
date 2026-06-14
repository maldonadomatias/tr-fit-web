# AMRAP (Epley) + Resync de Periodización — Diseño

**Fecha:** 2026-06-14
**Repo:** tr-fit-web (backend Express/TS + PostgreSQL)
**Origen:** Script actualizado de periodización de 30 semanas (Google Apps Script port). La semana 20 pasa de test de 1RM real a **test AMRAP**, y el 1RM teórico se deriva con la fórmula de Epley.

## Objetivo

1. Calcular el 1RM teórico desde un set AMRAP usando **Epley**: `1RM = peso × (1 + reps/30)`.
2. Resincronizar la configuración de las 30 semanas (`periodization_config` + seed) con el script nuevo.

## Contexto del código actual

- `periodization_config` (migración 004): config por semana. `is_rm_test`, `is_deload`, `principal_pct_rm`, `principal_rm_source IN (10,20,30)`.
- `rm_tests` (migración 007): `program_week INT CHECK (program_week IN (10,20,30))`, `value_kg`, `UNIQUE(athlete_id, exercise_id, program_week)`. **Semana 20 ya es un valor válido** → no hay que tocar el constraint.
- `engine.service.ts` `buildItem()`: branch `principal` →
  - `is_rm_test` → item sin peso, `flag:'rm_test'`.
  - `pct_rm && rm_source` → peso = `RM × pct`, redondeo `roundToNearest25` (barra/smith) o `Math.round`.
  - else → casilleros (`aewValue`).
- `engine.service.ts` línea ~32: bloquea la sesión si `state.rm_test_blocking` (`TodayBlockedError('rm_test_required')`).
- `progression.service.ts:146`: al avanzar de semana, `rm_test_blocking = next.is_rm_test`. **Solo mira `is_rm_test`.**
- `rm.service.ts` `recordRm()`: inserta en `rm_tests` y, si las 7 principales tienen RM para esa semana, limpia `rm_test_blocking`.
- Endpoint actual: `POST /athlete/rm` con `rmPayload = { exercise_id, value_kg, week:10|20|30 }`.
- `SessionItem.flag?: 'rm_test' | 'missing_rm'`.

### Divergencias detectadas (seed actual vs script nuevo)
`port-periodization.ts` ya difiere del script nuevo en semanas 9, 18, 20, 27 (pct, rmSource, reps, series). El resync corrige esto.

## Decisiones tomadas

- **Alcance:** Epley AMRAP **y** resync de periodización.
- **Input AMRAP:** el alumno ingresa **peso usado + reps**; el backend computa Epley (robusto si no usó exacto el peso prescrito).
- **Deload:** **preservar** los flags `is_deload` actuales (semanas 9/18/27/29). El resync solo pisa los valores `principal_*` / pct / rm_source y agrega `is_amrap`.
- **Semana 20:** `is_rm_test = FALSE`, `is_amrap = TRUE`, `pct = 0.85`, `rm_source = 10`. El valor Epley se guarda en `rm_tests` con `program_week = 20`, que el Bloque 3 (semanas 21–30, `rm_source = 20`) ya consume.

## Diseño

### 1. Util Epley (función pura — TDD)
Nuevo `backend/src/services/epley.service.ts`:
```ts
export function estimateEpley1RM(
  weightUsed: number,
  reps: number,
  equipment: string,
): number {
  const raw = weightUsed * (1 + reps / 30);
  return equipment === 'barra' || equipment === 'smith'
    ? roundToNearest25(raw)
    : Math.round(raw);
}
```
- `reps >= 1`, `weightUsed > 0` (validado en el schema).
- Reusa `roundToNearest25` de `progression-helpers.ts`.
- Casos de test: `100,8,'barra' → 127.5`; `100,1,'barra' → 102.5`; `60,10,'maquina' → 80`.

### 2. Migración `034_amrap_periodization.sql`
```sql
ALTER TABLE periodization_config
  ADD COLUMN IF NOT EXISTS is_amrap BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rm_tests
  ADD COLUMN IF NOT EXISTS amrap_weight NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS amrap_reps INT;

-- UPSERT de las 30 semanas con los valores del script nuevo
-- (is_amrap=TRUE solo en semana 20; is_deload preservado en 9/18/27/29).
INSERT INTO periodization_config (...) VALUES (...)
ON CONFLICT (week_number) DO UPDATE SET
  principal_series = EXCLUDED.principal_series,
  principal_reps = EXCLUDED.principal_reps,
  principal_descanso = EXCLUDED.principal_descanso,
  principal_pct_rm = EXCLUDED.principal_pct_rm,
  principal_rm_source = EXCLUDED.principal_rm_source,
  principal_use_casilleros = EXCLUDED.principal_use_casilleros,
  is_rm_test = EXCLUDED.is_rm_test,
  is_amrap = EXCLUDED.is_amrap;
  -- NO se pisa is_deload, block_label, accesorio_* (se preservan).
```
Las filas se generan desde `port-periodization.ts` actualizado (fuente de verdad).

### 3. Resync `port-periodization.ts`
Actualizar el mapa `principal` para que coincida con el script nuevo y agregar `isAmrap?: boolean` a `PrincipalCfg`. Semanas que cambian:
- **9:** `series 2, reps '2 a 3', pct 0.80, rmSource 30` (era `1 / '5' / 0.8 / 10`). `isDeload` preservado.
- **18:** `series 2, reps '2 a 3', pct 0.80, rmSource 10` (era `1 / '6 a 8' / 0.6`). `isDeload` preservado.
- **20:** `series 1, reps 'AMRAP', pct 0.85, rmSource 10, isAmrap: true`, `isRmTest: false`.
- **27:** `series 2, reps '2 a 3', pct 0.80, rmSource 20` (era `1 / '6 a 8' / 0.6`). `isDeload` preservado.
- El resto: verificar 1:1 contra el script y corregir cualquier diferencia.

El generador `rowFor()` emite la columna `is_amrap` y cambia a `ON CONFLICT DO UPDATE` (en vez de `DO NOTHING`) para que el reseed pise valores. Se preservan `is_deload`, `block_label`, `accesorio_*`.

### 4. `domain/types.ts`
- `PeriodizationConfig`: agregar `is_amrap: boolean`.
- `SessionItem.flag`: `'rm_test' | 'missing_rm' | 'amrap'`.

### 5. `engine.service.ts`
Nuevo branch en `buildItem()` para `role === 'principal'`, **antes** del branch `pct_rm` (porque la semana 20 tiene pct+rm_source):
```ts
} else if (cfg.is_amrap) {
  const rm = rmByEx.get(slot.exercise_id);   // RM10
  if (!rm) {
    item = baseItem(..., null, ..., 'missing_rm');
  } else {
    const weight = roundForEquipment(rm * Number(cfg.principal_pct_rm), exercise.equipment);
    item = baseItem(..., weight, ..., 'amrap');   // peso prescrito + flag amrap
  }
}
```
`rmByEx` ya se carga cuando `pct_rm && rm_source` (la semana 20 los tiene). El flag `'amrap'` le dice al cliente: peso sugerido = 85% del RM10, hacer **máximas reps** y registrar peso+reps.

### 6. `progression.service.ts`
Línea 142–146: el gate de bloqueo pasa a mirar `is_rm_test OR is_amrap`:
```ts
const nextCfg = await client.query<{ is_rm_test: boolean; is_amrap: boolean }>(
  `SELECT is_rm_test, is_amrap FROM periodization_config WHERE week_number = $1`, [toWeek]);
const blocking = !!(nextCfg.rows[0]?.is_rm_test || nextCfg.rows[0]?.is_amrap);
```
Así la semana 20 bloquea hasta que se carguen los AMRAP de las 7 principales (mismo flujo que un test RM).

### 7. Recording — `recordAmrap` + endpoint
**Schema** (`domain/schemas.ts`):
```ts
export const amrapPayload = z.object({
  exercise_id: z.number().int().positive(),
  weight_used: z.number().min(1).max(500),
  reps: z.number().int().min(1).max(100),
});
```
**Servicio** (`rm.service.ts`, nueva fn `recordAmrap`): resuelve equipment del ejercicio, computa `valueKg = estimateEpley1RM(weight_used, reps, equipment)`, inserta en `rm_tests` con `program_week = 20`, `value_kg`, `amrap_weight`, `amrap_reps`, y **reusa la misma lógica de desbloqueo** que `recordRm` (las 7 principales → `rm_test_blocking = FALSE`). Refactor: extraer el bloque de desbloqueo a un helper compartido `tryUnblockRmWeek(client, athleteId, week)`.

**Ruta** (`routes/athlete.ts`):
```ts
router.post('/amrap', async (req, res) => {
  const parsed = amrapPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  const out = await recordAmrap({ athleteId: req.user!.id, ...parsed.data });
  res.status(201).json(out); // { rmId, estimated1RM }
});
```
Devuelve el 1RM estimado para que el cliente lo muestre.

## Flujo end-to-end (semana 20)

1. Alumno avanza a semana 20 → `progression.service` setea `rm_test_blocking = TRUE` (ahora por `is_amrap`).
2. `buildTodaySession` lanza `rm_test_required`; cliente entra a modo test AMRAP.
3. Por cada principal, engine sugiere peso = 85% del RM10, `flag:'amrap'`.
4. Alumno hace máx reps, envía `POST /athlete/amrap { exercise_id, weight_used, reps }`.
5. Backend computa Epley → guarda `rm_tests(program_week=20)`.
6. Cargadas las 7 → `rm_test_blocking = FALSE`. Bloque 3 (semanas 21+, `rm_source=20`) usa ese RM teórico.

## Testing

- **epley.service**: unit puro (varios pesos/reps/equipment, redondeo).
- **engine.service**: semana 20 con RM10 presente → peso 85% + `flag:'amrap'`; sin RM10 → `missing_rm`.
- **rm.service.recordAmrap**: computa Epley correcto; desbloquea al cargar las 7; UPSERT idempotente (reenvío pisa).
- **progression.service**: avanzar a semana 20 setea `rm_test_blocking = TRUE`.
- **periodization seed**: las 30 filas matchean el script; `is_deload` preservado en 9/18/27/29; `is_amrap` solo en 20.

## Fuera de alcance (YAGNI)

- AMRAP en semanas distintas de la 20.
- UI del cliente (la pantalla de logging vive en tr-fit-app / mobile; acá solo backend + contrato API).
- Histórico/gráfico de 1RM estimado en el tiempo.
