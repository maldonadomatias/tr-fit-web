import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ExerciseRotation {
  id: string;
  created_at: string;
  program_week: number;
  day_of_week: number;
  muscle_group: string;
  from_exercise_id: number;
  from_name: string;
  to_exercise_id: number;
  to_name: string;
}

// Coach view of the automatic accessory swaps (one every 2 program weeks).
export function useExerciseRotations(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'exercise-rotations', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ExerciseRotation[]> => {
      const r = await api.get<ExerciseRotation[]>(
        `/admin/users/${userId}/rotations`
      );
      return r.data;
    },
    staleTime: 30_000,
  });
}
