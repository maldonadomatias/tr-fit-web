import { Check, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ActionFooter({
  onApprove,
  onReject,
  onSkip,
  approving,
  rejecting,
  canSkip,
}: {
  onApprove: () => void;
  onReject: () => void;
  onSkip: () => void;
  approving: boolean;
  rejecting: boolean;
  canSkip: boolean;
}) {
  return (
    <footer className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-background px-7 py-3">
      <Button
        type="button"
        variant="outline"
        onClick={onReject}
        disabled={rejecting || approving}
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <X size={14} className="mr-1.5" />
        Rechazar
        <kbd className="ml-2 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          R
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onSkip}
        disabled={!canSkip || approving || rejecting}
      >
        <SkipForward size={14} className="mr-1.5" />
        Skip
        <kbd className="ml-2 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          J
        </kbd>
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        disabled={approving || rejecting}
        className="ml-auto bg-brand text-primary-foreground hover:bg-brand/90"
      >
        <Check size={14} className="mr-1.5" />
        {approving ? 'Aprobando…' : 'Aprobar'}
        <kbd className="ml-2 rounded bg-brand-foreground/10 px-1 py-0.5 font-mono text-[10px]">
          A
        </kbd>
      </Button>
    </footer>
  );
}
