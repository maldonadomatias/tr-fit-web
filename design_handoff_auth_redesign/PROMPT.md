# Prompt para Claude Code

Copialo y pegalo en una sesión de Claude Code parada en el root de
`tr-fit-web`. Asegurate de que `design_handoff_auth_redesign/` esté
descomprimido en la raíz del repo antes de pegar esto.

---

```
Necesito que rediseñes la pantalla de login de este repo siguiendo el
handoff en `design_handoff_auth_redesign/`.

CONTEXTO
- Stack: React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, React
  Router v6, TanStack Query + Axios, Lucide React, sonner, react-hook-form,
  zod. Backend Express/Postgres.
- Alcance: SÓLO `/login`. No hay signup, ni forgot/reset, ni cuenta
  pendiente. El sistema tiene exactamente 2 usuarios fijos (1 admin +
  1 superadmin). Si alguien olvida la contraseña, superadmin la
  resetea manual en DB.
- Hoy `frontend/src/pages/Login.tsx` es un card básico de shadcn. El
  rediseño lo reemplaza por un layout split-screen (brand panel a la
  izquierda, formulario a la derecha) consistente con el lenguaje
  TR-Fit establecido en el rediseño del admin
  (`design_handoff_admin_redesign/`).

PREREQUISITO
- Este handoff asume que `design_handoff_admin_redesign/` YA ESTÁ
  aplicado (tokens, fuentes Inter + JetBrains Mono, variante `brand`
  de Button, variantes `brand/warning/muted` de Badge). Si no está,
  empezá por la Fase 0 del otro paquete.

QUE TENÉS QUE HACER
1. Leé en orden:
   - `design_handoff_auth_redesign/README.md`
   - `design_handoff_auth_redesign/SCREENS.md`
   - `design_handoff_auth_redesign/INTERACTIONS.md`
   - `design_handoff_auth_redesign/IMPLEMENTATION.md`
2. Abrí `design_handoff_auth_redesign/design/TR-Fit Auth.html` (mirá
   sólo la variante login — ignorá signup/forgot/verify/pending) y los
   archivos en `design/admin/auth.jsx` + `forma-auth.css` como
   referencia visual pixel-a-pixel.
3. Implementá en fases siguiendo `IMPLEMENTATION.md`. Un commit por
   fase.

REGLAS NO NEGOCIABLES
- Sin shadows en cards. Sólo border.
- Números siempre `font-mono tabular-nums` (emails, fechas, contadores).
- Eyebrows uppercase + `tracking-[0.22em]`, nunca title case.
- Idioma: castellano rioplatense (voseo). Sin emoji. Sin signos de
  exclamación.
- Errores inline dentro del form (`<AuthAlert>`), no toasts. Toasts
  sólo para confirmaciones asincrónicas externas al form.
- Brand color = acción primaria (Iniciar sesión).
- Validación con react-hook-form + zod, schema en
  `lib/auth-schemas.ts`.
- Mapping de errores backend → mensaje user en `lib/auth-errors.ts`
  (helper `authErrorMessage()`).

ANTES DE EMPEZAR
- Confirmá que entendiste leyendo los 4 .md y mostrame un plan corto
  (archivos a tocar/crear, en qué orden).
- Después arrancá por la Fase 0.
```

---

## Notas para vos (no para el prompt)

- El manifesto y stats del brand panel hoy son texto estático. Si
  querés stats vivos ("312 atletas activos") hay que exponer un
  endpoint público `GET /public/stats`. Si no, dejá los números
  hardcoded o sacalos.

- El prototipo HTML todavía tiene pantallas de signup/forgot/verify/
  pending — ignoralas. El alcance se redujo a login-only después de
  decidir que sólo hay 2 usuarios fijos.
