# Handoff — Rediseño del panel de admin (FORMA / tr-fit-web)

## Overview

Rediseño completo de las pantallas de admin de `tr-fit-web`. Pasa de un panel
mínimo de gestión de usuarios (sidebar + tabla) a un **cockpit operativo**
para Tato (admin único) con seis pantallas:

1. **Resumen** (`/admin`) — KPIs, snapshot de cola pendiente, actividad reciente
2. **Pendientes** (`/admin/pending`) — cola enfocada de aprobación
3. **Usuarios** (`/admin/users`) — tabla densa con filtros (redesign)
4. **Detalle de usuario** (`/admin/users/:id`) — header + tabs (redesign)
5. **Suscripciones** (`/admin/subscriptions`) — entidad propia, MRR/churn
6. **Actividad** (`/admin/activity`) — bitácora del sistema

Más una **AdminShell** nueva: sidebar con secciones (Panel / Gestión /
Sistema), badge de pendientes en vivo, topbar con breadcrumbs, búsqueda
global y toggle claro/oscuro.

## About the design files

Los archivos en `design/` son **prototipos HTML/React (Babel inline)** que
muestran la dirección visual e interactiva. **No son producción** — el trabajo
es recrearlos sobre el stack existente de `tr-fit-web/frontend`:

- React 19 + Vite + TypeScript
- Tailwind v4 (ya configurado en `src/index.css`)
- shadcn/ui (`src/components/ui/*` — ya hay `button`, `card`, `badge`,
  `dialog`, `table`, `tabs`, `input`, `label`, `form`, `avatar`, `separator`,
  `skeleton`, `sonner`, `textarea`)
- React Router v6
- TanStack Query
- Lucide React (íconos)
- `date-fns` (fechas)
- Axios (`src/lib/api.ts`)

**Mantené el design system actual de shadcn**; lo único nuevo en términos
de tokens es **un acento `--brand`** (emerald de FORMA). Todo lo demás
(neutros, espaciados, radios) ya está en `src/index.css`.

## Fidelity

**Hi-fi.** Los prototipos están a escala 1:1 con colores, tipografía,
espaciado e interacciones finales. El developer debe recrearlos
pixel-perfect usando shadcn/ui + Tailwind.

Las **funcionalidades hoy mockeadas** que hay que cablear al backend están
listadas en `IMPLEMENTATION.md`.

## Tono y copy

Todo en **castellano rioplatense, voseo** (consistente con la app móvil):
- Verbos `iniciá / registrate / actualizá`, nunca `inicia / regístrate / actualiza`
- Sin signos de exclamación
- **Eyebrows** uppercase + tracking ancho (`tracking-[0.22em]`), p. ej. `01 — PANEL`
- Separador de marca: punto medio `·` (`·` U+00B7), nunca el bullet `•`
- Números siempre con la fuente mono (JetBrains Mono), `tabular-nums`
- Sin emoji

## Files in this bundle

```
design/
├── FORMA Admin.html             ← raíz del prototipo
└── admin/
    ├── forma-tokens.css         ← tokens FORMA (color, type, spacing, radius)
    ├── forma-admin.css          ← utilidades de capa admin (shell, kpi, tabla…)
    ├── icons.jsx                ← íconos Lucide usados
    ├── data.jsx                 ← datos mock (USERS, KPI, ACTIVITY…)
    ├── ui.jsx                   ← átomos: Btn, Badge, Card, Donut, Sparkline…
    ├── shell.jsx                ← Sidebar + Topbar
    ├── page-dashboard.jsx       ← Resumen
    ├── page-pending.jsx         ← Pendientes
    ├── page-users.jsx           ← Lista de usuarios
    ├── page-user-detail.jsx     ← Detalle (tabs)
    ├── page-subscriptions.jsx   ← Suscripciones
    ├── page-activity.jsx        ← Actividad
    └── app.jsx                  ← Root + router interno + tweak claro/oscuro
```

Lee también:

- `TOKENS.md` — los tokens nuevos a agregar a `src/index.css`
- `SCREENS.md` — descripción detallada de cada pantalla
- `INTERACTIONS.md` — handlers, estados de carga/error y data fetching
- `IMPLEMENTATION.md` — checklist ordenado y mapeo a tu codebase actual

## Quick start para Claude Code

1. Lee este README, `TOKENS.md`, `SCREENS.md`, `INTERACTIONS.md`
2. Abrí `design/FORMA Admin.html` en un navegador para ver el prototipo
3. Seguí `IMPLEMENTATION.md` en orden — es un checklist en fases que
   minimiza commits rotos
