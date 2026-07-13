# rutinas activas: no deja scrollear hasta el final de la hoja

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-13
- **Dónde**: apartado rutinas activas (admin, tr-fit-web), listado de atletas de la pestaña Activas
- **Qué pasa**: el panel izquierdo tiene una altura limitada y la consulta trae solo los primeros 50 atletas, por lo que no se puede recorrer el listado activo completo
- **Esperado**: el listado de atletas ocupa la altura disponible, tiene scroll interno y permite acceder a todos los atletas activos
- **Notas**: probablemente mismo root cause que item 11 (página queda cargada 3/4). Item 9 del PDF ERRORES 2, sección Dashboard.

## Resolución

- **Resuelto**: 2026-07-13
- **Commit/PR**: `c897c02` + corrección posterior
- **Cómo se arregló**: se quitó el límite visual de `60vh`, se convirtió el panel izquierdo en una región de scroll de altura completa y la consulta solicita el máximo soportado por la API (200 atletas en lugar del valor predeterminado de 50).
