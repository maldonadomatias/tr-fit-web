export type Equipment =
  | 'barra' | 'mancuerna' | 'maquina' | 'polea' | 'smith'
  | 'bw' | 'pesa_rusa' | 'elastico' | 'disco';

export type Pattern =
  | 'squat' | 'hinge' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v'
  | 'isolation' | 'core' | 'cardio';

export interface Override {
  equipment?: Equipment;
  movement_pattern?: Pattern;
  is_principal?: boolean;
  is_unilateral?: boolean;
  level_min?: 'principiante' | 'intermedio' | 'avanzado';
  contraindicated_for?: string[];
  default_increment_kg?: number;
}

// Principal exercises (RM targets) — from Apps Script `ejerciciosExcluidos`
export const PRINCIPAL_NAMES = new Set([
  'Press Plano con Barra',
  'Remo con Barra Plana',
  'Sentadilla con Barra Plana',
  'Press Militar con Barra parado',
  'Peso Muerto con Barra',
  'Press Militar con Mancuernas Sentado',
  'Hip Thrust',
]);

export const overrides: Record<string, Override> = {
  'Press Plano con Barra':
    { equipment: 'barra', movement_pattern: 'push_h', is_principal: true,
      level_min: 'principiante', default_increment_kg: 2.5 },
  'Remo con Barra Plana':
    { equipment: 'barra', movement_pattern: 'pull_h', is_principal: true,
      level_min: 'intermedio', default_increment_kg: 2.5,
      contraindicated_for: ['lumbar'] },
  'Sentadilla con Barra Plana':
    { equipment: 'barra', movement_pattern: 'squat', is_principal: true,
      level_min: 'intermedio', default_increment_kg: 2.5,
      contraindicated_for: ['rodilla', 'lumbar'] },
  'Press Militar con Barra parado':
    { equipment: 'barra', movement_pattern: 'push_v', is_principal: true,
      level_min: 'intermedio', default_increment_kg: 2.5,
      contraindicated_for: ['hombro'] },
  'Peso Muerto con Barra':
    { equipment: 'barra', movement_pattern: 'hinge', is_principal: true,
      level_min: 'avanzado', default_increment_kg: 2.5,
      contraindicated_for: ['lumbar'] },
  'Press Militar con Mancuernas Sentado':
    { equipment: 'mancuerna', movement_pattern: 'push_v', is_principal: true,
      level_min: 'principiante', default_increment_kg: 1,
      contraindicated_for: ['hombro'] },
  'Hip Thrust':
    { equipment: 'barra', movement_pattern: 'hinge', is_principal: true,
      level_min: 'principiante', default_increment_kg: 2.5 },

  // From Apps Script `getAumentoPersonalizado` special cases:
  'Svend Press con Disco acostado':
    { equipment: 'disco', movement_pattern: 'isolation', default_increment_kg: 5 },
  'Curl Nordico Femoral':
    { equipment: 'bw', movement_pattern: 'isolation', default_increment_kg: 1 },
  'Pantorrillas en maquina sentado':
    { equipment: 'maquina', movement_pattern: 'isolation', default_increment_kg: 2.5 },
  'Pecho Sentado en Mariposa':
    { equipment: 'maquina', movement_pattern: 'isolation', default_increment_kg: 1 },

  // From Apps Script `ejerciciosHasta15` (rep ceiling at 15)
  'Face Pull parado con Soga':
    { equipment: 'polea', movement_pattern: 'isolation', default_increment_kg: 1 },
  'Vuelos Posteriores Sentado con Mancuernas':
    { equipment: 'mancuerna', movement_pattern: 'isolation', default_increment_kg: 1 },
  'Vuelos Laterales con Mancuerna':
    { equipment: 'mancuerna', movement_pattern: 'isolation', default_increment_kg: 1 },
  'Vuelo Lateral Unilateral en polea altura Rodilla':
    { equipment: 'polea', movement_pattern: 'isolation',
      is_unilateral: true, default_increment_kg: 1 },
};

// Muscle groups → default movement_pattern
export const MUSCLE_GROUP_DEFAULTS: Record<string, Pattern> = {
  'Piernas - Cuadriceps': 'squat',
  'Piernas - Femorales': 'hinge',
  'Piernas - Gluteos': 'hinge',
  'Piernas - Abductores': 'isolation',
  'Piernas - Aductores': 'isolation',
  'Piernas - Pantorrillas': 'isolation',
  'Pecho - Mayor': 'push_h',
  'Pecho - Superior': 'push_h',
  'Pecho - Inferior': 'push_h',
  Espalda: 'pull_h',
  Hombros: 'push_v',
  Triceps: 'isolation',
  Biceps: 'isolation',
  Antebrazos: 'isolation',
  Abdomen: 'core',
};
