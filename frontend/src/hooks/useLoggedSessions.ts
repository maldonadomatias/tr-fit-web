import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LoggedSet {
  set_index: number;
  is_dropset: boolean;
  weight_label: string;
  reps_label: string;
  rpe: number | null;
}

export interface LoggedExercise {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  sets: LoggedSet[];
}

export interface LoggedSession {
  id: string;
  program_week: number;
  day_of_week: number;
  finished_at: string | null;
  fatigue_rating: string | null;
  exercises: LoggedExercise[];
}

// Coach view of an athlete's logged training (dropsets grouped server-side).
export function useLoggedSessions(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'logged-sessions', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LoggedSession[]> => {
      const r = await api.get<LoggedSession[]>(
        `/admin/users/${userId}/sessions`,
      );
      return r.data;
    },
    staleTime: 30_000,
  });
}
