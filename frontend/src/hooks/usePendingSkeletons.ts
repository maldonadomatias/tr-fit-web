import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PendingSkeleton } from '@/types/api';

export function usePendingSkeletons() {
  return useQuery({
    queryKey: ['coach', 'skeletons', 'pending'],
    queryFn: async (): Promise<PendingSkeleton[]> => {
      const r = await api.get<PendingSkeleton[]>('/coach/skeletons/pending');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}
