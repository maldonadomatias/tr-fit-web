import { Search, X } from 'lucide-react';

export type RutinaOrder = 'age' | 'name';

export function ListFilters({
  query,
  onQuery,
  order,
  onOrder,
}: {
  query: string;
  onQuery: (v: string) => void;
  order: RutinaOrder;
  onOrder: (v: RutinaOrder) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-card px-3 py-3">
      <label className="relative block">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar atleta…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-7 text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </label>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Orden
        </span>
        <select
          value={order}
          onChange={(e) => onOrder(e.target.value as RutinaOrder)}
          className="h-8 flex-1 cursor-pointer rounded-md border border-input bg-background px-2 text-[12px] outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          <option value="age">Antigüedad</option>
          <option value="name">A — Z</option>
        </select>
      </div>
    </div>
  );
}
