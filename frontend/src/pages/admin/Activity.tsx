import { useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/admin/PageHeader';
import { Eyebrow } from '@/components/admin/Eyebrow';
import { Segmented } from '@/components/admin/Segmented';
import { Timeline, type TimelineEntry } from '@/components/admin/Timeline';
import {
  useActivityLog,
  type ActivityCategory,
} from '@/hooks/useActivityLog';
import { activityLabel, activitySub } from '@/lib/activity';
import { fmtTimeAgo } from '@/lib/format';
import type { ActivityEvent } from '@/types/api';

type CategoryKey = ActivityCategory | 'all';

export default function Activity() {
  const [category, setCategory] = useState<CategoryKey>('all');
  const [search, setSearch] = useState('');
  const q = useActivityLog({
    category: category === 'all' ? undefined : category,
    limit: 200,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data ?? []).filter((ev) => {
      if (!needle) return true;
      const hay = `${ev.actor} ${ev.target ?? ''} ${ev.type}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [q.data, search]);

  const groups = useMemo(() => groupByBucket(filtered), [filtered]);

  function exportCsv() {
    const header = 'created_at,type,actor,target,severity\n';
    const lines = filtered
      .map(
        (e) =>
          `${e.created_at},${e.type},${csv(e.actor)},${csv(e.target ?? '')},${e.severity ?? ''}`,
      )
      .join('\n');
    const blob = new Blob([header + lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actividad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        eyebrow="04 — Bitácora"
        title="Actividad del sistema"
        sub="Eventos de admin, suscripciones y autenticación · últimos 7 días"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download data-icon="inline-start" />
              Exportar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw data-icon="inline-start" />
              Actualizar
            </Button>
          </>
        }
      />

      <div className="mb-4 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<CategoryKey>
            value={category}
            onChange={setCategory}
            options={[
              { key: 'all', label: 'Todo' },
              { key: 'user', label: 'Usuarios' },
              { key: 'sub', label: 'Suscripciones' },
              { key: 'auth', label: 'Auth' },
            ]}
          />
          <div className="ml-auto flex h-8 w-72 items-center gap-2 rounded-md border bg-background px-2.5 text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar actor o destino…"
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">
          Sin eventos con ese filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 px-1">
                <Eyebrow variant="muted">{g.label}</Eyebrow>
              </div>
              <div className="rounded-2xl border bg-card p-[18px]">
                <Timeline items={g.items.map(toTimelineEntry)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Bucket {
  label: string;
  items: ActivityEvent[];
}

function groupByBucket(events: ActivityEvent[]): Bucket[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);

  const buckets: Bucket[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Anterior', items: [] },
  ];

  for (const ev of events) {
    const t = new Date(ev.created_at).getTime();
    if (t >= today.getTime()) buckets[0].items.push(ev);
    else if (t >= yesterday.getTime()) buckets[1].items.push(ev);
    else if (t >= weekStart.getTime()) buckets[2].items.push(ev);
    else buckets[3].items.push(ev);
  }
  return buckets.filter((b) => b.items.length > 0);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toTimelineEntry(ev: ActivityEvent): TimelineEntry {
  const sub = activitySub(ev);
  return {
    id: ev.id,
    title: activityLabel(ev.type),
    sub: (
      <>
        actor <span className="font-mono">{ev.actor}</span>
        {ev.target && (
          <>
            {' · '}
            <span className="font-mono">{ev.target}</span>
          </>
        )}
        {sub && (
          <>
            {' · '}
            <span className="font-mono">{sub}</span>
          </>
        )}
      </>
    ),
    time: <>hace {fmtTimeAgo(ev.created_at)}</>,
    severity: ev.severity,
  };
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
