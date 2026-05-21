# Plan de implementación

Checklist en fases. Una sola pantalla (login), pero conviene separar
átomos del rewrite.

## Fase 0 — Prerequisitos

- [ ] **Confirmar** que `design_handoff_admin_redesign/` ya está
      aplicado (al menos su Fase 0 — tokens, fuentes, variantes de
      Button/Badge). Si no, **aplicar primero** ese paquete.

## Fase 1 — Átomos compartidos

Crear `frontend/src/components/auth/`:

- [ ] `AuthLayout.tsx` — split grid + footer
- [ ] `BrandPanel.tsx` — columna izquierda decorativa
- [ ] `AuthHeader.tsx` — eyebrow + title + sub
- [ ] `AuthField.tsx` — wrapper con label + ícono + affix
- [ ] `AuthAlert.tsx` — alert inline destructive

## Fase 2 — Login redesign

Reemplaza `frontend/src/pages/Login.tsx`.

- [ ] Migrar a `react-hook-form` + `zodResolver(loginSchema)`
- [ ] Wrapear en `<AuthLayout>`
- [ ] Reemplazar `toast.error` por `<AuthAlert>` inline
- [ ] Usar el helper `authErrorMessage` (crear `lib/auth-errors.ts`)
- [ ] Crear `lib/auth-schemas.ts` con `loginSchema`

## Fase 3 — Polish

- [ ] Theme toggle en la esquina del form panel
- [ ] Footer con links Términos/Privacidad/Ayuda (apuntar a páginas
      reales o `#` por ahora)
- [ ] Stats del brand panel — opcional: fetchear stats reales del
      backend (`GET /public/stats`), o mantenerlos hardcoded
- [ ] Test E2E del happy path: login válido → /admin

---

## Tabla de archivos

| Archivo                                                     | Acción      |
|-------------------------------------------------------------|-------------|
| `frontend/src/components/auth/AuthLayout.tsx`               | new         |
| `frontend/src/components/auth/BrandPanel.tsx`               | new         |
| `frontend/src/components/auth/AuthHeader.tsx`               | new         |
| `frontend/src/components/auth/AuthField.tsx`                | new         |
| `frontend/src/components/auth/AuthAlert.tsx`                | new         |
| `frontend/src/lib/auth-schemas.ts`                          | new         |
| `frontend/src/lib/auth-errors.ts`                           | new         |
| `frontend/src/pages/Login.tsx`                              | rewrite     |

---

## Reglas no negociables (mismas que admin)

1. **Sin shadows** en cards. Sólo border.
2. **Números siempre `font-mono tabular-nums`** (emails, fechas, contadores).
3. **Eyebrows uppercase + `tracking-[0.22em]`**, nunca title case.
4. **Voseo**, sin emoji, sin signos de exclamación.
5. **Errores inline** dentro del form, no toasts.
6. **Brand color = compromiso.** Acción primaria (Iniciar sesión) es brand.
7. **El brand panel se oculta** debajo de 980px de viewport — el form
   ocupa todo. No es responsivo más allá de eso.

---

## Verificación

1. Levantá el frontend con `pnpm dev`
2. Navegá a `/login` y probá:
   - Credenciales válidas → redirige a `/admin`
   - Credenciales inválidas → alert inline "Email o contraseña incorrectos"
   - Sin email/password → validación de zod marca el campo
   - Cuenta `not_approved` / `rejected` / `not_verified` → alert con
     mensaje específico
3. Toggleá tema claro/oscuro
4. Comparalo side-by-side con `design/TR-Fit Auth.html` (variante login)
