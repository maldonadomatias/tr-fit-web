import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function RevertSwitchDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'revert_switch', payload: {}, note });
      toast.success('Decisión registrada · no se modifica rutina');
      onClose();
    } catch { toast.error('No se pudo registrar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revertir cambio del atleta</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">El cambio ya ocurrió en la sesión del atleta. Esta acción sólo registra que NO se aprueba para próximas sesiones. No inserta override.</p>
        <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
