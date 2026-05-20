import { cn } from '@/lib/utils';

export type TimelineSeverity = 'brand' | 'warning' | 'destructive' | null;

export interface TimelineEntry {
  id: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  time?: React.ReactNode;
  severity?: TimelineSeverity;
}

export function Timeline({
  items,
  className,
}: {
  items: TimelineEntry[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'relative pl-[22px] before:absolute before:left-[6px] before:top-[6px] before:bottom-[6px] before:w-px before:bg-border',
        className,
      )}
    >
      {items.map((it) => (
        <TimelineItem key={it.id} entry={it} />
      ))}
    </ul>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const sev = entry.severity ?? null;
  return (
    <li className="relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2.5">
      <span
        aria-hidden
        className={cn(
          'absolute -left-[22px] top-[14px] h-[13px] w-[13px] rounded-full border-2 bg-card',
          sev === 'brand' && 'border-brand',
          sev === 'warning' && 'border-amber-500',
          sev === 'destructive' && 'border-destructive',
          !sev && 'border-border',
        )}
      />
      <div className="text-[13px] font-medium leading-snug">{entry.title}</div>
      {entry.time && (
        <div className="font-mono tabular-nums text-[11px] text-muted-foreground text-right">
          {entry.time}
        </div>
      )}
      {entry.sub && (
        <div className="col-span-2 text-[12px] text-muted-foreground">
          {entry.sub}
        </div>
      )}
    </li>
  );
}
