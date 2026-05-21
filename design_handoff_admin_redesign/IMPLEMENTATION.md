# Plan de implementación

Checklist ordenado por fases. Cada fase debería poder commitearse y
desplegarse sin romper nada. Pensado para Claude Code, en este orden.

## Fase 0 — Setup (no rompe nada)

- [ ] Importar fuentes en `frontend/index.html` (Inter + JetBrains Mono).
- [ ] Agregar tokens `--brand` / `--brand-foreground` / `--font-sans` / `--font-mono`
      a `frontend/src/index.css` (ver `TOKENS.md` §1, §2).
- [ ] Instalar componentes shadcn faltantes:
      ```
      pnpm dlx shadcn@latest add tooltip dropdown-menu toggle-group
      ```
- [ ] Extender variantes de `Button` (`brand`) en
      `frontend/src/components/ui/button.tsx` (ver `TOKENS.md` §5).
- [ ] Extender variantes de `Badge` (`brand`, `warning`, `muted`) en
      `frontend/src/components/ui/badge.tsx` (ver `TOKENS.md` §6).

Test manual: abrí cualquier pantalla actual del admin y nada debería
verse distinto.

## Fase 1 — Átomos compartidos

Crear `frontend/src/components/admin/` con:

- [ ] `Eyebrow.tsx`
- [ ] `Avatar.tsx` (toma `name`, genera iniciales)
- [ ] `RoleBadge.tsx` / `StatusBadge.tsx` / `TierBadge.tsx` / `SubStatusBadge.tsx`
- [ ] `Segmented.tsx` (toggle group estilizado con bg-muted)
- [ ] `PageHeader.tsx` (eyebrow + title + sub + actions)
- [ ] `Sparkline.tsx` (SVG line + área gradient)
- [ ] `Donut.tsx` (SVG donut con label central)
- [ ] `Timeline.tsx` + `TimelineItem.tsx`

Referencia: traducir 1-a-1 desde `design/admin/ui.jsx`.

## Fase 2 — Nuevo AdminShell

Reemplaza `frontend/src/components/AdminShell.tsx`.

- [ ] Crear `frontend/src/components/admin/Sidebar.tsx`
- [ ] Crear `frontend/src/components/admin/Topbar.tsx`
- [ ] Reescribir `AdminShell.tsx` con grid 232×56 + outlet
- [ ] Persistir tema en `localStorage("forma-theme")`, aplicar `.dark` en `<html>`
- [ ] Item activo del sidebar: `useLocation` + match prefijo,
      `bg-muted`, rail brand `-left-4`

Test: las pantallas existentes (Usuarios, Detalle) siguen funcionando
adentro del nuevo shell. Pendientes/Resumen/Suscripciones/Actividad aún
no existen.

## Fase 3 — Resumen (`/admin`)

- [ ] Backend: implementar `GET /admin/stats` (ver `INTERACTIONS.md`).
      Si todavía no es viable, mockear el endpoint con datos derivados
      en runtime.
- [ ] `hooks/useAdminStats.ts`
- [ ] `pages/admin/Dashboard.tsx` (página `/admin`)
- [ ] `components/admin/KpiCard.tsx` (con sparkline opcional)
- [ ] Sub-componentes inline: `PendingRow`, `TierBars`, bar-chart de altas
- [ ] Wirear botones de aprobar/rechazar de la snapshot a
      `useUpdateAdminUser(id, { status })`
- [ ] Toasts en todas las mutaciones

## Fase 4 — Pendientes (`/admin/pending`)

- [ ] `pages/admin/Pending.tsx`
- [ ] Card grande por usuario, layout descripto en `SCREENS.md` §2
- [ ] Filtro/orden simple: por antigüedad descendente
- [ ] Acción "Aprobar todos los athletes" → batch
      `Promise.all(athletes.map(u => updateUser(u.id, { status: 'approved' })))`
      con confirmación previa (`<ConfirmDialog>`)
- [ ] Badges "> 24 h" cuando `now - created_at > 24h`

## Fase 5 — Usuarios redesign (`/admin/users`)

Refactor de `pages/admin/Users.tsx`:

- [ ] Reemplazar el `<Input>` + grupo de buttons por:
      filter card con search + `<Segmented>` de status + `<Segmented>` de role
- [ ] Reemplazar la `<Table>` por el patrón con avatar+nombre+email,
      pills inline, dot pending, row hover.
- [ ] Empty state con botón "Limpiar filtros"
- [ ] Footer con contador + paginación deshabilitada (placeholder hasta
      que haya cursor server-side)

## Fase 6 — Detalle redesign (`/admin/users/:id`)

Refactor de `pages/admin/UserDetail.tsx`:

- [ ] Identity card con avatar xl + pills + acciones contextuales
- [ ] `<Tabs>` de shadcn — armar 5 tabs (Resumen, Estado, Suscripción,
      Actividad, Zona peligrosa)
- [ ] Migrar lógica de los 4 cards actuales:
  - "Estado de la cuenta" → tab "Estado"
  - "Suscripción" → tab "Suscripción"
  - "Zona peligrosa" → tab "Peligro"
  - el card de header desaparece (su contenido va al identity card)
- [ ] Plan picker: 3 cards con border-brand en seleccionado
- [ ] Mover el botón "Cancelar suscripción" al footer del card de edición
      (margin-right auto), no a un card aparte
- [ ] Tab "Resumen": KV de identidad + donut de engagement + atajos de soporte
- [ ] Tab "Actividad": reusar `<Timeline>` con `useActivityLog({ user_id: id })`

## Fase 7 — Suscripciones (`/admin/subscriptions`)

- [ ] `pages/admin/Subscriptions.tsx`
- [ ] 3 cards de breakdown (premium / full / básico) con
      precios de MercadoPago hardcodeados o consultados:
      `basico: 2500, full: 4500, premium: 7800` ARS/mes
- [ ] Tabla con cliente / plan / estado / próxima renovación / precio
- [ ] Click row → `/admin/users/:id` (mismo detalle, tab "Suscripción")
- [ ] Si extendés `useAdminUsers` con flags `subscription_tier` y
      `subscription_status`, podés evitar un endpoint nuevo

## Fase 8 — Actividad (`/admin/activity`)

- [ ] Backend: implementar `GET /admin/activity` (ver `INTERACTIONS.md`).
      Idealmente con tabla `admin_audit_log` ya populada por los handlers
      de mutación actuales.
- [ ] `hooks/useActivityLog.ts` (infinite query)
- [ ] `pages/admin/Activity.tsx`
- [ ] Agrupado por buckets `Hoy / Ayer / Esta semana / Anterior`
- [ ] Filtro segmented `Todo / Usuarios / Suscripciones / Auth`
- [ ] Botón "Exportar" → CSV de los eventos visibles

## Fase 9 — Polishing

- [ ] Tooltips en todos los icon-only buttons (Bell, theme toggle,
      MoreHorizontal en filas, Copy en ID)
- [ ] Empty states pulidos
- [ ] Skeleton loaders en lugar de "Cargando..."
- [ ] Atajos de teclado (opcional)
- [ ] Test E2E del happy path (Playwright o el que uses)

## Tabla de archivos a tocar

| Archivo                                                | Acción      |
|--------------------------------------------------------|-------------|
| `frontend/index.html`                                  | + fuentes   |
| `frontend/src/index.css`                               | + tokens    |
| `frontend/src/components/ui/button.tsx`                | + variante  |
| `frontend/src/components/ui/badge.tsx`                 | + variantes |
| `frontend/src/components/AdminShell.tsx`               | rewrite     |
| `frontend/src/components/admin/Sidebar.tsx`            | new         |
| `frontend/src/components/admin/Topbar.tsx`             | new         |
| `frontend/src/components/admin/*.tsx`                  | new (atoms) |
| `frontend/src/hooks/useAdminStats.ts`                  | new         |
| `frontend/src/hooks/useActivityLog.ts`                 | new         |
| `frontend/src/pages/admin/Dashboard.tsx`               | new         |
| `frontend/src/pages/admin/Pending.tsx`                 | new         |
| `frontend/src/pages/admin/Subscriptions.tsx`           | new         |
| `frontend/src/pages/admin/Activity.tsx`                | new         |
| `frontend/src/pages/admin/Users.tsx`                   | rewrite     |
| `frontend/src/pages/admin/UserDetail.tsx`              | rewrite     |
| `frontend/src/App.tsx`                                 | + rutas     |
| `frontend/src/types/api.ts`                            | + tipos     |
| `backend/src/routes/admin/*`                           | + stats, activity |

## Reglas no negociables

1. **No agregar shadows a cards.** Solo `border`.
2. **Números siempre `font-mono tabular-nums`** (emails, ids, fechas,
   precios, conteos, deltas).
3. **Eyebrows uppercase + `tracking-[0.22em]`**, nunca title-case.
4. **Voseo en todos los strings nuevos.** Sin signos de exclamación.
5. **El verde brand es un acento, no un fondo.** Usalo para CTAs de
   compromiso (Aprobar, Activar), eyebrows, badges activos, dot pending.
   Los CTAs estándar siguen siendo `<Button>` default (primary near-black).
6. **Sin emoji.** Sin gradientes (excepto el sutil del sparkline).
7. **Mantener la API existente** (`useAdminUsers` etc.) — no romper sus
   contratos.

## Verificación visual

Para chequear paridad con el prototipo:

1. Abrí `design/FORMA Admin.html` en un browser local
2. Navegá entre las 6 pantallas
3. Toggleá entre light y dark
4. Compará side-by-side con tu implementación

Las pixels no tienen que ser exactos, pero el ritmo (espaciado, tipografía,
densidad) sí.
