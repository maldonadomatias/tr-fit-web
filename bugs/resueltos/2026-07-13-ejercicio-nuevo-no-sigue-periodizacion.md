# ejercicio principal nuevo no sigue periodización semanal

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: armado de rutinas (admin, tr-fit-web), agregar ejercicio
- **Qué pasa**: si se edita un ejercicio principal existente aparece con periodización de la semana, pero al agregar un ejercicio nuevo solo deja ponerle repeticiones fijas, no como principal que siga la periodización
- **Esperado**: poder agregar un ejercicio nuevo como principal que herede la periodización semanal
- **Notas**: duda del coach: ¿si en repeticiones no pone nada, el ejercicio sigue la periodización? Verificar comportamiento actual. Item 8 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: al agregar se puede elegir rol Principal; ese rol deja series, repeticiones y descanso bajo la periodización semanal.
