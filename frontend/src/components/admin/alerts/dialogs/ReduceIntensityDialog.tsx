import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ReduceIntensityDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [setsDelta, setSetsDelta] = useState<number | ''>('');
  const [weightPct, setWeightPct] = useState<number | ''>('');
  const [rpeDelta, setRpeDelta] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const submit = async () => {
    const payload: Record<string, number> = {};
    if (setsDelta !== '') payload.sets_delta = Number(setsDelta);
    if (weightPct !== '') payload.weight_pct = Number(weightPct);
    if (rpeDelta !== '') payload.rpe_delta = Number(rpeDelta);
    if (Object.keys(payload).length === 0) {
      toast.error('Definí al menos un ajuste'); return;
    }
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'reduce_intensity', payload, note });
      toast.success('Intensidad reducida esta semana');
      onClose();
    } catch { toast.error('No se pudo aplicar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bajar intensidad · {alert.exercise_name ?? 'ejercicio'}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <label className="block">Δ series (negativo, ej. -1)
            <Input type="number" max={0} min={-5} value={setsDelta}
              onChange={(e) => setSetsDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="block">% peso (0.5–1.0, ej. 0.8 = -20%)
            <Input type="number" step="0.05" min={0.5} max={1} value={weightPct}
              onChange={(e) => setWeightPct(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="block">Δ RPE (negativo)
            <Input type="number" max={0} min={-3} value={rpeDelta}
              onChange={(e) => setRpeDelta(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
