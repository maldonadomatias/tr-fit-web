/**
 * Default slot prescription for Tato's HYROX sessions (Molpo #128).
 * Fallback when the catalog row has no series, rest, or coach notes yet.
 * A saved prescription on the exercise wins (Molpo #143).
 */
export type HyroxSessionPreset = {
  series: number;
  reps: string;
  descanso: string;
  notes: string;
};

const PRESETS: Record<string, HyroxSessionPreset> = {
  'hyrox session lvl 1': {
    series: 2,
    reps: '2,1 km',
    descanso: '3 min',
    notes: [
      'CINTA 400 MTS + LUNGES 20 REPS +',
      'CINTA 400 MTS + REMO ROW 500 MTS +',
      'CINTA 400 MTS + THRUSTERS 15 REPS +',
      'CINTA 400 MTS - (Fin de Serie 1)',
    ].join('\n'),
  },
  'hyrox session lvl 2': {
    series: 1,
    reps: '3,8 Km',
    descanso: '3 min',
    notes: [
      'CINTA 800 MTS + THRUSTERS 25 REPS +',
      'CINTA 800 MTS + BURPEES TO PLATE 15 REPS +',
      'CINTA 800 MTS + SLAMBALL 25 REPS +',
      'CINTA 800 MTS + REMO ROW 600 MTS - (Fin de serie 1)',
    ].join('\n'),
  },
};

export function hyroxSessionPreset(name: string): HyroxSessionPreset | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return PRESETS[key] ?? null;
}
