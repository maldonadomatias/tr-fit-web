// frontend/src/components/admin/alerts/AlertRowActions.tsx
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { CoachAlert, AlertResolutionAction } from '@/types/api';
import { useMarkAlertRead, useMarkAlertResolved } from '@/hooks/useAlerts';
import { toast } from 'sonner';
import { SwapExerciseDialog } from './dialogs/SwapExerciseDialog';
import { SkipWeekDialog } from './dialogs/SkipWeekDialog';
import { ReduceIntensityDialog } from './dialogs/ReduceIntensityDialog';
import { RegenSkeletonDialog } from './dialogs/RegenSkeletonDialog';
import { ApproveSwitchDialog } from './dialogs/ApproveSwitchDialog';
import { RevertSwitchDialog } from './dialogs/RevertSwitchDialog';
import { ContactNoteDialog } from './dialogs/ContactNoteDialog';
import { AcknowledgeDialog } from './dialogs/AcknowledgeDialog';

const MATRIX: Record<CoachAlert['type'], AlertResolutionAction[]> = {
  sos_pain:              ['swap_exercise', 'skip_week', 'regen_skeleton', 'note_only'],
  sos_machine:           ['approve_switch', 'revert_switch', 'swap_exercise', 'note_only'],
  rpe_flag:              ['reduce_intensity', 'skip_week', 'note_only'],
  rm_skipped:            ['reschedule_rm', 'skip_rm_block', 'note_only'],
  rm_week_starting:      ['acknowledge', 'note_only'],
  membership_expiring:   ['acknowledge', 'note_only'],
  membership_overdue:    ['acknowledge', 'note_only'],
  sos_no_machine:        ['note_only'],
  program_reset:         ['note_only'],
};

const ITEM_LABEL: Record<AlertResolutionAction, string> = {
  swap_exercise: '↺ Swap ejercicio',
  skip_week: '⏭ Skip esta semana',
  reduce_intensity: '🔽 Bajar intensidad',
  regen_skeleton: '🤖 Regenerar rutina',
  approve_switch: '✓ Aprobar cambio del atleta',
  revert_switch: '↩ Revertir cambio',
  note_only: '💬 Contactar + nota',
  acknowledge: '👁 Acknowledge',
  reschedule_rm: '📅 Reagendar RM',
  skip_rm_block: '⏭ Skip bloque RM',
};

export function AlertRowActions({ alert }: { alert: CoachAlert }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AlertResolutionAction | null>(null);
  const markRead = useMarkAlertRead();
  const markResolved = useMarkAlertResolved();
  // Fallback guards against alert types not in MATRIX (avoids crashing on
  // .map of undefined when the backend adds a new type).
  const actions = MATRIX[alert.type] ?? ['note_only'];

  const choose = (a: AlertResolutionAction) => { setActive(a); setOpen(false); };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Acciones">
            <MoreHorizontal size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => choose(a)}
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {ITEM_LABEL[a]}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => {
              markResolved.mutate(alert.id, {
                onError: () => toast.error('No se pudo marcar como resuelta'),
              });
              setOpen(false);
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
          >
            ✓ Marcar resuelto
          </button>
          {!alert.read_at && (
            <button
              onClick={() => { markRead.mutate(alert.id); setOpen(false); }}
              className="block w-full rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              👁 Marcar leída
            </button>
          )}
        </PopoverContent>
      </Popover>

      {active === 'swap_exercise' && (
        <SwapExerciseDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'skip_week' && (
        <SkipWeekDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'reduce_intensity' && (
        <ReduceIntensityDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'regen_skeleton' && (
        <RegenSkeletonDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'approve_switch' && (
        <ApproveSwitchDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'revert_switch' && (
        <RevertSwitchDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'note_only' && (
        <ContactNoteDialog alert={alert} onClose={() => setActive(null)} />
      )}
      {active === 'acknowledge' && (
        <AcknowledgeDialog alert={alert} onClose={() => setActive(null)} />
      )}
    </>
  );
}
