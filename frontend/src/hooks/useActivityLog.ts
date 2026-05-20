import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ActivityEvent } from '@/types/api';

export type ActivityCategory = 'user' | 'sub' | 'auth';

export interface ActivityFilters {
  category?: ActivityCategory;
  target_id?: string;
  before?: string;
  limit?: number;
}

export function useActivityLog(filters: ActivityFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'activity', filters],
    queryFn: async (): Promise<ActivityEvent[]> => {
      const r = await api.get<ActivityEvent[]>('/admin/activity', {
        params: filters,
      });
      return r.data;
    },
    staleTime: 30_000,
  });
}
