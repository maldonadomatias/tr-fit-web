import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { Pencil } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  useApproveRutina,
  useRejectRutina,
  useRutina,
} from '@/hooks/useRutina';
import { useRutinasHotkeys } from '@/hooks/useRutinasHotkeys';
import { DetailHeader } from './DetailHeader';
import { RationaleCard } from './RationaleCard';
import { TabRutina } from './TabRutina';
import { TabContexto } from './TabContexto';
import { TabHistorial } from './TabHistorial';
import { TabDiff } from './TabDiff';
import { ActionFooter } from './ActionFooter';
import { RejectDialog, type RejectPayload } from './RejectDialog';
import { ShortcutsModal } from './ShortcutsModal';
import type { SlotOverride } from './EditSlotPopover';

type TabKey = 'rutina' | 'contexto' | 'historial' | 'diff';

export function DetailPane({
  id,
  canSkip,
  onAdvance,
  onNext,
  onPrev,
}: {
  id: string;
  canSkip: boolean;
  onAdvance: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { data, isLoading, error } = useRutina(id);
  const approve = useApproveRutina();
  const reject = useRejectRutina();
  const [tab, setTab] = useState<TabKey>('rutina');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, SlotOverride>>({});

  useEffect(() => {
    setTab('rutina');
    setRejectOpen(false);
    setOverrides({});
  }, [id]);

  const modalOpen = rejectOpen || shortcutsOpen;

  useRutinasHotkeys(
    {
      onApprove: () => {
        if (modalOpen || approve.isPending || reject.isPending) return;
        void onApprove();
      },
      onReject: () => {
        if (modalOpen) return;
        setRejectOpen(true);
      },
      onNext: () => {
        if (modalOpen) return;
        onNext();
      },
      onPrev: () => {
        if (modalOpen) return;
        onPrev();
      },
      onTab: (idx) => {
        if (modalOpen) return;
        const map: Record<number, TabKey> = {
          1: 'rutina',
          2: 'contexto',
          3: 'historial',
          4: 'diff',
        };
        setTab(map[idx]);
      },
      onShortcuts: () => {
        if (modalOpen) return;
        setShortcutsOpen(true);
      },
      onEsc: () => {
        if (rejectOpen) setRejectOpen(false);
        else if (shortcutsOpen) setShortcutsOpen(false);
      },
    },
    { enabled: !!data },
  );

  async function onApprove() {
    try {
      const slot_overrides = Object.entries(overrides).map(([slot_id, ov]) => ({
        slot_id,
        exercise_id: ov.exercise_id,
        notes: ov.notes,
      }));
      await approve.mutateAsync({ id, slot_overrides });
      toast.success('Rutina aprobada · pasando a la siguiente');
      onAdvance();
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      if (err.response?.status === 409) {
        toast.info('Ya fue procesada · pasando a la siguiente');
        onAdvance();
      } else {
        toast.error('No se pudo aprobar · intentá de nuevo');
      }
    }
  }

  async function onReject(payload: RejectPayload) {
    try {
      await reject.mutateAsync({ id, feedback: payload.feedback });
      setRejectOpen(false);
      toast.info(
        payload.critical
          ? 'Regenerando rutina (prioritaria) · ~30s'
          : 'Regenerando rutina · ~30s',
      );
      onAdvance();
    } catch {
      toast.error('No se pudo rechazar');
    }
  }

  function setOverride(slotId: string, payload: SlotOverride) {
    setOverrides((m) => ({ ...m, [slotId]: payload }));
    toast.success('Slot actualizado · cambios locales');
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-7 py-5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-4 px-7 py-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-md border border-border bg-muted/30"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center px-7">
        <div className="rounded-md border border-border bg-card p-6 text-center">
          <p className="text-[13px] text-destructive">Error cargando rutina.</p>
        </div>
      </div>
    );
  }

  const modCount = Object.keys(overrides).length;

  return (
    <div className="flex h-full flex-col">
      <DetailHeader data={data} />

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {modCount > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
            <Pencil size={12} />
            Modificada por admin · {modCount} cambio{modCount === 1 ? '' : 's'}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="rutina">Rutina</TabsTrigger>
            <TabsTrigger value="contexto">Contexto</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
          </TabsList>
          <div className="mt-5">
            <TabsContent value="rutina">
              <TabRutina
                slots={data.slots}
                daysSpecific={data.profile.days_specific}
                overrides={overrides}
                onOverride={setOverride}
              />
            </TabsContent>
            <TabsContent value="contexto">
              <TabContexto profile={data.profile} />
            </TabsContent>
            <TabsContent value="historial">
              <TabHistorial />
            </TabsContent>
            <TabsContent value="diff">
              <TabDiff />
            </TabsContent>
          </div>
        </Tabs>

        <div className="mt-5">
          <RationaleCard rationale={data.skeleton.generation_rationale} />
        </div>
      </div>

      <ActionFooter
        onApprove={onApprove}
        onReject={() => setRejectOpen(true)}
        onSkip={onAdvance}
        approving={approve.isPending}
        rejecting={reject.isPending}
        canSkip={canSkip}
      />

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        athleteName={data.profile.name}
        onSubmit={onReject}
        submitting={reject.isPending}
      />

      <ShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
