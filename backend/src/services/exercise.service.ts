import pool from '../db/connect.js';
import type {
  Exercise, AthleteProfile, ExerciseEquipment, Level,
} from '../domain/types.js';

const equipmentMatrix: Record<AthleteProfile['equipment'], ExerciseEquipment[]> = {
  gym_completo: ['barra', 'mancuerna', 'maquina', 'polea', 'smith',
                 'bw', 'pesa_rusa', 'elastico', 'disco'],
  gym_basico:   ['barra', 'mancuerna', 'maquina', 'bw', 'disco'],
  casa_basica:  ['mancuerna', 'pesa_rusa', 'bw', 'elastico'],
  solo_bw:      ['bw', 'elastico'],
};

const levelOrder: Record<Level, number> = {
  nunca: 1,
  bajo: 1,
  medio: 2,
  avanzado: 3,
  muy_avanzado: 3,
};

export async function listExercises(): Promise<Exercise[]> {
  const { rows } = await pool.query<Exercise>(`SELECT * FROM exercises`);
  return rows;
}

export async function findExerciseById(id: number): Promise<Exercise | null> {
  const { rows } = await pool.query<Exercise>(
    `SELECT * FROM exercises WHERE id = $1`, [id],
  );
  return rows[0] ?? null;
}

export async function listExercisesForAthlete(
  profile: AthleteProfile,
): Promise<Exercise[]> {
  const allowedEquipment = equipmentMatrix[profile.equipment];
  const athleteLevel = levelOrder[profile.level];
  const all = await listExercises();
  return all.filter((ex) => {
    if (!allowedEquipment.includes(ex.equipment)) return false;
    if (levelOrder[ex.level_min] > athleteLevel) return false;
    if (ex.contraindicated_for.some((c) => profile.injuries.includes(c))) return false;
    return true;
  });
}
