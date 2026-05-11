import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CoachAlert } from '@/types/api';

export function useAlerts({ unreadOnly = false } = {}) {
  return useQuery({
    queryKey: ['coach', 'alerts', { unreadOnly }],
    queryFn: async (): Promise<CoachAlert[]> => {
      const r = await api.get<CoachAlert[]>(
        `/coach/alerts${unreadOnly ? '?unread=true' : ''}`,
      );
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/coach/alerts/${id}/read`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach', 'alerts'] }),
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/coach/alerts/${id}/resolve`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach', 'alerts'] }),
  });
}
