# 10x10x10 editado en rutina activa no se ejecuta como dropset

- **Prioridad**: alta
- **Estado**: resuelto
- **Creado**: 2026-07-15
- **Dónde**: dashboard admin (tr-fit-web), edición manual de rutina activa; ejecución del entrenamiento en la app del atleta
- **Qué pasa**: si el coach edita un ejercicio de una rutina activa y carga `10x10x10` como repeticiones, el entrenamiento no entra en modo Dropset. La app presenta las series como series comunes separadas en vez de mostrar los tres descensos del dropset.
- **Esperado**: toda prescripción `10x10x10` debe interpretarse y ejecutarse como dropset, sin importar si fue cargada al aprobar una rutina pendiente o al editar manualmente una rutina activa.
- **Notas**: punto 2 del PDF `ERRORES 3 - TR FIT APP.pdf`, ampliado con el reporte del 14/07/2026 a las 23:26 y 23:30. El flujo de aprobación de una rutina pendiente sí reconoce `10x10x10` como dropset; el fallo queda acotado al flujo de edición de una rutina ya activa.

## Pasos para reproducir

1. Abrir en el dashboard la rutina activa de un atleta.
2. Editar cualquier ejercicio manualmente.
3. Escribir `10x10x10` en repeticiones y guardar.
4. Esperar a que la rutina actualizada se sincronice.
5. Iniciar el entrenamiento desde la cuenta del atleta.
6. Abrir el ejercicio editado y comprobar cómo se muestran sus series.

## Comparación de flujos

- **Rutina activa editada manualmente**: `10x10x10` no activa el modo Dropset.
- **Rutina pendiente aprobada**: `10x10x10` sí activa el modo Dropset.

## Criterios de aceptación

- `10x10x10` se guarda con la misma semántica en ambos flujos del dashboard.
- Al iniciar el entrenamiento, cada serie prescrita se presenta como un dropset de tres descensos de 10 repeticiones.
- La vista previa o detalle del dashboard identifica la prescripción como dropset.
- El comportamiento se mantiene después de esperar la sincronización y recargar tanto el dashboard como la app.

## Resolución

- **Resuelto**: 2026-07-15
- **Commit/PR**: sin commit
- **Cómo se arregló**: al guardar una prescripción explícita desde la rutina activa, el backend sincroniza también las repeticiones vigentes del ejercicio. Así, un valor progresado anterior ya no pisa el nuevo `10x10x10` cuando se arma la próxima sesión.
