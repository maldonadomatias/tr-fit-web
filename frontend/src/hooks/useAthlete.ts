import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAthlete(id: string | undefined) {
  return useQuery({
    queryKey: ['coach', 'athlete', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get(`/coach/athletes/${id}`);
      return r.data;
    },
  });
}
