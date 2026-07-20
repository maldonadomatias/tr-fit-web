# botón Skip (J) no anda en cola pendiente de rutinas

- **Prioridad**: media
- **Estado**: resuelto
- **Creado**: 2026-07-20
- **Dónde**: aprobación de rutinas, pestaña "Cola Pendiente" — `frontend/src/components/admin/rutinas/ActionFooter.tsx:34-45`, `frontend/src/pages/admin/Rutinas.tsx:61-74`
- **Qué pasa**: click en botón Skip (y/o tecla J) no avanza a la siguiente rutina de la cola
- **Esperado**: saltar la rutina actual sin aprobar/rechazar y mostrar la siguiente pendiente
- **Notas**:
  - Botón Skip llama `onAdvance` → `advance()` en `Rutinas.tsx:61`; tecla J llama `goNext()` (`useRutinasHotkeys.ts:44`). Son dos caminos distintos con el mismo objetivo.
  - `canSkip = queue.length > 1` (`Rutinas.tsx:74`): con una sola rutina pendiente el botón queda deshabilitado — verificar si el repro del coach era con 1 sola pendiente (en ese caso es diseño, no bug, pero el disabled no se comunica).
  - Otra pista: la cola (`usePendingRutinas`, orden del server) no coincide con el orden visual de `ListPane` (ordena por antigüedad/nombre en el cliente), así que "siguiente" puede saltar a una fila no adyacente y parecer que no hizo nada.
  - Falta repro con app corriendo (server no estaba levantado al investigar). Revisar también que ningún overlay del layout mobile (commit 13a05e9) tape el footer.

## Resolución

- **Resuelto**: 2026-07-20
- **Commit/PR**: 8eb49ae
- **Cómo se arregló**: root cause reproducido en browser: con exactamente 1 rutina pendiente, Skip quedaba `disabled` (`canSkip = queue.length > 1`) y la tecla J navegaba al mismo id — cero feedback, parecía roto. Fix: botón siempre habilitado; skip/J/K con una sola rutina muestran toast "No hay otra rutina en la cola". Con 2+ pendientes ya funcionaba (verificado). Tests en `frontend/src/pages/admin/Rutinas.skip.test.tsx`.
