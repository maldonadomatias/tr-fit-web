import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Equipment, Exercise, MovementPattern } from '@/types/api';

export interface AdminExercisesFilters {
  q?: string;
  muscle_group?: string;
  equipment?: Equipment;
  movement_pattern?: MovementPattern;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export function useAdminExercises(filters: AdminExercisesFilters) {
  return useQuery({
    queryKey: ['admin', 'exercises', filters],
    queryFn: async () => {
      const r = await api.get<{ items: Exercise[]; total: number }>(
        '/admin/exercises',
        { params: filters },
      );
      return r.data;
    },
  });
}

export interface ExercisesSearchOptions {
  enabled?: boolean;
  limit?: number;
}

export function useExercisesSearch(q: string, opts: ExercisesSearchOptions = {}) {
  const { enabled = true, limit = 8 } = opts;
  return useQuery({
    queryKey: ['exercises', 'search', q, limit],
    enabled,
    queryFn: async () => {
      const r = await api.get<{ items: Exercise[] }>('/exercises', {
        params: q.trim() ? { q: q.trim(), limit } : { limit },
      });
      return r.data.items;
    },
  });
}

export type CreateExerciseInput = Omit<Exercise, 'id' | 'archived_at'>;
export type UpdateExerciseInput = Partial<CreateExerciseInput>;

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExerciseInput) => {
      const r = await api.post<{ exercise: Exercise }>('/admin/exercises', input);
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useUpdateExercise(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateExerciseInput) => {
      const r = await api.patch<{ exercise: Exercise }>(
        `/admin/exercises/${id}`,
        patch,
      );
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useUploadExerciseVideo(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('video', file);
      // axios sets the multipart boundary from the FormData automatically.
      const r = await api.post<{ video_url: string }>(
        `/admin/exercises/${id}/video`,
        fd,
      );
      return r.data.video_url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useArchiveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useRestoreExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await api.post<{ exercise: Exercise }>(
        `/admin/exercises/${id}/restore`,
      );
      return r.data.exercise;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}
