# Prompt para Claude Code

Copialo y pegalo en tu sesión de Claude Code parado en el root de
`tr-fit-web`. El folder `design_handoff_admin_redesign/` ya debería estar
dentro del repo (descomprimilo ahí).

---

```
Necesito que rediseñes el panel de admin de este repo siguiendo el
handoff que tengo en `design_handoff_admin_redesign/`.

CONTEXTO
- Stack: React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, React
  Router v6, TanStack Query, Lucide React. Backend Express/Postgres.
- El admin actual está en `frontend/src/components/AdminShell.tsx` y
  `frontend/src/pages/admin/*` y es muy básico (sólo lista + detalle de
  usuarios). El rediseño suma 4 pantallas nuevas (Resumen, Pendientes,
  Suscripciones, Actividad) y reescribe Usuarios y Detalle.
- El diseño está basado en el design system FORMA (neutro grayscale +
  un único acento emerald). El prototipo HTML está en
  `design_handoff_admin_redesign/design/`.

QUE TENÉS QUE HACER
1. Leer estos archivos en orden:
   - `design_handoff_admin_redesign/README.md`
   - `design_handoff_admin_redesign/TOKENS.md`
   - `design_handoff_admin_redesign/SCREENS.md`
   - `design_handoff_admin_redesign/INTERACTIONS.md`
   - `design_handoff_admin_redesign/IMPLEMENTATION.md`
2. Abrir `design_handoff_admin_redesign/design/FORMA Admin.html` y los
   archivos en `design/admin/` como referencia visual e interactiva
   pixel-a-pixel.
3. Implementar en fases siguiendo `IMPLEMENTATION.md`. Hacé un commit
   por fase con un nombre descriptivo.
4. Donde el backend todavía no tenga endpoints (`/admin/stats`,
   `/admin/activity`), proponer la implementación más simple posible y
   stubear el frontend para no bloquear.

REGLAS NO NEGOCIABLES (del design system)
- Cards: sólo border, NO shadows.
- Números (emails, ids, fechas, precios, conteos, deltas): siempre
  `font-mono tabular-nums`.
- Eyebrows: uppercase + `tracking-[0.22em]`, nunca title case.
- Idioma: castellano rioplatense (voseo). Sin emoji. Sin signos de
  exclamación. Separador `·` (middle dot), nunca bullet.
- El verde brand es un ACENTO: úsalo para CTAs de compromiso (Aprobar,
  Activar), eyebrows brand, badges activos, dot pending. Los CTAs
  estándar siguen siendo el primary near-black de shadcn.

ANTES DE EMPEZAR
- Confirmá que entendiste leyendo los 5 .md y mostrame un plan de
  ejecución corto (qué archivos vas a tocar/crear, en qué orden).
- Después arrancá por la Fase 0 de IMPLEMENTATION.md.
```

---

## Notas para vos (no para el prompt)

- Si Claude Code te pide aclaraciones, lo más probable es que quiera saber
  precios reales de los planes (hoy hardcodeo `basico: 2500 / full: 4500 /
  premium: 7800` ARS) — confirmáselo o pasale los reales.
- Las tablas `admin_audit_log` (para `/admin/activity`) y el endpoint
  `/admin/stats` no existen; va a tener que crearlos. Decile si querés
  saltearte eso y mockear primero.
- Si querés ver el prototipo sin descomprimir el handoff, abrí
  `FORMA Admin.html` directamente en este repo, todavía está.
