import type { ReactNode } from 'react';
import type { RutinaDetail } from '@/types/api';

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
  recomp: 'Recomposición',
  perdida_grasa: 'Pérdida de grasa',
} as const;

const EQUIP_LABEL = {
  gym_completo: 'Gimnasio completo',
  gym_basico: 'Gimnasio básico',
  casa_basica: 'Casa básica',
  solo_bw: 'Solo bodyweight',
} as const;

const DAY_LABEL: Record<string, string> = {
  lun: 'Lun',
  mar: 'Mar',
  mie: 'Mié',
  jue: 'Jue',
  vie: 'Vie',
  sab: 'Sáb',
  dom: 'Dom',
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

export function TabContexto({ profile }: { profile: RutinaDetail['profile'] }) {
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-card p-5">
        <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Perfil del atleta
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          <Field label="Nivel" value={LEVEL_LABEL[profile.level]} />
          <Field label="Objetivo" value={GOAL_LABEL[profile.goal]} />
          <Field
            label="Edad"
            value={
              <span className="font-mono tabular-nums">{profile.age}</span>
            }
          />
          <Field
            label="Altura"
            value={
              <span className="font-mono tabular-nums">
                {profile.height_cm} cm
              </span>
            }
          />
          <Field
            label="Peso"
            value={
              <span className="font-mono tabular-nums">
                {profile.weight_kg} kg
              </span>
            }
          />
          <Field
            label="Días/semana"
            value={
              <span className="font-mono tabular-nums">
                {profile.days_per_week}
              </span>
            }
          />
          <Field label="Equipo" value={EQUIP_LABEL[profile.equipment]} />
          <Field
            label="Días"
            value={
              profile.days_specific && profile.days_specific.length > 0
                ? profile.days_specific
                    .map((d) => DAY_LABEL[d] ?? d)
                    .join(' · ')
                : '—'
            }
          />
          <Field label="Género" value={profile.gender} />
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-5">
        <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Lesiones declaradas
        </h3>
        {profile.injuries.length > 0 ? (
          <ul className="space-y-1.5">
            {profile.injuries.map((injury, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {injury}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Sin lesiones declaradas.
          </p>
        )}
      </section>
    </div>
  );
}
