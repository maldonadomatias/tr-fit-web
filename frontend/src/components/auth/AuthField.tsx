import * as React from 'react';
import { cn } from '@/lib/utils';

type AuthFieldProps = {
  id: string;
  label: React.ReactNode;
  labelLink?: React.ReactNode;
  icon: React.ReactNode;
  affix?: React.ReactNode;
  error?: string | null;
  className?: string;
  inputClassName?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>;

export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField(
    {
      id,
      label,
      labelLink,
      icon,
      affix,
      error,
      className,
      inputClassName,
      ...inputProps
    },
    ref
  ) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <label
          htmlFor={id}
          className="flex items-center justify-between text-xs font-semibold text-foreground"
        >
          <span>{label}</span>
          {labelLink}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            className={cn(
              'h-[42px] w-full rounded-md border border-input bg-background pl-[38px] pr-3 font-mono text-sm tabular-nums text-foreground outline-none transition-[border-color,box-shadow] duration-150',
              'placeholder:font-sans placeholder:text-muted-foreground',
              'focus:border-brand focus:shadow-[0_0_0_3px_oklch(0.65_0.18_152_/_0.15)]',
              'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:shadow-[0_0_0_3px_oklch(0.577_0.245_27.325_/_0.15)]',
              affix && 'pr-11',
              inputClassName
            )}
            {...inputProps}
          />
          {affix && (
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
              {affix}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
