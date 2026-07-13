# rutinas activas: no deja scrollear hasta el final de la hoja

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: apartado rutinas activas (admin, tr-fit-web), detalle de rutina de alumno
- **Qué pasa**: al entrar a la rutina activa de un alumno no se puede bajar del todo en la página; la opción de agregar ejercicio está al final y queda inaccesible en el último día
- **Esperado**: scroll completo de la página; agregar ejercicio accesible en todos los días, incluido el último
- **Notas**: probablemente mismo root cause que item 11 (página queda cargada 3/4). Item 9 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: se corrigió la cadena de alturas mínimas, viewport dinámico y scroll interno con espacio final en rutinas activas.
