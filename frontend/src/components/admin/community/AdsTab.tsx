import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAdMetrics,
  useArchiveAd,
  useCommunityAds,
  useCreateAd,
  type CommunityAd,
} from '@/hooks/useCommunity';
import {
  buildAdReport,
  ddmm,
  fmtNum,
  groupAds,
  validateAdForm,
  type AdFormErrors,
  type AdFormValues,
} from '@/lib/community';
import { prepareImage } from '@/lib/image';
import { fmtARS } from '@/lib/format';
import { Sparkline } from '@/components/admin/Sparkline';

const EMPTY: AdFormValues = {
  brand_name: '',
  body: '',
  cta_label: '',
  cta_url: '',
  monthly_fee_ars: '',
  starts_on: '',
  ends_on: '',
  image: null,
};

const field =
  'mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';
const card = 'rounded-lg border border-border bg-card p-5';

export function AdsTab() {
  const { data: ads, isLoading } = useCommunityAds();
  const [selected, setSelected] = useState<string | null>(null);
  const groups = groupAds(ads ?? []);
  const selectedAd = ads?.find((a) => a.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <AdForm />
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {selectedAd && (
        <AdDetail ad={selectedAd} onClose={() => setSelected(null)} />
      )}
      <AdList
        title="Vigentes"
        ads={groups.active}
        onMetrics={setSelected}
        canArchive
      />
      <AdList
        title="Próximas"
        ads={groups.upcoming}
        onMetrics={setSelected}
        canArchive
      />
      <AdList
        title="Vencidas / dadas de baja"
        ads={groups.ended}
        onMetrics={setSelected}
      />
    </div>
  );
}

function AdForm() {
  const create = useCreateAd();
  const [v, setV] = useState<AdFormValues>(EMPTY);
  const [errors, setErrors] = useState<AdFormErrors>({});
  const [busy, setBusy] = useState(false);
  // Remount the file input on reset (file inputs can't be cleared via value).
  const [fileKey, setFileKey] = useState(0);

  const set = <K extends keyof AdFormValues>(k: K, val: AdFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAdForm(v);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    try {
      const prepared = await prepareImage(v.image!);
      await create.mutateAsync({
        brand_name: v.brand_name.trim(),
        body: v.body.trim(),
        cta_label: v.cta_label.trim(),
        cta_url: v.cta_url.trim(),
        monthly_fee_ars: Number(v.monthly_fee_ars),
        starts_on: v.starts_on,
        ends_on: v.ends_on,
        image: prepared.image,
      });
      setV(EMPTY);
      setFileKey((k) => k + 1);
      toast.success('Publicidad creada');
    } catch {
      toast.error('No se pudo crear la publicidad');
    } finally {
      setBusy(false);
    }
  }

  const err = (k: keyof AdFormValues) =>
    errors[k] && <span className="mt-1 text-red-600">{errors[k]}</span>;

  return (
    <form onSubmit={onSubmit} noValidate className={card}>
      <div className="mb-3 text-sm font-semibold">Nueva publicidad</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-muted-foreground">
          Marca
          <input
            value={v.brand_name}
            onChange={(e) => set('brand_name', e.target.value)}
            className={field}
          />
          {err('brand_name')}
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Imagen
          <input
            key={fileKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => set('image', e.target.files?.[0] ?? null)}
            className="mt-1 text-sm"
          />
          {err('image')}
        </label>
        <label className="flex flex-col text-xs text-muted-foreground sm:col-span-2">
          Texto
          <textarea
            value={v.body}
            maxLength={280}
            onChange={(e) => set('body', e.target.value)}
            className="mt-1 min-h-16 rounded-md border border-border bg-background p-2 text-sm text-foreground"
          />
          <span className="mt-1 self-end tabular-nums">
            {v.body.length}/280
          </span>
          {err('body')}
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Texto del botón
          <input
            value={v.cta_label}
            onChange={(e) => set('cta_label', e.target.value)}
            placeholder="Ver más"
            className={field}
          />
          {err('cta_label')}
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Link
          <input
            type="url"
            value={v.cta_url}
            onChange={(e) => set('cta_url', e.target.value)}
            placeholder="https://"
            className={field}
          />
          {err('cta_url')}
        </label>
        <div className="flex flex-col text-xs text-muted-foreground">
          <label className="flex flex-col">
            Monto mensual (ARS)
            <input
              type="number"
              min={0}
              value={v.monthly_fee_ars}
              onChange={(e) => set('monthly_fee_ars', e.target.value)}
              className={field}
            />
          </label>
          <span className="mt-1">
            El monto no se puede editar después. Para cambiarlo, dala de baja y
            creá otra.
          </span>
          {err('monthly_fee_ars')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-xs text-muted-foreground">
            Desde
            <input
              type="date"
              value={v.starts_on}
              onChange={(e) => set('starts_on', e.target.value)}
              className={field}
            />
            {err('starts_on')}
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Hasta
            <input
              type="date"
              value={v.ends_on}
              onChange={(e) => set('ends_on', e.target.value)}
              className={field}
            />
            {err('ends_on')}
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Crear publicidad
      </button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Se muestra en el muro de la app de los alumnos, no en esta pantalla.
        Mientras esté vigente, aparece una tarjeta cada 8 publicaciones. Si hay
        menos de 8, se muestra una al final. Si cargás varias, rotan en el orden
        en que las creaste. Antes de Desde o después de Hasta no se muestra.
      </p>
    </form>
  );
}

function AdList({
  title,
  ads,
  onMetrics,
  canArchive = false,
}: {
  title: string;
  ads: CommunityAd[];
  onMetrics: (id: string) => void;
  canArchive?: boolean;
}) {
  const archive = useArchiveAd();
  if (ads.length === 0) return null;

  async function onArchive(id: string) {
    if (
      !window.confirm(
        '¿Dar de baja esta publicidad? Deja de mostrarse en el muro.'
      )
    )
      return;
    try {
      await archive.mutateAsync(id);
      toast.success('Publicidad dada de baja');
    } catch {
      toast.error('No se pudo dar de baja');
    }
  }

  return (
    <div className={card}>
      <div className="mb-3 text-sm font-semibold">
        {title} <span className="text-muted-foreground">({ads.length})</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {ads.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
            <img
              src={a.image_url}
              alt=""
              className="size-12 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {a.brand_name}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {ddmm(a.starts_on)} – {ddmm(a.ends_on)} ·{' '}
                {fmtARS(a.monthly_fee_ars)}/mes
                {a.status === 'active' && ' · visible en la app'}
                {a.status === 'upcoming' && ' · todavía no empieza'}
                {a.status === 'expired' && ' · vencida, no se muestra'}
                {a.status === 'archived' && ' · dada de baja'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onMetrics(a.id)}
              className="h-8 rounded-md border border-border px-3 text-xs font-semibold"
            >
              Ver métricas
            </button>
            {canArchive && (
              <button
                type="button"
                onClick={() => onArchive(a.id)}
                disabled={archive.isPending}
                className="h-8 rounded-md border border-red-500/40 px-3 text-xs font-semibold text-red-700 disabled:opacity-60 dark:text-red-400"
              >
                Dar de baja
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdDetail({ ad, onClose }: { ad: CommunityAd; onClose: () => void }) {
  const { data: m, isLoading } = useAdMetrics(ad.id);

  async function copy() {
    if (!m) return;
    try {
      await navigator.clipboard.writeText(buildAdReport(ad, m));
      toast.success('Reporte copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm font-semibold">Métricas · {ad.brand_name}</div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Cerrar
        </button>
      </div>
      {isLoading || !m ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                ['Vistas', m.views],
                ['Clics', m.clicks],
                ['Alcance', m.reach],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-md bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{fmtNum(n)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 text-brand">
            <Sparkline
              data={m.daily.map((d) => d.views)}
              width={320}
              height={48}
            />
          </div>
          <button
            type="button"
            onClick={copy}
            className="mt-3 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            Copiar reporte
          </button>
        </>
      )}
    </div>
  );
}
