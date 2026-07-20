import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DiscardDialog({
  open,
  onOpenChange,
  athleteName,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athleteName: string;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            Descartar · Sin regenerar
          </span>
          <DialogTitle>Descartar rutina · {athleteName}</DialogTitle>
          <DialogDescription>
            La saca de la cola pendiente. No se genera otra rutina: la alumna
            queda con su rutina actual — asegurate de haberle armado una.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
          >
            <Trash2 size={14} className="mr-1.5" />
            {submitting ? 'Descartando…' : 'Sí, descartar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
