import pool from '../db/connect.js';

export type Equipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';

export type MovementPattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';

export type Level = 'principiante' | 'intermedio' | 'avanzado';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  is_principal: boolean;
  is_unilateral: boolean;
  level_min: Level;
  contraindicated_for: string[];
  default_increment_kg: number;
  alternatives_ids: number[];
  video_url: string | null;
  illustration_url: string | null;
  archived_at: string | null;
}

export type CreateExerciseInput = Omit<Exercise, 'id' | 'archived_at'>;
export type UpdateExerciseInput = Partial<CreateExerciseInput>;

export interface ListExercisesFilters {
  q?: string;
  muscle_group?: string;
  equipment?: Equipment;
  movement_pattern?: MovementPattern;
  archived?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export class ExerciseError extends Error {
  constructor(public code: 'not_found' | 'name_taken') {
    super(code);
  }
}

const SELECT_COLS = `
  id, name, muscle_group, equipment, movement_pattern,
  is_principal, is_unilateral, level_min,
  contraindicated_for, default_increment_kg, alternatives_ids,
  video_url, illustration_url, archived_at
`;
