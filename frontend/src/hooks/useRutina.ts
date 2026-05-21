import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RutinaDetail } from '@/types/api';

export type SlotOverridePayload = {
  slot_id: string;
  exercise_id: number;
  notes?: string;
};

export function useRutina(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'rutina', id],
    enabled: !!id,
    queryFn: async (): Promise<RutinaDetail> => {
      const r = await api.get<RutinaDetail>(`/admin/rutinas/${id}`);
      return r.data;
    },
  });
}

export function useApproveRutina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: string | { id: string; slot_overrides?: SlotOverridePayload[] },
    ) => {
      const id = typeof args === 'string' ? args : args.id;
      const body =
        typeof args === 'string'
          ? undefined
          : { slot_overrides: args.slot_overrides ?? [] };
      await api.post(`/admin/rutinas/${id}/approve`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'rutinas'] });
    },
  });
}

export function useRejectRutina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      feedback,
    }: {
      id: string;
      feedback: string;
    }) => {
      const r = await api.post<{
        newRutinaId?: string;
        newSkeletonId?: string;
      }>(`/admin/rutinas/${id}/reject`, { feedback });
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'rutinas'] });
    },
  });
}
