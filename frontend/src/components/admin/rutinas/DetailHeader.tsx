import { Dumbbell, AlertTriangle } from 'lucide-react';
import { Avatar } from '@/components/admin/Avatar';
import type { RutinaDetail } from '@/types/api';

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

const LEVEL_LABEL = {
  nunca: 'Nunca',
  bajo: 'Bajo',
  medio: 'Intermedio',
  avanzado: 'Avanzado',
  muy_avanzado: 'Muy avanzado',
} as const;

const GOAL_LABEL = {
  hipertrofia: 'Hipertrofia',
  fuerza: 'Fuerza',
  recomp: 'Recomp',
  perdida_grasa: 'Pérdida de grasa',
} as const;

const EQUIP_LABEL = {
  gym_completo: 'Gimnasio completo',
  gym_basico: 'Gimnasio básico',
  casa_basica: 'Casa básica',
  solo_bw: 'Solo bodyweight',
} as const;

export function DetailHeader({ data }: { data: RutinaDetail }) {
  const { profile, skeleton } = data;
  const lesion = profile.injuries.length > 0;

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-1 border-b border-border bg-background px-4 pb-4 pt-5 lg:px-7">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand">
        Rutina · {skeleton.id.slice(0, 8).toUpperCase()}
      </span>
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} size="md" brand />
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-bold leading-6 tracking-tight">
            {profile.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 font-mono text-[12px] tabular-nums text-muted-foreground">
            <span>{profile.age}a</span>
            <span className="text-border">·</span>
            <span>{profile.gender === 'female' ? 'F' : profile.gender === 'male' ? 'M' : 'X'}</span>
            <span className="text-border">·</span>
            <span>{LEVEL_LABEL[profile.level]}</span>
            <span className="text-border">·</span>
            <span>{profile.days_per_week}d/sem</span>
            <span className="text-border">·</span>
            <span>{GOAL_LABEL[profile.goal]}</span>
          </div>
        </div>
        <div className="ml-auto hidden text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
          <div className="flex items-center justify-end gap-1.5">
            <Dumbbell size={12} />
            <span>{EQUIP_LABEL[profile.equipment]}</span>
          </div>
          <div>Generada {ago(skeleton.created_at)}</div>
        </div>
      </div>
      {lesion && (
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={12} />
          <span>Lesión declarada · {profile.injuries.join(', ')}</span>
        </div>
      )}
    </header>
  );
}
