import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CoachAthlete } from '@/types/api';

export function useAthletes() {
  return useQuery({
    queryKey: ['coach', 'athletes'],
    queryFn: async (): Promise<CoachAthlete[]> => {
      const r = await api.get<CoachAthlete[]>('/coach/athletes');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}
