# "Agregar ejercicio" no deja filtrar por grupo muscular

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-20
- **Dónde**: aprobación de rutinas → "+ Agregar ejercicio" — `frontend/src/components/admin/rutinas/AddSlotPopover.tsx`
- **Qué pasa**: el popover de agregar ejercicio solo tenía búsqueda por texto; sin selector de grupo muscular (a diferencia de Editar slot).
- **Esperado**: poder filtrar por grupo muscular igual que en Editar ejercicio.

## Resolución

- **Resuelto**: 2026-07-20
- **Commit/PR**: pendiente de commit
- **Cómo se arregló**: agregado `<select>` "Grupo muscular" a AddSlotPopover (fetch de catálogo para armar opciones + estado `selectedGroup` que pasa `muscle_group` a `useExercisesSearch`), reflejando el patrón de EditSlotPopover. Verificado en vivo: 22 opciones, seleccionar "Piernas - Cuadriceps" lista solo cuádriceps. Test `frontend/src/components/admin/rutinas/AddSlotPopover.test.tsx`.
