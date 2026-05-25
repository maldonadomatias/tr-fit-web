import pool from '../db/connect.js';

export type AdminRutinaErrorCode =
  | 'not_found'
  | 'rutina_not_active'
  | 'invalid_exercise'
  | 'empty_patch';

export class AdminRutinaError extends Error {
  constructor(
    public code: AdminRutinaErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface ActiveAthleteRow {
  athlete_id: string;
  name: string;
  skeleton_id: string;
  reviewed_at: string | null;
  days_per_week: number;
}

export async function listActiveAthletes(opts: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ActiveAthleteRow[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q ? `%${opts.q.toLowerCase()}%` : null;

  const params: unknown[] = [];
  // Inner-joins drop athletes without active_skeleton_id / no program_state.
  // That is intentional: this endpoint lists athletes with a fully-activated routine.
  let where = `s.status = 'approved' AND ps.active_skeleton_id = s.id`;
  if (q) {
    params.push(q);
    where += ` AND LOWER(ap.name) LIKE $${params.length}`;
  }

  const totalSql = `
    SELECT COUNT(*)::int AS c
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}`;
  const total = (await pool.query<{ c: number }>(totalSql, params)).rows[0].c;

  params.push(limit, offset);
  const sql = `
    SELECT s.athlete_id, ap.name, s.id AS skeleton_id,
           s.reviewed_at, ap.days_per_week
      FROM athlete_skeletons s
      JOIN athlete_program_state ps ON ps.athlete_id = s.athlete_id
      JOIN athlete_profiles ap ON ap.user_id = s.athlete_id
     WHERE ${where}
     ORDER BY s.reviewed_at DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await pool.query<ActiveAthleteRow>(sql, params);
  return { items: rows, total };
}
