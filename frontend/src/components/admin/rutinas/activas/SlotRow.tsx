import type { CSSProperties } from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  EditSlotPopover,
  type SlotOverride,
} from '@/components/admin/rutinas/EditSlotPopover';
import type { RutinaSlot } from '@/types/api';

/* eslint-disable no-unused-vars -- callback parameter names document the API */
interface SlotRowProps {
  slot: RutinaSlot;
  flagged?: boolean;
  edited?: boolean;
  onEdit(slotId: string, payload: SlotOverride): void;
  onDelete(slotId: string): void;
}
/* eslint-enable no-unused-vars */

export function SlotRow({
  slot,
  flagged = false,
  edited = false,
  onEdit,
  onDelete,
}: SlotRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const hasScheme = slot.series != null || slot.reps || slot.descanso;

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
          {edited ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary"
              aria-label="Cambio sin guardar"
            />
          ) : null}
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
        onSave={(payload) => onEdit(slot.id, payload)}
        onDelete={() => onDelete(slot.id)}
      />
    </div>
  );
}
