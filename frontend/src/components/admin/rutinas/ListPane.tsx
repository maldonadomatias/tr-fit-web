import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { usePendingRutinas } from '@/hooks/usePendingRutinas';
import { ListFilters, type RutinaOrder } from './ListFilters';
import { ListRow } from './ListRow';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function ListPane({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const order = (params.get('order') ?? 'age') as RutinaOrder;
  const debouncedQuery = useDebounce(query, 250);

  const { data: items = [], isLoading } = usePendingRutinas();

  function setQuery(v: string) {
    setParams(
      (p) => {
        if (v) p.set('q', v);
        else p.delete('q');
        return p;
      },
      { replace: true },
    );
  }

  function setOrder(v: RutinaOrder) {
    setParams(
      (p) => {
        if (v === 'age') p.delete('order');
        else p.set('order', v);
        return p;
      },
      { replace: true },
    );
  }

  const filtered = useMemo(() => {
    let arr = items;
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      arr = arr.filter((it) => it.athlete_name.toLowerCase().includes(q));
    }
    arr = [...arr];
    if (order === 'age') {
      arr.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } else if (order === 'name') {
      arr.sort((a, b) => a.athlete_name.localeCompare(b.athlete_name));
    }
    return arr;
  }, [items, debouncedQuery, order]);

  const total = items.length;
  const todayCount = items.filter((it) => isToday(it.created_at)).length;

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      <ListFilters
        query={query}
        onQuery={setQuery}
        order={order}
        onOrder={setOrder}
      />

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-md bg-muted/40"
              />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && total === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Cola vacía
            </span>
            <span className="text-[13px] text-muted-foreground">
              Sin rutinas pendientes de revisar.
            </span>
          </div>
        )}

        {!isLoading && filtered.length === 0 && total > 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
            <span className="text-[13px] text-muted-foreground">
              Sin resultados para esa búsqueda.
            </span>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-[12px] text-foreground underline-offset-2 hover:underline"
            >
              Limpiar
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {filtered.map((it) => (
            <ListRow
              key={it.id}
              item={it}
              isActive={it.id === activeId}
              onClick={() => onSelect(it.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>
          <b className="font-mono text-foreground">{total}</b> pending
        </span>
        <span className="text-border">·</span>
        <span>{todayCount} hoy</span>
        <span className="ml-auto flex items-center gap-1 text-[10px]">
          <Clock size={10} /> queue
        </span>
      </div>
    </aside>
  );
}
