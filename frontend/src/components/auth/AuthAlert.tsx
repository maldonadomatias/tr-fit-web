import type { ReactNode } from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthAlertProps = {
  variant?: 'destructive' | 'info' | 'warn';
  children: ReactNode;
  className?: string;
};

const ICONS = {
  destructive: AlertTriangle,
  info: Info,
  warn: AlertCircle,
};

export function AuthAlert({
  variant = 'destructive',
  children,
  className,
}: AuthAlertProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'mb-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-[1.45]',
        variant === 'destructive' &&
          'border-destructive/20 bg-destructive/10 text-destructive',
        variant === 'info' &&
          'border-brand/20 bg-brand/10 text-brand',
        variant === 'warn' &&
          'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        className
      )}
    >
      <Icon size={16} className="mt-px shrink-0" />
      <span className="flex-1">{children}</span>
    </div>
  );
}
