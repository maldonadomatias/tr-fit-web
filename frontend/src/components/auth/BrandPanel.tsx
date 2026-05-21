import { Dumbbell } from 'lucide-react';

export function BrandPanel() {
  return (
    <aside
      className="relative isolate hidden flex-col overflow-hidden p-10 text-white md:flex"
      style={{ background: 'oklch(0.18 0.02 152)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 110%, oklch(0.65 0.18 152 / 0.35), transparent 70%), radial-gradient(ellipse 60% 40% at 0% 0%, oklch(0.65 0.18 152 / 0.15), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          backgroundPosition: '-1px -1px',
          maskImage:
            'radial-gradient(ellipse 100% 80% at 50% 50%, black 30%, transparent 90%)',
        }}
      />

      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-brand-foreground">
          <Dumbbell size={20} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-base font-extrabold tracking-[0.2em]">TR-Fit</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">
            Strength · ARG
          </div>
        </div>
      </div>

      <div className="my-auto max-w-[460px]">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">
          Consola operativa
        </div>
        <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.025em]">
          Tu cockpit para <em className="not-italic text-brand">TR-Fit</em>.
        </h1>
        <p className="mt-[18px] max-w-[380px] text-[15px] leading-[1.55] text-white/65">
          Aprobá altas, revisá suscripciones y mirá el pulso del negocio en un
          solo lugar.
        </p>

        <div className="mt-10 flex gap-8 border-t border-white/10 pt-6">
          <Stat label="Atletas activos" value="312" />
          <Stat label="Series · 30 d" value="48.7K" />
          <Stat label="PRs · semana" value="126" />
        </div>
      </div>

      <div className="absolute bottom-10 right-10 max-w-[280px] text-right text-xs leading-[1.6] text-white/60">
        <span className="mr-1 font-mono text-sm text-brand">“</span>
        Volví a tener objetivos claros por semana. La app me dice qué tocar y
        cuándo apretar.
        <div className="mt-2 font-semibold tracking-[0.02em] text-white">
          — Camila P., atleta hace 8 meses
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
        {label}
      </span>
      <span className="font-mono text-[22px] font-bold tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}
