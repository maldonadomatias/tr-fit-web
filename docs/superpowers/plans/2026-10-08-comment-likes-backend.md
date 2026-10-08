# Comment Likes (MG en comentarios) — Backend Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **auto-build host:** Claude plans+reviews; Grok implements via headless CLI.
> <!-- auto-build plan · 2026-10-08 · source: claude+writing-plans -->

**Goal:** Users can "me gusta" (MG, heart only — no emoji picker) any visible community comment. Like count is public on every comment; only the comment's author can list who liked it (same privacy rule as post reactions: `listReactors`). Admins do NOT bypass.

**Architecture:** New table `community_comment_likes` (one row per user per comment). `COMMENT_SELECT` returns `like_count` + `liked_by_me`. Three routes on `/api/community/comments/:id/...`. Mirrors existing post-reaction code in `backend/src/services/community.service.ts` (`listReactors`, `setReaction`).

**Tech Stack:** Node 20, Express, TypeScript (ESM), PostgreSQL, Jest + supertest integration tests (`backend/tests/integration`).

## Global Constraints
- Do NOT commit, push, or open PRs.
- Minimal diff; no drive-by refactors; follow existing code style (prettier, 2 spaces, single quotes).
- All work inside `backend/`.

## Review Focus
- Liking a deleted/hidden comment → 404 `comment_not_found`.
- Liking a comment whose post the viewer cannot see (deleted/hidden post, blocked author) → 404 `post_not_found` (reuse `assertVisiblePost`).
- Double like / double unlike are idempotent 204s.
- Non-author (including admin) GET likers → 403 `{ error: 'forbidden' }`.
- `createComment` response must include `like_count: 0, liked_by_me: false` (its SELECT currently binds `$1` = commentId — must be re-bound, see Task 2).

## File Structure
- Create: `backend/src/db/migrations/072_community_comment_likes.sql`
- Modify: `backend/src/services/community.service.ts` (CommentDTO, CommentRow, COMMENT_SELECT, toCommentDTO, createComment final SELECT, new `setCommentLike`, `listCommentLikers`)
- Modify: `backend/src/routes/community.ts` (3 routes, import new fns)
- Test: `backend/tests/integration/community-posts.test.ts` (add one `it` block)

---

### Task 1: Migration

**Files:** Create `backend/src/db/migrations/072_community_comment_likes.sql`

- [ ] **Step 1: Write migration**

```sql
-- 072 — "Me gusta" on comments. One like per user per comment; only the
-- comment author can list who liked it (same rule as post reactions).
CREATE TABLE IF NOT EXISTS community_comment_likes (
  comment_id  UUID NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
```

(Test DB reset truncates `users ... CASCADE`, so no change to `tests/integration/helpers/test-db.ts` is needed.)

### Task 2: Service + routes + test

**Files:**
- Modify: `backend/src/services/community.service.ts`
- Modify: `backend/src/routes/community.ts`
- Test: `backend/tests/integration/community-posts.test.ts`

**Interfaces (produces):**
- `CommentDTO` gains `like_count: number; liked_by_me: boolean`.
- `export async function setCommentLike(viewer: Viewer, commentId: string, liked: boolean): Promise<void>`
- `export interface CommentLikerDTO { id: string; name: string; avatar_url: string | null }`
- `export async function listCommentLikers(viewer: Viewer, commentId: string): Promise<CommentLikerDTO[]>`
- HTTP: `PUT /api/community/comments/:id/like` → 204; `DELETE /api/community/comments/:id/like` → 204; `GET /api/community/comments/:id/likes` → `200 { items: CommentLikerDTO[] }`. Invalid uuid → 404 `comment_not_found`.

- [ ] **Step 1: Write the failing test** — add after the `'comments: photo-only comment ...'` test in `community-posts.test.ts`:

```ts
  it('comment likes: count public, toggle idempotent, only comment author lists likers', async () => {
    await enableCommunity();
    const postAuthor = await makeUser('athlete', 'Ana');
    const commenter = await makeUser('athlete', 'Beto');
    const admin = await makeUser('admin', 'Coach');
    const p = await insertPost(postAuthor.id);
    const created = await request(app)
      .post(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ body: 'hola' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ like_count: 0, liked_by_me: false });
    const cid = created.body.id;
    const like = (token: string) =>
      request(app)
        .put(`/api/community/comments/${cid}/like`)
        .set('Authorization', `Bearer ${token}`);

    await like(postAuthor.token).expect(204);
    await like(postAuthor.token).expect(204); // idempotent
    await like(admin.token).expect(204);

    const asAna = await request(app)
      .get(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${postAuthor.token}`);
    expect(asAna.body.items[0]).toMatchObject({ like_count: 2, liked_by_me: true });
    const asBeto = await request(app)
      .get(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`);
    expect(asBeto.body.items[0]).toMatchObject({ like_count: 2, liked_by_me: false });
    expect(JSON.stringify(asBeto.body)).not.toContain('Coach Test');

    const own = await request(app)
      .get(`/api/community/comments/${cid}/likes`)
      .set('Authorization', `Bearer ${commenter.token}`);
    expect(own.status).toBe(200);
    expect(own.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: postAuthor.id, name: 'Ana Test' }),
        expect.objectContaining({ id: admin.id, name: 'Coach Test' }),
      ])
    );
    expect(own.body.items[0]).not.toHaveProperty('email');

    for (const t of [postAuthor.token, admin.token]) {
      const r = await request(app)
        .get(`/api/community/comments/${cid}/likes`)
        .set('Authorization', `Bearer ${t}`);
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ error: 'forbidden' });
    }

    await request(app)
      .delete(`/api/community/comments/${cid}/like`)
      .set('Authorization', `Bearer ${postAuthor.token}`)
      .expect(204);
    await request(app)
      .delete(`/api/community/comments/${cid}/like`)
      .set('Authorization', `Bearer ${postAuthor.token}`)
      .expect(204); // idempotent
    const after = await request(app)
      .get(`/api/community/posts/${p}/comments`)
      .set('Authorization', `Bearer ${postAuthor.token}`);
    expect(after.body.items[0]).toMatchObject({ like_count: 1, liked_by_me: false });

    const missing = '00000000-0000-4000-8000-000000000000';
    const r404 = await request(app)
      .put(`/api/community/comments/${missing}/like`)
      .set('Authorization', `Bearer ${postAuthor.token}`);
    expect(r404.status).toBe(404);
    const bad = await request(app)
      .get(`/api/community/comments/not-a-uuid/likes`)
      .set('Authorization', `Bearer ${commenter.token}`);
    expect(bad.status).toBe(404);

    await request(app)
      .delete(`/api/community/comments/${cid}`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .expect(204);
    const gone = await like(admin.token);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ error: 'comment_not_found' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npm test -- tests/integration/community-posts.test.ts -t "comment likes"`
Expected: FAIL (404 on `/comments/:id/like` or missing `like_count`).
Integration tests need Postgres; the repo's docker postgres runs on localhost:5433 (`tr-fit-web-postgres-1`). Check `backend/jest.config.js` / `tests/integration/helpers/test-db.ts` for the env var the tests use. If `node_modules` is missing, run `npm ci` in `backend/` first. If the DB truly cannot be reached, still implement everything and report that integration tests could not run, plus run `npx tsc --noEmit -p tsconfig.json` and `npm run lint` in `backend/`.

- [ ] **Step 3: Implement service**

In `community.service.ts`:

1. `CommentDTO` (≈line 70): add `like_count: number;` and `liked_by_me: boolean;`.
2. `CommentRow`: add `like_count: number; liked_by_me: boolean;`.
3. `COMMENT_SELECT`: after the `AS media` expression add (note `$1` is ALWAYS the viewer id for this SELECT):
```sql
         , (SELECT count(*) FROM community_comment_likes cl WHERE cl.comment_id = c.id)::int AS like_count,
         EXISTS (SELECT 1 FROM community_comment_likes cl
                  WHERE cl.comment_id = c.id AND cl.user_id = $1) AS liked_by_me
```
   Add a one-line comment above `COMMENT_SELECT`: `// $1 is always the viewer id.`
4. `toCommentDTO`: add `like_count: Number(row.like_count), liked_by_me: !!row.liked_by_me,`.
5. `listComments` already passes `[viewer.id, postId]` → fine.
6. `createComment` final query: change
   `pool.query<CommentRow>(\`${COMMENT_SELECT} WHERE c.id = $1\`, [commentId])`
   to
   `pool.query<CommentRow>(\`${COMMENT_SELECT} WHERE c.id = $2\`, [viewer.id, commentId])`.
7. Grep for any other use of `COMMENT_SELECT` (e.g. in `community-moderation.service.ts` or admin routes) and make sure `$1` is the viewer/admin id there too; if a caller has no viewer, pass a nil uuid `'00000000-0000-0000-0000-000000000000'` as `$1` and shift its params.
8. Add after `deleteComment`:

```ts
/** Visible, non-deleted comment or 404. Also enforces post visibility for the viewer. */
async function assertVisibleComment(
  viewer: Viewer,
  commentId: string
): Promise<{ author_id: string }> {
  const r = await pool.query<{ author_id: string; post_id: string }>(
    `SELECT author_id, post_id FROM community_comments
      WHERE id = $1 AND deleted_at IS NULL AND hidden_at IS NULL`,
    [commentId]
  );
  const c = r.rows[0];
  if (!c) throw new CommunityError(404, 'comment_not_found');
  await assertVisiblePost(viewer, c.post_id);
  return c;
}

/** "Me gusta" on a comment. Idempotent both ways. */
export async function setCommentLike(
  viewer: Viewer,
  commentId: string,
  liked: boolean
): Promise<void> {
  await assertVisibleComment(viewer, commentId);
  await pool.query(
    liked
      ? `INSERT INTO community_comment_likes (comment_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`
      : `DELETE FROM community_comment_likes WHERE comment_id = $1 AND user_id = $2`,
    [commentId, viewer.id]
  );
}

export interface CommentLikerDTO {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Who liked a comment. Only the comment author gets the names; admins do not bypass. */
export async function listCommentLikers(
  viewer: Viewer,
  commentId: string
): Promise<CommentLikerDTO[]> {
  const c = await assertVisibleComment(viewer, commentId);
  if (c.author_id !== viewer.id) throw new CommunityError(403, 'forbidden');
  const r = await pool.query<CommentLikerDTO>(
    `SELECT u.id, ${AUTHOR_NAME_SQL('u', 'ap', 'cp')} AS name, ap.avatar_url
       FROM community_comment_likes l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
      WHERE l.comment_id = $1
      ORDER BY l.created_at DESC, u.id`,
    [commentId]
  );
  return r.rows;
}
```

- [ ] **Step 4: Implement routes** in `routes/community.ts`, right after the `router.delete('/comments/:id', ...)` block; import `setCommentLike`, `listCommentLikers` alongside the other service imports:

```ts
for (const [method, liked] of [
  ['put', true],
  ['delete', false],
] as const) {
  router[method](
    '/comments/:id/like',
    handle(async (req, res) => {
      if (!uuid.safeParse(req.params.id).success)
        return res.status(404).json({ error: 'comment_not_found' });
      await setCommentLike(viewerOf(req), req.params.id, liked);
      res.status(204).end();
    })
  );
}

router.get(
  '/comments/:id/likes',
  handle(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(404).json({ error: 'comment_not_found' });
    res.json({ items: await listCommentLikers(viewerOf(req), req.params.id) });
  })
);
```

- [ ] **Step 5: Run tests** — `npm test -- tests/integration/community-posts.test.ts` and `tests/integration/community-moderation.test.ts` from `backend/`. Expected: all pass. Then `npx tsc --noEmit` (or `npm run build`) and `npm run lint` in `backend/`.

- [ ] **Step 6: Commit** — skip unless user asked to commit.
