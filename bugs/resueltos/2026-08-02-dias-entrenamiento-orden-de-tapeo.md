# días de entrenamiento en desorden (Día 3 · Viernes, Día 4 · Jueves)

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-08-02
- **Dónde**: admin, días de entrenamiento del atleta — `frontend/src/components/admin/rutinas/activas/DayCard.tsx:24` (`dayHeading`), datos en `athlete_profiles.days_specific`
- **Qué pasa**: un alumno eligió lunes, martes, viernes y jueves (en ese orden) y el admin mostraba "Día 1 lunes / Día 2 martes / Día 3 viernes / Día 4 jueves".
- **Esperado**: los días listados en orden de semana (lun, mar, jue, vie).
- **Notas**: la rutina asignada era la correcta y no cambió de orden — el error era solo de etiquetas. El video del reporte no llegó adjunto; no hizo falta.

## Resolución

- **Resuelto**: 2026-08-02
- **Commit/PR**: `d2f3867` (deployado; migración `060` confirmada en la tabla `migrations` de prod)
- **Cómo se arregló**: `days_specific[i]` es el día de la sesión i+1, pero la app lo mandaba en el orden en que el alumno tocaba los botones, así que quedaba guardado sin ordenar. `selectTemplate` compara ordenado (`template.service.ts:41`), por eso la rutina elegida sí era la correcta; el único consumidor sensible al orden era la etiqueta.
  - Fix en el punto por donde pasan las tres escrituras del campo: `weekdayEnum` compartido + `.transform(sortWeekdays)` en `onboardingPayload`, `profileUpdatePayload` y `adminTrainingDaysPayload` (`backend/src/domain/schemas.ts`). El diálogo del admin ya mandaba ordenado (`ChangeTrainingDaysDialog.tsx:48`); la app mobile no.
  - `backend/src/db/migrations/060_sort_days_specific.sql` normaliza las filas existentes. Probado antes en un postgres descartable: sólo toca las desordenadas, deja NULL y ya-ordenadas intactas.
  - Verificado en prod: 0 filas desordenadas; la combinación `{lun,mar,jue,vie}` (8 alumnos) es la del reporte.
  - Arregla también la app mobile: lee el mismo campo. Las rutinas ya aprobadas no cambian de contenido, sólo la etiqueta de día pasa a orden calendario.
