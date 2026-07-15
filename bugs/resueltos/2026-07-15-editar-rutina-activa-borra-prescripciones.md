# editar una rutina activa borra las prescripciones

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-15
- **Dónde**: dashboard admin (tr-fit-web), edición manual de la rutina activa de un atleta
- **Qué pasa**: al cambiar un ejercicio o agregar uno en un lugar de la rutina activa se pierden las series, repeticiones y descansos de los ejercicios de la rutina. Los campos afectados pasan a mostrarse como "Según periodización" aunque antes tenían una prescripción específica.
- **Esperado**: cambiar o agregar un ejercicio debe modificar solamente el lugar seleccionado y conservar sin cambios las series, repeticiones y descansos del resto de la rutina. La prescripción del ejercicio editado solo debe cambiar si el coach la modifica de forma explícita.
- **Notas**: punto 1 del PDF `ERRORES 3 - TR FIT APP.pdf`. Reportado después de la última actualización.

## Pasos para reproducir

1. Abrir en el dashboard un atleta que tenga una rutina activa con series, repeticiones y descansos definidos.
2. Editar manualmente la rutina activa.
3. Cambiar un ejercicio existente o agregar un ejercicio en uno de los lugares de la rutina.
4. Guardar o esperar a que finalice la actualización.
5. Revisar las prescripciones de todos los ejercicios de la rutina.

## Criterios de aceptación

- Los lugares no editados conservan exactamente sus series, repeticiones y descansos.
- El lugar editado conserva su prescripción previa al reemplazar el ejercicio, salvo que el coach la cambie.
- Agregar un ejercicio no convierte otras prescripciones en "Según periodización".
- Al recargar el dashboard, la rutina mantiene los mismos datos guardados.

## Resolución

- **Resuelto**: 2026-07-15
- **Commit/PR**: `78d021b`
- **Cómo se arregló**: el editor de rutinas activas ahora acumula los cambios en un borrador y los aplica de forma atómica. Solo actualiza los slots modificados y conserva series, repeticiones y descansos al reordenar o guardar el resto de la rutina.
