# Descartar rutina pendiente sin regenerar

- **Fecha**: 2026-07-20
- **Estado**: aprobado (coach pidió: "sólo me deja rechazarla y regenerar, y no descartar o eliminarla de pendiente")

## Problema

En la cola pendiente de aprobación (`/admin/rutinas`), las únicas salidas de una
rutina son Aprobar o Rechazar. Rechazar siempre regenera otra pendiente
(`POST /admin/rutinas/:id/reject` → `generateRoutine` → `createPendingSkeleton`),
así que cuando el coach ya le armó una rutina a mano a la alumna, la pendiente
de IA no se puede sacar de la cola: rechazar la reemplaza por otra.

## Solución

### Backend

`POST /admin/rutinas/:id/discard` (router `rutinas.ts`, ya protegido por
`requireAuth + requireAdmin`):

- Busca el skeleton; 404 si no existe, 409 (`not_pending`) si no está
  `pending_review`.
- Marca `status='superseded'`, `reviewed_at=NOW()`, `reviewed_by=<admin>` a
  **todas** las filas `pending_review` de esa alumna, no solo la visible.
  Motivo: `listPendingForCoach` hace `DISTINCT ON (athlete_id)` con la más
  nueva; si solo se descarta la visible, una pendiente vieja oculta
  resurgiría en la cola.
- Sin regeneración. Sin push notification a la alumna.
- Responde 204.

Se reutiliza `superseded` (ya existe en el CHECK constraint y en
`SkeletonStatus`): semánticamente es "reemplazada por otra", no "mala rutina".
`rejected` queda reservado para rechazos reales, cuyo feedback alimenta la
regeneración.

### Frontend

- `useDiscardRutina` en `hooks/useRutina.ts`: `POST /admin/rutinas/:id/discard`,
  invalida `['admin', 'rutinas']`.
- Botón "Descartar" (ghost, ícono Trash2) en `ActionFooter`, junto a Skip.
  Sin hotkey: acción destructiva, evita descartes accidentales.
- `DiscardDialog` de confirmación: "No se genera otra rutina. La alumna queda
  con su rutina actual — asegurate de haberle armado una." Confirmar →
  descarta, toast "Rutina descartada", `onAdvance()` a la siguiente.
- 409 → toast "Ya fue procesada" + advance (mismo patrón que approve).

## Testing

- Backend (integration, `admin-rutinas.test.ts`): discard marca superseded sin
  crear nueva pendiente; descarta también pendientes viejas de la misma alumna;
  409 si ya procesada; desaparece de `GET /pending`.
- Frontend (`Rutinas.discard.test.tsx`): botón abre diálogo, confirmar llama al
  endpoint y avanza; cancelar no llama.
