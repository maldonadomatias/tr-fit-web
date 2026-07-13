# agregar tiempo de entrenamiento en contexto de rutinas

- **Prioridad**: baja
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: tab "contexto" de rutinas (admin, tr-fit-web)
- **Qué pasa**: el contexto de la rutina no muestra el tiempo de entrenamiento elegido por el alumno (1 h, 1:15, etc.); todas las rutinas base son de 1 h 30 min
- **Esperado**: mostrar el tiempo de entrenamiento del alumno en contexto, para que el coach sepa si agregar o quitar series
- **Notas**: feature request más que bug. Item 2 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: la pestaña Contexto muestra `exercise_minutes` con formato de horas y minutos.
