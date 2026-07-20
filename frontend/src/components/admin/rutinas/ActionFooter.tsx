import { Check, SkipForward, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ActionFooter({
  onApprove,
  onReject,
  onDiscard,
  onSkip,
  approving,
  rejecting,
  discarding,
}: {
  onApprove: () => void;
  onReject: () => void;
  onDiscard: () => void;
  onSkip: () => void;
  approving: boolean;
  rejecting: boolean;
  discarding: boolean;
}) {
  const busy = approving || rejecting || discarding;
  return (
    <footer className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-background px-4 py-3 lg:px-7">
      <Button
        type="button"
        variant="outline"
        onClick={onReject}
        disabled={busy}
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <X size={14} className="mr-1.5" />
        Rechazar
        <kbd className="ml-2 hidden rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          R
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onDiscard}
        disabled={busy}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} className="mr-1.5" />
        Descartar
      </Button>
      <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
        <SkipForward size={14} className="mr-1.5" />
        Skip
        <kbd className="ml-2 hidden rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          J
        </kbd>
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="ml-auto bg-brand text-primary-foreground hover:bg-brand/90"
      >
        <Check size={14} className="mr-1.5" />
        {approving ? 'Aprobando…' : 'Aprobar'}
        <kbd className="ml-2 hidden rounded bg-brand-foreground/10 px-1 py-0.5 font-mono text-[10px] sm:inline">
          A
        </kbd>
      </Button>
    </footer>
  );
}
