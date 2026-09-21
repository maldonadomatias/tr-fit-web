import { useState } from 'react';
import { toast } from 'sonner';
import {
  useCommunityReports,
  useResolveReport,
  type CommunityReport,
} from '@/hooks/useCommunity';
import { REPORT_REASON_LABEL, fmtAge, reportAgeTone } from '@/lib/community';
import { cn } from '@/lib/utils';

export function ReportsTab() {
  const { data: reports, isLoading } = useCommunityReports('open');
  if (isLoading)
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!reports || reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay denuncias pendientes.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Respondé cada denuncia dentro de las 24 h. Se ponen en rojo pasadas las
        20 h.
      </p>
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: CommunityReport }) {
  const resolve = useResolveReport();
  const [days, setDays] = useState('3');
  const danger = reportAgeTone(report.age_hours) === 'danger';

  async function run(action: 'hide' | 'dismiss' | 'mute') {
    try {
      await resolve.mutateAsync(
        action === 'mute'
          ? { id: report.id, action, mute_days: Number(days) }
          : { id: report.id, action }
      );
      toast.success(
        action === 'dismiss' ? 'Denuncia descartada' : 'Denuncia resuelta'
      );
    } catch {
      toast.error('No se pudo resolver la denuncia');
    }
  }

  const btn = 'h-8 rounded-md px-3 text-xs font-semibold disabled:opacity-60';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400">
          {REPORT_REASON_LABEL[report.reason]}
        </span>
        <span className="text-muted-foreground">
          {report.target_type === 'post' ? 'Publicación' : 'Comentario'} ·
          denunció {report.reporter.name}
        </span>
        <span
          data-testid="report-age"
          className={cn(
            'ml-auto font-mono tabular-nums',
            danger ? 'font-bold text-red-600' : 'text-muted-foreground'
          )}
        >
          hace {fmtAge(report.age_hours)}
        </span>
      </div>
      {report.content ? (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          <div className="mb-1 text-xs font-semibold">
            {report.content.author_name}
            {report.content.hidden && (
              <span className="ml-2 text-muted-foreground">(ya oculto)</span>
            )}
          </div>
          <p className="whitespace-pre-wrap">{report.content.body}</p>
          {report.content.media.length > 0 && (
            <div className="mt-2 flex gap-2">
              {report.content.media.map((m) => (
                <img
                  key={m.thumb_url}
                  src={m.thumb_url}
                  alt=""
                  className="size-16 rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          El contenido ya fue borrado.
        </p>
      )}
      {report.note && (
        <p className="mt-2 text-xs text-muted-foreground">
          Nota: {report.note}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run('hide')}
          disabled={resolve.isPending}
          className={cn(btn, 'bg-primary text-primary-foreground')}
        >
          Ocultar
        </button>
        <button
          type="button"
          onClick={() => run('dismiss')}
          disabled={resolve.isPending}
          className={cn(btn, 'border border-border')}
        >
          Descartar
        </button>
        <select
          aria-label="Días de silencio"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {[1, 3, 7, 30].map((d) => (
            <option key={d} value={d}>
              {d} {d === 1 ? 'día' : 'días'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => run('mute')}
          disabled={resolve.isPending}
          className={cn(
            btn,
            'border border-red-500/40 text-red-700 dark:text-red-400'
          )}
        >
          Silenciar {days} {days === '1' ? 'día' : 'días'}
        </button>
      </div>
    </div>
  );
}
