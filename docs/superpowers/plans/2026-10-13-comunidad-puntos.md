# Comunidad — Sistema de puntos y ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los atletas suman puntos por participar en Comunidad (publicar, comentar, reaccionar, confirmar eventos, recibir interacción) y ven un ranking mensual en la app.

**Architecture:** Sin tablas nuevas ni migración. Los puntos se calculan al vuelo con una sola query SQL sobre `community_posts`, `community_comments`, `community_likes`, `community_event_rsvps` y `community_post_media`, expuesta en `GET /api/community/leaderboard`. Los valores de puntos y topes viven en una única constante del backend y viajan en la respuesta, así la app nunca duplica el mapa (evita el drift que ya pasó con `TIER_PRICE`). La app agrega una pantalla `community/leaderboard` accesible desde la barra superior de Comunidad.

**Tech Stack:** Backend: Node 20 + Express + TypeScript (ESM, imports con `.js`) + PostgreSQL 15, Jest + supertest (integración contra DB real). App: Expo SDK 55 + React Native + expo-router + NativeWind, Jest + @testing-library/react-native.

**Spec:** No hay doc de spec separado; las decisiones de producto están en la sección "Decisiones" de abajo (salen de la conversación del 2026-10-13 con el cliente). Repos: `tr-fit-web` (Tasks 1–2) y `tr-fit-app` (Tasks 3–4).

## Decisiones (defaults, ajustables por el cliente)

| Acción | Puntos | Quién suma | Tope diario (día BA) |
|---|---|---|---|
| Publicar post (`kind='post'`) | 10 | autor | 3 posts |
| Extra si el post tiene ≥1 foto | +5 | autor | (entra en el tope de posts) |
| Comentar en post **ajeno** | 4 | comentarista | 10 comentarios |
| Reaccionar a post **ajeno** | 1 | quien reacciona | 20 reacciones |
| Confirmar asistencia a evento | 3 | quien confirma | sin tope |
| Reacción recibida en mi post (de otro) | 2 | autor del post | sin tope |
| Comentario recibido en mi post (de otro) | 3 | autor del post | 1 vez por (post, comentarista) |

- **Período:** ranking mensual, mes calendario en `America/Argentina/Buenos_Aires`. Se reinicia solo (no hay nada que resetear: es un filtro por fecha).
- **Quién entra al ranking:** solo `role='athlete'`, `status='approved'`, no silenciados (`community_muted_until` vencido o null). Coach/admin no compiten.
- **No suma:** posts/comentarios borrados u ocultos por moderación, interacción sobre posts borrados/ocultos, interacción con uno mismo. Si algo se borra después, los puntos desaparecen (consistente, anti-farmeo).
- **Visibilidad:** ranking público entre atletas, top 5 + "tu posición" (fila aparte si quedás fuera del top). Usuarios bloqueados (en cualquier sentido) no se muestran al viewer, pero los números de puesto son globales (no se renumeran).
- **Los puntos no se canjean** por nada en esta versión. Si el cliente quiere premios/canjes/descuentos → recién ahí se agrega tabla `community_points_ledger` (fuera de alcance).
- **Fuera de alcance:** likes en comentarios (el backend todavía no los tiene), panel admin, notificaciones push de ranking, insignias.

## Global Constraints

- Sin migración SQL nueva. No tocar `src/db/migrations/`.
- Zona horaria: `America/Argentina/Buenos_Aires` para día y mes (misma constante que `community-ads.service.ts`).
- Puntos y topes: única fuente `POINTS` / `DAILY_CAPS` en `tr-fit-web/backend/src/services/community-points.service.ts`. La app los lee de la respuesta; prohibido hardcodear el mapa en la app.
- Backend ESM: imports relativos terminan en `.js`.
- Copy de la app en español rioplatense ("Vos", "Sumá"), igual que el resto de Comunidad.
- Endpoint detrás de `requireAuth` + `requireCommunityEnabled` (ya aplicados por `router.use` en `routes/community.ts`).
- Tests backend: `cd tr-fit-web/backend && npm test -- <archivo>` (no `npx jest` pelado). Tests app: `cd tr-fit-app && npx jest <archivo>`.

## Review Focus

1. **Bordes de día/mes en hora Argentina** — un post a las 23:30 BA del 30/09 (02:30Z del 01/10) es de septiembre, no de octubre; los topes diarios cuentan por día BA, no UTC. → test en Task 1 (`month and day boundaries use Buenos Aires time`).
2. **Auto-farmeo** — reaccionar/comentar en el post propio o comentar 10 veces el mismo post no debe inflar "recibidos". → test en Task 1 (`self interaction and repeated comments`).
3. **Moderación posterior** — post oculto/borrado después de sumar debe dejar de sumar (al autor y a quien interactuó). → test en Task 1 (`hidden and deleted content does not score`).
4. **Bloqueos** — el viewer no ve a quien bloqueó/lo bloqueó, pero los puestos de los demás no cambian. → test en Task 1 (`hides blocked users without renumbering`).
5. **Mes vacío (día 1)** — sin actividad: `top: []`, `me: { rank: null, points: 0 }` y la app muestra estado vacío, no una lista rota. → tests en Task 1 (`empty month`) y Task 3 (`estado vacío`).

---

### Task 1: Servicio de puntos (backend)

**Files:**
- Create: `tr-fit-web/backend/src/services/community-points.service.ts`
- Test: `tr-fit-web/backend/tests/integration/community-points.test.ts`

**Interfaces:**
- Consumes: `AUTHOR_NAME_SQL(u, ap, cp)`, `visibleAuthorsClause(authorCol, viewerParam)`, `type Viewer` de `src/services/community.service.ts`; `pool` de `src/db/connect.js`. Test helpers `makeUser`, `enableCommunity`, `insertPost` de `tests/integration/community-helpers.ts`.
- Produces:
  ```ts
  export const POINTS: { post: 10; post_photo_bonus: 5; comment: 4; reaction: 1; rsvp: 3; reaction_received: 2; comment_received: 3 };
  export const DAILY_CAPS: { post: 3; comment: 10; reaction: 20 };
  export const LEADERBOARD_SIZE = 5;
  export interface LeaderboardEntry { rank: number; points: number; user: { id: string; name: string; avatar_url: string | null } }
  export interface Leaderboard {
    month: string; // 'YYYY-MM' en hora BA
    points: typeof POINTS;
    caps: typeof DAILY_CAPS;
    top: LeaderboardEntry[];
    me: { rank: number | null; points: number };
  }
  export async function getLeaderboard(viewer: Viewer, now?: Date): Promise<Leaderboard>;
  ```

- [ ] **Step 1: Crear branch**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git checkout main && git pull
git checkout -b feat/community-points
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `tr-fit-web/backend/tests/integration/community-points.test.ts`:

```ts
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => ({
    name: 'test-bucket',
    file: () => ({ save: async () => {}, delete: async () => {} }),
  }),
  getFirebaseApp: () => ({}),
}));
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: async () => 'sent',
}));

const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const pool = (await import('../../src/db/connect.js')).default;
const { makeUser, enableCommunity, insertPost } =
  await import('./community-helpers.js');
const { getLeaderboard, POINTS, DAILY_CAPS } =
  await import('../../src/services/community-points.service.js');

// 15/10/2026 12:00 en BA (-03:00)
const NOW = new Date('2026-10-15T15:00:00Z');
const AT = '2026-10-10T15:00:00Z';

async function react(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_likes (post_id, user_id, emoji, created_at) VALUES ($1, $2, '🔥', $3)`,
    [postId, userId, at]
  );
}
async function comment(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_comments (post_id, author_id, body, created_at) VALUES ($1, $2, 'buenísimo', $3)`,
    [postId, userId, at]
  );
}
async function rsvp(postId: string, userId: string, at = AT) {
  await pool.query(
    `INSERT INTO community_event_rsvps (post_id, user_id, created_at) VALUES ($1, $2, $3)`,
    [postId, userId, at]
  );
}
async function addPhoto(postId: string) {
  await pool.query(
    `INSERT INTO community_post_media (post_id, storage_path, thumb_path, url, thumb_url, width, height, position)
     VALUES ($1, 'p', 't', 'https://x/p.jpg', 'https://x/t.jpg', 100, 100, 0)`,
    [postId]
  );
}
const pointsOf = (lb: { top: { user: { id: string }; points: number }[] }, id: string) =>
  lb.top.find((e) => e.user.id === id)?.points ?? 0;

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  await enableCommunity();
});
afterAll(async () => {
  await closePool();
});

describe('getLeaderboard scoring', () => {
  it('scores every action with the configured points', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const coach = await makeUser('admin', 'Coach');

    const plain = await insertPost(ana.id, { createdAt: AT });
    const withPhoto = await insertPost(ana.id, { createdAt: AT });
    await addPhoto(withPhoto);
    await comment(plain, beto.id);
    await react(plain, beto.id);
    const event = await insertPost(coach.id, { kind: 'event', createdAt: AT });
    await rsvp(event, beto.id);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(
      POINTS.post * 2 + POINTS.post_photo_bonus + POINTS.comment_received + POINTS.reaction_received
    );
    expect(pointsOf(lb, beto.id)).toBe(POINTS.comment + POINTS.reaction + POINTS.rsvp);
    expect(lb.month).toBe('2026-10');
    expect(lb.points).toEqual(POINTS);
    expect(lb.caps).toEqual(DAILY_CAPS);
  });

  it('does not score self interaction and counts a received comment once per commenter', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const post = await insertPost(ana.id, { createdAt: AT });
    await comment(post, ana.id);
    await react(post, ana.id);
    for (let i = 0; i < 3; i++) await comment(post, beto.id, `2026-10-10T15:0${i}:00Z`);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post + POINTS.comment_received);
    expect(pointsOf(lb, beto.id)).toBe(POINTS.comment * 3);
  });

  it('hidden and deleted content does not score', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const hidden = await insertPost(ana.id, { createdAt: AT, hidden: true });
    await react(hidden, beto.id);
    const deleted = await insertPost(ana.id, { createdAt: AT });
    await comment(deleted, beto.id);
    await pool.query(`UPDATE community_posts SET deleted_at = now() WHERE id = $1`, [deleted]);
    const ok = await insertPost(ana.id, { createdAt: AT });
    await comment(ok, beto.id);
    await pool.query(`UPDATE community_comments SET hidden_at = now() WHERE post_id = $1`, [ok]);

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post);
    expect(pointsOf(lb, beto.id)).toBe(0);
  });

  it('applies daily caps per Buenos Aires day', async () => {
    const ana = await makeUser('athlete', 'Ana');
    // 5 posts el 10/10 BA (el último a las 23:30 BA = 02:30Z del 11/10) + 1 post el 11/10 BA
    for (let i = 0; i < 4; i++) await insertPost(ana.id, { createdAt: `2026-10-10T15:0${i}:00Z` });
    await insertPost(ana.id, { createdAt: '2026-10-11T02:30:00Z' });
    await insertPost(ana.id, { createdAt: '2026-10-11T15:00:00Z' });

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post * (DAILY_CAPS.post + 1));
  });

  it('month and day boundaries use Buenos Aires time', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id, { createdAt: '2026-10-01T02:30:00Z' }); // 30/09 23:30 BA → septiembre
    await insertPost(ana.id, { createdAt: '2026-10-01T03:30:00Z' }); // 01/10 00:30 BA → octubre
    await insertPost(ana.id, { createdAt: '2026-10-15T16:00:00Z' }); // después de NOW → no cuenta

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(pointsOf(lb, ana.id)).toBe(POINTS.post);
  });
});

describe('getLeaderboard ranking', () => {
  it('only ranks approved, non-muted athletes', async () => {
    const coach = await makeUser('admin', 'Coach');
    const pending = await makeUser('athlete', 'Pend');
    const muted = await makeUser('athlete', 'Mute');
    const ok = await makeUser('athlete', 'Ok');
    await pool.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [pending.id]);
    await pool.query(`UPDATE users SET community_muted_until = now() + interval '1 day' WHERE id = $1`, [muted.id]);
    for (const u of [coach, pending, muted, ok]) await insertPost(u.id, { createdAt: AT });

    const lb = await getLeaderboard({ id: coach.id, role: 'admin' }, NOW);

    expect(lb.top.map((e) => e.user.id)).toEqual([ok.id]);
    expect(lb.me).toEqual({ rank: null, points: 0 });
  });

  it('ties share rank, top is capped at 5 and me carries the viewer rank', async () => {
    const users = [];
    for (let i = 0; i < 22; i++) users.push(await makeUser('athlete', `U${i}`));
    // U0 y U1: 2 posts (empatan primeros); resto: 1 post; el viewer U21 sin nada más que un post.
    for (const [i, u] of users.entries()) {
      await insertPost(u.id, { createdAt: AT });
      if (i < 2) await insertPost(u.id, { createdAt: '2026-10-11T15:00:00Z' });
    }
    const viewer = users[21];

    const lb = await getLeaderboard({ id: viewer.id, role: 'athlete' }, NOW);

    expect(lb.top).toHaveLength(5);
    expect(lb.top[0].rank).toBe(1);
    expect(lb.top[1].rank).toBe(1);
    expect(lb.top[2].rank).toBe(3);
    expect(lb.me).toEqual({ rank: 3, points: POINTS.post });
  });

  it('hides blocked users without renumbering', async () => {
    const ana = await makeUser('athlete', 'Ana');
    const beto = await makeUser('athlete', 'Beto');
    const caro = await makeUser('athlete', 'Caro');
    await insertPost(beto.id, { createdAt: AT });
    await insertPost(beto.id, { createdAt: '2026-10-11T15:00:00Z' });
    await insertPost(caro.id, { createdAt: AT });
    await pool.query(
      `INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
      [beto.id, ana.id]
    );

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(lb.top.map((e) => [e.user.name, e.rank])).toEqual([['Caro Test', 2]]);
  });

  it('empty month', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id, { createdAt: '2026-09-20T15:00:00Z' });

    const lb = await getLeaderboard({ id: ana.id, role: 'athlete' }, NOW);

    expect(lb.top).toEqual([]);
    expect(lb.me).toEqual({ rank: null, points: 0 });
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/integration/community-points.test.ts`
Expected: FAIL con `Cannot find module '../../src/services/community-points.service.js'`.

- [ ] **Step 4: Implementar el servicio**

Crear `tr-fit-web/backend/src/services/community-points.service.ts`:

```ts
import pool from '../db/connect.js';
import {
  AUTHOR_NAME_SQL,
  visibleAuthorsClause,
  type Viewer,
} from './community.service.js';

/** Single source of truth for community points. The app reads these from the API. */
export const POINTS = {
  post: 10,
  post_photo_bonus: 5,
  comment: 4,
  reaction: 1,
  rsvp: 3,
  reaction_received: 2,
  comment_received: 3,
} as const;

/** Max scoring actions per user per Buenos Aires day. Extra actions still happen, they just don't score. */
export const DAILY_CAPS = { post: 3, comment: 10, reaction: 20 } as const;

export const LEADERBOARD_SIZE = 5;
const TZ = 'America/Argentina/Buenos_Aires';

export interface LeaderboardEntry {
  rank: number;
  points: number;
  user: { id: string; name: string; avatar_url: string | null };
}
export interface Leaderboard {
  month: string;
  points: typeof POINTS;
  caps: typeof DAILY_CAPS;
  top: LeaderboardEntry[];
  me: { rank: number | null; points: number };
}

const LIVE = (p: string) => `${p}.deleted_at IS NULL AND ${p}.hidden_at IS NULL`;

// ponytail: computed on every request over the whole month. Fine for one coach's
// community; move to a materialized view / ledger table if it gets slow or points become redeemable.
const LEADERBOARD_SQL = `
WITH acts AS (
  SELECT p.author_id AS user_id, 'post' AS action, p.created_at,
         ${POINTS.post} + CASE WHEN EXISTS (
           SELECT 1 FROM community_post_media m WHERE m.post_id = p.id
         ) THEN ${POINTS.post_photo_bonus} ELSE 0 END AS pts
    FROM community_posts p
   WHERE p.kind = 'post' AND ${LIVE('p')}
  UNION ALL
  SELECT c.author_id, 'comment', c.created_at, ${POINTS.comment}
    FROM community_comments c JOIN community_posts p ON p.id = c.post_id
   WHERE ${LIVE('c')} AND ${LIVE('p')} AND c.author_id <> p.author_id
  UNION ALL
  SELECT l.user_id, 'reaction', l.created_at, ${POINTS.reaction}
    FROM community_likes l JOIN community_posts p ON p.id = l.post_id
   WHERE ${LIVE('p')} AND l.user_id <> p.author_id
  UNION ALL
  SELECT r.user_id, 'rsvp', r.created_at, ${POINTS.rsvp}
    FROM community_event_rsvps r JOIN community_posts p ON p.id = r.post_id
   WHERE ${LIVE('p')}
  UNION ALL
  SELECT p.author_id, 'reaction_received', l.created_at, ${POINTS.reaction_received}
    FROM community_likes l JOIN community_posts p ON p.id = l.post_id
   WHERE p.kind = 'post' AND ${LIVE('p')} AND l.user_id <> p.author_id
  UNION ALL
  SELECT author_id, 'comment_received', created_at, ${POINTS.comment_received} FROM (
    SELECT DISTINCT ON (c.post_id, c.author_id) p.author_id, c.created_at
      FROM community_comments c JOIN community_posts p ON p.id = c.post_id
     WHERE p.kind = 'post' AND ${LIVE('c')} AND ${LIVE('p')} AND c.author_id <> p.author_id
     ORDER BY c.post_id, c.author_id, c.created_at
  ) first_comment
),
capped AS (
  SELECT user_id, action, pts,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, action, (created_at AT TIME ZONE $1::text)::date
           ORDER BY created_at
         ) AS n
    FROM acts
   WHERE created_at >= date_trunc('month', $2::timestamptz AT TIME ZONE $1::text) AT TIME ZONE $1::text
     AND created_at <= $2::timestamptz
),
ranked AS (
  SELECT t.user_id, t.points, RANK() OVER (ORDER BY t.points DESC)::int AS rank
    FROM (
      SELECT user_id, SUM(pts)::int AS points FROM capped
       WHERE n <= CASE action
                    WHEN 'post' THEN ${DAILY_CAPS.post}
                    WHEN 'comment' THEN ${DAILY_CAPS.comment}
                    WHEN 'reaction' THEN ${DAILY_CAPS.reaction}
                    ELSE n END
       GROUP BY user_id
    ) t
    JOIN users u ON u.id = t.user_id
   WHERE u.role = 'athlete' AND u.status = 'approved'
     AND NOT COALESCE(u.community_muted_until > now(), false)
)
SELECT r.user_id AS id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url,
       r.points, r.rank
  FROM ranked r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
  LEFT JOIN coach_profiles cp ON cp.user_id = u.id
 WHERE r.user_id = $3 OR ${visibleAuthorsClause('r.user_id', '$3')}
 ORDER BY r.rank, name, r.user_id`;

export async function getLeaderboard(
  viewer: Viewer,
  now: Date = new Date()
): Promise<Leaderboard> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    avatar_url: string | null;
    points: number;
    rank: number;
  }>(LEADERBOARD_SQL, [TZ, now.toISOString(), viewer.id]);

  const mine = rows.find((r) => r.id === viewer.id);
  return {
    month: now.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7),
    points: POINTS,
    caps: DAILY_CAPS,
    top: rows.slice(0, LEADERBOARD_SIZE).map((r) => ({
      rank: r.rank,
      points: r.points,
      user: { id: r.id, name: r.name, avatar_url: r.avatar_url },
    })),
    me: mine
      ? { rank: mine.rank, points: mine.points }
      : { rank: null, points: 0 },
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/integration/community-points.test.ts`
Expected: PASS, 9 tests.

Si `hides blocked users without renumbering` falla por el nombre: `makeUser` setea `last_name = 'Test'`, así que `AUTHOR_NAME_SQL` devuelve `'Caro Test'` — ajustar el test, no el SQL.

- [ ] **Step 6: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/services/community-points.service.ts backend/tests/integration/community-points.test.ts
git commit -m "feat(community): compute monthly community points leaderboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Endpoint `GET /api/community/leaderboard`

**Files:**
- Modify: `tr-fit-web/backend/src/routes/community.ts` (imports arriba; nueva ruta antes de `export default router;`)
- Test: `tr-fit-web/backend/tests/integration/community-points.test.ts` (agregar `describe` al final)

**Interfaces:**
- Consumes: `getLeaderboard(viewer, now?)` de Task 1; `handle`, `viewerOf` ya definidos en `routes/community.ts`.
- Produces: `GET /api/community/leaderboard` → `200` con JSON `Leaderboard` (ver Task 1). `404 { error: 'community_disabled' }` para atletas si Comunidad está apagada (lo hace el middleware existente).

- [ ] **Step 1: Escribir el test HTTP que falla**

Agregar al import dinámico del principio del archivo:

```ts
const request = (await import('supertest')).default;
const app = (await import('../../src/app.js')).default;
```

Y al final del archivo:

```ts
describe('GET /api/community/leaderboard', () => {
  it('returns the leaderboard for the current viewer', async () => {
    const ana = await makeUser('athlete', 'Ana');
    await insertPost(ana.id);

    const r = await request(app)
      .get('/api/community/leaderboard')
      .set('Authorization', `Bearer ${ana.token}`);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      points: POINTS,
      caps: DAILY_CAPS,
      me: { rank: 1, points: POINTS.post },
    });
    expect(r.body.top[0].user).toMatchObject({ id: ana.id, name: 'Ana Test' });
  });

  it('is 404 for athletes when community is disabled', async () => {
    await pool.query(
      `UPDATE platform_fee_config SET community_launched_on = NULL WHERE id = 1`
    );
    const ana = await makeUser('athlete', 'Ana');

    const r = await request(app)
      .get('/api/community/leaderboard')
      .set('Authorization', `Bearer ${ana.token}`);

    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/integration/community-points.test.ts -t "GET /api/community/leaderboard"`
Expected: FAIL — el primer test recibe `404` (ruta inexistente) en lugar de `200`.

- [ ] **Step 3: Agregar la ruta**

En `tr-fit-web/backend/src/routes/community.ts`, debajo de `import { AdError, recordAdEvent } from '../services/community-ads.service.js';`:

```ts
import { getLeaderboard } from '../services/community-points.service.js';
```

Y justo antes de `export default router;`:

```ts
router.get(
  '/leaderboard',
  handle(async (req, res) => {
    res.json(await getLeaderboard(viewerOf(req)));
  })
);
```

- [ ] **Step 4: Correr el archivo completo y la suite**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test -- tests/integration/community-points.test.ts`
Expected: PASS, 11 tests.

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web/backend && npm test && npm run lint`
Expected: suite completa verde, lint sin errores.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-web
git add backend/src/routes/community.ts backend/tests/integration/community-points.test.ts
git commit -m "feat(community): expose GET /community/leaderboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Componente de ranking (app)

**Files:**
- Modify: `tr-fit-app/lib/community.ts` (tipos + `fetchLeaderboard`, junto a `fetchBlocks`)
- Create: `tr-fit-app/components/community/LeaderboardList.tsx`
- Test: `tr-fit-app/__tests__/community-leaderboard.test.tsx`

**Interfaces:**
- Consumes: respuesta de `GET /api/community/leaderboard` (Task 2); `Avatar` de `@/components/ui/Avatar` (`name`, `uri`, `size`); `Text` de `@/components/ui/text`.
- Produces:
  ```ts
  // lib/community.ts
  export interface LeaderboardPoints { post: number; post_photo_bonus: number; comment: number; reaction: number; rsvp: number; reaction_received: number; comment_received: number }
  export interface LeaderboardEntry { rank: number; points: number; user: { id: string; name: string; avatar_url: string | null } }
  export interface Leaderboard { month: string; points: LeaderboardPoints; caps: { post: number; comment: number; reaction: number }; top: LeaderboardEntry[]; me: { rank: number | null; points: number } }
  export const fetchLeaderboard: () => Promise<Leaderboard>;
  // components/community/LeaderboardList.tsx
  export function LeaderboardList(props: { data: Leaderboard; meId: string }): JSX.Element;
  export function monthLabel(month: string): string; // '2026-10' → 'octubre'
  ```

- [ ] **Step 1: Crear branch**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git checkout main && git pull
git checkout -b feat/community-points
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tr-fit-app/__tests__/community-leaderboard.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { LeaderboardList, monthLabel } from '@/components/community/LeaderboardList';
import type { Leaderboard } from '@/lib/community';

const base: Leaderboard = {
  month: '2026-10',
  points: { post: 10, post_photo_bonus: 5, comment: 4, reaction: 1, rsvp: 3, reaction_received: 2, comment_received: 3 },
  caps: { post: 3, comment: 10, reaction: 20 },
  top: [
    { rank: 1, points: 40, user: { id: 'a', name: 'Ana', avatar_url: null } },
    { rank: 2, points: 12, user: { id: 'b', name: 'Beto', avatar_url: null } },
  ],
  me: { rank: 2, points: 12 },
};

describe('LeaderboardList', () => {
  it('muestra el ranking y marca al viewer dentro del top', () => {
    const { getByText, getByLabelText, queryByText } = render(<LeaderboardList data={base} meId="b" />);
    expect(getByText('Ana')).toBeTruthy();
    expect(getByLabelText('Puesto 2, Beto (vos), 12 puntos')).toBeTruthy();
    expect(queryByText('Tu posición')).toBeNull();
  });

  it('muestra tu posición aparte cuando estás fuera del top', () => {
    const data = { ...base, me: { rank: 31, points: 2 } };
    const { getByText, getByLabelText } = render(<LeaderboardList data={data} meId="z" />);
    expect(getByText('Tu posición')).toBeTruthy();
    expect(getByLabelText('Puesto 31, vos, 2 puntos')).toBeTruthy();
  });

  it('estado vacío cuando nadie sumó en el mes', () => {
    const data = { ...base, top: [], me: { rank: null, points: 0 } };
    const { getByText } = render(<LeaderboardList data={data} meId="z" />);
    expect(getByText('Nadie sumó puntos en octubre todavía.')).toBeTruthy();
  });

  it('explica cómo sumar con los valores que manda el backend', () => {
    const data = { ...base, points: { ...base.points, post: 25 } };
    const { getByText } = render(<LeaderboardList data={data} meId="z" />);
    expect(getByText('+25')).toBeTruthy();
    expect(getByText('Suman hasta 3 publicaciones, 10 comentarios y 20 reacciones por día.')).toBeTruthy();
  });

  it('monthLabel', () => {
    expect(monthLabel('2026-01')).toBe('enero');
    expect(monthLabel('2026-12')).toBe('diciembre');
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx jest __tests__/community-leaderboard.test.tsx`
Expected: FAIL con `Cannot find module '@/components/community/LeaderboardList'`.

- [ ] **Step 4: Agregar tipos y fetch en `lib/community.ts`**

Debajo de `export const unblockUser = ...`:

```ts
export interface LeaderboardPoints {
  post: number; post_photo_bonus: number; comment: number; reaction: number;
  rsvp: number; reaction_received: number; comment_received: number;
}
export interface LeaderboardEntry { rank: number; points: number; user: { id: string; name: string; avatar_url: string | null } }
export interface Leaderboard {
  month: string;
  points: LeaderboardPoints;
  caps: { post: number; comment: number; reaction: number };
  top: LeaderboardEntry[];
  me: { rank: number | null; points: number };
}
export const fetchLeaderboard = () => apiGet<Leaderboard>('/community/leaderboard');
```

- [ ] **Step 5: Crear el componente**

Crear `tr-fit-app/components/community/LeaderboardList.tsx`:

```tsx
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Avatar } from '@/components/ui/Avatar';
import type { Leaderboard, LeaderboardPoints } from '@/lib/community';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthLabel = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

const RULES: [keyof LeaderboardPoints, string][] = [
  ['post', 'Publicar'],
  ['post_photo_bonus', 'Extra si tu publicación tiene foto'],
  ['comment', 'Comentar la publicación de otro'],
  ['reaction', 'Reaccionar a la publicación de otro'],
  ['rsvp', 'Confirmar que vas a un evento'],
  ['reaction_received', 'Cada reacción que recibís'],
  ['comment_received', 'Cada persona que te comenta'],
];

function Row({ rank, name, points, avatar, highlight, label }: {
  rank: number; name: string; points: number; avatar?: string; highlight: boolean; label: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${highlight ? 'bg-accent' : ''}`}
    >
      <Text className="w-7 text-center text-[15px] font-bold text-muted-foreground">{rank}</Text>
      <Avatar name={name} uri={avatar} size={36} />
      <Text className="flex-1 text-[14.5px] font-semibold text-foreground" numberOfLines={1}>{name}</Text>
      <Text className="text-[14.5px] font-bold text-foreground">{points}</Text>
    </View>
  );
}

export function LeaderboardList({ data, meId }: { data: Leaderboard; meId: string }) {
  const month = monthLabel(data.month);
  const meInTop = data.top.some((e) => e.user.id === meId);
  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="text-[13px] font-semibold uppercase text-muted-foreground">Ranking de {month}</Text>
        {data.top.length === 0 ? (
          <Text className="py-8 text-center text-[14px] text-muted-foreground">Nadie sumó puntos en {month} todavía.</Text>
        ) : (
          data.top.map((e) => {
            const isMe = e.user.id === meId;
            return (
              <Row
                key={e.user.id}
                rank={e.rank}
                name={e.user.name}
                points={e.points}
                avatar={e.user.avatar_url ?? undefined}
                highlight={isMe}
                label={`Puesto ${e.rank}, ${e.user.name}${isMe ? ' (vos)' : ''}, ${e.points} puntos`}
              />
            );
          })
        )}
      </View>

      {!meInTop && data.me.rank !== null && (
        <View className="gap-1">
          <Text className="text-[13px] font-semibold uppercase text-muted-foreground">Tu posición</Text>
          <Row
            rank={data.me.rank}
            name="Vos"
            points={data.me.points}
            highlight
            label={`Puesto ${data.me.rank}, vos, ${data.me.points} puntos`}
          />
        </View>
      )}

      <View className="gap-2">
        <Text className="text-[13px] font-semibold uppercase text-muted-foreground">Cómo sumar puntos</Text>
        {RULES.map(([key, text]) => (
          <View key={key} className="flex-row items-center justify-between">
            <Text className="text-[14px] text-foreground">{text}</Text>
            <Text className="text-[14px] font-bold text-foreground">+{data.points[key]}</Text>
          </View>
        ))}
        <Text className="pt-1 text-[12.5px] text-muted-foreground">
          Suman hasta {data.caps.post} publicaciones, {data.caps.comment} comentarios y {data.caps.reaction} reacciones por día.
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx jest __tests__/community-leaderboard.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add lib/community.ts components/community/LeaderboardList.tsx __tests__/community-leaderboard.test.tsx
git commit -m "feat(community): leaderboard list component and API client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pantalla de ranking + acceso desde Comunidad (app)

**Files:**
- Create: `tr-fit-app/app/(app)/community/leaderboard.tsx`
- Modify: `tr-fit-app/app/(app)/athlete/community.tsx` (`CommunityTopBar`, import de iconos línea 7)

**Interfaces:**
- Consumes: `fetchLeaderboard`, `type Leaderboard` (Task 3); `LeaderboardList` (Task 3); `useAuth()` de `@/context/auth` → `{ user: User | null }`, con `User.id: string` (`lib/auth.ts`).
- Produces: ruta `/(app)/community/leaderboard`.

- [ ] **Step 1: Crear la pantalla**

Crear `tr-fit-app/app/(app)/community/leaderboard.tsx` (mismo esqueleto que `community/blocked.tsx`):

```tsx
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { fetchLeaderboard, type Leaderboard } from '@/lib/community';
import { THEME } from '@/lib/theme';
import { LeaderboardList } from '@/components/community/LeaderboardList';

export default function LeaderboardScreen() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  const { user } = useAuth();
  const [data, setData] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((lb) => { if (!cancelled) { setData(lb); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);
  useFocusEffect(load);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center px-4 py-2.5">
        <Pressable onPress={() => router.back()} hitSlop={8} className="min-h-11 flex-row items-center gap-1">
          <ChevronLeft size={20} color={theme.foreground} />
          <Text className="text-[15px] font-semibold text-foreground">Ranking</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}>
        {failed && <Text className="text-sm text-muted-foreground">Necesitás conexión para ver la comunidad</Text>}
        {data && user && <LeaderboardList data={data} meId={user.id} />}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Agregar el botón en la barra superior de Comunidad**

En `tr-fit-app/app/(app)/athlete/community.tsx`, línea 7:

```tsx
import { Plus, RefreshCw, ScrollText, Trophy, Users } from 'lucide-react-native';
```

Dentro de `CommunityTopBar`, como primer hijo de `<View className="flex-row items-center gap-2">` (antes del `Pressable` de "Normas"):

```tsx
        <Pressable
          onPress={() => router.push('/(app)/community/leaderboard' as never)}
          accessibilityRole="button"
          accessibilityLabel="Ranking de la comunidad"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full border border-border active:bg-accent"
        >
          <Trophy size={18} color={theme.foreground} />
        </Pressable>
```

- [ ] **Step 3: Typecheck + suite de la app**

Run: `cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app && npx tsc --noEmit && npm test`
Expected: sin errores de tipos; suite verde.

- [ ] **Step 4: Verificación manual en simulador**

Con backend local (`cd tr-fit-web && npm run start:dev`) y app (`cd tr-fit-app && npm run ios`), logueado como atleta de seed:
1. Comunidad → ícono trofeo → abre "Ranking".
2. Publicar un post con foto → volver al ranking → vos aparecés con 15 puntos.
3. Modo oscuro: la fila resaltada se lee bien.

- [ ] **Step 5: Commit**

```bash
cd /Users/matiasagustinmaldonado/Coding/tr-fit/tr-fit-app
git add "app/(app)/community/leaderboard.tsx" "app/(app)/athlete/community.tsx"
git commit -m "feat(community): leaderboard screen with entry from community top bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Orden de despliegue

1. Backend (Tasks 1–2) a producción primero — es aditivo, no rompe apps viejas.
2. App (Tasks 3–4): va en build nueva por Xcode (agrega pantalla/ruta). Si la build es compatible con el runtime actual, puede ir por OTA (`ota-update.sh`).

## Pendiente de confirmar con el cliente (no bloquea implementar)

- Valores de puntos y topes de la tabla "Decisiones" — cambiar = editar `POINTS` / `DAILY_CAPS`, sin tocar la app.
- ¿Premio para el top del mes? Si implica descuento en `monthly_fee_ars` o canje → plan aparte con tabla ledger.
