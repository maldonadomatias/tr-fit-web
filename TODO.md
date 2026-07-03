# TODO — features pendientes

## Freeze de membresía por lesión

- **Prioridad**: media
- **Estado**: hecho (2026-07-03)
- **Dónde**: `POST /admin/users/:id/membership/pause` y `/resume`; UI en UserDetail → tab Suscripción → card "Membresía"
- **Cómo quedó**: pausar bloquea login/refresh y congela el reloj (`memberships.paused_at`); reanudar corre `paid_until` los días pausados. Registrar un pago mientras está pausada la reactiva. El cron ignora membresías pausadas. Auditado como `membership_paused` / `membership_resumed`.
