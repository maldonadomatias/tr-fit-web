import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUpdateSlot, useDeleteSlot } from '@/hooks/useAdminRutina';
import { ExerciseSwapDialog } from './ExerciseSwapDialog';
import type { RutinaSlot } from '@/types/api';

export function SlotRow({
  athleteId,
  slot,
}: {
  athleteId: string;
  slot: RutinaSlot;
}) {
  const update = useUpdateSlot(athleteId);
  const remove = useDeleteSlot(athleteId);
  const [swapOpen, setSwapOpen] = useState(false);
  const [notes, setNotes] = useState(slot.notes ?? '');
  const notesRef = useRef(notes);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const v = slot.notes ?? '';
    setNotes(v);
    notesRef.current = v;
  }, [slot.notes]);

  function commitNotes() {
    const current = notesRef.current;
    if ((slot.notes ?? '') === current) return;
    update.mutate(
      { slotId: slot.id, patch: { notes: current || null } },
      { onError: () => toast.error('No se pudo guardar la nota') },
    );
  }

  function onNotesChange(v: string) {
    setNotes(v);
    notesRef.current = v;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(commitNotes, 500);
  }

  function onSwap(newExerciseId: number) {
    update.mutate(
      { slotId: slot.id, patch: { exercise_id: newExerciseId } },
      {
        onError: (e: unknown) => {
          const status = (e as { response?: { status?: number } })?.response
            ?.status;
          if (status === 409) toast.error('Rutina ya no activa');
          else toast.error('No se pudo cambiar el ejercicio');
        },
      },
    );
  }

  function onDelete() {
    if (!confirm('¿Eliminar este ejercicio del día?')) return;
    remove.mutate(slot.id, {
      onError: () => toast.error('No se pudo eliminar'),
    });
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 text-sm">
      <span className="rounded bg-muted px-2 py-0.5 text-xs">{slot.role}</span>
      <button
        onClick={() => setSwapOpen(true)}
        className="flex-1 text-left font-medium hover:underline"
      >
        {slot.exercise_name}
      </button>
      <input
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        onBlur={commitNotes}
        placeholder="Notas..."
        className="w-48 rounded border border-border bg-background px-2 py-1 text-xs"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={remove.isPending}
      >
        <Trash2 size={14} />
      </Button>
      <ExerciseSwapDialog
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        onSelect={onSwap}
        title="Cambiar ejercicio"
      />
    </div>
  );
}
