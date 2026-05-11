import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SkeletonDetail } from '@/types/api';

export function useSkeleton(id: string | undefined) {
  return useQuery({
    queryKey: ['coach', 'skeleton', id],
    enabled: !!id,
    queryFn: async (): Promise<SkeletonDetail> => {
      const r = await api.get<SkeletonDetail>(`/coach/skeletons/${id}`);
      return r.data;
    },
  });
}

export function useApproveSkeleton() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/coach/skeletons/${id}/approve`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coach', 'skeletons'] });
      qc.invalidateQueries({ queryKey: ['coach', 'athletes'] });
    },
  });
}

export function useRejectSkeleton() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, feedback }: { id: string; feedback: string }) => {
      const r = await api.post<{ newSkeletonId: string }>(
        `/coach/skeletons/${id}/reject`,
        { feedback },
      );
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coach', 'skeletons'] });
    },
  });
}
