import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function ShortcutsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            Atajos · Review queue
          </span>
          <DialogTitle>Atajos de teclado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Section title="Navegación">
            <Row keys={['J']} label="Siguiente rutina" />
            <Row keys={['K']} label="Rutina anterior" />
            <Row keys={['Esc']} label="Cerrar modal / popover" />
          </Section>

          <Section title="Acciones">
            <Row keys={['A']} label="Aprobar" />
            <Row keys={['R']} label="Abrir reject" />
            <Row keys={['1', '2', '3', '4']} label="Cambiar tab" />
          </Section>

          <Section title="Ayuda">
            <Row keys={['?']} label="Abrir este overlay" />
          </Section>
        </div>

        <p className="text-[12px] text-muted-foreground">
          Los atajos se deshabilitan cuando hay un modal o popover abierto,
          excepto <kbd className="font-mono">Esc</kbd>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
