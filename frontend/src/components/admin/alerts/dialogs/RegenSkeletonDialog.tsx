import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function RegenSkeletonDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      await resolve.mutateAsync({
        id: alert.id, action: 'regen_skeleton',
        payload: reason ? { reason } : {}, note: reason || undefined,
      });
      toast.success('Rutina regenerada');
      onClose();
    } catch { toast.error('No se pudo regenerar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Regenerar rutina (AI)</DialogTitle></DialogHeader>
        <p className="text-sm text-destructive">Sustituye el skeleton activo del atleta. Acción irreversible sin backup manual.</p>
        <Textarea placeholder="Razón (opcional, se guarda en audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? 'Regenerando…' : 'Regenerar + resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
