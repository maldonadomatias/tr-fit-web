# Handoff — Rediseño Operaciones → **Rutinas** (FORMA / tr-fit-web)

## Overview

Convierte la review de "skeletons" (hoy una lista de cards + tabla básica)
en un **queue de review high-velocity** estilo Gmail / Linear:
**split-view 340 / flex**, atajos de teclado, tabs por contexto, edit
in-place de slots, reject tag-based y diff visual contra la rutina previa.

**Cambios estructurales**

1. **IA del sidebar.** Se elimina el grupo "Operaciones". Rutinas pasa a
   **Gestión**. Alertas sube a **Panel**. Las rutas se renombran:
   `/admin/operations/skeletons` → `/admin/rutinas`.
2. **Skeletons → Rutinas** en todo el frontend (label, hook, ruta, ícono
   `FileText` → `ClipboardList`).
3. **Pantalla nueva** `/admin/rutinas` y `/admin/rutinas/:id`, ambas
   resueltas dentro del mismo shell split-view (deeplinkeable, compartible
   con filtros en query params).
4. **Rename backend** (Fase 6, no bloqueante): tabla `skeletons` → `rutinas`,
   endpoints `/api/skeletons*` → `/api/rutinas*` con alias temporal.

## About the design files

Los archivos en `design/` son **prototipos HTML + React (Babel inline)**.
**No son producción**: el dev recrea los componentes sobre el stack actual
de `tr-fit-web/frontend` (React 19 + Vite + shadcn + Tailwind v4).

El prototipo está a escala 1:1 con tokens FORMA. Es navegable end-to-end:
abre la lista, atajos `J`/`K` para moverse, `A` aprueba, `R` rechaza, `?`
muestra el cheatsheet de atajos. El edit popover y reject modal son
totalmente funcionales sobre estado local mockeado.

## Fidelity

**Hi-fi.** Layout, colores, tipografía, jerarquía, microinteracciones y
atajos son finales. Lo único que el prototipo NO simula es:
- Llamada real al backend (mock data en `rutinas/data.jsx`).
- Persistencia entre reloads (todo se resetea al refrescar).
- Conflicto 409 con otro admin (descripto en `INTERACTIONS.md`, listo para
  cablear).
- Toast de 30s con countdown real de regeneración (placeholder visual OK).

## Tono y copy

Castellano rioplatense, voseo. Idénticas reglas al handoff admin:
- Verbos `iniciá / registrate / actualizá`, nunca `inicia / regístrate`.
- Sin signos de exclamación. Separador `·` (U+00B7).
- Eyebrows uppercase + `tracking-[0.22em]`.
- Números siempre en mono + `tabular-nums`.
- Sin emoji. Glyphs ↑/↓ permitidos solo en weight-history.

Microcopy del prototipo, lista para copiar literal:

| Contexto | Copy |
|---|---|
| Header tab | `Pendientes de aprobación` |
| Eyebrow rutina | `RUTINA · RT-001` |
| Modified banner | `MODIFICADA POR ADMIN · 3 cambios` |
| Aprobar / Rechazar | `Aprobar (A)` / `Rechazar (R)` / `Skip (J)` |
| Reject modal | `Rechazar rutina · {nombre}` · `Elegí al menos un motivo. La IA usa los tags + detalle para regenerar.` |
| Reject submit | `Rechazar y regenerar` |
| Critical checkbox | `Marcar como crítica` · `Manda al frente de la cola de regeneración con prioridad alta.` |
| Toast approve | `Rutina aprobada · pasando a la siguiente` |
| Toast reject | `Regenerando rutina · ~30s` |
| Toast conflict | `Ya fue aprobada por otro admin · pasando a la siguiente` |
| Empty all-done | `Todo al día · Sin rutinas pendientes de revisar.` |
| Empty filter | `Sin resultados para los filtros activos · [Limpiar]` |
| Retry badge | `Reintento 2/3` |
| Critical row | `Manual` (cuando llega a 3/3) |

## Files in this bundle

```
design/
├── FORMA Rutinas.html                  ← raíz del prototipo
└── rutinas/
    ├── forma-tokens.css                ← tokens FORMA (copiados de admin)
    ├── forma-admin.css                 ← shell admin (sidebar, topbar, cards)
    ├── rutinas.css                     ← NUEVO: split-view, list rows, slots,
    │                                     popover, modals, diff, tag chips
    ├── icons.jsx                       ← Lucide subset + ClipboardList,
    │                                     Edit, Keyboard, ArrowRight,
    │                                     SkipForward, Sparkles, GitCompare…
    ├── data.jsx                        ← mock atletas, queue, slots, diff,
    │                                     historial, sesiones, reasons,
    │                                     catálogo de ejercicios
    ├── ui.jsx                          ← atoms: Btn, Eyebrow, ConfidenceBadge,
    │                                     StatusDot, MonoAvatar, Seg, Kbd
    ├── shell.jsx                       ← Sidebar nuevo + Topbar
    ├── list.jsx                        ← Panel izq 340px: search, filtros,
    │                                     orden, list rows, footer
    ├── detail.jsx                      ← Panel der: header sticky, 4 tabs,
    │                                     slot rows, rationale, action footer
    ├── modals.jsx                      ← RejectModal, ShortcutsModal,
    │                                     EditSlotPopover, Toast, EmptyAllDone
    ├── tweaks-panel.jsx                ← (copiado del admin)
    └── app.jsx                         ← Root + estado + atajos + tweaks
```

## Documentación

- **`README.md`** — este archivo
- **`SCREENS.md`** — descripción detallada del split-view, cada tab, todos
  los empty/loading/error states
- **`INTERACTIONS.md`** — atajos completos, comportamiento approve/reject/
  skip, 409 conflict flow, optimistic state, query params
- **`IMPLEMENTATION.md`** — checklist ordenado por las 7 fases del spec,
  con mapeo archivo-por-archivo al codebase de `tr-fit-web/frontend`

## Quick start para Claude Code

1. Leé este README, `IMPLEMENTATION.md`, `INTERACTIONS.md`.
2. Abrí `design/FORMA Rutinas.html` en un navegador. Probá:
   - `J` / `K` mueve en el queue.
   - `A` aprueba (sale toast), `R` abre reject, `?` muestra atajos.
   - `1` / `2` / `3` / `4` cambia tab.
   - Click ✎ en cualquier slot → popover edit.
3. Seguí `IMPLEMENTATION.md` fase por fase. Un commit por fase.

## Tweaks activos

El prototipo expone 5 tweaks vía el panel toggle del toolbar:

- **Tema** — claro / oscuro
- **Ancho lista** — 280 / 300 / 320 / 340 / 360 / 380 / 400 px (default 340)
- **Densidad lista** — cómoda (3 líneas) / densa (2 líneas)
- **Mostrar reintentos** — toggle del badge "Reintento N/3"
- **Rationale abierto** — toggle del default expand del card rationale

Use estos tweaks para validar trade-offs con el cliente antes de
codificar el componente final.
