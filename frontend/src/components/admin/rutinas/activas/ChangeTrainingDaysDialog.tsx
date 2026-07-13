import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChangeTrainingDays } from '@/hooks/useAdminRutina';

const DAYS = [
  ['lun', 'Lunes'],
  ['mar', 'Martes'],
  ['mie', 'Miércoles'],
  ['jue', 'Jueves'],
  ['vie', 'Viernes'],
  ['sab', 'Sábado'],
  ['dom', 'Domingo'],
] as const;

export function ChangeTrainingDaysDialog({
  athleteId,
  current,
  open,
  onOpenChange,
}: {
  athleteId: string;
  current: string[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>(current ?? []);
  const change = useChangeTrainingDays(athleteId);
  useEffect(() => {
    if (open) setSelected(current ?? []);
  }, [open, current]);
  const toggle = (day: string) =>
    setSelected((days) =>
      days.includes(day)
        ? days.filter((value) => value !== day)
        : [...days, day]
    );
  const submit = async () => {
    try {
      await change.mutateAsync(selected);
      toast.success('Nueva rutina en generación con los días elegidos');
      onOpenChange(false);
    } catch {
      toast.error('Ya hay una rutina pendiente o no se pudo regenerar');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar días de entrenamiento</DialogTitle>
          <DialogDescription>
            Se generará una nueva rutina para revisión. La rutina actual seguirá
            activa hasta aprobarla.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DAYS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={selected.includes(value)}
              onClick={() => toggle(value)}
              className={`rounded-md border px-3 py-2 text-sm ${selected.includes(value) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Elegí entre 2 y 6 días.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={
              selected.length < 2 || selected.length > 6 || change.isPending
            }
          >
            {change.isPending ? 'Generando…' : 'Regenerar rutina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
