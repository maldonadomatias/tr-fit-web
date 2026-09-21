import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCreateCommunityPost } from '@/hooks/useCommunity';
import {
  apiErrorCode,
  validatePublishForm,
  type PublishFormValues,
} from '@/lib/community';
import { prepareImage } from '@/lib/image';
import { cn } from '@/lib/utils';

const EMPTY: PublishFormValues = {
  kind: 'announcement',
  body: '',
  event_location: '',
  event_starts_at: '',
  pin: false,
};

const field =
  'mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';

function fmtEventDate(local: string): string {
  if (!local) return 'Fecha a definir';
  return new Date(local).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PublishTab() {
  const create = useCreateCommunityPost();
  const [v, setV] = useState<PublishFormValues>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<keyof PublishFormValues, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = <K extends keyof PublishFormValues>(
    k: K,
    val: PublishFormValues[K]
  ) => setV((prev) => ({ ...prev, [k]: val }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validatePublishForm(v);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    try {
      const image = photo ? await prepareImage(photo) : null;
      await create.mutateAsync({
        kind: v.kind,
        body: v.body.trim(),
        pin: v.pin,
        image,
        ...(v.kind === 'event'
          ? {
              event_location: v.event_location.trim(),
              event_starts_at: new Date(v.event_starts_at).toISOString(),
            }
          : {}),
      });
      setV(EMPTY);
      setPhoto(null);
      setFileKey((k) => k + 1);
      toast.success('Publicado. Les llega un aviso a todos los alumnos.');
    } catch (err) {
      toast.error(
        apiErrorCode(err) === 'pin_limit'
          ? 'Ya hay 3 publicaciones fijadas. Desfijá una desde el Muro.'
          : 'No se pudo publicar'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-lg border border-border bg-card p-5"
      >
        <div
          role="radiogroup"
          aria-label="Tipo"
          className="mb-4 inline-flex rounded-md border border-border p-0.5"
        >
          {(
            [
              ['announcement', 'Aviso'],
              ['event', 'Evento'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.kind === k}
              onClick={() => set('kind', k)}
              className={cn(
                'h-8 rounded px-3 text-sm font-medium',
                v.kind === k
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col text-xs text-muted-foreground">
            Texto
            <textarea
              value={v.body}
              maxLength={2000}
              onChange={(e) => set('body', e.target.value)}
              className="mt-1 min-h-32 rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          </label>
          <div className="flex justify-between text-xs">
            <span className="text-red-600">{errors.body}</span>
            <span className="tabular-nums text-muted-foreground">
              {v.body.length}/2000
            </span>
          </div>

          {v.kind === 'event' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col text-xs text-muted-foreground">
                <label className="flex flex-col">
                  Lugar
                  <input
                    value={v.event_location}
                    maxLength={200}
                    onChange={(e) => set('event_location', e.target.value)}
                    className={field}
                  />
                </label>
                <span className="mt-1 text-red-600">
                  {errors.event_location}
                </span>
              </div>
              <div className="flex flex-col text-xs text-muted-foreground">
                <label className="flex flex-col">
                  Fecha y hora
                  <input
                    type="datetime-local"
                    value={v.event_starts_at}
                    onChange={(e) => set('event_starts_at', e.target.value)}
                    className={field}
                  />
                </label>
                <span className="mt-1 text-red-600">
                  {errors.event_starts_at}
                </span>
              </div>
            </div>
          )}

          <label className="flex flex-col text-xs text-muted-foreground">
            Foto (opcional)
            <input
              key={fileKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="mt-1 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.pin}
              onChange={(e) => set('pin', e.target.checked)}
            />
            Fijar arriba
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Publicando…' : 'Publicar'}
        </button>
      </form>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Vista previa
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold">Vos</span>
            <span className="rounded-full bg-brand/15 px-1.5 py-0.5 font-bold text-brand">
              Coach
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
              {v.kind === 'event' ? 'Evento' : 'Aviso'}
            </span>
            {v.pin && (
              <span className="ml-auto text-muted-foreground">📌 Fijada</span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {v.body || (
              <span className="text-muted-foreground">
                El texto aparece acá.
              </span>
            )}
          </p>
          {preview && (
            <img
              src={preview}
              alt=""
              className="mt-3 max-h-64 w-full rounded-md object-cover"
            />
          )}
          {v.kind === 'event' && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
              <div className="font-semibold">
                {fmtEventDate(v.event_starts_at)}
              </div>
              <div className="text-muted-foreground">
                {v.event_location || 'Lugar a definir'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
