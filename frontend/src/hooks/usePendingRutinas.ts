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

export interface StuckGeneration {
  athlete_id: string;
  athlete_name: string;
  status: 'failed' | 'stalled';
  last_error: string | null;
  since: string;
}

export function useStuckGenerations() {
  return useQuery({
    queryKey: ['admin', 'rutinas', 'stuck'],
    queryFn: async (): Promise<StuckGeneration[]> => {
      const r = await api.get<StuckGeneration[]>('/admin/rutinas/pending/stuck');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}
