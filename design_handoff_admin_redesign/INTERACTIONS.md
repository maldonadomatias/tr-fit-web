# Interacciones, estados y data fetching

## Hooks existentes (no romper)

El codebase ya tiene `frontend/src/hooks/useAdminUsers.ts` con:

- `useAdminUsers(filters)` — lista filtrada
- `useAdminUser(id)` — detalle de un usuario
- `useCreateUser()` — alta manual
- `useUpdateAdminUser(id)` — patch (role/status/email_verified)
- `useUpsertSubscription(id)` — crea/actualiza suscripción
- `useCancelSubscription(id)` — cancela
- `useDeleteUser()` — borra

Mantenelos. Las pantallas nuevas/redesigned se enchufan acá.

## Hooks nuevos a crear

### `useAdminStats()` — KPIs del dashboard

```ts
GET /admin/stats?range=30d
→ {
  signups_30d: number;
  signups_delta_pct: number;            // % vs los 30d anteriores
  signups_trend: number[];              // últimos 30 puntos
  pending_count: number;
  active_subs: number;
  active_subs_delta: number;
  mrr_estimated: number;                // en centavos ARS
  mrr_delta_pct: number;
  mrr_trend: number[];
  churn_pct: number;
  churn_delta_pp: number;
  verified_pct: number;
}
```

Cachear con `staleTime: 60_000` (1 min). Polling opcional cada 5 min.

### `useActivityLog(filter?)` — bitácora

```ts
GET /admin/activity?type=user|sub|auth&before=cursor
→ Array<{
  id: string;
  type: 'user_approved' | 'user_rejected' | 'user_created'
      | 'subscription_authorized' | 'subscription_cancelled' | 'subscription_paused'
      | 'email_verified' | 'role_changed' | 'password_reset';
  actor: string;                        // email del admin, "system", "auto-signup", "MercadoPago"
  target: string;                       // email afectado
  meta?: Record<string, any>;           // diff o detalles
  severity: 'brand' | 'warning' | 'destructive' | null;
  created_at: string;                   // ISO
}>
```

Infinite query con cursor por `created_at`.

### `useSubscriptions(filters)` — vista propia

Filtrado por tier y status. Sustituye una llamada equivalente a
`useAdminUsers({ has_subscription: true })` si querés exponer la vista en
ruta propia. Si preferís reusar `useAdminUsers`, alcanza con:

```ts
useAdminUsers({ subscription_status: filters.status, subscription_tier: filters.tier })
```

### Acciones de soporte (opcional, fase 2)

- `useForceLogout(id)` — invalida refresh tokens del usuario
- `useGeneratePasswordResetLink(id)` — devuelve URL de un solo uso
- `useImpersonate(id)` — abre la app del cliente con la sesión del usuario

## Estados de carga / vacío / error

Reutilizar `<Skeleton>` de shadcn para placeholders.

### Resumen
- **Loading**: 4 skeletons para los KPIs (rect 96×144) + skeletons para las cards secundarias.
- **Empty**: nunca completamente vacío — si `signups_30d === 0`, mostrar `0` y "todavía sin altas" en sub.

### Pendientes
- **Loading**: 3 skeletons de PendingCard (rect 88px tall).
- **Empty**: card centrado con texto "No hay usuarios pendientes." y un ícono `CheckCircle` brand.

### Lista de usuarios
- **Loading**: skeleton de tabla (header real + 8 filas con skeleton cells).
- **Empty filtrado**: card con texto + botón "Limpiar filtros" como link.
- **Empty absoluto**: nunca debería pasar; si pasa, mismo mensaje.

### Detalle de usuario
- **Loading**: identity card con skeleton avatar + tres líneas; tabs deshabilitadas.
- **Error / no encontrado**: card centrada `Usuario no encontrado.` + botón `Volver a usuarios` (outline).
  Mantener el comportamiento actual del archivo `UserDetail.tsx`.

### Suscripciones
- Igual que Usuarios.

### Actividad
- **Loading**: timeline skeleton (5 items).
- **Empty**: `Sin eventos con ese filtro.` en una card empty.

## Toasts (sonner)

Todos los handlers de mutación deben mostrar toast (ya hay `sonner` instalado).

| Acción                               | Éxito                          | Error                                         |
|--------------------------------------|--------------------------------|-----------------------------------------------|
| Aprobar usuario                      | `Usuario aprobado`             | `No se pudo aprobar: {msg}`                   |
| Rechazar usuario                     | `Usuario rechazado`            | `No se pudo rechazar: {msg}`                  |
| Patch estado/rol/verificación        | `Usuario actualizado`          | `No se pudo actualizar: {msg}`                |
| Crear suscripción                    | `Suscripción creada`           | `No se pudo crear la suscripción`             |
| Editar suscripción                   | `Suscripción actualizada`      | `No se pudo guardar la suscripción`           |
| Cancelar suscripción                 | `Suscripción cancelada`        | `No se pudo cancelar`                         |
| Eliminar usuario                     | `Usuario eliminado`            | `No se pudo eliminar: {msg}`                  |
| Reenviar verificación                | `Email de verificación enviado`| `No se pudo enviar`                           |
| Generar link reset                   | `Link copiado al portapapeles` | `No se pudo generar el link`                  |
| Forzar logout                        | `Sesiones cerradas`            | `No se pudo cerrar sesiones`                  |
| Exportar CSV                         | `CSV descargado`               | `No se pudo generar el CSV`                   |

## Navegación

Rutas a registrar en `src/App.tsx` (anidadas bajo `<RequireAdmin />`):

```tsx
<Route path="/admin" element={<AdminShell />}>
  <Route index element={<Dashboard />} />
  <Route path="pending" element={<Pending />} />
  <Route path="users" element={<Users />} />
  <Route path="users/:id" element={<UserDetail />} />
  <Route path="subscriptions" element={<Subscriptions />} />
  <Route path="activity" element={<Activity />} />
</Route>
```

## Atajos de teclado (nice-to-have, fase 2)

- `⌘K` / `Ctrl K` → abrir command palette de búsqueda global
- `g d` → ir a Resumen
- `g u` → ir a Usuarios
- `g p` → ir a Pendientes
- `?` → cheatsheet flotante

## Persistencia de UI

`localStorage`:

- `forma-theme` — `"light" | "dark"` (toggle de la topbar)
- `forma-admin-users-filters` — last set de filtros de Usuarios (opcional)
- `forma-admin-subs-filters` — idem suscripciones (opcional)

## Accesibilidad

- Todos los íconos-solo-botón deben tener `aria-label` o `<Tooltip>`
- Tabs implementadas con shadcn `<Tabs>` ya manejan ARIA
- Modales con shadcn `<Dialog>` también
- Color del foco: ya usa `--ring`; no overridear

## Responsive

No es prioridad — el admin es desktop-first. Pero:

- Por debajo de `lg` (1024px), colapsar el sidebar a íconos (`w-14`)
- Por debajo de `md` (768px), no soportar — mostrar mensaje
  "El panel está pensado para escritorio. Abrilo desde una pantalla más
  grande." (o no hacer nada; queda a discreción)
