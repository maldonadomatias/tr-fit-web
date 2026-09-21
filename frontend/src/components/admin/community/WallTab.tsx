import { useState } from 'react';
import { toast } from 'sonner';
import {
  useCommunityWall,
  useDeleteCommunityPost,
  useEventRsvps,
  useSetPostHidden,
  useSetPostPinned,
  type CommunityPost,
} from '@/hooks/useCommunity';
import { apiErrorCode } from '@/lib/community';
import { fmtTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const KIND_LABEL = {
  post: 'Publicación',
  announcement: 'Aviso',
  event: 'Evento',
};
const CATEGORY_LABEL = {
  general: 'General',
  meals: 'Comidas',
  training: 'Entrenamiento',
};

export function WallTab() {
  const [showHidden, setShowHidden] = useState(true);
  const wall = useCommunityWall(showHidden);
  const posts = wall.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => setShowHidden(e.target.checked)}
        />
        Mostrar ocultas
      </label>
      {wall.isLoading && (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}
      {!wall.isLoading && posts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay publicaciones.
        </p>
      )}
      {posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
      {wall.hasNextPage && (
        <button
          type="button"
          onClick={() => wall.fetchNextPage()}
          disabled={wall.isFetchingNextPage}
          className="h-9 self-center rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60"
        >
          {wall.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  );
}

function PostRow({ post }: { post: CommunityPost }) {
  const hide = useSetPostHidden();
  const pin = useSetPostPinned();
  const del = useDeleteCommunityPost();
  const [showRsvps, setShowRsvps] = useState(false);
  const hidden = !!post.hidden_at;

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(
        apiErrorCode(e) === 'pin_limit'
          ? 'Ya hay 3 publicaciones fijadas. Desfijá una primero.'
          : 'No se pudo completar la acción'
      );
    }
  }

  function onDelete() {
    if (!window.confirm('¿Borrar esta publicación? No se puede deshacer.'))
      return;
    void act(() => del.mutateAsync(post.id), 'Publicación borrada');
  }

  const btn =
    'h-7 rounded-md border border-border px-2.5 text-xs font-semibold disabled:opacity-60';

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4',
        hidden && 'opacity-50'
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{post.author.name}</span>
        {post.author.is_coach && (
          <span className="rounded-full bg-brand/15 px-1.5 py-0.5 font-bold text-brand">
            Coach
          </span>
        )}
        <span className="text-muted-foreground">
          hace {fmtTimeAgo(post.created_at)}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
          {KIND_LABEL[post.kind]}
        </span>
        <span className="text-muted-foreground">
          {CATEGORY_LABEL[post.category]}
        </span>
        {post.pinned && <span>📌 Fijada</span>}
        {hidden && (
          <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 font-semibold text-red-700 dark:text-red-400">
            Oculta
          </span>
        )}
      </div>
      {post.body && (
        <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
      )}
      {post.media.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {post.media.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
              <img
                src={m.thumb_url}
                alt=""
                className="size-20 rounded object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {post.event && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
          <div className="font-semibold">
            {new Date(post.event.starts_at).toLocaleString('es-AR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </div>
          {post.event.location && (
            <div className="text-muted-foreground">{post.event.location}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {post.event.rsvp_count} asistentes
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground tabular-nums">
        {post.reactions.length > 0
          ? post.reactions.map((r) => `${r.emoji} ${r.count}`).join('  ')
          : 'Sin reacciones'}{' '}
        · 💬 {post.comment_count}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={hide.isPending}
          onClick={() =>
            act(
              () => hide.mutateAsync({ id: post.id, hidden: !hidden }),
              hidden ? 'Publicación restaurada' : 'Publicación oculta'
            )
          }
        >
          {hidden ? 'Restaurar' : 'Ocultar'}
        </button>
        <button
          type="button"
          className={btn}
          disabled={pin.isPending}
          onClick={() =>
            act(
              () => pin.mutateAsync({ id: post.id, pinned: !post.pinned }),
              post.pinned ? 'Publicación desfijada' : 'Publicación fijada'
            )
          }
        >
          {post.pinned ? 'Desfijar' : 'Fijar'}
        </button>
        {post.kind === 'event' && (
          <button
            type="button"
            className={btn}
            onClick={() => setShowRsvps((s) => !s)}
          >
            {showRsvps ? 'Ocultar asistentes' : 'Ver asistentes'}
          </button>
        )}
        <button
          type="button"
          className={cn(
            btn,
            'border-red-500/40 text-red-700 dark:text-red-400'
          )}
          disabled={del.isPending}
          onClick={onDelete}
        >
          Borrar
        </button>
      </div>
      {showRsvps && <RsvpList postId={post.id} />}
    </div>
  );
}

function RsvpList({ postId }: { postId: string }) {
  const { data, isLoading } = useEventRsvps(postId);
  if (isLoading)
    return <p className="mt-2 text-xs text-muted-foreground">Cargando…</p>;
  if (!data || data.length === 0)
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Nadie confirmó todavía.
      </p>
    );
  return (
    <ul className="mt-2 text-sm">
      {data.map((r) => (
        <li key={r.id}>{r.name}</li>
      ))}
    </ul>
  );
}
