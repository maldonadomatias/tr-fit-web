# Interacciones, endpoints y validación

## Endpoint backend

### `POST /auth/login` (ya existe)

```ts
Request:  { email, password }
Success:  { accessToken, refreshToken, user: { id, email, role } }
Errors:   { error: 'invalid_credentials' }
          { error: 'blocked', reason: 'email_not_verified' | 'not_approved' | 'rejected' }
          { error: 'rate_limited' }
```

No se exponen otros endpoints de auth en este alcance. Sin signup, sin
forgot, sin reset, sin resend-verification.

---

## Validación (zod schema)

`frontend/src/lib/auth-schemas.ts`:

```ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

export type LoginValues = z.infer<typeof loginSchema>;
```

Usar con `react-hook-form` + `zodResolver` (ya están en `package.json`).

---

## Manejo de errores

### Patrón

El form tiene un estado local `error: string | null` que se muestra
como **`<AuthAlert variant="destructive">`** en la parte superior,
**encima** de los campos.

> No usar `toast.error()` para errores del propio form. Sí usarlo para
> eventos asincrónicos fuera del form.

### Mapping backend → mensaje user

Helper `frontend/src/lib/auth-errors.ts`:

```ts
import type { AxiosError } from 'axios';

type AuthErrorBody = { error?: string; reason?: string };

export function authErrorMessage(err: unknown): { message: string } {
  const e = err as AxiosError<AuthErrorBody>;
  const body = e.response?.data;

  switch (body?.error) {
    case 'invalid_credentials':
      return { message: 'Email o contraseña incorrectos' };
    case 'blocked':
      if (body.reason === 'email_not_verified')
        return { message: 'Verificá tu email antes de iniciar sesión' };
      if (body.reason === 'not_approved')
        return { message: 'Tu cuenta está pendiente de aprobación' };
      if (body.reason === 'rejected')
        return { message: 'Tu cuenta fue rechazada. Escribinos a hola@tr-fit.app' };
      return { message: 'Tu cuenta no puede iniciar sesión' };
    case 'rate_limited':
      return { message: 'Demasiados intentos. Esperá unos minutos.' };
    default:
      return { message: 'No se pudo iniciar sesión' };
  }
}
```

### Flujo de Login

```tsx
async function onSubmit(values: LoginValues) {
  setError(null);
  try {
    const user = await login(values.email, values.password);
    if (user.role === 'admin' || user.role === 'superadmin') {
      navigate('/admin');
    } else {
      clearAuth();
      setError('Esta cuenta no tiene acceso a la consola web.');
    }
  } catch (err) {
    const { message } = authErrorMessage(err);
    setError(message);
  }
}
```

---

## Estado del CTA

- Cuando `isSubmitting`: texto `"Iniciando..."`
- Cuando `disabled`: opacidad 0.5, cursor not-allowed
- Mantener width fijo para evitar layout shift

---

## Atajos de teclado

- `Enter` en cualquier campo → submit (default de `<form>`)

---

## Accesibilidad

- Inputs con `aria-invalid` cuando hay error de campo
- Alert inline con `role="alert"` y `aria-live="assertive"`
- Toggle ver/ocultar password: `aria-label="Mostrar contraseña"` /
  `aria-label="Ocultar contraseña"`

---

## Rutas a registrar en `App.tsx`

```tsx
<Route path="/login" element={<Login />} />
```

Una sola ruta pública. `/signup`, `/forgot-password`, `/verify-email`,
`/account-pending` **no existen**.

---

## Acceso al admin

El `Login.tsx` sólo deja entrar a roles `admin | superadmin`:

```ts
if (user.role === 'admin' || user.role === 'superadmin') {
  navigate('/admin');
} else {
  clearAuth();
  setError('Esta cuenta no tiene acceso a la consola web.');
}
```

Athletes no usan la web — sólo la app móvil.

Rate limits sugeridos en backend para login: 5/min por email + 20/min
por IP.
