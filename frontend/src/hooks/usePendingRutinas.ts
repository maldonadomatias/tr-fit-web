import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PendingRutina } from '@/types/api';

export function usePendingRutinas() {
  return useQuery({
    queryKey: ['admin', 'rutinas', 'pending'],
    queryFn: async (): Promise<PendingRutina[]> => {
      const r = await api.get<PendingRutina[]>('/admin/rutinas/pending');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}
