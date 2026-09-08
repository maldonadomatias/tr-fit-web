# backend acepta swap de máquina sobre un ejercicio de test de RM

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-09-08
- **Dónde**: endpoints de `machine-alert` y `exclude-exercise` (consumidos desde tr-fit-app en `lib/api.ts:374` `apiMachineAlert` y `lib/api.ts:399` `apiExcludeExercise`)
- **Qué pasa**: el server acepta un swap de máquina sobre un ejercicio marcado `rm_test` sin rechazarlo. El bloqueo que se agregó es 100% del cliente, así que cualquier build viejo, un payload donde `flag` llegue `undefined`, o un request repetido escribe igual el swap corrupto.
- **Esperado**: rechazar el swap cuando el `exercise_id` corresponde a un slot de test de RM en la semana de testeo. La regla es una invariante de integridad de datos que usa el coach, así que la fuente de verdad tiene que ser el backend; el bloqueo de la app queda como conveniencia.
- **Notas**: Encontrado por el review adversarial de `/ship` en tr-fit-app (merge 881cf13, que agregó el bloqueo en `AyudaSheet` + el guard de identidad en `swapCurrentSlot`). Síntoma visible y ticket hermano en la app: `tr-fit-app/bugs/resueltos/2026-09-08-flag-rm-test-sobrevive-al-swap.md`.

## Resolución (al cerrar)

- **Resuelto**: 2026-09-08
- **Commit/PR**: local
- **Cómo se arregló**: `assertNotRmTestSwap` rechaza (409 `rm_test_locked`) si el ejercicio es un principal en la semana `is_rm_test`. Lo usan `createMachineAlert` y `excludeExercise` (antes de persistir la exclusión). Los accesorios siguen pudiendo swappear.
