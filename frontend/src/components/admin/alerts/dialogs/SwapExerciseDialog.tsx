import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { CoachAlert } from '@/types/api';
import { useAlertContext, useResolveAlert } from '@/hooks/useAlerts';

export function SwapExerciseDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const ctx = useAlertContext(alert.id);
  const resolve = useResolveAlert();
  const [replId, setReplId] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const suggested = ctx.data?.suggestedAlternative;
  const chosen = replId === '' ? suggested?.id : Number(replId);

  const submit = async () => {
    if (!chosen) { toast.error('Elegí una alternativa'); return; }
    try {
      await resolve.mutateAsync({
        id: alert.id, action: 'swap_exercise',
        payload: { replacement_exercise_id: chosen }, note,
      });
      toast.success('Swap aplicado · alerta resuelta');
      onClose();
    } catch {
      toast.error('No se pudo aplicar el swap');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap: {alert.exercise_name ?? 'ejercicio'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ctx.isLoading && <div className="text-sm text-muted-foreground">Cargando contexto…</div>}
          {suggested && (
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs uppercase text-muted-foreground">Alternativa sugerida</div>
              <div className="font-medium">{suggested.name}</div>
              <div className="text-xs text-muted-foreground">ID {suggested.id}</div>
            </div>
          )}
          <div>
            <label className="text-xs uppercase text-muted-foreground">O ID manual</label>
            <Input
              type="number" min={1}
              placeholder={suggested ? `${suggested.id}` : 'exercise_id'}
              value={replId}
              onChange={(e) => setReplId(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <Textarea
            placeholder="Nota interna (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? 'Aplicando…' : 'Aplicar swap + resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
