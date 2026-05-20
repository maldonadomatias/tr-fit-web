import { Button } from '@/components/ui/button';

export function DangerRow({
  title,
  body,
  action,
  destructive = false,
  onClick,
  disabled,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  action: React.ReactNode;
  destructive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-md border bg-card p-[14px]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
      <Button
        size="sm"
        variant={destructive ? 'destructive' : 'outline'}
        onClick={onClick}
        disabled={disabled}
      >
        {action}
      </Button>
    </div>
  );
}
