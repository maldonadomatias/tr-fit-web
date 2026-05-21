import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RationaleCard({ rationale }: { rationale: string | null }) {
  const [open, setOpen] = useState(true);
  if (!rationale) return null;

  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <Sparkles size={14} className="text-brand" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Rationale IA
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'ml-auto text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 text-[13px] leading-relaxed text-foreground">
          {rationale}
        </div>
      )}
    </section>
  );
}
