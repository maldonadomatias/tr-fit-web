# coach no puede cambiar días de entrenamiento de una rutina

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: edición de rutinas (admin, tr-fit-web) + perfil del atleta (app)
- **Qué pasa**: al editar la rutina de una alumna aparecen los días seleccionados en su formulario original (ej: lunes-jueves), no los que ahora quiere (lunes, martes, miércoles y viernes). Otro caso: alumno de 4 días necesita 3 y no se puede reducir; hubo que reiniciar la cuenta de cero
- **Esperado**: botón de regenerar rutina que permita elegir nuevos días de entrenamiento. OPCIÓN NUEVA pedida: en perfil -> deslizar abajo -> "Cambiar los días de entrenamiento" (formulario nuevo) para pedir una nueva rutina
- **Notas**: relacionado con `tr-fit-app/bugs/pendientes/2026-06-18-cambiar-dias-de-entrenamiento.md` (lado atleta, bloqueado por falta de `PATCH /athlete/me`); este ticket agrega el lado coach/admin. Item 7 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: el coach puede elegir 2–6 días y encolar una nueva rutina; `PATCH /athlete/me` acepta días concretos atómicamente para la app.
