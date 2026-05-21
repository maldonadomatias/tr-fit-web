export type CatalogExercise = {
  id: number;
  name: string;
  muscle_group: string;
  equipment: 'gym_completo' | 'gym_basico' | 'casa_basica' | 'solo_bw';
};

export const EXERCISES_CATALOG: CatalogExercise[] = [
  { id: 1, name: 'Press banca', muscle_group: 'pecho', equipment: 'gym_basico' },
  { id: 2, name: 'Press banca inclinado', muscle_group: 'pecho', equipment: 'gym_basico' },
  { id: 3, name: 'Aperturas con mancuernas', muscle_group: 'pecho', equipment: 'casa_basica' },
  { id: 4, name: 'Fondos paralelas', muscle_group: 'pecho', equipment: 'gym_basico' },
  { id: 5, name: 'Press militar', muscle_group: 'hombro', equipment: 'gym_basico' },
  { id: 6, name: 'Elevaciones laterales', muscle_group: 'hombro', equipment: 'casa_basica' },
  { id: 7, name: 'Elevaciones frontales', muscle_group: 'hombro', equipment: 'casa_basica' },
  { id: 8, name: 'Face pull', muscle_group: 'hombro posterior', equipment: 'gym_basico' },
  { id: 9, name: 'Press francés', muscle_group: 'tríceps', equipment: 'casa_basica' },
  { id: 10, name: 'Extensión polea', muscle_group: 'tríceps', equipment: 'gym_basico' },
  { id: 11, name: 'Curl barra', muscle_group: 'bíceps', equipment: 'gym_basico' },
  { id: 12, name: 'Curl martillo', muscle_group: 'bíceps', equipment: 'casa_basica' },
  { id: 13, name: 'Dominadas', muscle_group: 'espalda', equipment: 'gym_basico' },
  { id: 14, name: 'Remo con barra', muscle_group: 'espalda', equipment: 'gym_basico' },
  { id: 15, name: 'Remo mancuerna', muscle_group: 'espalda', equipment: 'casa_basica' },
  { id: 16, name: 'Jalón al pecho', muscle_group: 'espalda', equipment: 'gym_completo' },
  { id: 17, name: 'Sentadilla', muscle_group: 'cuádriceps', equipment: 'gym_basico' },
  { id: 18, name: 'Sentadilla búlgara', muscle_group: 'cuádriceps', equipment: 'casa_basica' },
  { id: 19, name: 'Prensa', muscle_group: 'cuádriceps', equipment: 'gym_completo' },
  { id: 20, name: 'Hack squat', muscle_group: 'cuádriceps', equipment: 'gym_completo' },
  { id: 21, name: 'Peso muerto rumano', muscle_group: 'isquios', equipment: 'gym_basico' },
  { id: 22, name: 'Curl femoral', muscle_group: 'isquios', equipment: 'gym_completo' },
  { id: 23, name: 'Hip thrust', muscle_group: 'glúteo', equipment: 'gym_basico' },
  { id: 24, name: 'Patada de glúteo', muscle_group: 'glúteo', equipment: 'casa_basica' },
  { id: 25, name: 'Elevación de talones', muscle_group: 'gemelos', equipment: 'casa_basica' },
  { id: 26, name: 'Plancha frontal', muscle_group: 'core', equipment: 'solo_bw' },
  { id: 27, name: 'Crunch', muscle_group: 'abdominales', equipment: 'solo_bw' },
  { id: 28, name: 'Rueda abdominal', muscle_group: 'core', equipment: 'casa_basica' },
  { id: 29, name: 'Burpees', muscle_group: 'full body', equipment: 'solo_bw' },
  { id: 30, name: 'Mountain climbers', muscle_group: 'core', equipment: 'solo_bw' },
];

export function searchExercises(query: string, limit = 8): CatalogExercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return EXERCISES_CATALOG.slice(0, limit);
  return EXERCISES_CATALOG.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.muscle_group.toLowerCase().includes(q),
  ).slice(0, limit);
}
