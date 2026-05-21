import { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PendingRutina } from '@/types/api';

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

export function ListRow({
  item,
  isActive,
  onClick,
}: {
  item: PendingRutina;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const parent = el.parentElement;
    if (!parent) return;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (er.top < pr.top) parent.scrollTop += er.top - pr.top - 8;
    else if (er.bottom > pr.bottom) parent.scrollTop += er.bottom - pr.bottom + 8;
  }, [isActive]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={isActive}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-3 text-left transition',
        isActive
          ? 'border-border bg-muted/60'
          : 'hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 size-2.5 shrink-0 rounded-full',
          isActive
            ? 'bg-brand'
            : 'border-[1.5px] border-brand',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {item.athlete_name}
        </span>
        <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">
          {ago(item.created_at)}
        </span>
      </span>
      {isActive ? (
        <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
          Activa
        </span>
      ) : (
        <ChevronRight
          size={14}
          className="text-muted-foreground/60 group-hover:text-muted-foreground"
        />
      )}
    </button>
  );
}
