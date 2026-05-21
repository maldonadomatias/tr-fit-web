# SCREENS

Descripción pantalla-por-pantalla del prototipo `FORMA Rutinas.html`.
Tokens y reglas FORMA aplicadas literal — no inventar nada nuevo.

---

## 0. Shell

**Sidebar** (`shell.jsx · Sidebar`)
Mismo chrome que `design_handoff_admin_redesign/`. Cambios IA:

| Grupo | Items |
|---|---|
| Panel | Resumen · **Pendientes** (badge usuarios) · **Alertas** · Actividad |
| Gestión | Usuarios · Suscripciones · **Rutinas** (badge rutinas pending) |
| Sistema | Ajustes (pronto) |

- "Pendientes" sigue contando **usuarios** esperando aprobación de cuenta.
- "Rutinas" cuenta **rutinas IA** esperando review.
- Item activo: `bg-muted`, font-semibold, ícono `text-brand`, rail vertical
  brand a la izq (`::before · left: -14px`).
- Soon items (`Ajustes`): `opacity: 0.6`, `cursor: not-allowed`, label
  "pronto" a la derecha.

**Topbar** (`shell.jsx · Topbar`)
- Crumb: `Gestión · Rutinas · Pendientes de aprobación`.
- Search global con `⌘K` hint (placeholder, no funcional en el prototipo).
- Icon buttons: `Keyboard` (abre overlay atajos), `Bell` (placeholder).

---

## 1. Split-view raíz · `/admin/rutinas[/:id]`

Layout grid: `[sidebar 232px] [topbar 56px / split-view]`. La main area se
reemplaza por `.rutinas-split` con `grid-template-columns: 340px 1fr`.
Altura `calc(100vh - 56px)`, sin scroll en el contenedor — cada panel
hace su propio scroll.

### 1.1 Lista (340px · `list.jsx · ListPane`)

**Header de filtros** (`.list-filters`, sticky):
- Search atleta, debounced 250ms (en el prototipo el debounce es instant
  para iterar más rápido).
- Estado: `Todos · Pending · Reintento`.
- Confidence: `Todas · ≥85 Alta · 70-85 Media · <70 Baja`.
- Orden: `Antigüedad (default, más vieja primero) · Confidence asc · A-Z`.

**Cuerpo** (`.list-rows`):
- Cada row: dot status (16px col) · nombre + meta línea · `Activa` badge o
  `>` chevron.
- Dot:
  · **Pending** — ring brand (`border 1.5px var(--brand-color)`).
  · **Active** (la fila seleccionada) — relleno brand sólido.
  · **Retry** — ring amber (`hsl(38 92% 50%)`).
  · **Critical** (retries ≥ 3) — relleno destructive.
- Meta línea: `hace Xh · NN%` en mono. Si retry, añade `· Reintento N/3`
  en amber. Si crítica, añade `· Manual` en destructive.
- Click → `setActiveId()` + push URL `/admin/rutinas/:id` (sin reload).
- Auto-scroll: si la row activa queda fuera del viewport del panel,
  scroll programático (no `scrollIntoView`).
- **Densidad** controlada por tweak `.list-rows.compact` reduce padding
  vertical de 12px → 8px y meta a 10px.

**Footer sticky** (`.list-footer`):
`<N> pending · <M> hoy · ⏱ avg 2m 14s`. Todo mono.

### 1.2 Detalle (flex-1 · `detail.jsx · DetailPane`)

#### Header sticky (`.detail-header`, 18px padding)
- Eyebrow brand: `RUTINA · RT-001`.
- Row principal: avatar monogram brand (40px) · nombre 19px bold · meta
  línea mono `32a · F · Intermedio · 4d/sem · Hipertrofia` ·
  ConfidenceBadge (high / med / low).
- Tercera línea: `Generada hace 2d · Equipo: Gimnasio completo · ⚠ Lumbar
  leve · 2024` (lesión visible siempre en header como aviso).

#### Tabs (`.detail-tabs`)
4 tabs subrayadas brand cuando activas. Cada tab tiene un `num-tag`
`<1>` `<2>` `<3>` `<4>` para reforzar los atajos numéricos.

#### Body scrolleable (`.detail-body`)
Cada tab renderiza su contenido; **el card Rationale aparece bajo TODAS
las tabs** (incluye Diff/Historial — es contexto persistente del review).

##### Tab 1 — Rutina
- Si hay slots modificados (en data o por admin), banner amber arriba:
  `✎ MODIFICADA POR ADMIN · N cambios`.
- Días agrupados con eyebrow:
  `[DÍA 1] EMPUJE                                   5 ejercicios`
  Donde `DÍA 1` es un `num-pill` mono y `EMPUJE` es eyebrow muted.
- Slot list: card border con rows divididos.
  · Row: `<nombre>` · `4 × 6-8 · RIR 2` (todo mono, sep `·`) · `✎` btn.
  · Slot modificado: `bg amber/4` + rail amber a la izq + en su data
    `modified: true` o el admin lo editó vía popover.

##### Tab 2 — Contexto
- Card "Perfil del atleta": `<dl class="detail-kv">` con Nivel, Objetivo,
  Edad (mono), Frecuencia (mono), Días (mono), Equipo, Lesiones.
- Card "Preferencias declaradas": lista con dot brand a la izq.
  Empty: "Sin preferencias declaradas en el perfil."

##### Tab 3 — Historial
- Card "Últimas rutinas aprobadas": 3 rows con `fecha mono · label ·
  duración mono · VER →` en brand.
- Card "Últimas 10 sesiones registradas": tabla con headers `FECHA`,
  `EJERCICIO`, `TOP PESO`, `RPE`, `RIR`. Header del card incluye
  `RPE prom · 8.3` como badge muted.
- Empty: empty state `Sin sesiones previas registradas`.

##### Tab 4 — Diff
- Solo se habilita si `rutina.diff?.length > 0`. Si no, el tab se
  renderiza disabled (opacity 0.4, cursor not-allowed).
- Leyenda arriba: `+` Agregado (brand) · `−` Removido (destructive) ·
  `↔` Modificado (amber).
- Cada día = una card con header `[DÍA N] EMPUJE · N cambios`.
- Rows tipo:
  - **added**: marker `+` brand, nombre normal, spec mono.
  - **removed**: marker `−` destructive, nombre tachado muted, spec mono.
  - **modified**: marker `↔` amber, nombre, line `antes mono tachado → 
    después mono`, opcional reason en italic muted.
- Empty si pero hay rutina previa: `Sin cambios estructurales`.

#### Rationale card (`.rationale`)
Collapsible. Default abierto. Head: `✨ RATIONALE IA · confidence · 87%`,
chevron rota al toggle. Body: parrafito de la IA (1-2 sentencias).

#### Action footer (`.action-footer`, sticky bottom 72px)
- `[X Rechazar (R)]` — outline destructive (no rojo sólido).
- `[⏭ Skip (J)]` — ghost.
- A la derecha: `[✓ Aprobar (A)]` — brand sólido emerald.
- Los kbd hints son píldoras transparentes dentro del botón (`.kbd-hint`).

---

## 2. Reject Modal (`modals.jsx · RejectModal`)

Trigger: botón Rechazar o tecla `R`.

Dialog 560px wide. Estructura:
1. **Head**: eyebrow brand `REJECT · REGENERAR`, título `Rechazar rutina ·
   <nombre>`, sub: explicación.
2. **Body**:
   - **Tag grid** 6 grupos: Volumen, Intensidad, Selección, Equipo,
     Lesión, Estructura. Cada grupo es un row con label uppercase a la
     izq + chips toggle a la derecha.
   - Chip default: outline gray. Activo: `bg brand/15 · text brand ·
     border brand/35` + check icon.
   - **Textarea libre** (opcional). Placeholder: ej concreto.
   - **Checkbox "Marcar como crítica"** — al activar, manda a IA con
     `critical: true`.
3. **Footer** muted bg:
   - Izq: contador mono `N motivos · ⌘ ↵ confirma`.
   - Der: `Cancelar` ghost, `Rechazar y regenerar` destructive (disabled
     hasta tener ≥1 tag).

Submit envía `{ reject_reasons: string[], detail?: string, critical: bool }`.
Pattern de keys: `"Volumen:Mucho"`, `"Lesión:Riesgo articular"`, etc.

---

## 3. Shortcuts Modal (`modals.jsx · ShortcutsModal`)

Trigger: tecla `?` o ícono keyboard en topbar.

Dialog 520px. 3 secciones con label eyebrow muted:

| Navegación | |
|---|---|
| `J` | Siguiente rutina del queue |
| `K` | Rutina anterior |
| `⌘ K` | Quick search |
| `Esc` | Cerrar modal / popover |

| Acciones | |
|---|---|
| `A` | Aprobar |
| `R` | Abrir modal reject |
| `E` | Editar primer slot (focus combobox) |
| `1` / `2` / `3` / `4` | Tabs Rutina / Contexto / Historial / Diff |

| Confirmación | |
|---|---|
| `⌘ ↵` | Confirmar en modal abierta |

Footer con disclaimer: los atajos se deshabilitan con modal/popover abiertos,
excepto `Esc` y `⌘ ↵`.

---

## 4. Edit Slot Popover (`modals.jsx · EditSlotPopover`)

Trigger: ✎ a la derecha de cualquier slot row.

Popover 360px, anclado debajo-derecha del botón ✎. Arrow apuntando al
trigger. Click fuera o `Esc` cierra.

Campos:
- **Ejercicio**: input con search icon + combobox debajo. Catálogo tira
  de `EXERCISES` (stub local con 30 ejercicios comunes etiquetados por
  músculo + equipo). En producción, debería tirar de `GET /api/exercises?q=`.
- **Series**: input number.
- **Reps**: input text (acepta "6-8", "8", "AMRAP").
- **RIR**: input number 0-5.
- **Notas (opcional)**: textarea 2 rows.
- Footer: `Cancelar` ghost, `Guardar` primary.

Guardar:
- **No regenera IA.** Sólo actualiza el slot en estado local.
- Suma 1 al contador `MODIFICADA POR ADMIN`.
- Pinta el row con `is-modified` (rail amber).
- El cambio se manda solo al backend en el `approve` final como override
  del slot.

---

## 5. Empty / Loading / Error

### 5.1 Empty all-done (lista vacía)
`EmptyAllDone` en el panel derecho (la lista se mantiene vacía con
"0 pending"). Centrado vertical, ícono `CheckCircle` 28px brand sobre
fondo brand/12. Texto `Todo al día · Sin rutinas pendientes de revisar.`
Sub mono `Última aprobada · hace 23min · Pedro M.` (datos de
`GET /api/rutinas/last-approved`). Botón `Ver historial` outline.

### 5.2 Empty filter (lista filtrada vacía)
Inline en `.list-rows`. Texto centrado muted + botón ghost `Limpiar`.
La pane derecha sigue mostrando la rutina activa o el empty all-done si
no hay ninguna.

### 5.3 Detail sin selección
Mismo bloque "Todo al día" centrado en la pane derecha. Sólo aparece si
el URL no tiene `:id` y el queue está vacío.

### 5.4 Loading lista
6 `list-row-skel` con shimmer (linear-gradient 1.4s loop).

### 5.5 Loading detalle
Skeleton blocks de header (avatar 40px + 2 líneas) + tabs (4 píldoras
24px) + 3 días × 4 slots stubeados.

### 5.6 Error fetch detalle
Card centrada en pane derecha: `Error cargando rutina · [Reintentar]`.
La lista sigue clickeable.

### 5.7 Conflict 409 (otra admin aprobó)
Toast `Ya fue aprobada por otro admin · pasando a la siguiente` + auto-skip
a `goToNext()`. Si era la última, cae en empty all-done.

---

## 6. Responsive

**Desktop ≥1024px**: `340 / flex` split-view.

**Tablet 768-1023px**: split colapsable. Lista se reduce a 280px. Si más
estrecho, lista se transforma en `<Sheet>` superior con trigger
`[N pendientes ▾]` en el topbar.

**Mobile <768px**: stack vertical. La lista oculta por default. Detail
ocupa full screen con back button (`<` ChevronLeft) en el detail-header.
Tap en back vuelve a la lista full-screen. Atajos de teclado ocultos
(no aplica overlay `?`).

Implementado en `rutinas.css` con `@media (max-width: 1023px / 767px)`.

---

## 7. Tokens reforzados

Reglas FORMA específicas usadas en este screen, ya en
`design_handoff_admin_redesign/TOKENS.md`:

- `font-mono tabular-nums` aplicado a: ids (`RT-001`), edades, días/sem,
  porcentajes (`87%`, `2m 14s`), series × reps × RIR, fechas (`2026-05-19`),
  pesos (`62.5 kg`), RPE/RIR (`8.2`), counters (`12 pending`), antigüedad
  relativa (`hace 2d`, `hace 12h`), confidence numérica, contador de
  modificaciones, atajos en kbd.
- **Eyebrows** brand: `RUTINA · RT-001`, `REJECT · REGENERAR`, `ATAJOS ·
  REVIEW QUEUE`. Muted: `DÍA 1`, `TRACCIÓN`, `RATIONALE IA`, `PERFIL DEL
  ATLETA`, `EJERCICIO`, `SERIES`, `REPS`, `RIR`, `NOTAS (OPCIONAL)`.
- **Cards**: border-only. Sin shadow en ninguna card. La única sombra
  del design es la del `dialog.scrim` y la del popover edit slot.
- **Brand color**: usado para aprobar, dot pending, badges activos,
  arc del confidence high, eyebrow brand, link "VER →", rail vertical
  active row, marker `+` del diff.
- **Amber**: solo modified slot, retry badge, marker `↔` diff. Nada más.
- **Destructive**: solo reject button border + diff removed marker +
  texto del row crítica. Nunca rojo sólido en cards.
