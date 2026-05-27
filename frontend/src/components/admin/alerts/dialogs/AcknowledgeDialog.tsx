import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function AcknowledgeDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'acknowledge', payload: {} });
      toast.success('Acknowledged');
      onClose();
    } catch { toast.error('No se pudo'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Acknowledge</DialogTitle></DialogHeader>
        <p className="text-sm">Marca la alerta como vista sin tomar acción de rutina.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
