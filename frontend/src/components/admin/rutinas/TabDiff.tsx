export function TabDiff() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Diff · próximamente
      </span>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        Comparación visual contra la rutina anterior del atleta. Requiere
        endpoint <code className="font-mono text-[12px]">/api/rutinas/:id/diff</code>.
      </p>
    </div>
  );
}
