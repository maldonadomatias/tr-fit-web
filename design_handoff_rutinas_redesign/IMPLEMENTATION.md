# IMPLEMENTATION

Checklist ordenado para portar el prototipo al stack real
(`tr-fit-web/frontend`). Un commit por fase.
Formato del mensaje: `feat(admin/rutinas): <desc corta>`.

---

## Pre-flight

- [ ] Leer `README.md`, `SCREENS.md`, `INTERACTIONS.md` de este bundle.
- [ ] Leer `design_handoff_admin_redesign/TOKENS.md` (los tokens FORMA ya
      están aplicados ahí — esto reusa todo, sólo agrega componentes).
- [ ] Verificar deps:
      - `react-hotkeys-hook` en `package.json`. Si no está, agregarla.
      - `@radix-ui/react-popover` (shadcn ya lo trae con `popover`).
      - `cmdk` para el Command/Combobox de ejercicios.

---

## FASE 0 — Sidebar IA + rutas (preparación)

**Archivos**
- `frontend/src/components/admin/Sidebar.tsx`
- `frontend/src/App.tsx` (o donde se definan rutas admin)

**Cambios**

- [ ] En `Sidebar.tsx`:
  - Eliminar el grupo `'Operaciones'` entero (Home / Atletas / Skeletons /
    Alertas).
  - En grupo `'Panel'`, agregar item `Alertas` (icon `AlertCircle`,
    `to: '/admin/alerts'`) entre Pendientes y Actividad.
  - En grupo `'Gestión'`, agregar item `Rutinas` (icon `ClipboardList`,
    `to: '/admin/rutinas'`, count del hook `usePendingRutinas()` nuevo
    — temporal: alias del `usePendingSkeletons()` actual mientras dura
    el rename).
- [ ] En el router:
  - Mantener temporalmente `/admin/operations/skeletons` y
    `/admin/operations/skeletons/:id` como **redirects** a
    `/admin/rutinas` y `/admin/rutinas/:id` (`<Navigate to=… replace />`).
  - Redirect `/admin/operations/alerts` → `/admin/alerts`.
  - Eliminar `/admin/operations` y `/admin/operations/athletes(/:id)?`
    (verificar que no haya links).
- [ ] Confirmar que `AppShell.tsx` no se usa fuera de las rutas borradas.
      Marcar para deprecación en Fase 7.

**Commit**: `feat(admin/sidebar): nueva IA — Operaciones removido, Rutinas
en Gestión, Alertas en Panel`

---

## FASE 1 — Split-view shell

**Archivos nuevos**
- `frontend/src/pages/admin/Rutinas.tsx` (página, ruta `/admin/rutinas[/:id]`)
- `frontend/src/components/admin/rutinas/ListPane.tsx`
- `frontend/src/components/admin/rutinas/ListRow.tsx`
- `frontend/src/components/admin/rutinas/ListFilters.tsx`

**Tareas**

- [ ] Layout `<Rutinas>` con grid `[340px_1fr]` adentro del `<AdminShell>`.
- [ ] `<ListPane>` con search debounced (`useDebounce`), 3 selects
      (`<Select>` de shadcn), filtros + orden persistidos en URL via
      `useSearchParams`.
- [ ] `<ListRow>` con dot status (4 variantes), nombre, meta `hace · NN%`,
      badge `Activa` o chevron. Auto-scroll programático (no
      `scrollIntoView`).
- [ ] Footer sticky `N pending · M hoy · avg 2m 14s`.
- [ ] Pane derecha: por ahora, embeber `SkeletonReview` actual con
      `useParams.id`. **NO refactorizar todavía.**
- [ ] Mock data (mientras backend no cambia): seguir leyendo
      `usePendingSkeletons()` pero mapear `skeleton.athlete_name` →
      `rutina.athlete.name`.

**Commit**: `feat(admin/rutinas): split-view shell + lista con filtros y
URL params`

---

## FASE 2 — Tabs detalle + Rationale + Footer

**Archivos nuevos**
- `frontend/src/components/admin/rutinas/DetailPane.tsx`
- `frontend/src/components/admin/rutinas/DetailHeader.tsx`
- `frontend/src/components/admin/rutinas/TabRutina.tsx`
- `frontend/src/components/admin/rutinas/TabContexto.tsx`
- `frontend/src/components/admin/rutinas/TabHistorial.tsx`
- `frontend/src/components/admin/rutinas/TabDiff.tsx`
- `frontend/src/components/admin/rutinas/RationaleCard.tsx`
- `frontend/src/components/admin/rutinas/ActionFooter.tsx`

**Tareas**

- [ ] `<DetailPane>` con header sticky 64px + `<Tabs>` shadcn (variant
      underline brand) + body scrolleable + `<ActionFooter>` sticky 72px.
- [ ] Las 4 tabs renderizan según el data shape de `useSkeleton(id)` actual
      (renombrar a `useRutina(id)` en Fase 6).
- [ ] `<RationaleCard>` collapsible con `useState(rationaleOpen)`. Default
      abierto.
- [ ] **Endpoints nuevos a contratar con backend** (si no existen):
      - `GET /api/rutinas/:id/history` → `{ prev_routines: [], sessions: [] }`
      - `GET /api/rutinas/:id/diff` → `{ days: [...] }` (vacío si es
        la primera rutina del atleta)
      - `GET /api/rutinas/last-approved` → `{ athlete_name, ago_label }`
        para el empty `Todo al día`.
      - Si alguno no existe: stub frontend con mock data realista +
        abrir issue.
- [ ] `<ActionFooter>` con 3 botones (Approve brand, Reject destructive
      outline, Skip ghost) + kbd hints.

**Commit**: `feat(admin/rutinas): tabs detalle (Rutina/Contexto/Historial/
Diff) + rationale + action footer`

---

## FASE 3 — Reject Modal tag-based

**Archivos nuevos**
- `frontend/src/components/admin/rutinas/RejectModal.tsx`

**Tareas**

- [ ] Dialog shadcn 560px max-width.
- [ ] Tag grid 6 grupos × 2 chips cada uno (toggle).
- [ ] Textarea libre opcional.
- [ ] Checkbox `Marcar como crítica`.
- [ ] Footer con contador `N motivos · ⌘↵ confirma` + Cancelar + Rechazar.
- [ ] Mutation `useRejectRutina` extiende payload con
      `{ reject_reasons: string[], detail?: string, critical: boolean }`.
- [ ] **Backend**: agregar columnas `reject_reasons jsonb`, `critical bool`
      a la tabla de regeneraciones (o pasarlas al prompt sin persistir si
      no hace falta auditoría — coordinar con backend).

**Commit**: `feat(admin/rutinas): reject modal tag-based con regeneración
prioritizada`

---

## FASE 4 — Edit in-place de slots

**Archivos nuevos**
- `frontend/src/components/admin/rutinas/EditSlotPopover.tsx`
- `frontend/src/lib/exercisesCatalog.ts` (stub si `/api/exercises` no existe)

**Tareas**

- [ ] `<Popover>` shadcn anclado al botón ✎ del slot row.
- [ ] Combobox de ejercicios con `<Command>` (cmdk). Si endpoint no
      existe, filtrar el catálogo local.
- [ ] Inputs Series, Reps (free-form), RIR + Textarea Notas.
- [ ] Estado `modifiedSlots: Record<slotId, ModifiedSlot>` en
      `<DetailPane>` (no context, no global).
- [ ] Reset al cambiar de `activeId`.
- [ ] En `approve()`, mandar `slot_overrides: [...]` en el payload.
- [ ] Banner `MODIFICADA POR ADMIN · N cambios` arriba del Tab Rutina.

**Commit**: `feat(admin/rutinas): edit in-place de slots con popover y
overrides en approve`

---

## FASE 5 — Atajos teclado + overlay help

**Archivos nuevos**
- `frontend/src/components/admin/rutinas/ShortcutsModal.tsx`
- `frontend/src/hooks/useRutinasHotkeys.ts`

**Tareas**

- [ ] `useRutinasHotkeys()` declara todos los atajos con
      `react-hotkeys-hook`. Acepta `{ disabled }` para bloquear cuando hay
      modal/popover abierto.
- [ ] `<ShortcutsModal>` con 3 secciones (Nav / Acciones / Confirmación).
      Trigger: tecla `?` o botón ⌨ en topbar.
- [ ] 409 auto-skip: en el `onError` de `useApproveRutina`, si status 409,
      `toast.info(...) + goToNext()`.
- [ ] Tab navigation con `1/2/3/4` (tab Diff disabled si no hay diff).

**Commit**: `feat(admin/rutinas): atajos de teclado + overlay help + 409
auto-skip`

---

## FASE 6 — Rename backend skeleton → rutina

**Migration SQL**
- `backend/db/migrations/00X_rename_skeletons_to_rutinas.sql`

```sql
ALTER TABLE skeletons RENAME TO rutinas;
ALTER TABLE rutina_slots RENAME COLUMN skeleton_id TO rutina_id;
-- (revisar todos los FKs y renombrarlos también)
```

**Backend routes**
- `backend/src/routes/rutinas.ts` (nuevo)
- Routes montadas en **ambos** `/api/skeletons*` y `/api/rutinas*`
  durante 1 release (alias temporal). Borrar `/api/skeletons*` en
  release siguiente.

**Frontend rename**
- [ ] `usePendingSkeletons` → `usePendingRutinas`
- [ ] `useSkeleton` → `useRutina`
- [ ] `useApproveSkeleton` → `useApproveRutina`
- [ ] `useRejectSkeleton` → `useRejectRutina`
- [ ] `SkeletonReviewTable` → `RutinaReviewTable`
- [ ] Type `Skeleton` → `Rutina` en `types/api.ts`
- [ ] **No tocar `components/ui/skeleton.tsx`** — es el loader de shadcn.
- [ ] Borrar `pages/coach/Skeletons.tsx` y
      `pages/coach/SkeletonReview.tsx`.

**Commit**: `refactor(rutinas): rename skeletons → rutinas en DB, API,
hooks y componentes`

---

## FASE 7 — Cleanup

- [ ] Borrar `frontend/src/components/AppShell.tsx` si no lo usa nadie.
- [ ] Borrar `frontend/src/pages/coach/*` huérfanos (verificar).
- [ ] Borrar `frontend/src/components/RequireSuperadmin.tsx` si no se usa.
- [ ] Quitar redirects de `/admin/operations/*` (Fase 0) tras 1 release.
- [ ] Quitar alias `/api/skeletons*` tras 1 release.
- [ ] Borrar `frontend/src/hooks/useAdminUsers.ts` no — ese se queda;
      solo borrar referencias a "skeletons" si quedan.

**Commit**: `chore(admin): cleanup post rutinas rename — AppShell, coach pages,
redirects temporales`

---

## QA antes del PR final

- [ ] `npm run lint` sin warnings.
- [ ] `npm run typecheck` (o `tsc --noEmit`) verde.
- [ ] Vitest verde (tests listados en `INTERACTIONS.md · 12`).
- [ ] Probar manual:
  - [ ] `J`/`K` navega.
  - [ ] `A` aprueba + toast + pasa a siguiente.
  - [ ] `R` abre modal, sin tags submit está disabled.
  - [ ] `⌘+Enter` en modal de reject confirma.
  - [ ] `Esc` cierra modal/popover.
  - [ ] `1`/`2`/`3`/`4` cambia tab; `4` deshabilitado si no hay diff.
  - [ ] Edit slot suma `MODIFICADA POR ADMIN` y marca el row amber.
  - [ ] 409 simulado (rechazar la misma rutina dos veces en 2 tabs):
        toast + auto-skip.
  - [ ] Reload con URL `/admin/rutinas/rt-001?status=pending&order=conf`
        recupera vista exacta.
  - [ ] Empty state se ve cuando no hay nada pending.
- [ ] GIF de approve+skip+reject en el PR (asciinema o similar).

---

## Endpoints backend — resumen

| Método | Path | Status | Notas |
|---|---|---|---|
| GET | `/api/rutinas/pending` | existe (rename de `/skeletons/pending`) | acepta `?status=&conf=&order=&q=` |
| GET | `/api/rutinas/:id` | existe (rename) | igual shape, devuelve `routine`, `rationale`, `confidence` |
| POST | `/api/rutinas/:id/approve` | extender | acepta `{ slot_overrides: [] }` |
| POST | `/api/rutinas/:id/reject` | extender | acepta `{ reject_reasons[], detail?, critical }` |
| GET | `/api/rutinas/:id/history` | **NUEVO** | `{ prev_routines: [], sessions: [] }` |
| GET | `/api/rutinas/:id/diff` | **NUEVO** | `{ days: [...] }`, vacío si primera rutina |
| GET | `/api/rutinas/last-approved` | **NUEVO** | `{ athlete_name, ago_label }` para empty |
| GET | `/api/exercises?q=` | opcional | si no, stub frontend |

---

## Notas finales

- El prototipo HTML es referencia visual + comportamiento. No copiar JSX
  literal — el stack real usa shadcn primitives.
- Cualquier ambigüedad: priorizar **reglas del design system** (border-only
  cards, mono para números, eyebrows uppercase 0.22em, brand sólo para
  approve/active/dot pending).
- Si encontrás un caso que el spec no cubre, abrir issue antes de
  inventar — el dueño del producto prefiere preguntar.
