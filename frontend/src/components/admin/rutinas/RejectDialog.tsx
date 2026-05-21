import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type TagGroup = {
  label: string;
  options: string[];
};

const TAG_GROUPS: TagGroup[] = [
  { label: 'Volumen', options: ['Mucho', 'Poco'] },
  { label: 'Intensidad', options: ['Muy alta', 'Muy baja'] },
  { label: 'Selección', options: ['Ejercicios no aptos', 'Falta variedad'] },
  { label: 'Equipo', options: ['No disponible', 'Mal asignado'] },
  { label: 'Lesión', options: ['Ignora lesión', 'Riesgo articular'] },
  { label: 'Estructura', options: ['Mal split', 'Días desbalanceados'] },
];

export type RejectPayload = {
  feedback: string;
  reasons: string[];
  detail: string;
  critical: boolean;
};

export function RejectDialog({
  open,
  onOpenChange,
  athleteName,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athleteName: string;
  onSubmit: (payload: RejectPayload) => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState('');
  const [critical, setCritical] = useState(false);

  function reset() {
    setSelected(new Set());
    setDetail('');
    setCritical(false);
  }

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  const reasons = Array.from(selected);
  const valid = reasons.length >= 1;

  function handleSubmit() {
    if (!valid) return;
    const reasonsLabel = reasons.join(', ');
    const criticalLabel = critical ? ' [CRÍTICA]' : '';
    const detailLabel = detail.trim() ? ` — ${detail.trim()}` : '';
    const feedback =
      `Motivos: ${reasonsLabel}${detailLabel}${criticalLabel}`.trim();
    onSubmit({
      feedback,
      reasons,
      detail: detail.trim(),
      critical,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            Reject · Regenerar
          </span>
          <DialogTitle>Rechazar rutina · {athleteName}</DialogTitle>
          <DialogDescription>
            Elegí al menos un motivo. La IA usa los tags + detalle para
            regenerar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {TAG_GROUPS.map((g) => (
            <div
              key={g.label}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {g.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const key = `${g.label}: ${opt}`;
                  const active = selected.has(key);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggle(key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition',
                        active
                          ? 'border-brand/40 bg-brand/15 text-brand'
                          : 'border-border bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {active && <Check size={11} />}
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Detalle (opcional)
          </label>
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ej: cambiá sentadilla profunda por hip thrust por lumbar leve."
            rows={3}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card p-3 text-[13px]">
          <input
            type="checkbox"
            checked={critical}
            onChange={(e) => setCritical(e.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle size={12} className="text-amber-600" />
              Marcar como crítica
            </span>
            <span className="text-muted-foreground">
              Manda al frente de la cola de regeneración con prioridad alta.
            </span>
          </span>
        </label>

        <DialogFooter className="items-center sm:justify-between">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {reasons.length} motivo{reasons.length === 1 ? '' : 's'} · ⌘↵
            confirma
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={!valid || submitting}
            >
              {submitting ? 'Rechazando…' : 'Rechazar y regenerar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
