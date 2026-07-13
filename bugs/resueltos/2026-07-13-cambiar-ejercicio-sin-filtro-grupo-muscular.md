# cambiar ejercicio no permite filtrar por grupo muscular

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: armado de rutinas y edición de rutina activa (admin, tr-fit-web), modal de cambiar ejercicio
- **Qué pasa**: al cambiar un ejercicio solo aparece "Ejercicios de <músculo actual>" o "Todos los ejercicios" (chip "Solo Calentamiento" en el caso de la foto); no se puede elegir otro grupo muscular
- **Esperado**: selector de grupo muscular ("pecho mayor", "pecho inferior", "piernas - cuádriceps", "espalda", etc.) y que la lupa busque dentro de ese grupo; tanto en armado como en edición de rutina de atleta activo
- **Notas**: item 4 del PDF ERRORES 2, sección Dashboard (con screenshot del modal).

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: los selectores de armado y rutina activa permiten elegir cualquier grupo muscular y buscar dentro de él.
