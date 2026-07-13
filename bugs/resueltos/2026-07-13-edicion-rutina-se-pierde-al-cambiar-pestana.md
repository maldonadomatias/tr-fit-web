# edición de rutina se pierde al cambiar de pestaña

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: armado/edición de rutinas de alumno nuevo (admin, tr-fit-web)
- **Qué pasa**: editando la rutina de un alumno nuevo, al moverse a otra pestaña se pierde todo lo editado
- **Esperado**: mantener el estado editado (draft persistente) y ofrecer botón "reiniciar" para descartar lo hecho
- **Notas**: pérdida de trabajo del coach → alta. Item 5 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: los cambios se guardan como borrador local por rutina y se restauran al volver; se agregó Reiniciar.
