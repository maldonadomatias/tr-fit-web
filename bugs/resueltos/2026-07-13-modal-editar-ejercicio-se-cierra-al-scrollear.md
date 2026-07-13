# modal editar ejercicio se cierra al scrollear

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: armado de rutinas (admin, tr-fit-web), modal del lápiz para editar ejercicio
- **Qué pasa**: el cuadro de edición no se ve completo; al deslizar con el trackpad para verlo, la pantalla scrollea y el cuadro se sale/cierra
- **Esperado**: modal con scroll interno propio o anclado, que no se desplace ni cierre al scrollear la página
- **Notas**: mismo modal que el screenshot del item 4. Item 6 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: sin commit
- **Cómo se arregló**: el editor tiene altura máxima, scroll interno y overscroll contenido; ya no se cierra al scrollear la página.
