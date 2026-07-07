import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AthleteRm } from '@/types/api';

export function useAthleteRms(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'rms'],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<{ rms: AthleteRm[] }>(`/admin/users/${id}/rms`);
      return r.data.rms;
    },
  });
}

export interface SetAthleteRmInput {
  exercise_id: number;
  program_week: 10 | 20 | 30;
  value_kg: number;
  coach_note?: string | null;
}

export function useSetAthleteRm(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetAthleteRmInput) => {
      const r = await api.put<{ rm: AthleteRm }>(
        `/admin/users/${id}/rms`,
        input
      );
      return r.data.rm;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user', id, 'rms'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
  });
}
