# TODO — features pendientes

## Freeze de membresía por lesión

- **Prioridad**: media
- **Estado**: pendiente
- **Creado**: 2026-07-03
- **Dónde**: backend `memberships` + dashboard admin (UserDetail, tab Suscripción)
- **Qué pasa hoy**: estado "Pausada" de suscripción es cosmético; no bloquea acceso ni congela días pagados. Única opción es dejar vencer `paid_until` y ajustar `covers_until` a mano al volver.
- **Feature**: pausar membresía N días (lesión/vacaciones). Al reanudar, correr `paid_until` la cantidad de días pausados para respetar días ya pagados. Registrar pausa en audit log.
- **Notas**: campos sugeridos `memberships.paused_at` / `paused_days`; bloquear o no acceso durante la pausa a definir con el coach.
