import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useActiveAthletes } from '@/hooks/useAdminRutina';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { fmtTimeAgo } from '@/lib/format';

export function ListPaneActivas({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 250);
  const { data, isLoading } = useActiveAthletes(debounced.trim() || undefined);

  return (
    <aside className="flex h-full min-h-0 flex-col border-b border-border bg-card lg:border-b-0 lg:border-r">
      <div className="border-b border-border p-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar atleta..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      <div
        role="region"
        aria-label="Atletas con rutina activa"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {isLoading && (
          <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
        )}
        {!isLoading && (data?.items ?? []).length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            Sin atletas con rutina activa.
          </div>
        )}
        {(data?.items ?? []).map((a) => (
          <button
            key={a.athlete_id}
            onClick={() => onSelect(a.athlete_id)}
            className={cn(
              'w-full border-b border-border px-4 py-3 text-left text-sm hover:bg-muted/50',
              activeId === a.athlete_id && 'bg-muted'
            )}
          >
            <div className="font-medium">{a.name}</div>
            <div className="text-xs text-muted-foreground">
              {a.days_per_week} días/sem ·{' '}
              {a.reviewed_at ? fmtTimeAgo(a.reviewed_at) : 'sin revisar'}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
