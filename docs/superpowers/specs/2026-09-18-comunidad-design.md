# Comunidad (backend + panel) — design

**Fecha:** 2026-09-18
**Repos:** `tr-fit-web` (este spec: backend, panel, infraestructura) · `tr-fit-app` (ver `tr-fit-app/docs/superpowers/specs/2026-09-18-comunidad-design.md`)
**Plazo comprometido:** 6 semanas desde la activación.

## Contexto comercial

Módulo add-on acordado con el cliente (adenda de septiembre 2026):

- Fee fijo del módulo: **$30.000 ARS/mes**.
- **15%** de lo facturado a marcas por publicidad en la comunidad, liquidado junto al fee base y al 4%.
- **Cláusula de revisión:** a los 6 meses del lanzamiento, si el promedio mensual de publicidad fue menor a $50.000, el fee fijo pasa a **$40.000** (el 15% se mantiene). Se aplica **automáticamente**.
- Toda publicidad se registra en el panel con monto y período; el 15% se calcula sobre lo registrado.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Audiencia | Comunidad única. Ven y publican todos los usuarios con acceso a la app (`users.status` + gate de membresía existentes). Campo `audience = 'all'` reservado para grupos futuros. |
| Moderación | Posterior: se publica al instante. Denuncia + bloqueo + ocultar/silenciar desde el panel. Denuncias respondidas en < 24 h (requisito Apple 1.2). |
| Fotos | Compresión en el celular, el backend valida y sube a **Firebase Storage** (patrón del avatar). |
| Storage | Firebase Storage. R2 solo si el tráfico supera ~100 GB/mes; la migración queda contenida en `storage.service.ts`. |
| Entrega del muro | REST con paginación por cursor. Sin WebSocket. La app consulta `new-count` cada 60 s solo con el muro visible. |
| Publicidad | Tarjeta dentro del muro cada 8 publicaciones, rotando, etiqueta "Publicidad". |
| Contenido | Texto + hasta 4 fotos. Sin video (`post_media.kind` reservado para sumarlo). |
| Push | Aviso/evento del entrenador → todos. Comentario → autor de la publicación. Denuncia → admins. Sin push por reacciones ni por publicaciones de alumnos. |
| Arquitectura | Extensión del backend actual. **Ningún servicio nuevo en Railway.** |
| Revisión a 6 meses | Automática en el cron mensual de platform fee, con aviso por push y mail. |

## Fuera de alcance (v1)

Video, grupos, edición de publicaciones (se borra y se vuelve a publicar), respuestas anidadas en comentarios, resumen diario de "me gusta", WebSocket/tiempo real, cola offline para publicar, cron de limpieza de archivos huérfanos, contadores desnormalizados.

## Modelo de datos

Migraciones `063_community.sql` y `064_community_ads.sql`. UUID + `TIMESTAMPTZ`, mismo estilo que las existentes.

### `063_community.sql`

```sql
CREATE TABLE community_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'post'
                   CHECK (kind IN ('post', 'announcement', 'event')),
  category         TEXT NOT NULL DEFAULT 'general'
                   CHECK (category IN ('general', 'meals', 'training')),
  body             TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  audience         TEXT NOT NULL DEFAULT 'all',
  pinned_at        TIMESTAMPTZ,
  event_location   TEXT,
  event_starts_at  TIMESTAMPTZ,
  hidden_at        TIMESTAMPTZ,
  hidden_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'event') = (event_starts_at IS NOT NULL))
);
CREATE INDEX idx_community_posts_feed
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND hidden_at IS NULL;

CREATE TABLE community_post_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT NOT NULL,
  url           TEXT NOT NULL,
  thumb_url     TEXT NOT NULL,
  width         INT NOT NULL,
  height        INT NOT NULL,
  position      SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),
  UNIQUE (post_id, position)
);

CREATE TABLE community_likes (
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  hidden_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_comments_post ON community_comments (post_id, created_at);

CREATE TABLE community_event_rsvps (
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('offensive', 'spam', 'inappropriate', 'other')),
  note         TEXT CHECK (char_length(note) <= 500),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_community_reports_status ON community_reports (status, created_at);

CREATE TABLE community_blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS community_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS community_muted_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS community_seen_at           TIMESTAMPTZ;
```

### `064_community_ads.sql`

```sql
CREATE TABLE community_ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name       TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 280),
  image_path       TEXT NOT NULL,
  image_url        TEXT NOT NULL,
  cta_label        TEXT NOT NULL,
  cta_url          TEXT NOT NULL,
  monthly_fee_ars  NUMERIC(12,2) NOT NULL CHECK (monthly_fee_ars >= 0),
  starts_on        DATE NOT NULL,
  ends_on          DATE NOT NULL CHECK (ends_on >= starts_on),
  archived_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_ad_events (
  ad_id    UUID NOT NULL REFERENCES community_ads(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('view', 'click')),
  PRIMARY KEY (ad_id, user_id, day, kind)
);
CREATE INDEX idx_community_ad_events_ad_day ON community_ad_events (ad_id, day);

ALTER TABLE platform_fee_config
  ADD COLUMN IF NOT EXISTS community_fee_ars          NUMERIC(12,2) NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS community_fallback_fee_ars NUMERIC(12,2) NOT NULL DEFAULT 40000,
  ADD COLUMN IF NOT EXISTS community_revision_threshold_ars NUMERIC(12,2) NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS ad_share_pct               NUMERIC(5,2)  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS community_launched_on      DATE,
  ADD COLUMN IF NOT EXISTS community_revision_applied_at TIMESTAMPTZ;

ALTER TABLE platform_fee_history
  ADD COLUMN IF NOT EXISTS community_fee_ars NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_revenue_ars    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_share_ars      NUMERIC(14,2) NOT NULL DEFAULT 0;
```

### Reglas del modelo

- **El monto de una publicidad no se edita.** Para cambiar precio: archivar y crear otra. Así los meses ya liquidados no cambian.
- **Publicidad del mes** = suma de `monthly_fee_ars` de las publicidades no archivadas cuyo rango `[starts_on, ends_on]` se superpone con el mes. Sin prorrateo: vigente al menos un día = mes completo.
- **Una publicidad archivada** deja de mostrarse pero sigue contando en los meses en los que estuvo vigente (la foto mensual ya la registró).
- **Módulo apagado:** `community_launched_on IS NULL`. Mientras esté apagado, `community_fee_ars` no se suma a la liquidación.
- **Fecha de revisión** = `community_launched_on + 6 meses`. No se guarda, se calcula.
- `announcement` y `event` solo pueden crearlos usuarios admin/superadmin (validado en el servicio).

## API

Dos routers nuevos montados en `routes/index.ts`: `/community` y `/admin/community`. Validación con `zod`, límites con `express-rate-limit`. Errores con códigos cortos en inglés, igual que el resto.

### `/community` (autenticado, cualquier rol con acceso)

Si `community_launched_on IS NULL`, todos los endpoints devuelven `404 { error: 'community_disabled' }` para rol `athlete`. Los admins pueden usarlos antes del lanzamiento para cargar contenido.

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/feed?cursor=&category=` | 20 ítems. Cursor opaco que codifica (`created_at`, `id`). La primera página (sin cursor) incluye `pinned[]`, máximo 3. `items[]` mezcla `{type:'post', ...}` y `{type:'ad', ...}`: el servidor inserta una publicidad vigente después de cada 8 publicaciones, rotando por `(page_offset / 8) % ads.length`. Respuesta: `{ pinned, items, next_cursor }`. |
| GET | `/feed/new-count?since=<postId>` | `{ count }` de publicaciones visibles más nuevas que `since`. |
| POST | `/posts` | Multipart: `body`, `category`, `images[]` (≤4) y `thumbs[]` (misma cantidad), más `widths[]`/`heights[]`. Exige `community_terms_accepted_at` (si no: `403 terms_required`) y `community_muted_until` vencido o nulo (si no: `403 muted`). Debe tener texto o al menos una foto (`400 empty_post`). Los alumnos solo crean `kind='post'`. |
| DELETE | `/posts/:id` | Autor o admin. Setea `deleted_at` y borra los archivos de Storage. |
| PUT / DELETE | `/posts/:id/reaction` | `{ emoji }` de un set fijo: ❤️ 🔥 💪 👏 😂 😮 (`400 invalid_emoji` si no). Una reacción por usuario: otra la reemplaza, `DELETE` la quita. |
| POST / DELETE | `/posts/:id/like` | Alias de la reacción ❤️ (compatibilidad). |
| GET | `/posts/:id` | Detalle de una publicación (para abrir desde un push). |
| GET | `/posts/:id/comments?cursor=` | 30 por página, orden cronológico. |
| POST | `/posts/:id/comments` | `{ body }`. Mismos chequeos de normas y silenciado. Push al autor si no es el mismo usuario. |
| DELETE | `/comments/:id` | Autor o admin. |
| POST / DELETE | `/posts/:id/rsvp` | Solo sobre `kind='event'` (`400 not_an_event`). |
| POST | `/reports` | `{ target_type, target_id, reason, note? }`. Duplicado → `200` idempotente. Push a admins. |
| GET | `/blocks` | Usuarios que bloqueé (id, nombre, avatar). |
| POST / DELETE | `/blocks/:userId` | Bloquear / desbloquear. |
| POST | `/terms/accept` | Setea `community_terms_accepted_at = now()`. |
| POST | `/seen` | Setea `community_seen_at = now()`. |
| POST | `/ads/:id/events` | `{ kind: 'view' \| 'click' }`. Inserta con `day = current_date` (zona `America/Argentina/Buenos_Aires`), `ON CONFLICT DO NOTHING`. |

**Forma de una publicación en la respuesta**

```ts
{
  type: 'post',
  id, kind, category, body, created_at, pinned: boolean,
  author: { id, name, avatar_url, is_coach: boolean },
  media: [{ url, thumb_url, width, height }],
  like_count, comment_count, liked_by_me: boolean,   // like_count = total de reacciones
  my_reaction: string | null, reactions: [{ emoji, count }],  // más usada primero
  event?: { location, starts_at, rsvp_count, going: boolean },
  can_delete: boolean
}
```

**Forma de una publicidad:** `{ type: 'ad', id, brand_name, body, image_url, cta_label, cta_url }`.

**El perfil** (endpoint existente) suma `community_enabled: boolean`, `community_terms_accepted: boolean` y `community_unseen: boolean` (hay comentarios en publicaciones propias posteriores a `community_seen_at`).

### `/admin/community` (`requireAdmin`)

| Método | Ruta | Detalle |
|---|---|---|
| POST | `/posts` | Multipart. `kind` `announcement` o `event` (con `event_location`, `event_starts_at`), `pin?`, foto opcional. Push a todos los alumnos. |
| GET | `/posts?cursor=&include_hidden=1` | Muro completo para moderar. |
| PATCH | `/posts/:id/pin` | `{ pinned: boolean }`. Más de 3 fijadas → `409 pin_limit`. |
| POST | `/posts/:id/hide` · `/posts/:id/unhide` | Ocultar o restaurar. |
| POST | `/comments/:id/hide` | Ocultar comentario. |
| GET | `/posts/:id/rsvps` | Asistentes de un evento. |
| GET | `/reports?status=open` | Con el contenido denunciado embebido y la antigüedad. |
| POST | `/reports/:id/resolve` | `{ action: 'hide' \| 'dismiss' \| 'mute', mute_days? }`. `hide` y `mute` resuelven como `actioned`; además cierran las otras denuncias abiertas sobre el mismo contenido. |
| POST | `/users/:id/mute` | `{ days: number \| null }` (`null` = reactivar). |
| GET | `/ads` | Vigentes, próximas y vencidas. |
| POST | `/ads` | Multipart con imagen. |
| POST | `/ads/:id/archive` | Dar de baja. |
| GET | `/ads/:id/metrics?from=&to=` | `{ views, clicks, reach, daily: [{ day, views, clicks }] }`. `reach` = usuarios distintos con vista. |
| GET | `/summary` | `{ enabled, launched_on, revision_date, days_to_revision, ad_revenue_this_month, ad_share_this_month, avg_ad_revenue, projected_community_fee, revision_applied_at }`. |

### Reglas transversales

- **Bloqueos:** una única función `visibleAuthorsClause(userId)` en `community.service.ts` que excluye autores bloqueados por mí o que me bloquearon. La usan el muro, el detalle, los comentarios y `new-count`.
- **Ocultos y borrados:** nunca se devuelven en `/community`. Los ocultos solo se ven en `/admin/community`.
- **Límites por usuario:** 10 publicaciones por hora, 60 comentarios por hora, 20 denuncias por día, 300 eventos de publicidad por hora.
- **Subidas:** `multer.memoryStorage()`, JPEG/PNG/WebP, ≤2 MB por foto, ≤200 KB por miniatura. Rutas en Storage: `community/{postId}/{position}.jpg` y `community/{postId}/{position}_thumb.jpg`; publicidad en `community-ads/{adId}.jpg`.
- **Rollback de subidas:** si falla cualquier archivo o la inserción, se borran los objetos ya subidos y no se crea nada.
- **Baja de cuenta:** las FK con `ON DELETE CASCADE` borran las filas. Antes del borrado del usuario, el servicio de baja borra sus archivos de Storage.

## Servicios (backend)

Carpeta nueva de dominio, siguiendo el estilo de `services/`:

| Archivo | Responsabilidad |
|---|---|
| `services/community.service.ts` | Muro, publicaciones, comentarios, likes, RSVP, bloqueos, normas, `seen`. |
| `services/community-media.service.ts` | Validar y subir fotos, rollback, borrar objetos. Usa `uploadBufferToStorage` y una nueva `deleteFromStorage(path)` en `storage.service.ts`. |
| `services/community-moderation.service.ts` | Denuncias, ocultar, silenciar. |
| `services/community-ads.service.ts` | Publicidades, eventos, métricas, `adRevenueForMonth(month)`. |
| `services/platform-fee.math.ts` | Suma funciones puras: `communityRevisionDate(launchedOn)`, `evaluateCommunityRevision({ monthlyAdRevenues, threshold, fee, fallbackFee })`. |
| `routes/community.ts`, `routes/admin-community.ts` | HTTP + validación zod. |
| `services/notification-templates.ts` | Plantillas nuevas: `community_announcement`, `community_event`, `community_comment`, `community_report`. |

## Integración con platform fee

- **Foto mensual** (`platform-fee-cron.ts`): si el módulo está lanzado, agrega `community_fee_ars` vigente, `ad_revenue_ars = adRevenueForMonth(period)` y `ad_share_ars = ad_revenue_ars * ad_share_pct / 100` a `platform_fee_history`, y los suma a `total_ars`. El mes del lanzamiento cuenta como mes completo de Comunidad.
- **Revisión automática:** en la misma corrida, si `community_revision_applied_at IS NULL` y el período en curso es posterior o igual a la fecha de revisión:
  - promedio = suma de `ad_revenue_ars` de las 6 primeras filas de `platform_fee_history` desde el mes del lanzamiento inclusive, dividido 6 (los meses sin publicidad cuentan como 0);
  - si el promedio es **menor** al umbral → `community_fee_ars = community_fallback_fee_ars`; si es mayor o igual → sin cambios;
  - en los dos casos se setea `community_revision_applied_at = now()` y se manda push + mail (vía `resend`) a los admins y superadmins con el resultado y el promedio.
- **Ajuste trimestral por dólar:** `community_fee_ars`, `community_fallback_fee_ars` y el umbral se ajustan con el mismo factor que `base_fee_ars`.

## Panel admin

Ruta nueva `/admin/community` en `App.tsx`, con ítem en la barra lateral y contador de denuncias abiertas.

| Pestaña | Contenido |
|---|---|
| **Publicar** | Formulario de aviso o evento (texto, foto opcional, lugar y fecha/hora si es evento, casilla "Fijar arriba") con vista previa. |
| **Muro** | Todas las publicaciones, las ocultas en gris. Acciones: ocultar/restaurar, borrar, fijar/desfijar, ver asistentes. |
| **Denuncias** | Ordenadas por antigüedad, contenido a la vista. Acciones: Ocultar / Descartar / Silenciar N días. La antigüedad se pone **roja pasadas las 20 h**. |
| **Publicidad** | Alta, lista (vigentes / próximas / vencidas), detalle con vistas, clics, alcance y `Sparkline` por día. Botón **"Copiar reporte"** con texto listo para WhatsApp. |

- **Dashboard:** tarjeta "Denuncias pendientes" solo si hay abiertas. Aviso de revisión si faltan ≤15 días.
- **`PlatformFee.tsx`:** desglose con Comunidad fija, publicidad del mes y 15%. Tarjeta **"Revisión de Comunidad"** (fecha, días restantes, promedio contra umbral, fee proyectado; después de aplicada, el resultado). En la sección superadmin: `community_fee_ars`, `community_fallback_fee_ars`, umbral, `ad_share_pct` y `community_launched_on`.
- **`Terms.tsx`:** sección de normas de la comunidad con cláusula de tolerancia cero con contenido ofensivo (requisito Apple para contenido de usuarios).

## Infraestructura (Railway)

- **Sin servicios nuevos.** Siguen `Postgres`, `backend` y `frontend`.
- **Sin variables de entorno nuevas:** reusa el bucket y las credenciales de Firebase.
- **Costo incremental:** Railway ≈ USD 0; Firebase < USD 1/mes con ~100 alumnos.
- **RAM:** pico de ~10 MB por subida. Sin tráfico de lectura de fotos en Railway (salen de Firebase).
- **Advertencia de escala:** los crons corren dentro del proceso del backend. Con 2 o más réplicas se ejecutarían duplicados (foto mensual y revisión incluidas). Si se escala, mover los crons a un servicio `worker` separado antes.

## Manejo de errores

- Falla de subida o de inserción → rollback de objetos en Storage, `500 upload_failed` o `400` con el código de validación.
- Falla al borrar un objeto de Storage → `logger.warn({ storage_path })`, la operación sigue.
- Falla de push → se loguea, no falla el request (patrón actual de `notification.service`).
- Falla del mail de revisión → se loguea; el cambio de fee ya quedó aplicado y visible en el panel.

## Lanzamiento

1. Deploy de migraciones + backend con `community_launched_on = NULL` (módulo apagado).
2. Deploy del panel. Tato carga avisos y la primera marca.
3. Build de la app con la pestaña oculta mientras `community_enabled = false` → revisión en App Store y Google Play. Notas de revisión: dónde están denuncia, bloqueo y moderación; cuenta demo con publicaciones.
4. Lanzamiento: el superadmin carga `community_launched_on`. Empiezan el fee y los 6 meses.

## Tests

**Backend (Jest):**
- Un alumno no puede crear `announcement` ni `event`.
- Bloqueos filtran en las dos direcciones en muro, detalle, comentarios y `new-count`.
- `terms_required` y `muted` en publicaciones y comentarios.
- Rollback: si falla la tercera foto, no queda publicación ni objetos.
- Vistas de publicidad deduplicadas por día.
- `adRevenueForMonth`: publicidad que cubre un solo día del mes cuenta completa; archivada sigue contando en sus meses; fuera de rango no cuenta.
- `evaluateCommunityRevision`: promedio exactamente 50.000 (se mantiene 30.000), cero publicidad, un mes alto que compensa.
- Foto mensual con el módulo apagado no suma Comunidad.
- Intercalado de publicidad: una cada 8 y rotación.

**Panel (Vitest):** bandeja de denuncias (acciones y color por antigüedad) y alta de publicidad (validaciones).

## Plan de 6 semanas

| Semana | Trabajo (web) |
|---|---|
| 1 | Migraciones, API de publicaciones, fotos, "me gusta" y comentarios. |
| 2 | Muro con cursor, detalle, `new-count`, RSVP. |
| 3 | Moderación: denuncias, bloqueos, silenciar, normas. Pestañas Denuncias y Muro del panel. |
| 4 | Avisos, eventos, fijadas y push. Pestaña Publicar. |
| 5 | Publicidad, métricas, integración con platform fee y revisión automática. Pestaña Publicidad y `PlatformFee.tsx`. |
| 6 | `Terms.tsx`, ajustes de QA con la app en TestFlight, lanzamiento. |
