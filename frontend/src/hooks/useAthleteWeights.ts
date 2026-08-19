import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AthleteExerciseWeight } from '@/types/api';

export function useAthleteWeights(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'weights'],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get<{ weights: AthleteExerciseWeight[] }>(
        `/admin/users/${id}/weights`
      );
      return r.data.weights;
    },
  });
}

export interface SetAthleteWeightInput {
  exercise_id: number;
  current_value: number;
}

export function useSetAthleteWeight(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetAthleteWeightInput) => {
      const r = await api.put<{ weight: AthleteExerciseWeight }>(
        `/admin/users/${id}/weights`,
        input
      );
      return r.data.weight;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user', id, 'weights'] });
    },
  });
}
