# Handoff — Rediseño de auth (TR-Fit / tr-fit-web)

## Overview

Rediseño de **la pantalla de login del dashboard admin** de `tr-fit-web`,
alineada al lenguaje TR-Fit que ya quedó establecido en el rediseño del
admin (ver `design_handoff_admin_redesign/` si todavía no se implementó
— ese paquete es prerequisito de este).

**Alcance: sólo `/login`.** No hay signup, ni forgot/reset, ni cuenta
pendiente. El sistema arranca con dos usuarios fijos creados a mano:

- 1 admin: `tatoroblesfit@gmail.com`
- 1 superadmin (creado via script)

Sin self-service. Si alguien olvida la contraseña, un superadmin la
resetea manualmente en DB.

Estado actual del frontend: `frontend/src/pages/Login.tsx` — un card
básico de shadcn centrado. El rediseño lo reemplaza por un layout
split-screen (brand panel a la izquierda + formulario a la derecha).

## About the design files

Los archivos en `design/` son **prototipos HTML + React (Babel inline)**.
Muestran el look final, **pero no son producción**. La tarea es
recrearlos en el stack del repo (`tr-fit-web/frontend`):

- React 19 + Vite + TypeScript
- Tailwind v4 (con tokens en `src/index.css`)
- shadcn/ui
- React Router v6
- TanStack Query + Axios (`src/lib/api.ts`)
- Lucide React
- Sonner para toasts
- `react-hook-form` + `zod` para validación

> El prototipo todavía contiene pantallas de signup/forgot/verify/pending
> — ignoralas. Spec actual = sólo login.

## Prerequisito

Este handoff **asume que `design_handoff_admin_redesign/` ya está
aplicado** — específicamente:

- El token `--brand` ya está en `src/index.css`
- Las fuentes Inter + JetBrains Mono ya están importadas
- Las clases utilitarias `.eyebrow`, `.num`, etc. ya existen
- La variante `brand` de `<Button>` ya está agregada
- Las variantes `brand`, `warning`, `muted` de `<Badge>` ya están

Si todavía no, **leé y aplicá primero `TOKENS.md` del otro paquete** —
acá no se repiten.

## Fidelity

**Hi-fi.** El prototipo está a escala 1:1 con colores, tipografía,
espaciado, transiciones e interacciones finales.

## Tono y copy

- **Voseo** rioplatense en todo (`creá`, `iniciá`, `verificá`)
- Sin emoji, sin signos de exclamación
- Números siempre `font-mono tabular-nums`
- Mensajes de error tienen que ser **concretos**, no genéricos
  (`Email o contraseña incorrectos` mejor que `No se pudo iniciar sesión`)
- Mantener consistencia con los mensajes que ya devuelve el backend
  (ver `Login.tsx` actual y `INTERACTIONS.md`)

## Files in this bundle

```
design/
├── TR-Fit Auth.html             ← raíz del prototipo (ignorar pantallas no-login)
└── admin/                       ← reusa estilos del rediseño de admin
    ├── forma-tokens.css         ← tokens TR-Fit (ya aplicados al repo en el otro handoff)
    ├── forma-admin.css          ← utilidades reusadas
    ├── forma-auth.css           ← utilidades específicas de auth
    ├── icons.jsx                ← íconos Lucide usados
    ├── auth.jsx                 ← pantallas del prototipo (sólo importa la de login)
    └── tweaks-panel.jsx         ← (sólo para el prototipo, ignorar)
```

Y junto al `README`:

- `SCREENS.md` — descripción detallada del login
- `INTERACTIONS.md` — endpoints, errores y validación
- `IMPLEMENTATION.md` — checklist en fases
- `PROMPT.md` — prompt listo para pegar en Claude Code

## Quick start

1. Abrí `design/TR-Fit Auth.html` en un navegador para ver el look
2. Leé `SCREENS.md` y `INTERACTIONS.md`
3. Seguí `IMPLEMENTATION.md` en orden
