# Exercise Modality (reps / tiempo / distancia) — Design

**Fecha:** 2026-06-12
**Repos:** `tr-fit-web` (backend Express + frontend admin React) + `tr-fit-app` (RN).
**Origen:** bug reportado — en el flujo guiado "Bicicleta fija" (calentamiento por tiempo)
muestra "10 reps" gigante. El modelo no distingue reps de tiempo/distancia.

## Problema

Los calentamientos están **hardcodeados** a `2 series, '10' reps, '1 min'`
(`backend/src/services/engine.service.ts:117-119`), sin importar el ejercicio.
"Bicicleta fija" (5 min, cardio) recibe "10 reps". La prescripción real vive solo
en `notes`. El modelo de ejercicios **no tiene concepto de modalidad**: todo se
asume por repeticiones. El rediseño guiado expuso el problema al convertir las
reps en el número héroe de la pantalla.

## Decisiones (acordadas con Tato)

1. **Modalidad intrínseca al ejercicio.** Campo `modality` en `exercises`
   (`reps` | `tiempo` | `distancia`). Una bicicleta fija siempre es tiempo; una
   sentadilla siempre reps. Se setea una vez por ejercicio en el admin.
2. **Target = texto libre + default en el ejercicio.** `exercises.default_target`
   (TEXT nullable, ej "5 min", "2 km"). El engine lo usa para calentamientos en
   vez del hardcode `'10'`. principal/accesorio siguen tomando el texto objetivo
   del config de la planilla.
3. **tiempo/distancia: solo "hecho".** Sin peso, sin RPE, sin stepper de reps.
   IN_SET muestra el target con su label correcto; POST_SET confirma completado
   (`logSet` con `completed=true`, sin value/reps/rpe).

## Modelo de datos (backend)

Migración nueva `NNN_exercise_modality.sql`:

```sql
ALTER TABLE exercises
  ADD COLUMN modality TEXT NOT NULL DEFAULT 'reps'
    CHECK (modality IN ('reps', 'tiempo', 'distancia')),
  ADD COLUMN default_target TEXT;

-- Backfill: el cardio existente pasa a tiempo. default_target queda null
-- (el coach carga el valor real en el admin; no se puede inferir).
UPDATE exercises SET modality = 'tiempo' WHERE movement_pattern = 'cardio';
```

`Exercise` domain type (`backend/src/domain/types.ts`) gana:

```ts
export type ExerciseModality = 'reps' | 'tiempo' | 'distancia';
// en interface Exercise:
modality: ExerciseModality;
default_target: string | null;
```

## Engine (`backend/src/services/engine.service.ts`)

- `SessionItem` (domain) gana `modality: ExerciseModality`.
- `baseItem(...)` gana parámetro `modality` y lo incluye en el item.
- **Warmup** deja de hardcodear reps. Target = `default_target` del ejercicio,
  con fallback **modality-aware** (solo reps cae a `'10'`; tiempo/distancia sin
  default quedan con target vacío → la app muestra solo el label + la nota):
  ```ts
  const warmupTarget =
    exercise.default_target ?? (exercise.modality === 'reps' ? '10' : '');
  baseItem(exercise, ..., 2, warmupTarget, '1 min', ..., exercise.modality);
  ```
- **principal/accesorio:** `modality = exercise.modality`; el target sigue siendo
  el texto del config (`principal_reps` / `accesorio_reps` / `current_reps_text`).
- El query de `buildItem` que trae el ejercicio debe seleccionar las columnas
  nuevas (`modality`, `default_target`).

## Admin (web frontend + backend service)

- `admin-exercise.service.ts`: `Exercise` interface + `CreateExerciseInput` ganan
  `modality` + `default_target`. SQL `INSERT`/`UPDATE`/`SELECT` incluyen ambas
  columnas. `name_taken`/`not_found` sin cambios.
- Form de crear/editar ejercicio (frontend admin): select **Modalidad**
  (reps/tiempo/distancia) + input **Target default** (texto, placeholder "ej. 5 min").
  Validación: modality requerido (default reps), default_target opcional.

## App render (`tr-fit-app`)

- `lib/api.ts` `SessionItem`: add `modality: 'reps' | 'tiempo' | 'distancia'`.
- Helper nuevo `lib/exercise-target.ts`:
  ```ts
  // reps → { hero: '10', label: 'reps' } (top del rango, como hoy)
  // tiempo/distancia → { hero: target, label: '' } (texto tal cual, sin parsear número)
  export function targetDisplay(modality, targetText): { hero: string; label: string }
  export function isRepBased(modality): boolean // modality === 'reps'
  ```
- **Guiado:**
  - `PreSetCard`: la columna "REPS OBJETIVO 10" pasa a label/valor por modalidad
    ("TIEMPO" / "5 min"). Para no-reps, sin columna de peso (ya gateada por noWeight).
  - `InSetView`: número héroe = `targetDisplay` (reps → "10 reps"; tiempo → "5 min";
    distancia → "2 km").
  - `PostSetCard`: si `!isRepBased(modality)` → sin stepper de reps, sin RPE, sin
    weight segment; solo el header "¿Cómo salió?"/confirmación. (warmup ya cae en
    `noWeight`; se agrega el gate por modalidad para tiempo/distancia accesorios.)
  - meta row: "10 reps meta" → modality-aware.
  - `buildSetLogPayload` (`lib/guided-log.ts`): para no-reps → `value=null`,
    `reps=null`, `rpe=null`, `completed=true`.
  - approx/weight-adjust: solo reps + principal; no afectados (warmups saltan approx).
- **Carril** (`SessionScreen` + `SetRowIter`): para tiempo/distancia mostrar el
  target como texto, sin inputs de reps/peso, solo el check de completado. Mínimo
  pero consistente con el guiado.

## Flujo de datos

```
exercises.modality/default_target
  → engine.buildItem → SessionItem.modality (+ target text en reps)
    → API /sessions
      → app SessionItem.modality
        → targetDisplay()/isRepBased() → render + gating UI + logSet payload
```

## Tests

- **Backend** (jest): engine construye warmup con `modality` + `default_target`
  del ejercicio (no hardcode); admin-exercise round-trip de `modality`/`default_target`;
  migración backfill `cardio → tiempo` (test de la query o del estado post-migración).
- **App** (jest): `targetDisplay`/`isRepBased` unit (reps/tiempo/distancia);
  `PostSetCard` oculta stepper/RPE/weight cuando `modality!=='reps'`; `InSetView`
  muestra "5 min" para tiempo; `buildSetLogPayload` non-reps → value/reps/rpe null;
  carril gatea inputs para no-reps.

## Fuera de alcance

- Registrar lo logrado en tiempo/distancia (decidido: solo "hecho").
- Progresión por tiempo/distancia (la planilla sigue reps/peso).
- Override de modalidad por slot/planilla (modalidad es intrínseca al ejercicio).
- Backfill de `default_target` con valores reales (el coach los carga en admin;
  hasta entonces, no-reps con target null muestra solo el label de modalidad + la
  nota del coach).

## Migración / rollout

1. Migración agrega columnas con default seguro (`modality='reps'`).
2. Backfill cardio → tiempo.
3. Deploy backend + app. Ejercicios cardio ya no fuerzan "10 reps" (muestran su
   modalidad; target se completa en admin).
4. Tato edita en admin los ejercicios de tiempo/distancia que necesiten
   `default_target` (ej Bicicleta fija → "5 min").
