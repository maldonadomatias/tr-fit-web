import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminStats } from '@/types/api';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStats> => {
      const r = await api.get<AdminStats>('/admin/stats');
      return r.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
