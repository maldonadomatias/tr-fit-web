import type { CSSProperties } from 'react';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUpdateSlot, useDeleteSlot } from '@/hooks/useAdminRutina';
import {
  EditSlotPopover,
  type SlotOverride,
} from '@/components/admin/rutinas/EditSlotPopover';
import type { RutinaSlot, SlotPatchInput } from '@/types/api';

export function SlotRow({
  athleteId,
  slot,
  flagged = false,
}: {
  athleteId: string;
  slot: RutinaSlot;
  flagged?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const update = useUpdateSlot(athleteId);
  const remove = useDeleteSlot(athleteId);

  function onSave(payload: SlotOverride) {
    const patch: SlotPatchInput = { notes: payload.notes ?? null };
    // Only re-send exercise_id when it actually changed, so saving notes or
    // the set scheme doesn't needlessly reseed the athlete's working weight.
    if (payload.exercise_id !== slot.exercise_id) {
      patch.exercise_id = payload.exercise_id;
    }
    // EditSlotPopover only emits the set scheme for accessories; principals and
    // warmups follow the week's periodization.
    if (slot.role === 'accesorio') {
      patch.series = payload.series ?? null;
      patch.reps = payload.reps ?? null;
      patch.descanso = payload.descanso ?? null;
    }
    update.mutate(
      { slotId: slot.id, patch },
      {
        onError: (e: unknown) => {
          const status = (e as { response?: { status?: number } })?.response
            ?.status;
          if (status === 409) toast.error('Rutina ya no activa');
          else toast.error('No se pudo guardar el cambio');
        },
      },
    );
  }

  function onDelete() {
    remove.mutate(slot.id, {
      onError: () => toast.error('No se pudo eliminar'),
    });
  }

  const hasScheme =
    slot.series != null || slot.reps || slot.descanso;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:flex-nowrap sm:px-5"
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
      <div className="flex min-w-0 flex-1 basis-[55%] flex-col gap-0.5 sm:basis-auto">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">
            {slot.exercise_name}
          </span>
          {flagged ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                  aria-label="Alerta de dolor abierta en este ejercicio"
                />
              </TooltipTrigger>
              <TooltipContent>
                Alerta de dolor abierta en este ejercicio.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {slot.exercise_archived_at ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Ejercicio archivado
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Este ejercicio fue archivado. Cambiá por una alternativa no
                archivada.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          {hasScheme ? (
            <>
              {slot.series != null ? <span>{slot.series} series</span> : null}
              {slot.reps ? <span>{slot.reps} reps</span> : null}
              {slot.descanso ? <span>desc. {slot.descanso}</span> : null}
            </>
          ) : slot.role === 'accesorio' ? (
            <span className="italic">Según periodización</span>
          ) : (
            <span className="italic">Según periodización de la semana</span>
          )}
          {slot.notes ? (
            <span className="normal-case not-italic text-foreground/70">
              · {slot.notes}
            </span>
          ) : null}
        </div>
      </div>
      <EditSlotPopover
        role={slot.role}
        currentExerciseId={slot.exercise_id}
        currentExerciseName={slot.exercise_name ?? ''}
        currentMuscleGroup={slot.muscle_group}
        currentNotes={slot.notes ?? undefined}
        currentSeries={slot.series}
        currentReps={slot.reps}
        currentDescanso={slot.descanso}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
}
