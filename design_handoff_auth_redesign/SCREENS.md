# Pantalla — Login

Layout **split-screen** de dos columnas: **brand panel** a la izquierda
(decorativo, oscuro) y **form panel** a la derecha (funcional, neutro).

Referencias visuales: `design/admin/auth.jsx` (función `LoginScreen` +
`BrandPanel`) y `forma-auth.css`.

## Layout — `<AuthLayout>`

Crear `frontend/src/components/auth/AuthLayout.tsx`.

```
grid-template-columns: minmax(420px, 1fr) minmax(520px, 1fr);
min-height: 100vh;
```

A partir de `max-width: 980px`, colapsa a una columna (sólo se ve el
formulario; el brand panel se oculta).

### Brand panel (columna izquierda)

- Fondo: `oklch(0.18 0.02 152)` (emerald-black profundo)
- Texto: blanco / `white/65` para los sub
- Gradientes radiales **emerald** sutiles (uno desde abajo-centro, otro
  desde arriba-izquierda) — ver `.auth-brand::before`
- Grid pattern 56×56 con `opacity: 0.025` y mask radial — ver
  `.auth-brand::after`
- Padding: `40px`

Estructura vertical (flex column):

1. **Brand lockup** (top):
   - Square 36×36 `rounded-[10px] bg-brand` con ícono `Dumbbell` 20px
   - "TR-Fit" (font-extrabold, `tracking-[0.2em]`, 16px)
   - "Strength · ARG" (font-semibold, `tracking-[0.28em]`, 10px, color brand)
2. **Manifesto** (centro, `margin: auto`):
   - **Eyebrow brand** uppercase: "Consola operativa"
   - **Headline** 44px, line-height 1.05, letter-spacing -0.025em,
     font-bold: "Tu cockpit para *TR-Fit*." (la palabra `TR-Fit` envuelta
     en `<em>` no italic con `color: var(--brand)`)
   - **Sub** 15px, line-height 1.55, `text-white/65`, max-width 380px:
     "Aprobá altas, revisá suscripciones y mirá el pulso del negocio en
     un solo lugar."
3. **Stats footer** (bottom): tres stats horizontales (atletas activos,
   series 30d, PRs semana) separados con `border-t border-white/10`
   - Valores en `font-mono tabular-nums`, 22px, font-bold
   - Hardcodeados por ahora (`312` / `48.7K` / `126`). Cuando exista
     `GET /public/stats`, leerlos de ahí.

Bottom-right absoluto: **quote** con apertura `“` en mono color brand,
texto en `text-white/60` 12px, autoría en negrita blanca.

### Form panel (columna derecha)

- Fondo: `bg-background`
- Padding: `40px`
- Layout: flex column, center align, justify center
- Contenedor del form: `w-full max-w-[400px]`
- **Theme toggle** en `top-right` absoluto (32×32 `rounded-md` con border)
- **Footer** en `bottom-center` absoluto, 11px muted, con
  "TR-Fit · 2026 · Términos · Privacidad · Ayuda"

---

## Bloque reutilizable: `<AuthHeader>`

```
<div className="eyebrow text-brand">{eyebrow}</div>
<h2 className="text-[28px] font-bold tracking-tight leading-[1.1]">{title}</h2>
<p className="text-sm text-muted-foreground mt-1.5 mb-8">{sub}</p>
```

## Bloque reutilizable: `<AuthField>`

- Label (top): 12px font-semibold
- Input: `h-[42px]`, `font-mono tabular-nums`, `rounded-md`, border 1px
- Placeholder en `font-sans` (no mono) — usuario ve "vos@equipo.com" en
  sans, pero al tipear el texto pasa a mono
- Ícono a la izquierda (`Mail`, `Shield`) en `text-muted-foreground`
- Focus ring: `border-brand` + `shadow-[0_0_0_3px_oklch(0.65_0.18_152_/_0.15)]`
- Affix a la derecha (opcional): botón ghost para mostrar/ocultar
  password (`Eye` / `EyeOff`)

---

## Login — `/login`

**Reemplaza:** `frontend/src/pages/Login.tsx`.

### Header

```
EYEBROW    Iniciar sesión
TITLE      Bienvenido de vuelta
SUB        Entrá a tu consola para seguir donde lo dejaste.
```

### Campos

1. **Email** — type email, autoComplete email, autoCapitalize off
   - Ícono: `Mail`
2. **Password** — type password con toggle de ver/ocultar
   - Ícono: `Shield`

### Acciones

- CTA primario: `[Iniciar sesión →]` (full-width, `h-11`, `bg-brand`)

No hay "¿La olvidaste?" ni "Crear cuenta". El sistema sólo tiene dos
usuarios fijos (1 admin + 1 superadmin). Si alguien pierde la
contraseña, superadmin la resetea manual en DB.

### Errores

Inline arriba del primer campo, con ícono `AlertTriangle`:

- Si `invalid_credentials`: "Email o contraseña incorrectos"
- Si `blocked + email_not_verified`: "Verificá tu email antes de iniciar sesión"
- Si `blocked + not_approved`: "Tu cuenta está pendiente de aprobación"
- Si `blocked + rejected`: "Tu cuenta fue rechazada. Escribinos a hola@tr-fit.app"
- Si `rate_limited`: "Demasiados intentos. Esperá unos minutos."
- Si nada matchea: "No se pudo iniciar sesión"

> Reemplazá los `toast.error()` actuales por errores **inline** dentro
> del form (más visibles y no se pierden). Mantené el toast solo como
> fallback para errores que vienen de afuera del flujo de login.

---

## Componentes nuevos a crear

En `frontend/src/components/auth/`:

- `AuthLayout.tsx` — layout split (brand + form)
- `BrandPanel.tsx` — panel izquierdo decorativo
- `AuthHeader.tsx` — eyebrow + title + sub
- `AuthField.tsx` — wrapper de campo con label, ícono y affix
- `AuthAlert.tsx` — alert inline (variant: `destructive | info | warn`)

## shadcn components a usar

- `<Input>` — para los inputs (con `className` para los overrides)
- `<Button>` (variant `brand` ya creada en el handoff de admin)
- `<Label>`
