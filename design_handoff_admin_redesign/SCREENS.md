# Pantallas

Una pantalla por sección. Para cada una:

- **Ruta**: la URL en React Router
- **Layout**: estructura
- **Componentes**: piezas clave y su comportamiento
- **Copy**: textos exactos (en voseo)
- **Data**: qué hooks/queries usar

Las medidas son en px (Tailwind: dividir por 4 → `space`). El prototipo de
referencia es `design/admin/page-*.jsx`.

---

## 0. AdminShell (todas las rutas `/admin/*`)

**Ref**: `design/admin/shell.jsx` + `forma-admin.css` (`.shell`, `.sidebar`, `.topbar`).

Reemplaza el actual `frontend/src/components/AdminShell.tsx`.

### Layout

```
grid-template-columns: 232px 1fr;
grid-template-rows: 56px 1fr;
min-height: 100vh;
background: hsl(var(--background) ~ canvas);
```

- **Sidebar** (col 1, rows 1–2): `bg-card`, `border-r`, `p-4`
- **Topbar** (col 2, row 1): `bg-card`, `border-b`, `h-14`, `px-6`
- **Main** (col 2, row 2): `overflow-auto`, `p-7`, contenido envuelto en
  `max-w-[1240px] mx-auto`

### Sidebar

1. **Brand lockup** — square `28×28` `bg-primary` con icono `Dumbbell`
   (Lucide, `size=16`, `stroke=2.5`), seguido de:
   - `FORMA` (font-weight 800, letter-spacing 0.28em)
   - `Admin · ARG` (texto chico muted)

2. **Nav agrupado** — tres secciones con labels uppercase:
   - **PANEL**: Resumen (`Home`), Pendientes (`Clock`) + count badge,
     Actividad (`Activity`)
   - **GESTIÓN**: Usuarios (`Users`), Suscripciones (`CreditCard`)
   - **SISTEMA**: Ajustes (`Settings`, marcado "pronto", disabled)

3. **Item activo** — `bg-muted`, `font-semibold`, **rail vertical de 2px**
   `bg-brand` posicionado `-left-4` (asoma por fuera del padding del nav),
   `top-2 bottom-2`, redondeado. El ícono del item activo es `text-brand`.

4. **Badge de conteo** — al lado de "Pendientes":
   - `ml-auto`, font-mono, tabular-nums, `text-[10px] font-bold`
   - `bg-brand/15 text-brand`, `px-1.5 py-0.5`, `rounded-full`

5. **Footer del sidebar** — `mt-auto`, divider arriba, contiene avatar +
   nombre/email + botón `LogOut` (ghost, 28×28).

### Topbar

De izquierda a derecha:

- **Breadcrumb**: `Usuarios / matias@…` (current en `text-foreground`
  `font-semibold`, separador `/` en `text-border`)
- **Search global** (centrada hacia la derecha, `w-80`):
  `bg-muted`, `rounded-md`, ícono `Search` 14px, placeholder
  `Buscar email, id, suscripción…`, `kbd` con `⌘K` a la derecha
- **Icon button toggle tema** — Sun/Moon 16px
- **Icon button Bell** con dot brand 6px si hay novedades

> El search no necesita ser funcional en esta fase (es visual). Podés cablearlo
> a un command palette con shadcn `command` más adelante.

### Dark mode

Mover el toggle a un `<DropdownMenu>` o dejarlo como icon-button toggle.
Persistir en `localStorage("forma-theme")` y aplicar `.dark` en `<html>`.

---

## 1. Resumen — `/admin`

**Ref**: `design/admin/page-dashboard.jsx`.

### PageHeader

```
EYEBROW   01 — PANEL
TITLE     Hola Tato, esto es lo que está pasando
SUB       Resumen del último mes · actualizado hace 4 min
ACTIONS   [Exportar (outline)]  [Nuevo usuario (primary, ícono Plus)]
```

Bordeada al pie con `border-b border-border pb-[18px] mb-[22px]`.

### Fila de KPIs (4 columnas, `gap-4`, `mb-6`)

Card `rounded-2xl border bg-card p-[18px]`, columna flex:

1. **Eyebrow + ícono** (muted)
2. **Valor** en font-mono, 28px, font-bold
3. Fila: delta (verde si ↑, rojo si ↓, `font-mono`) + subtítulo muted
4. **Sparkline** absolute bottom-right, opacidad 0.7 (SVG line + área
   gradient stop 18% → 0%)

KPIs:

- **Altas 30 d** — `47` · `+12%` · sparkline 30 puntos
- **Pendientes** — `4` · sub: `revisar cola →` (link). Card resaltado:
  `border-brand/40 bg-brand/4`
- **Suscripciones activas** — `18` · `+3` · sub: `de 27 atletas`
- **MRR estimado** — `$318.420` · `+7.4%` · sparkline mensual

### Fila secundaria (3 columnas, `gap-4`, `mb-6`)

- **Donut** "Email verificado" — `91%` etiqueta central, 96×96, stroke 9,
  trayectoria `var(--muted)`, arco `var(--brand)` rotado -90°. Al lado: texto
  `26 de 30` con comentario muted de 2 líneas.
- **Bar chart "Altas por día"** — barras finas (6px gap), altura 80px;
  últimas 3 en `bg-brand`, el resto en `bg-muted`.
- **Distribución por plan** — 3 filas (premium / full / básico) con
  badge de plan a la izquierda (70px), barra de progreso de 8px, número
  font-mono a la derecha (30px right-align). Footer: `2.1% churn · -0.3pp`
  + `Detalle →`.

### Split grid (1fr / 320px, `gap-[22px]`)

#### Cola de pendientes (izquierda)

Card con `card-head`:

- Eyebrow brand "ACCIÓN REQUERIDA"
- Title `Cola de pendientes`
- Action button outline: `Ver los 4 →`

Lista de `<PendingRow>`: cada fila `card-body` con `border-t`, contiene
avatar (brand), nombre/email/edad + tres botones xs (Rechazar outline,
Aprobar brand, ChevronRight ghost).

#### Actividad reciente (derecha)

Card con eyebrow muted "BITÁCORA" + título. Body: `<Timeline>` (ver más
abajo).

---

## 2. Pendientes — `/admin/pending`

**Ref**: `design/admin/page-pending.jsx`.

### PageHeader

```
EYEBROW   ACCIÓN REQUERIDA
TITLE     Cola de pendientes
SUB       4 usuarios esperando aprobación · ordenados por antigüedad
ACTIONS   [Actualizar (outline, RefreshCw)]  [Aprobar todos los athletes (primary)]
```

### Lista de `<PendingCard>`

Cada card `p-[18px]`, layout horizontal:

- Avatar `lg` (56×56), brand
- Centro: nombre (`t-section`), pills inline (RoleBadge, "Email sin
  verificar" si aplica, "> 24 h" destructive si aplica), línea muted con
  email/edad/id
- Derecha: `[Ver perfil (outline)] [Rechazar (outline)] [Aprobar (brand)]`

### Info banner al final

Card `muted`, con ícono `Info` y dos líneas de copy explicando la lógica
de aprobación (athletes automáticos / coaches+admins manuales).

---

## 3. Usuarios — `/admin/users` (redesign)

**Ref**: `design/admin/page-users.jsx`. Reemplaza `pages/admin/Users.tsx`.

### PageHeader

```
EYEBROW   02 — GESTIÓN
TITLE     Usuarios
SUB       {filtered} de {total} · todos los roles y estados
ACTIONS   [Exportar CSV] [Nuevo usuario (primary)]
```

### Barra de filtros (card pequeño)

`p-3` `flex items-center gap-3`:

1. **Input search** (`w-72`, ícono `Search` 14px) → bind a `search` state
2. **Separator vertical** 22px tall
3. **Segmented control** de estado: Todos / Pendientes / Aprobados /
   Rechazados — cada uno con count
4. **Separator**
5. **Segmented control** de rol: Cualquier rol / Atletas / Coaches / Admins
6. **Limpiar** (ghost, ml-auto)

El segmented control se hace con un wrapper `bg-muted rounded-md p-0.5`
y los items son `<button>` con clase condicional `bg-card shadow-sm` cuando
activos.

### Tabla

Headers en uppercase font-mono micro:
| Col   | Contenido                                                        |
|-------|------------------------------------------------------------------|
| 28px  | Dot brand si `pending`                                           |
| —     | Avatar + nombre + email (mono, "sin verificar" warning si aplica) |
| —     | RoleBadge                                                        |
| —     | StatusBadge (brand/warning/destructive con dot)                  |
| —     | TierBadge + SubStatusBadge inline, o `—` muted                   |
| —     | "Última sesión" muted mono (`hace X días` o `nunca`)             |
| right | "Alta" muted mono (formato `25 may`)                             |
| 60px  | Acciones row (visible solo en hover): MoreHorizontal             |

- Rows con `pending` tienen `bg-brand/4` y hover `bg-brand/8`
- Row hover normal: `bg-muted/35`
- Click en row → navigate `/admin/users/{id}`

Pie: contador + paginación (`Anterior` / `Siguiente`, disabled por ahora).

---

## 4. Detalle de usuario — `/admin/users/:id` (redesign)

**Ref**: `design/admin/page-user-detail.jsx`. Reemplaza
`pages/admin/UserDetail.tsx`.

### Back link

`[← Volver a usuarios]` (ghost button, sm).

### Identity card

Card grande (`p-[22px]`):

- Avatar **xl** (72×72, rounded-2xl, brand variant)
- Centro:
  - Eyebrow brand "DETALLE DE CUENTA"
  - Nombre `t-title`
  - Línea meta: email mono · MailCheck verificado / Mail sin verificar ·
    ID mono + botón copy · creado el {fecha}
  - Pills: RoleBadge, StatusBadge, TierBadge, SubStatusBadge
- Derecha:
  - Si **pending**: `[Rechazar (outline)] [Aprobar (brand)]`
  - Si no: `[Reenviar verificación (outline)] [Forzar logout (outline)]`
  - Debajo: `{n} sesiones · últimos 30 días` muted

### Tabs (shadcn `<Tabs>`, underline variant)

Items:
- **Resumen** (default)
- **Estado de la cuenta**
- **Suscripción**
- **Actividad** + count badge `12`
- **Zona peligrosa**

Cada tab activo tiene una línea `bg-brand` de 2px en el borde inferior,
posicionada `-bottom-px` y dentro de `[14px → -14px]` del label.

### Tab "Resumen"

Grid 1fr / 320px:

- Izquierda:
  - Card "Identidad" con `<dl>` key/value de 7 campos (Nombre, Email,
    Rol, Estado, Verificado, Creado, Última sesión). Etiquetas uppercase
    micro, valores en mono cuando son email/fechas.
  - Card "Suscripción" con plan + estado + próxima renovación inline,
    o "Sin suscripción activa" muted si no hay.
- Derecha:
  - Card muted "Engagement 30 d": donut 80×80 + lista de stats
    (Asistencia %, Racha días) en mono
  - Card "Soporte": tres botones outline full-width left-aligned con ícono:
    `[Reenviar email]`, `[Generar link de reseteo]`, `[Abrir como usuario]`

### Tab "Estado de la cuenta"

Card único `p-[22px]` con tres `<Field>`:

- **Estado** — segmented control: Aprobado / Pendiente / Rechazado
- **Rol** — segmented control: Atleta / Coach / Admin
- **Email verificado** — pill (brand/outline) + botón "Forzar verificación" o
  "Quitar verificación", con fecha de verificación si está activa

Footer con `border-t pt-4`: `[Descartar cambios] [Guardar (primary)]`

### Tab "Suscripción"

Dos cards apilados:

1. **Estado actual** — fila de stats horizontal con separadores verticales:
   Plan / Estado / Próxima renovación. A la derecha: `[Ver en MercadoPago]`
   outline.

2. **Editar suscripción** (o "Crear suscripción manual" si no hay):
   - **Plan** — grid de 3 cards seleccionables (max-width 540), cada uno
     con badge del tier + precio mono + descripción muted. El seleccionado
     toma `border-brand bg-brand/6`.
   - **Estado de pago** — segmented control: Activa / Pendiente / Pausada /
     Cancelada
   - Footer:
     - Izquierda (margin-right auto): `[Cancelar suscripción]` destructive,
       sólo si hay sub activa y no está cancelada
     - Derecha: `[Descartar] [Guardar cambios (primary)]`

### Tab "Actividad"

Card con `<Timeline>` de eventos del usuario (mock con 4 items).

### Tab "Zona peligrosa"

Card con `border-destructive/40`. Header con:
- Bloque 36×36 `bg-destructive/12 text-destructive rounded-lg` + ícono `AlertTriangle`
- Eyebrow + título en destructive

Tres `<DangerRow>`:
- Forzar logout en todos los dispositivos · `[Forzar logout]`
- Resetear contraseña · `[Generar link]`
- Eliminar usuario · `[Eliminar]` destructive → abre `<ConfirmDialog>` shadcn

### ConfirmDialog (delete)

Reutilizar `<Dialog>` de shadcn. Copy:
- Title: `¿Eliminar a {nombre}?`
- Body: `Acción irreversible. Borra {email} y todos sus datos asociados — perfil, sesiones, suscripciones, tokens.`
- Acciones: `[Cancelar (ghost)] [Eliminar definitivamente (destructive)]`

---

## 5. Suscripciones — `/admin/subscriptions` (nuevo)

**Ref**: `design/admin/page-subscriptions.jsx`.

### PageHeader

```
EYEBROW   03 — SUSCRIPCIONES
TITLE     Suscripciones
SUB       {n} activas · MRR estimado $X · churn 2.1%
ACTIONS   [Abrir en MercadoPago (outline, ExternalLink)]
```

### Cards de breakdown (3 columnas, `gap-4`, `mb-6`)

Uno por tier (premium, full, básico). Cada uno:
- Header: TierBadge a izquierda · precio `$X/mes` muted mono a derecha
- Cuerpo: número de activos en font-mono 28px
- Footer: pausadas/canceladas + contribución MRR mono

### Filtros (card pequeño)

Segmented control plan + segmented control estado + counter en `ml-auto`.

### Tabla

Cols: Cliente (avatar+nombre+email) / Plan / Estado / Próxima renovación /
Precio (right) / chevron. Click → user detail.

---

## 6. Actividad — `/admin/activity` (nuevo)

**Ref**: `design/admin/page-activity.jsx`.

### PageHeader

```
EYEBROW   04 — BITÁCORA
TITLE     Actividad del sistema
SUB       Eventos de admin, suscripciones y autenticación · últimos 7 días
ACTIONS   [Exportar] [Actualizar]
```

### Filtros

Segmented (`Todo / Usuarios / Suscripciones / Auth`) + input search a la
derecha (`ml-auto w-72`).

### Grupos por fecha

`Hoy` / `Ayer` / `Esta semana` — eyebrow muted antes de cada grupo,
seguido de un card que contiene el `<Timeline>` correspondiente.

---

## Componentes nuevos a crear

Para que esto se sienta consistente, conviene encapsular varios átomos en
`frontend/src/components/admin/`:

- `Eyebrow.tsx` — `<span>` con clases del eyebrow + prop `variant: "brand" | "muted"`
- `PageHeader.tsx` — eyebrow + title + sub + actions
- `KpiCard.tsx` — KPI con sparkline opcional
- `Sparkline.tsx` — SVG line + área gradient (props: `data`, `width`, `height`, `color`)
- `Donut.tsx` — SVG donut con label central (`value`, `size`, `stroke`, `label`, `sub`)
- `Timeline.tsx` + `TimelineItem.tsx` — vertical timeline con dot
- `StatusBadge.tsx` — wrapper sobre `<Badge>` con mapa `approved/pending/rejected → variant + label`
- `TierBadge.tsx` — pill mono con border, mapeada por tier
- `SubStatusBadge.tsx` — wrapper sobre `<Badge>` con mapa de estados de suscripción
- `RoleBadge.tsx` — `<Badge variant="muted">{label}</Badge>`
- `Segmented.tsx` — toggle group sobre `bg-muted` (opcionalmente `<ToggleGroup>` de shadcn)
- `DangerRow.tsx` — card row con título/descripción/acción para zona peligrosa
- `Avatar.tsx` — wrap del shadcn Avatar con prop `name` que genera iniciales
- `Topbar.tsx` y `Sidebar.tsx` — chrome del shell

## Componentes de shadcn a sumar

Probablemente no tengas instalados:

- `tooltip` — para botones con sólo ícono
- `dropdown-menu` — para el menú de fila en la tabla
- `command` — opcional para la búsqueda global `⌘K`
- `toggle-group` — para los segmented controls (alternativa a custom)

Instalar con tu CLI de shadcn:

```bash
pnpm dlx shadcn@latest add tooltip dropdown-menu command toggle-group
```
