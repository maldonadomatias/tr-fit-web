# Tokens

El stack ya usa shadcn/ui con tokens en `src/index.css` (OKLCH). El rediseño
**reutiliza todos los tokens existentes** y agrega **uno solo**: el acento
`--brand` (emerald) de FORMA, más una familia mono para números.

## 1. Agregar al `:root` en `src/index.css`

```css
:root {
  /* …tokens existentes intactos… */

  /* Brand emerald — usado para eyebrows, badges activos, dots de pending,
     completed-state, donut arc, "Activa" tag, accent rail del nav activo. */
  --brand: oklch(0.65 0.18 152);            /* emerald, light */
  --brand-foreground: oklch(0.98 0 0);

  /* Tipografía */
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas,
               'Liberation Mono', monospace;
}

.dark {
  /* …tokens existentes intactos… */
  --brand: oklch(0.72 0.17 152);            /* emerald, dark */
  --brand-foreground: oklch(0.20 0 0);
}
```

## 2. Exponer `--brand` como utilidad Tailwind

En el bloque `@theme inline { ... }` de `src/index.css`, agregar:

```css
@theme inline {
  /* …mapeos existentes… */
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}
```

Eso habilita `text-brand`, `bg-brand`, `border-brand`, `bg-brand/15`,
`font-mono`, `font-sans` en Tailwind v4.

## 3. Importar fuentes

En `frontend/index.html`, dentro del `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
/>
```

Y aplicar globalmente en `body` (Tailwind ya lo hace via `--font-sans`).
Para los **números**, usar `font-mono tabular-nums` en cada lugar — no aplicar
mono al `body`.

## 4. Equivalencias HTML prototipo → Tailwind

El prototipo usa una capa `forma-admin.css` con utilidades manuales.
Esto es la traducción a clases shadcn/Tailwind:

| Prototipo                          | Tailwind / shadcn                                                |
| ---------------------------------- | ---------------------------------------------------------------- |
| `.eyebrow.brand`                   | `text-[10px] font-semibold tracking-[0.22em] uppercase text-brand` |
| `.eyebrow.muted`                   | `text-[10px] font-semibold tracking-[0.22em] uppercase text-muted-foreground` |
| `.t-title`                         | `text-[22px] font-bold tracking-tight leading-7`                 |
| `.t-section`                       | `text-[17px] font-semibold tracking-tight`                       |
| `.num` / `.mono`                   | `font-mono tabular-nums font-semibold`                           |
| `.card`                            | `rounded-2xl border bg-card`                                     |
| `.card.muted`                      | `rounded-2xl border bg-muted/40`                                 |
| `.card-pad-lg`                     | `p-[22px]`                                                       |
| `.card-pad`                        | `p-[18px]`                                                       |
| `.btn-primary`                     | `<Button>` (variant default)                                     |
| `.btn-outline`                     | `<Button variant="outline">`                                     |
| `.btn-ghost`                       | `<Button variant="ghost">`                                       |
| `.btn-brand`                       | nuevo: ver más abajo                                             |
| `.btn-destructive`                 | `<Button variant="destructive">`                                 |
| `.badge.brand`                     | nuevo: `bg-brand/15 text-brand`                                  |
| `.badge.warning`                   | nuevo: `bg-amber-500/15 text-amber-700 dark:text-amber-400`      |
| `.seg`                             | `<Tabs>` con `inline-flex` y `bg-muted` — ver `SCREENS.md`       |
| `.tier.premium` / `.tier.full` / `.tier.basico` | nuevo componente `TierBadge` (font-mono pill)         |
| `.tabs` + `.tab.active`            | `<Tabs>` de shadcn (underline variant)                           |
| `.shell` grid                      | `grid grid-cols-[232px_1fr] grid-rows-[56px_1fr] min-h-screen`   |

## 5. Variantes nuevas de Button

Extender la `buttonVariants` cva en `src/components/ui/button.tsx`:

```ts
const buttonVariants = cva(
  /* base unchanged */,
  {
    variants: {
      variant: {
        // …existing variants…
        brand:
          'bg-brand text-brand-foreground shadow-sm hover:brightness-95',
      },
      // …existing sizes…
    },
  }
);
```

## 6. Componente Badge — agregar variantes brand y warning

Editar `src/components/ui/badge.tsx`:

```ts
const badgeVariants = cva(/* base */, {
  variants: {
    variant: {
      default:    'bg-primary text-primary-foreground',
      secondary:  'bg-secondary text-secondary-foreground',
      destructive:'bg-destructive/15 text-destructive',  // softer than current
      outline:    'border text-muted-foreground',
      brand:      'bg-brand/15 text-brand',              // new
      warning:    'bg-amber-500/15 text-amber-700 dark:text-amber-400', // new
      muted:      'bg-muted text-foreground',            // new
    },
  },
});
```

## 7. Radios y espaciado

Ya están bien:

- Cards: `rounded-2xl` (`--radius-xl` de shadcn = 14px; el prototipo usa 16px,
  podés bumpear `--radius` a `0.75rem` si querés más fiel — opcional)
- Inputs/botones: `rounded-md`
- Pills/badges: `rounded-full`
- Page padding: `px-6` (24px); contenido del shell: `p-7` (28px)

## 8. Shadows

- Cards: **sin shadow**, solo `border` — esto es regla dura del system
- Buttons: `shadow-sm` (default de shadcn ya lo tiene)
- Dialog: `shadow-2xl` (default de shadcn)
- **No agregar sombras a cards bajo ningún motivo.** Si el card necesita
  enfatizarse, usar `border-brand/40` + `bg-brand/4`.
