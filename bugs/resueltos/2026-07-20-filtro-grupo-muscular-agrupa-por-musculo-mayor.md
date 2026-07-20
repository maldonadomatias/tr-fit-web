# Filtro de grupo muscular agrupa por músculo mayor

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-20
- **Dónde**: filtro de grupo muscular en armado de rutina — `backend/src/routes/exercises.ts:23`
- **Qué pasa**: al elegir un subgrupo (ej. "Piernas - Cuadriceps") aparecían todos los ejercicios del músculo mayor ("Piernas"), no solo el subgrupo.
- **Esperado**: filtrar por el subgrupo exacto seleccionado.

## Resolución

- **Resuelto**: 2026-07-20
- **Commit/PR**: 07f9d40
- **Cómo se arregló**: `GET /api/exercises` mapeaba el `muscle_group` entrante a `muscle_group_parent` (match por `split_part(muscle_group, ' - ', 1)` = ensancha a parent). Único caller es el buscador del armado web (EditSlotPopover/AddSlotPopover), que manda el subgrupo exacto del dropdown. Cambiado a `muscle_group` (match exacto). Verificado: `?muscle_group=Piernas - Cuadriceps` devuelve 24 filas, todas cuádriceps. Test `backend/tests/integration/exercises-route.test.ts`. Mobile no usa este filtro (solo `/exercises/:id/alternatives`).
