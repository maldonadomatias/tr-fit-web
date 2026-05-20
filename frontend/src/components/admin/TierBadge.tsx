import { cn } from '@/lib/utils';
import type { SubscriptionTier } from '@/types/api';

const TIER_CLS: Record<SubscriptionTier, string> = {
  premium: 'text-brand border-brand/40',
  full: 'text-foreground border-border',
  basico: 'text-muted-foreground border-border',
};

export function TierBadge({
  tier,
  className,
}: {
  tier: SubscriptionTier | null | undefined;
  className?: string;
}) {
  if (!tier) {
    return <span className="text-muted-foreground text-xs font-mono">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border bg-background px-2 py-0.5',
        'font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        TIER_CLS[tier],
        className,
      )}
    >
      {tier}
    </span>
  );
}
