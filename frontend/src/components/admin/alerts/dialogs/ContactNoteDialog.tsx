import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CoachAlert } from '@/types/api';
import { useResolveAlert } from '@/hooks/useAlerts';

export function ContactNoteDialog({ alert, onClose }: { alert: CoachAlert; onClose: () => void }) {
  const resolve = useResolveAlert();
  const [note, setNote] = useState('');
  const submit = async () => {
    if (!note.trim()) { toast.error('Escribí una nota'); return; }
    try {
      await resolve.mutateAsync({ id: alert.id, action: 'note_only', payload: {}, note });
      toast.success('Nota guardada · alerta resuelta');
      onClose();
    } catch { toast.error('No se pudo guardar'); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Contactar atleta + nota interna</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">No se manda mensaje al atleta. Contactá por WhatsApp/email externo. Esta nota queda en audit.</p>
        <Textarea placeholder="Qué hablaste / decisión que tomaste fuera del sistema" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={resolve.isPending}>Guardar nota + resolver</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
