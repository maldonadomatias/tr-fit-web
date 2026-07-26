import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProgressionBump {
  exercise_id: number;
  exercise_name: string;
  from_kg: number | null;
  to_kg: number | null;
  reps_from: string | null;
  reps_to: string;
}

export interface ProgressionRun {
  id: string;
  ran_at: string;
  from_week: number;
  to_week: number;
  compliance: number | null;
  weights_bumped: ProgressionBump[];
  status: 'success' | 'partial' | 'failed' | 'skipped';
  error_message: string | null;
}

// Coach view of what the automatic weekly progression changed for an athlete.
export function useProgressionRuns(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'progression-runs', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProgressionRun[]> => {
      const r = await api.get<ProgressionRun[]>(
        `/admin/users/${userId}/progression`
      );
      return r.data;
    },
    staleTime: 30_000,
  });
}
