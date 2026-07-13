# rutinas activas: agregar ejercicio no se agrega

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: apartado rutinas activas (admin, tr-fit-web), agregar ejercicio
- **Qué pasa**: se selecciona un ejercicio para agregar y no se agrega; a veces hay que recargar la página para que aparezca. Además, al bajar del todo no se visualiza la rutina completa: la página queda cargada 3/4
- **Esperado**: el ejercicio se agrega y se refleja al instante, sin recargar; la rutina se renderiza completa
- **Notas**: el coach lo marca como "error grave y urgente". Relacionado con item 9 (scroll incompleto), posible mismo root cause de render. Item 11 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: el agregado usa la primera posición libre real y evita colisiones cuando existen huecos tras eliminar o mover ejercicios.
