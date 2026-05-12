import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AthleteDetailResponse } from '@/types/api';

export function useAthlete(id: string | undefined) {
  return useQuery<AthleteDetailResponse>({
    queryKey: ['coach', 'athlete', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<AthleteDetailResponse>(`/coach/athletes/${id}`);
      return r.data;
    },
  });
}
