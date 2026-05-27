// frontend/src/components/admin/alerts/AlertsFilters.tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import type { AlertsListFilters } from '@/types/api';

interface Props {
  value: AlertsListFilters;
  onChange: (next: AlertsListFilters) => void;
}

const TYPES = ['', 'sos_pain', 'sos_machine', 'rpe_flag', 'rm_skipped', 'rm_week_starting'] as const;
const TYPE_LABEL: Record<string, string> = {
  '': 'Todos',
  sos_pain: 'SOS dolor',
  sos_machine: 'SOS máquina',
  rpe_flag: 'RPE alto',
  rm_skipped: 'RM salteado',
  rm_week_starting: 'Semana RM',
};

export function AlertsFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        value={value.status ?? 'open'}
        onValueChange={(s) => onChange({ ...value, status: s as 'open' | 'resolved' | 'all' })}
      >
        <TabsList>
          <TabsTrigger value="open">Abiertas</TabsTrigger>
          <TabsTrigger value="resolved">Resueltas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs
        value={value.type ?? ''}
        onValueChange={(t) => onChange({ ...value, type: t || undefined })}
      >
        <TabsList>
          {TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>{TYPE_LABEL[t]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Input
        placeholder="ID atleta (UUID)"
        value={value.athleteId ?? ''}
        onChange={(e) => onChange({ ...value, athleteId: e.target.value || undefined })}
        className="max-w-[260px]"
      />
    </div>
  );
}
