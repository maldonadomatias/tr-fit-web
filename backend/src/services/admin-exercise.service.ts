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

export async function listExercises(
  f: ListExercisesFilters,
): Promise<{ items: Exercise[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  const archived = f.archived ?? 'false';
  if (archived === 'false') where.push(`archived_at IS NULL`);
  else if (archived === 'true') where.push(`archived_at IS NOT NULL`);

  if (f.q) {
    params.push(`%${f.q.toLowerCase()}%`);
    where.push(`LOWER(name) LIKE $${params.length}`);
  }
  if (f.muscle_group) {
    params.push(f.muscle_group);
    where.push(`muscle_group = $${params.length}`);
  }
  if (f.equipment) {
    params.push(f.equipment);
    where.push(`equipment = $${params.length}`);
  }
  if (f.movement_pattern) {
    params.push(f.movement_pattern);
    where.push(`movement_pattern = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(f.limit ?? 50, 200);
  const offset = f.offset ?? 0;

  const totalQ = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM exercises ${whereSql}`,
    params,
  );
  const total = parseInt(totalQ.rows[0]?.count ?? '0', 10);

  params.push(limit);
  params.push(offset);
  const rowsQ = await pool.query<Exercise>(
    `SELECT ${SELECT_COLS}
       FROM exercises
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items: rowsQ.rows.map(normalize), total };
}

export async function getExercise(id: number): Promise<Exercise> {
  const r = await pool.query<Exercise>(
    `SELECT ${SELECT_COLS} FROM exercises WHERE id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new ExerciseError('not_found');
  return normalize(r.rows[0]);
}

function normalize(row: Exercise): Exercise {
  return {
    ...row,
    default_increment_kg: Number(row.default_increment_kg),
  };
}

export async function createExercise(input: CreateExerciseInput): Promise<Exercise> {
  try {
    const r = await pool.query<Exercise>(
      `INSERT INTO exercises
         (name, muscle_group, equipment, movement_pattern,
          is_principal, is_unilateral, level_min,
          contraindicated_for, default_increment_kg, alternatives_ids,
          video_url, illustration_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SELECT_COLS}`,
      [
        input.name, input.muscle_group, input.equipment, input.movement_pattern,
        input.is_principal, input.is_unilateral, input.level_min,
        input.contraindicated_for, input.default_increment_kg, input.alternatives_ids,
        input.video_url, input.illustration_url,
      ],
    );
    return normalize(r.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new ExerciseError('name_taken');
    }
    throw err;
  }
}

export async function archiveExercise(id: number): Promise<void> {
  const r = await pool.query(
    `UPDATE exercises SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
  if (r.rowCount === 0) {
    const exists = await pool.query(`SELECT 1 FROM exercises WHERE id = $1`, [id]);
    if (exists.rowCount === 0) throw new ExerciseError('not_found');
  }
}

// Stubs implemented in Task 2.3
export async function updateExercise(
  _id: number,
  _patch: UpdateExerciseInput,
): Promise<Exercise> {
  throw new Error('not implemented');
}

export async function restoreExercise(_id: number): Promise<Exercise> {
  throw new Error('not implemented');
}
