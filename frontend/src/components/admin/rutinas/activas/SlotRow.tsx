import { useEffect, useRef, useState } from 'react';
import { Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
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
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-5 py-3 text-sm"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Reordenar"
      >
        <GripVertical size={14} />
      </button>
      <span className="rounded bg-muted px-2 py-0.5 text-xs">{slot.role}</span>
      <div className="flex flex-1 items-center gap-2">
        <button
          onClick={() => setSwapOpen(true)}
          className="text-left font-medium hover:underline"
        >
          {slot.exercise_name}
        </button>
        {slot.exercise_archived_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                Ejercicio archivado
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Este ejercicio fue archivado. Cambiá por una alternativa no archivada.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
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
        muscleGroup={slot.muscle_group}
      />
    </div>
  );
}
