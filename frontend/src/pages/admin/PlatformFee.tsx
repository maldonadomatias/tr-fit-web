// frontend/src/pages/admin/PlatformFee.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { fmtARS, fmtShortDate } from '@/lib/format';
import { Sparkline } from '@/components/admin/Sparkline';
import {
  usePlatformFee,
  usePlatformFeeHistory,
  useUpdatePlatformFeeConfig,
  useApplyAdjustment,
} from '@/hooks/usePlatformFee';

export default function PlatformFee() {
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const { data, isLoading } = usePlatformFee();
  const { data: history } = usePlatformFeeHistory();
  const updateConfig = useUpdatePlatformFeeConfig();
  const applyAdjustment = useApplyAdjustment();

  const [usdInput, setUsdInput] = useState('');

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  }

  const { summary, config } = data;

  async function onApply() {
    const usd = Number(usdInput);
    if (!usd || usd <= 0) {
      toast.error('Ingresá un dólar válido');
      return;
    }
    const newBase = (config.base_fee_ars * usd) / config.reference_usd;
    const ok = window.confirm(
      `Nuevo fee base: ${fmtARS(Math.round(newBase))} (dólar ${usd}). ¿Aplicar?`
    );
    if (!ok) return;
    try {
      await applyAdjustment.mutateAsync(usd);
      setUsdInput('');
      toast.success('Ajuste aplicado');
    } catch {
      toast.error('No se pudo aplicar el ajuste');
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-bold">Facturación TR-FIT</h1>
        <p className="text-sm text-muted-foreground">
          Lo que se abona por el servicio este mes.
        </p>
      </div>

      {/* Hero total */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Total del mes
        </div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums">
          {fmtARS(summary.total_ars)}
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Fee base</dt>
            <dd className="tabular-nums">{fmtARS(summary.base_fee_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {summary.active_athletes} atletas × {fmtARS(summary.price_per_athlete_ars)}
            </dt>
            <dd className="tabular-nums">{fmtARS(summary.gross_revenue_ars)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {summary.revenue_share_pct}% sobre facturación
            </dt>
            <dd className="tabular-nums">{fmtARS(summary.revenue_share_ars)}</dd>
          </div>
        </dl>
      </div>

      {/* Adjustment banner */}
      <div
        className={
          'rounded-lg border p-4 text-sm ' +
          (summary.adjustment_due
            ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/30'
            : 'border-border bg-card')
        }
      >
        <div className="font-semibold">
          {summary.adjustment_due
            ? 'Ajuste trimestral disponible'
            : 'Próximo ajuste'}
        </div>
        <div className="text-muted-foreground">
          Fecha: {fmtShortDate(summary.next_adjustment_date)} · dólar de
          referencia actual: {config.reference_usd}
        </div>

        {isSuper && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-xs text-muted-foreground">
              Dólar BNA vendedor
              <input
                type="number"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder={String(config.current_usd)}
                className="mt-1 h-9 w-32 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
              />
            </label>
            <button
              type="button"
              onClick={onApply}
              disabled={applyAdjustment.isPending}
              className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Aplicar ajuste
            </button>
          </div>
        )}
      </div>

      {/* Superadmin config editor */}
      {isSuper && (
        <ConfigEditor
          config={config}
          onSave={async (patch) => {
            try {
              await updateConfig.mutateAsync(patch);
              toast.success('Configuración guardada');
            } catch {
              toast.error('No se pudo guardar');
            }
          }}
          saving={updateConfig.isPending}
        />
      )}

      {/* History */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Historial mensual</div>
          {history && history.length >= 2 && (
            <Sparkline
              data={[...history].reverse().map((h) => h.total_ars)}
              className="text-brand"
            />
          )}
        </div>
        {!history || history.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Todavía no hay meses cerrados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-1">Mes</th>
                <th className="py-1 text-right">Atletas</th>
                <th className="py-1 text-right">Fee base</th>
                <th className="py-1 text-right">4%</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.period} className="border-t border-border">
                  <td className="py-1.5">{fmtShortDate(h.period)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {h.active_athletes}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtARS(h.base_fee_ars)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {fmtARS(h.revenue_share_ars)}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {fmtARS(h.total_ars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ConfigEditor({
  config,
  onSave,
  saving,
}: {
  config: {
    price_per_athlete_ars: number;
    revenue_share_pct: number;
    adjustment_interval_months: number;
    next_adjustment_date: string;
    base_fee_ars: number;
  };
  onSave: (patch: Record<string, number | string>) => void;
  saving: boolean;
}) {
  const [price, setPrice] = useState(String(config.price_per_athlete_ars));
  const [pct, setPct] = useState(String(config.revenue_share_pct));
  const [base, setBase] = useState(String(config.base_fee_ars));
  const [interval, setInterval] = useState(
    String(config.adjustment_interval_months)
  );
  const [nextDate, setNextDate] = useState(config.next_adjustment_date);

  const field =
    'mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm tabular-nums';

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold">Configuración (superadmin)</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-muted-foreground">
          Fee base (ARS)
          <input
            type="number"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Precio por atleta (ARS)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          % sobre facturación
          <input
            type="number"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Intervalo de ajuste (meses)
          <input
            type="number"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Próximo ajuste (YYYY-MM-DD)
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() =>
          onSave({
            base_fee_ars: Number(base),
            price_per_athlete_ars: Number(price),
            revenue_share_pct: Number(pct),
            adjustment_interval_months: Number(interval),
            next_adjustment_date: nextDate,
          })
        }
        disabled={saving}
        className="mt-4 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Guardar
      </button>
    </div>
  );
}
