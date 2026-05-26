import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ActiveAthleteRow,
  ActiveRutinaResponse,
  ReorderInput,
  SlotCreateInput,
  SlotPatchInput,
  RutinaSlot,
} from '@/types/api';

const KEYS = {
  list: (q?: string) => ['admin', 'rutinas', 'list', q ?? ''] as const,
  detail: (athleteId: string) =>
    ['admin', 'rutinas', 'detail', athleteId] as const,
};

export function useActiveAthletes(q?: string) {
  return useQuery({
    queryKey: KEYS.list(q),
    queryFn: async () => {
      const r = await api.get<{ items: ActiveAthleteRow[]; total: number }>(
        '/admin/rutinas/atleta',
        { params: q ? { q } : undefined },
      );
      return r.data;
    },
  });
}

export function useActiveRutina(athleteId: string | undefined) {
  return useQuery({
    queryKey: athleteId
      ? KEYS.detail(athleteId)
      : (['admin', 'rutinas', 'detail', 'none'] as const),
    enabled: !!athleteId,
    queryFn: async () => {
      const r = await api.get<ActiveRutinaResponse>(
        `/admin/rutinas/atleta/${athleteId}`,
      );
      return r.data;
    },
  });
}

export function useCreateSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SlotCreateInput) => {
      const r = await api.post<{ slot: RutinaSlot }>(
        `/admin/rutinas/atleta/${athleteId}/slots`,
        input,
      );
      return r.data.slot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useUpdateSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slotId: string; patch: SlotPatchInput }) => {
      const r = await api.patch<{ slot: RutinaSlot }>(
        `/admin/rutinas/slots/${vars.slotId}`,
        vars.patch,
      );
      return r.data.slot;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useDeleteSlot(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string) => {
      await api.delete(`/admin/rutinas/slots/${slotId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}

export function useReorderSlots(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderInput) => {
      await api.post(`/admin/rutinas/atleta/${athleteId}/reorder`, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.detail(athleteId) }),
  });
}
