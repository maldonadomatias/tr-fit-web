# Blueprint de autenticación con Node.js, Express y PostgreSQL

Esta guía explica cómo reproducir, en un proyecto distinto, el modelo de autenticación de TR Fit sin copiar sus reglas de negocio. El patrón central combina:

- contraseñas con hash lento;
- access tokens JWT de vida corta;
- refresh tokens opacos, rotativos y revocables;
- persistencia de sesiones en PostgreSQL;
- verificación de email y recuperación de contraseña de un solo uso;
- autenticación y autorización como capas separadas;
- validación de entradas, límites de intentos y respuestas anti-enumeración.

La implementación de referencia usa Node.js 20, Express, TypeScript, `pg`, `jsonwebtoken`, `bcrypt`, `zod` y `express-rate-limit`. Los conceptos sirven también para otros frameworks.

> Importante: esta no es una copia literal. Conserva los métodos de seguridad de TR Fit y endurece algunos puntos para un proyecto nuevo. En particular, un navegador debería recibir el refresh token en una cookie `HttpOnly` en vez de guardarlo en `localStorage`, y PostgreSQL debería validar correctamente el certificado TLS en producción.

## 1. Modelo mental

El sistema maneja tres credenciales diferentes:

| Credencial | Uso | Vida sugerida | Persistencia del servidor |
|---|---|---:|---|
| Contraseña | Demostrar identidad en login | Hasta que se cambie | Sólo hash lento (`bcrypt` o `Argon2id`) |
| Access token | Autorizar requests API | 10–15 minutos | No se persiste; se verifica la firma |
| Refresh token | Renovar la sesión | 30 días | Sólo SHA-256 del token, nunca el valor original |

Flujo general:

```text
Cliente                              API                         PostgreSQL
  |                                  |                              |
  | POST /auth/login                 |                              |
  | email + password --------------> | busca usuario                |
  |                                  | compara password hash        |
  |                                  | crea familia de sesión ----> |
  |                                  | guarda hash(refresh) ------> |
  | <------------- JWT + refresh ----|                              |
  |                                  |                              |
  | GET /recurso                     |                              |
  | Authorization: Bearer JWT -----> | firma + usuario + estado --> |
  | <---------------------- recurso -|                              |
  |                                  |                              |
  | POST /auth/refresh ------------> | bloquea token (FOR UPDATE)   |
  |                                  | revoca token anterior ------>|
  |                                  | inserta token nuevo -------->|
  | <--------- JWT + refresh nuevos -|                              |
```

El JWT permite autorizar rápido, pero no representa una sesión revocable por sí solo. La sesión real está en la familia de refresh tokens de PostgreSQL.

## 2. Qué pertenece a auth y qué pertenece al negocio

Conviene separar tres decisiones:

1. **Identidad:** ¿la contraseña es correcta y el email está verificado?
2. **Estado de cuenta:** ¿la cuenta existe y está habilitada?
3. **Permiso de negocio:** ¿el usuario puede ejecutar esta acción?

TR Fit agrega aprobación manual, membresías pagas y roles `athlete`, `admin` y `superadmin`. En otro sistema podrían ser `user`, `editor` y `owner`, o no existir membresías. No mezcles esas reglas dentro de la criptografía de tokens.

Una política genérica puede ser:

```ts
type UserStatus = 'pending' | 'active' | 'disabled';
type UserRole = 'user' | 'admin';
```

- `pending`: identidad creada, pero todavía no puede iniciar sesión;
- `active`: acceso normal;
- `disabled`: login, refresh y requests protegidos deben fallar;
- el rol define autorización, no si la contraseña es válida.

## 3. Componentes y responsabilidades

```text
src/
├── config/env.ts                 valida variables de entorno al arrancar
├── db/connect.ts                 crea y monitorea el pool de PostgreSQL
├── db/migrations/                esquema versionado
├── domain/auth.schemas.ts        valida payloads HTTP
├── middleware/auth.ts            autentica JWT y revalida al usuario
├── middleware/role.ts            aplica autorización por rol
├── middleware/rate-limit.ts      limita abuso por IP, email o user ID
├── routes/auth.ts                contrato HTTP y traducción de errores
├── services/auth.service.ts      casos de uso y transacciones
├── services/token.service.ts     genera, hashea y vence tokens
└── tests/                        unitarios + integración con PostgreSQL
```

Regla de separación:

- las rutas validan y traducen HTTP;
- el servicio implementa decisiones y transacciones;
- el middleware protege recursos;
- PostgreSQL impone unicidad, relaciones y consistencia;
- el cliente nunca decide si un usuario está autorizado.

## 4. Esquema PostgreSQL mínimo

Esta migración es un punto de partida reutilizable. Requiere `pgcrypto` para generar UUIDs.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'disabled')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La aplicación normaliza el email a lowercase. Este índice evita duplicados
-- incluso si una escritura futura omite esa normalización.
CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));
CREATE INDEX users_status_idx ON users(status);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES refresh_tokens(id),
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_active_idx
  ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_expires_idx
  ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX email_verifications_user_unused_idx
  ON email_verifications(user_id) WHERE used_at IS NULL;

CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_resets_user_unused_idx
  ON password_resets(user_id) WHERE used_at IS NULL;
```

### Por qué cada tabla existe

- `users` guarda identidad, estado y rol. Nunca guarda contraseñas en texto plano.
- `refresh_tokens` permite cerrar sesiones, rotarlas, registrar dispositivos y detectar reutilización.
- `email_verifications` guarda tokens de un solo uso para demostrar control del email.
- `password_resets` guarda OTPs hasheados, vencimiento y cantidad de intentos.
- `ON DELETE CASCADE` elimina credenciales derivadas cuando se elimina un usuario.

No uses una columna `refresh_token` dentro de `users`: un usuario puede tener varias sesiones y cada dispositivo necesita su propio ciclo de revocación.

## 5. Conexión segura a PostgreSQL

### Variables de entorno

```env
NODE_ENV=development
DATABASE_URL=postgres://app_user:replace_me@localhost:5432/app_db
DB_SSL=false
JWT_SECRET=replace_with_at_least_32_random_bytes
JWT_EXPIRES_IN=15m
JWT_ISSUER=my-api
JWT_AUDIENCE=my-client
```

Valida estas variables al iniciar. Un servicio no debería arrancar con un secreto vacío o una URL inválida.

```ts
import 'dotenv/config';
import { z } from 'zod';

export const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
}).parse(process.env);
```

### Pool

```ts
import pg from 'pg';
import { env } from '../config/env.js';

const ssl = env.DB_SSL === 'true'
  ? { rejectUnauthorized: true }
  : false;

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // En producción: logger estructurado + alerta. No imprimir credenciales.
  console.error('Unexpected PostgreSQL pool error', error);
});
```

En producción, usa el certificado CA indicado por tu proveedor si la plataforma lo requiere. Evita `rejectUnauthorized: false`: cifra el tráfico, pero no verifica correctamente la identidad del servidor.

### Guard obligatorio para tests

Los tests de integración suelen truncar tablas. Rechaza cualquier conexión de Jest a una base cuyo nombre no contenga `test`:

```ts
if (process.env.JEST_WORKER_ID !== undefined) {
  const dbName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests against database: ${dbName}`);
  }
}
```

Usa consultas parametrizadas (`$1`, `$2`) en todo el sistema. Nunca concatenes emails, IDs o tokens dentro del SQL.

## 6. Generación y almacenamiento de secretos

### Contraseñas

TR Fit usa `bcrypt` con costo 10. Para un sistema nuevo:

- usa `Argon2id` si el stack lo soporta bien;
- si mantienes `bcrypt`, calibra el costo en tu infraestructura y apunta aproximadamente a 100–250 ms por hash;
- acepta contraseñas largas, por ejemplo hasta 200 caracteres;
- aplica una longitud mínima razonable y permite gestores de contraseñas;
- nunca registres la contraseña ni su hash.

```ts
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12; // Calibrar, no copiar a ciegas.

export const hashPassword = (password: string) =>
  bcrypt.hash(password, BCRYPT_COST);

export const comparePassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);
```

Si el email no existe durante el login, ejecuta igualmente una comparación contra un hash dummy válido. Esto reduce diferencias de tiempo que podrían revelar qué emails están registrados.

### Tokens opacos

```ts
import crypto from 'node:crypto';

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 256 bits
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

El valor plano se entrega una sola vez al usuario. PostgreSQL recibe únicamente `hashOpaqueToken(token)`. Esto aplica a refresh tokens y links de verificación. Un dump de la base no debería convertirse directamente en sesiones utilizables.

Los OTPs de seis dígitos tienen poca entropía y deben usar un hash lento como `bcrypt`, además de vencimiento corto, límite de intentos y rate limit.

## 7. Registro y verificación de email

### Registro

1. Validar y normalizar el email.
2. Verificar unicidad, respaldada por un índice único.
3. Hashear la contraseña.
4. Dentro de una transacción:
   - insertar el usuario como no verificado;
   - generar un token aleatorio;
   - insertar sólo el SHA-256 del token con vencimiento de 24 horas.
5. Confirmar la transacción.
6. Enviar el email después del `COMMIT`.

El envío debe ocurrir después de confirmar la base. Si el proveedor de email falla, conserva la cuenta y permite reenviar la verificación. Para un sistema de alto volumen, usa un outbox transaccional y un worker.

### Verificación

Procesa el token dentro de una transacción:

```sql
SELECT id, user_id, expires_at, used_at
FROM email_verifications
WHERE token_hash = $1
FOR UPDATE;
```

Luego:

- rechazar si no existe, venció o ya fue usado;
- marcar `used_at = NOW()`;
- marcar `users.email_verified = TRUE` y `email_verified_at = NOW()`;
- confirmar todo junto.

`FOR UPDATE` evita que dos requests concurrentes consuman el mismo token.

## 8. Login y emisión de sesión

El orden recomendado es:

1. buscar el usuario por email normalizado;
2. comparar la contraseña, o hacer dummy compare si no existe;
3. verificar email;
4. verificar estado de cuenta;
5. aplicar reglas de acceso propias del negocio;
6. crear una familia de refresh tokens;
7. emitir el access token.

Cada login crea un `family_id` nuevo. Esa familia representa una sesión o dispositivo.

```ts
const familyId = crypto.randomUUID();
const refreshToken = generateOpaqueToken();

await pool.query(
  `INSERT INTO refresh_tokens
     (user_id, family_id, token_hash, expires_at, user_agent, ip_address)
   VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4, $5)`,
  [user.id, familyId, hashOpaqueToken(refreshToken), userAgent, ipAddress],
);
```

El JWT debería contener pocos claims:

```ts
const accessToken = jwt.sign(
  { sub: user.id },
  env.JWT_SECRET,
  {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
);
```

Para proyectos nuevos, consulta el rol actual desde PostgreSQL en el middleware. Si incluyes el rol en el JWT para ahorrar una lectura, un cambio de rol tardará hasta el vencimiento del access token en tener efecto.

### Respuesta HTTP

Con cliente web, la opción recomendada es:

- devolver el access token en el JSON;
- enviar el refresh token mediante cookie `HttpOnly`, `Secure`, `SameSite=Lax` o `Strict`;
- limitar el `Path` de la cookie a los endpoints de auth si la arquitectura lo permite;
- implementar defensa CSRF si el refresh se envía automáticamente por cookie.

```http
Set-Cookie: refresh_token=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth
Content-Type: application/json

{
  "accessToken": "<jwt>",
  "user": { "id": "...", "email": "...", "role": "user" }
}
```

Para una app móvil, guarda el refresh token en Keychain/Keystore mediante almacenamiento seguro. No uses almacenamiento plano.

TR Fit web guarda access y refresh tokens en `localStorage`. Es simple y el cliente implementa correctamente la rotación, pero un XSS podría leer ambos tokens. No copies esa parte en una aplicación web nueva si puedes usar cookies `HttpOnly`.

## 9. Rotación de refresh tokens y detección de reutilización

Ésta es la parte más importante del modelo de sesiones.

### Rotación normal

Si el cliente presenta el token A:

1. calcular `SHA-256(A)`;
2. abrir una transacción;
3. buscar el registro con `FOR UPDATE`;
4. comprobar que no esté vencido ni revocado;
5. revalidar usuario y estado de acceso;
6. generar token B;
7. insertar `hash(B)` con el mismo `family_id`;
8. marcar A como revocado y `replaced_by = B.id`;
9. confirmar;
10. devolver B y un JWT nuevo.

### Detección de reutilización

Si A ya fue rotado y vuelve a aparecer, puede haber sido robado. Revoca todos los tokens activos de la familia:

```sql
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE family_id = $1 AND revoked_at IS NULL;
```

El usuario deberá iniciar sesión otra vez en ese dispositivo.

### Transacción de referencia

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');

  const result = await client.query(
    `SELECT id, user_id, family_id, expires_at, revoked_at
       FROM refresh_tokens
      WHERE token_hash = $1
      FOR UPDATE`,
    [hashOpaqueToken(rawRefreshToken)],
  );

  const current = result.rows[0];
  if (!current) throw new RefreshError('invalid');

  if (current.revoked_at) {
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE family_id = $1 AND revoked_at IS NULL`,
      [current.family_id],
    );
    await client.query('COMMIT');
    throw new RefreshError('reuse_detected');
  }

  if (new Date(current.expires_at).getTime() <= Date.now()) {
    await client.query('COMMIT');
    throw new RefreshError('expired');
  }

  // Consultar el usuario aquí. Si fue eliminado o deshabilitado,
  // revocar la familia y rechazar el refresh.

  // Insertar el reemplazo y revocar el actual dentro de esta transacción.
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
}
```

Cuida el caso “usuario eliminado”: la consulta de usuario puede devolver cero filas. Trátalo como sesión inválida; no accedas a propiedades de un resultado inexistente.

### Concurrencia del cliente

Implementa un refresh de vuelo único: si cinco requests reciben 401 al mismo tiempo, todos deben esperar la misma promesa de renovación. De lo contrario, varios requests usarán el mismo refresh token y el servidor interpretará el segundo como reutilización.

En aplicaciones con varias pestañas, coordina también entre pestañas con `BroadcastChannel` o usa una estrategia de refresh idempotente con una ventana muy corta y cuidadosamente diseñada.

## 10. Middleware de autenticación

El middleware debe:

1. exigir `Authorization: Bearer <token>`;
2. verificar firma, algoritmo, expiración, issuer y audience;
3. extraer `sub`;
4. consultar el usuario actual por clave primaria;
5. rechazar usuarios eliminados o deshabilitados;
6. adjuntar a `req.user` el ID y rol obtenidos de la base.

```ts
export async function requireAuth(req, res, next) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const result = await pool.query(
      `SELECT id, role, status FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'invalid_token' });
    }

    req.user = { id: user.id, role: user.role };
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    return next(error);
  }
}
```

La lectura a PostgreSQL por request hace que una eliminación, deshabilitación o cambio de rol tenga efecto inmediato. Si el volumen no lo permite, usa access tokens muy cortos y un caché con invalidación explícita; no elimines la revalidación sin entender el período de exposición.

## 11. Autorización por rol

Autenticar responde “quién es”. Autorizar responde “qué puede hacer”.

```ts
export function requireRole(...allowedRoles: UserRole[]) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

router.get(
  '/admin/users',
  requireAuth,
  requireRole('admin'),
  listUsers,
);
```

El guard del frontend sólo mejora navegación y experiencia. La API debe repetir siempre la autorización real.

Para recursos pertenecientes a un usuario, el rol no alcanza. Comprueba también propiedad o alcance:

```sql
SELECT id FROM documents WHERE id = $1 AND owner_id = $2;
```

## 12. Logout, cierre forzado y cambio de contraseña

### Logout del dispositivo actual

Hashea el refresh token presentado y marca su fila como revocada. Responde `204` incluso si ya estaba revocado, para que la operación sea idempotente.

### Cerrar todas las sesiones

```sql
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id = $1 AND revoked_at IS NULL;
```

Úsalo en:

- cambio o recuperación de contraseña;
- deshabilitación de cuenta;
- acción “cerrar sesión en todos los dispositivos”;
- respuesta a un incidente.

Los access tokens ya emitidos seguirán vivos hasta 10–15 minutos, salvo que el middleware revalide un estado que ya fue deshabilitado.

## 13. Recuperación de contraseña con OTP

### Solicitud

`POST /auth/forgot-password` debe responder siempre el mismo `200`, exista o no la cuenta:

```json
{ "message": "if account exists, code sent" }
```

Esto evita enumerar usuarios. Si el email existe:

1. invalidar códigos anteriores sin usar;
2. generar un código criptográficamente aleatorio de seis dígitos;
3. guardarlo con `bcrypt`, vencimiento de 15 minutos y `attempts = 0`;
4. enviar el código por email;
5. no incluir el código en logs ni respuestas.

No uses `Math.random()` para generar el OTP.

### Verificación y consumo

- seleccionar el último código vigente con `FOR UPDATE`;
- comparar con `bcrypt.compare`;
- incrementar intentos si falla;
- invalidar al llegar, por ejemplo, a cinco intentos;
- consumirlo sólo durante el cambio efectivo de contraseña;
- hashear la contraseña nueva;
- revocar todos los refresh tokens;
- confirmar todo en una transacción.

Un endpoint previo de “verificar código” puede validar sin consumir, pero el endpoint final debe volver a verificarlo. Nunca confíes en que el cliente ya llamó al paso anterior.

## 14. Rate limiting y anti-abuso

Política de referencia basada en TR Fit:

| Operación | Ventana | Máximo | Clave sugerida |
|---|---:|---:|---|
| Login | 15 minutos | 10 | IP + email normalizado |
| Registro | 1 hora | 5 | IP |
| Olvidé contraseña | 1 hora | 3 | email normalizado |
| Reenviar verificación | 1 minuto | 1 | user ID |
| Eliminar cuenta | 15 minutos | 5 | user ID |
| Refresh | según riesgo | conservador | familia/IP |

El límite en memoria de `express-rate-limit` sirve para una única instancia. Si despliegas varias réplicas, usa un store compartido como Redis.

En producción detrás de un proxy, configura `trust proxy` con la cantidad exacta de saltos confiables. Si lo configuras mal, `req.ip` y los límites por IP pueden ser falsificados o agrupar usuarios incorrectamente.

Los límites reducen abuso, pero no reemplazan:

- alertas por reutilización de refresh tokens;
- bloqueo temporal o progresivo ante ataques;
- MFA para cuentas privilegiadas;
- monitoreo de patrones anómalos.

## 15. CORS, cookies y CSRF

Permite una lista explícita de orígenes. No reflejes cualquier `Origin` en producción.

```ts
app.use(cors({
  origin: ['https://app.example.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
```

Si el refresh token está en cookie:

- usa `HttpOnly`, `Secure` y `SameSite`;
- valida `Origin` en requests mutables;
- incorpora token CSRF si el flujo permite solicitudes cross-site;
- no uses `Access-Control-Allow-Origin: *` junto con credenciales.

CORS no evita ataques directos contra la API. Es una política del navegador, no un firewall.

## 16. Contrato HTTP sugerido

| Método | Ruta | Auth | Resultado principal |
|---|---|---|---|
| `POST` | `/auth/signup` | Pública | crea usuario no verificado |
| `GET` | `/auth/verify-email?token=...` | Pública | consume token y verifica email |
| `POST` | `/auth/resend-verification` | Access token o flujo firmado | invalida el anterior y envía otro |
| `POST` | `/auth/login` | Pública | access token + refresh session |
| `POST` | `/auth/refresh` | Refresh token | rota refresh y emite access nuevo |
| `POST` | `/auth/logout` | Refresh token | revoca sesión actual |
| `POST` | `/auth/forgot-password` | Pública | respuesta anti-enumeración |
| `POST` | `/auth/verify-reset-code` | Pública | valida OTP sin confiar en el cliente |
| `POST` | `/auth/reset-password` | Pública + OTP | cambia password y revoca sesiones |
| `DELETE` | `/auth/account` | Access token + password/MFA | elimina o anonimiza la cuenta |

Códigos de respuesta:

- `400`: payload inválido o código inválido;
- `401`: credencial ausente, inválida o vencida;
- `403`: identidad válida sin permiso o cuenta bloqueada por política;
- `409`: email ya registrado;
- `410`: código de recuperación vencido/consumido;
- `429`: demasiados intentos.

No devuelvas detalles como “este email existe pero la contraseña está mal”. Para login, usa `invalid_credentials` en ambos casos.

## 17. Cliente web

El cliente necesita cuatro comportamientos:

1. adjuntar el access token a requests normales;
2. ante un único `401`, intentar refresh;
3. hacer que requests simultáneos compartan la misma renovación;
4. reintentar cada request como máximo una vez.

No actives el interceptor de refresh para `/auth/login`, `/auth/refresh` o `/auth/logout`. Un `401` de login es un error de formulario, y un `401` de refresh debe terminar la sesión en vez de entrar en un bucle.

Pseudocódigo:

```ts
let refreshPromise: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = callRefreshEndpoint()
    .then(saveNewAccessToken)
    .then(() => true)
    .catch(() => {
      clearLocalSession();
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
```

El usuario guardado en el frontend sirve para renderizar. No es fuente de verdad para permisos.

## 18. Limpieza y retención

Programa una tarea periódica para borrar credenciales antiguas:

```sql
DELETE FROM refresh_tokens
WHERE expires_at < NOW() - INTERVAL '30 days'
   OR revoked_at < NOW() - INTERVAL '30 days';

DELETE FROM email_verifications
WHERE created_at < NOW() - INTERVAL '7 days';

DELETE FROM password_resets
WHERE created_at < NOW() - INTERVAL '7 days';
```

Adapta los plazos a requisitos legales, auditoría y respuesta a incidentes. Si necesitas conservar metadatos, anonimiza IP y user agent en lugar de retenerlos indefinidamente.

## 19. Tests mínimos antes de producción

### Unitarios

- una contraseña correcta valida y una incorrecta falla;
- dos hashes de la misma contraseña son distintos por el salt;
- token opaco tiene longitud y entropía esperadas;
- expiración y normalización de email funcionan;
- middleware de roles distingue `401` de `403`.

### Integración con PostgreSQL

- registro crea usuario no verificado y token hasheado;
- email duplicado devuelve `409`;
- login no distingue usuario inexistente de contraseña incorrecta;
- login bloquea email no verificado y cuenta deshabilitada;
- login exitoso guarda sólo el hash del refresh token;
- refresh A → B funciona;
- reutilizar A revoca toda la familia y B deja de funcionar;
- logout invalida el refresh token;
- usuario eliminado o deshabilitado recibe `401` aunque conserve un JWT válido;
- verificación de email es de un solo uso;
- forgot-password siempre devuelve la misma respuesta;
- cinco OTPs incorrectos invalidan el código;
- reset cambia la contraseña, consume el OTP y revoca sesiones anteriores;
- el request número 11 de login dentro de la ventana recibe `429`;
- dos refresh concurrentes no dejan una sesión en estado incoherente;
- la suite se niega a ejecutar contra una base que no sea de test.

## 20. Checklist de producción

### Secretos y criptografía

- [ ] `JWT_SECRET` aleatorio, de al menos 32 bytes y fuera del repositorio.
- [ ] JWT verifica algoritmo, issuer y audience explícitos.
- [ ] Access token de 10–15 minutos.
- [ ] Refresh token aleatorio de 256 bits y 30 días o menos.
- [ ] PostgreSQL guarda sólo hashes de refresh/verificación.
- [ ] OTP con hash lento, vencimiento corto y máximo de intentos.
- [ ] Rotación periódica de secretos con procedimiento documentado.

### Base de datos

- [ ] TLS valida el certificado del servidor.
- [ ] Usuario de PostgreSQL con privilegios mínimos.
- [ ] Consultas parametrizadas.
- [ ] Transacciones y `FOR UPDATE` en consumos de un solo uso.
- [ ] Backups cifrados y restauración probada.
- [ ] Base de tests aislada con guard contra datos reales.
- [ ] Tarea de limpieza para tokens vencidos/revocados.

### API

- [ ] Validación de todos los payloads.
- [ ] Rate limiting con store compartido si hay varias instancias.
- [ ] CORS con orígenes explícitos.
- [ ] `trust proxy` configurado según la infraestructura real.
- [ ] Errores de login y recuperación no enumeran usuarios.
- [ ] Logs excluyen passwords, tokens, códigos y headers sensibles.
- [ ] Roles y propiedad se validan en el servidor.
- [ ] Usuarios eliminados/deshabilitados dejan de pasar el middleware.
- [ ] MFA obligatorio para administradores o acciones críticas.

### Cliente

- [ ] Refresh token web en cookie `HttpOnly`, o móvil en Keychain/Keystore.
- [ ] Refresh de vuelo único y máximo un retry por request.
- [ ] Endpoints de auth excluidos del interceptor de refresh.
- [ ] Logout limpia el cliente aunque la API falle.
- [ ] El estado local no se usa como autorización real.

## 21. Diferencias deliberadas respecto de TR Fit

Conviene conservar:

- JWT de vida corta;
- refresh tokens opacos almacenados como SHA-256;
- rotación y revocación por familia ante reutilización;
- `FOR UPDATE` para tokens de un solo uso;
- bcrypt para contraseñas y OTPs;
- respuestas anti-enumeración;
- revalidación del usuario en requests protegidos;
- revocación total tras restablecer contraseña;
- rate limits específicos por operación;
- guard que impide tests destructivos contra una base real.

Conviene adaptar o endurecer:

- reemplazar los roles y gates de membresía por reglas del nuevo dominio;
- usar cookies `HttpOnly` o secure storage en lugar de `localStorage`;
- exigir un secreto JWT largo y claims `issuer`/`audience`;
- tomar el rol actual desde PostgreSQL, no sólo desde el JWT;
- validar certificados TLS de PostgreSQL;
- calibrar bcrypt o migrar a Argon2id;
- usar Redis para rate limiting distribuido;
- agregar MFA para cuentas privilegiadas;
- contemplar refresh concurrente entre pestañas.

## 22. Orden recomendado de implementación

1. Crear migraciones y pool de PostgreSQL.
2. Validar configuración y agregar el guard de base de test.
3. Implementar hash de contraseñas y tokens opacos.
4. Implementar registro y verificación de email.
5. Implementar login y persistencia de la primera familia.
6. Implementar refresh rotativo con detección de reutilización.
7. Implementar middleware de autenticación y autorización.
8. Implementar logout y cierre global de sesiones.
9. Implementar recuperación de contraseña.
10. Agregar rate limits, CORS, cookies/CSRF y logs seguros.
11. Integrar el cliente con refresh de vuelo único.
12. Ejecutar la matriz de tests y una revisión de seguridad antes de producción.

El criterio de finalización no es solamente “el login funciona”. El sistema está listo cuando puede revocar, rotar, recuperar, bloquear abuso, responder a usuarios eliminados y demostrar todo eso con tests sobre PostgreSQL aislado.
