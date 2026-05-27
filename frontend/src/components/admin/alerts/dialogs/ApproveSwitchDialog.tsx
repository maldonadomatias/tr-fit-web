import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ApproveSwitchDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const p = alert.payload as { switched_to_exercise_id?: number };
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'approve_switch', payload: {} });
      toast.success('Cambio aprobado · override insertado para esta semana');
      onClose();
    } catch { toast.error('No se pudo aprobar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aprobar cambio del atleta</DialogTitle></DialogHeader>
        <p className="text-sm">
          Atleta cambió <strong>{alert.exercise_name ?? 'ejercicio'}</strong> por
          {' '}<strong>ejercicio ID {p.switched_to_exercise_id ?? '?'}</strong>.
          Confirmar aprueba el cambio para el resto de la semana.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Aprobar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
