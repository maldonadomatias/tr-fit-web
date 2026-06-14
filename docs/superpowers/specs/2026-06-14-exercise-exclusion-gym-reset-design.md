# Exclusión permanente de ejercicios + reset por cambio de gimnasio

Fecha: 2026-06-14
Repos: tr-fit-web (backend, grueso del trabajo) + tr-fit-app (UI)
Origen: pedido de Tato (WhatsApp 13/06/2026).

## Problema

Hoy las opciones SOS en sesión son dos:
- **"Siento dolor"** → avisa al coach, avanza de ejercicio.
- **"Máquina ocupada"** → reemplaza el ejercicio **solo por esta sesión** (no persiste).

Falta una tercera: **"No tengo esta máquina"**, que excluya el ejercicio **para siempre** (el gimnasio del atleta no tiene ese equipo), lo reemplace de forma permanente, y el sistema recuerde no volver a programarlo. Además, un botón **"He cambiado de gimnasio"** que reinicie el programa completo (semana 1, re-anotar pesos), porque al cambiar de gym cambia el equipamiento disponible.

## Decisiones tomadas

- **Rotación 4-semanas:** FUERA de alcance. Solo se garantiza que las exclusiones se respeten cuando esa rotación se construya (spec aparte).
- **Qué se puede excluir:** cualquier ejercicio (principal, accesorio, calentamiento), con reemplazo automático (mismo grupo muscular, equipo compatible, sin contraindicación) — igual que "máquina ocupada" pero permanente.
- **Reset por gimnasio:** `current_week=1` + borrar `athlete_exercise_weights` + borrar `athlete_excluded_exercises` + borrar `weekly_overrides`; **conservar** `rm_tests`.
- **Gobierno:** self-service. Exclusión y reset registran un `coach_alert` informativo. El reset pide confirmación explícita (confirm simple con advertencia clara, NO escribir palabra).

## A. Modelo de datos (migraciones nuevas, tr-fit-web)

Migración `034_excluded_exercises.sql`:

```sql
CREATE TABLE IF NOT EXISTS athlete_excluded_exercises (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),
  reason TEXT NOT NULL DEFAULT 'no_machine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, exercise_id)
);

-- extender el CHECK de coach_alerts.type (espejo de 032_membership_notifications.sql)
ALTER TABLE coach_alerts DROP CONSTRAINT IF EXISTS coach_alerts_type_check;
ALTER TABLE coach_alerts ADD CONSTRAINT coach_alerts_type_check
  CHECK (type IN (
    'sos_pain','sos_machine','rpe_flag','rm_skipped','rm_week_starting',
    'membership_expiring','membership_overdue',
    'sos_no_machine','program_reset'
  ));
```

Una fila en `athlete_excluded_exercises` = "este atleta no puede hacer `exercise_id`, se reemplaza por `replacement_exercise_id` para siempre". `replacement_exercise_id` puede ser `NULL` si no hubo alternativa.

Actualizar el union de tipos de alerta en TS:
- `backend/src/domain/types.ts:204` (`CoachAlert.type`).
- `backend/src/domain/alert-actions.ts` (agregar `sos_no_machine`, `program_reset` con acciones `['note_only']`).
- `backend/src/domain/schemas.ts:151` — NOTA: ese enum valida el body de creación de alertas vía `/alerts`. Los nuevos tipos NO se crean por esa ruta pública (se crean server-side), así que no hace falta sumarlos al enum del request; verificar que el flujo de creación interna no pase por ese schema.

## B. Backend — `exclusions.service.ts` (nuevo) + reset

`excludeExercise(athleteId, exerciseId)`:
1. Validar que el ejercicio existe y que no está ya excluido (idempotente: si ya existe, devolver el reemplazo guardado).
2. Calcular reemplazo con `alternatives.service.findAlternative(exerciseId, athleteId, excludeIds)` donde `excludeIds` = ids ya excluidos del atleta (para no elegir uno excluido). `findAlternative` ya respeta grupo muscular, equipo, nivel y contraindicaciones.
3. Insertar fila `(athlete_id, exercise_id, replacement_exercise_id, 'no_machine')`.
4. Crear `coach_alert`: si hubo reemplazo → `type='sos_no_machine'`, `severity='info'`, payload `{ replacement_exercise_id }`. Si NO hubo reemplazo (null) → `severity='yellow'` para que el coach lo resuelva.
5. Devolver `{ replacement: Exercise | null }`.

`reactivateExercise(athleteId, exerciseId)`: `DELETE FROM athlete_excluded_exercises WHERE athlete_id=$1 AND exercise_id=$2`. Idempotente.

`listExclusions(athleteId)`: devuelve filas con nombres resueltos del ejercicio original y del reemplazo (JOIN exercises).

`resetProgramForGymChange(athleteId)` (en una transacción):
```sql
UPDATE athlete_program_state
   SET current_week = 1, last_week_advanced_at = NULL, rm_test_blocking = FALSE
 WHERE athlete_id = $1;
DELETE FROM athlete_exercise_weights      WHERE athlete_id = $1;
DELETE FROM athlete_excluded_exercises    WHERE athlete_id = $1;
DELETE FROM weekly_overrides              WHERE athlete_id = $1;
-- rm_tests: NO se tocan (se conservan).
```
Luego crea `coach_alert` `type='program_reset'`, `severity='info'`.

## C. Integración en el engine

En `engine.service.ts`, al armar la sesión:
- Cargar el mapa de exclusiones del atleta: `Map<original_exercise_id, replacement_exercise_id | null>`.
- Por cada slot del día: si `slot.exercise_id` está excluido → si hay reemplazo, usar `replacement_exercise_id` (cargar ese ejercicio); si es null, **saltear** el slot (no incluirlo en los items de la sesión).
- Aplicar esto ANTES de cualquier override semanal.
- Si el reemplazo es un slot `principal` sin RM registrado, el flag `missing_rm` existente lo cubre (no hay trabajo extra).

Filtros de no-reintroducción:
- `exercise.service.listExercisesForAthlete`: excluir también los `athlete_excluded_exercises` del atleta (no solo contraindicaciones por lesión).
- `alternatives.service.findAlternative`: ya recibe `excludeIds`; los callers deben pasar el set de excluidos del atleta para no proponer uno excluido.

## D. Backend — rutas (`backend/src/routes/athlete.ts`)

- `POST /athlete/exclusions` body `{ exercise_id: number }` → `excludeExercise`, responde `{ replacement: { id, name, muscle_group, equipment } | null }`.
- `DELETE /athlete/exclusions/:exerciseId` → `reactivateExercise`, responde `{ ok: true }`.
- `GET /athlete/exclusions` → `listExclusions`, responde `Array<{ exercise_id, exercise_name, replacement_exercise_id, replacement_name }>`.
- `POST /athlete/program/reset` → `resetProgramForGymChange`, responde `{ ok: true }`.

Todas usan el `req.user!.id` como `athleteId` (auth existente).

## E. App (tr-fit-app)

### E1. Tercer botón SOS "No tengo esta máquina"
- Agregar a la fila SOS en `app/(app)/session/active.tsx` (la fila con "Siento dolor" / "Máquina ocupada", ~líneas 515-541) y en `components/session/GuidedSessionScreen.tsx` (componente `SOSRow`, ~líneas 306-334). La fila pasa de 2 a 3 botones (ajustar layout: apilar el tercero o fila de 3 compactos).
- Nuevo `components/session/NoMachineSheet.tsx` (espejo de `MachineSheet.tsx`, forwardRef BottomSheetModal):
  - Texto: "¿No tenés esta máquina en tu gimnasio? La sacamos de tu rutina para siempre y la reemplazamos por otra equivalente."
  - Al confirmar: `apiExcludeExercise(exercise_id)` → recibe reemplazo → hace el swap en la sesión actual (igual que MachineSheet: `useSessionStore.setState` cambia el item del slot actual) y avanza/continúa. Si `replacement` es null: mensaje "Tu coach va a elegir un reemplazo" y saltea el ejercicio.

### E2. Profile → sección "Mi gimnasio"
- Nueva pantalla o sección (en `app/(app)/profile/`, p.ej. `app/(app)/profile/gimnasio.tsx`, enlazada desde el índice de profile):
  - **Lista de ejercicios excluidos** (`apiListExclusions`): cada item muestra "Original → Reemplazo" con botón **"Reactivar"** (`apiReactivateExercise`).
  - Botón **"He cambiado de gimnasio"** → modal de confirmación simple con advertencia: "Vas a reiniciar tu rutina a la semana 1 y tendrás que re-anotar los pesos. Esto no se puede deshacer. ¿Seguro?" → `apiResetProgram`.

### E3. API client (`lib/api.ts`)
- `apiExcludeExercise(exerciseId)` → `POST /athlete/exclusions`.
- `apiReactivateExercise(exerciseId)` → `DELETE /athlete/exclusions/:exerciseId`.
- `apiListExclusions()` → `GET /athlete/exclusions`.
- `apiResetProgram()` → `POST /athlete/program/reset`.

## F. Gobierno
Self-service. Exclusión (`sos_no_machine`) y reset (`program_reset`) generan `coach_alert` informativo. El reset pide confirmación explícita en el app.

## G. Fuera de alcance
- Rotación automática de un ejercicio no-principal cada 4 semanas (spec aparte). Las exclusiones quedan listas para ser respetadas por esa rotación futura.
- Panel de coach para estos nuevos tipos de alerta más allá de mostrarlos en la lista existente (los tipos nuevos usan `['note_only']`).

## H. Testing (Jest, backend `npm test`; app `npm test`)
- `exclusions.service`: excluir (elige reemplazo, inserta, crea alert), excluir sin alternativa (null + alert yellow), no re-excluir un excluido como reemplazo, reactivar (borra), idempotencia, listExclusions con nombres.
- `resetProgramForGymChange`: week→1, borra weights/exclusions/weekly_overrides, **conserva rm_tests** (test explícito).
- `engine.service`: slot con ejercicio excluido → usa reemplazo; reemplazo null → slot salteado; orden exclusión-antes-de-override.
- `exercise.service`/`alternatives.service`: no devuelven ejercicios excluidos del atleta.
- App: smoke render de `NoMachineSheet` y de la sección "Mi gimnasio".

## I. Riesgos / notas
- **Cross-repo:** este trabajo toca tr-fit-web (grueso) y tr-fit-app (UI). Cada repo es su propio git; ambos tienen WIP sin commitear no relacionado al momento de escribir este spec — resolver el manejo de ramas/WIP antes de implementar.
- Excluir un principal y reemplazarlo puede dejar el reemplazo sin RM → el flag `missing_rm` y `RMMissingBanner` existentes lo cubren.
- El reset borra `weekly_overrides` para evitar overrides obsoletos al volver a semana 1.
