// Condensed few-shot examples distilled from the coach's real routines
// (docs/routine-corpus/). One example per corpus profile combo; the generator
// injects the nearest match into the OpenAI user message so the model imitates
// the coach's structure instead of reconstructing it from prose rules.
//
// Provenance: women 3d/4d are verbatim slot-level ground truth (mujer/002,
// mujer/003). Women 5d and all men examples are reconstructed from each
// sample's documented day tables plus the confirmed shared mechanics M1-M5
// (docs/routine-corpus/shared-mechanics.md) — only ≥2-sample confirmed
// patterns are encoded.
//
// Invariant (guarded by tests/unit/corpus-examples.test.ts): every example
// satisfies the server-side validators in openai.service.ts (slot range,
// principal rules, volume caps), so imitating it never causes a retry.

export interface CorpusExampleSlot {
  muscle_group: string;
  role: 'calentamiento' | 'principal' | 'accesorio';
  // Prescription follows the generator's output contract: accessories carry
  // series/reps/descanso; principals & warmups leave them null (periodization
  // and warmup defaults own those).
  series: number | null;
  reps: string | null;
  descanso: string | null;
  notes: string | null;
}

export interface CorpusExampleDay {
  focus: string;
  slots: CorpusExampleSlot[];
}

export interface CorpusExample {
  source: string;
  gender: 'male' | 'female';
  days: number;
  leg_days: number | null; // men only; null for women
  days_detail: CorpusExampleDay[];
}

type Role = CorpusExampleSlot['role'];

const slot = (
  muscle_group: string,
  role: Role,
  series: number | null = null,
  reps: string | null = null,
  descanso: string | null = null,
  notes: string | null = null,
): CorpusExampleSlot => ({ muscle_group, role, series, reps, descanso, notes });

const warmup = () => slot('Calentamiento', 'calentamiento');
const principal = (mg: string, notes: string | null = null) =>
  slot(mg, 'principal', null, null, null, notes);
const acc = (
  mg: string,
  series: number,
  reps: string,
  descanso: string,
  notes: string | null = null,
) => slot(mg, 'accesorio', series, reps, descanso, notes);

const DROP = 'DISMINUIR PESO CADA 10 REPES';
const PYRAMID = 'AUMENTAR PESO AL FINALIZAR CADA SERIE';
const ECC_VUELTA = 'CONTROLAR VELOCIDAD EN LA VUELTA';
const ECC_BAJADA = 'CONTROLAR VELOCIDAD EN LA BAJADA';

// ---------------------------------------------------------------------------
// Women (docs/routine-corpus/mujer)
// ---------------------------------------------------------------------------

// mujer/002 — 3 días full-body, rotating lower emphasis (verbatim Semana 1).
const MUJER_3D: CorpusExample = {
  source: 'mujer/002-3dias-hipertrofia-60min',
  gender: 'female',
  days: 3,
  leg_days: null,
  days_detail: [
    {
      focus: 'Full-body énfasis cuádriceps + espalda',
      slots: [
        warmup(),
        principal('Piernas - Cuadriceps'),
        acc('Piernas - Cuadriceps', 2, '8', '2 min'),
        acc('Piernas - Cuadriceps', 2, '10x10x10', '2 min', DROP),
        acc('Piernas - Pantorrillas', 1, '10x10x10', '2 min', DROP),
        warmup(),
        principal('Espalda'),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min', 'CONTROLAR VELOCIDAD DE GIRO'),
      ],
    },
    {
      focus: 'Full-body énfasis pecho/hombros (push)',
      slots: [
        warmup(),
        principal('Pecho - Mayor'),
        principal('Hombros'),
        acc('Pecho - Mayor', 2, '10', '1:45 a 2 min', ECC_VUELTA),
        acc('Hombros', 3, '10', '1:45 a 2 min'),
        acc('Hombros', 2, '10x10x10', '2 min', DROP),
        acc('Triceps', 3, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
        acc('Triceps', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
    {
      focus: 'Full-body énfasis glúteos/femorales + espalda/bíceps',
      slots: [
        warmup(),
        principal('Piernas - Gluteos'),
        acc('Piernas - Femorales', 2, '8', '2 min'),
        acc('Piernas - Femorales', 2, '8', '1:45 a 2 min', ECC_VUELTA),
        acc('Piernas - Abductores', 2, '10x10x10', '2 min', DROP),
        warmup(),
        acc('Espalda', 3, '10 - 8 - 6', '2 min', PYRAMID),
        acc('Biceps', 2, '8', '1:45 a 2 min'),
        acc('Biceps', 2, '8', '1:45 a 2 min', ECC_BAJADA),
      ],
    },
  ],
};

// mujer/003 — 4 días, lower-biased region-pairing split (verbatim Semana 1;
// PM Smith heavy-second demoted to accesorio 3×6 to respect the
// distinct-base-group principal rule).
const MUJER_4D: CorpusExample = {
  source: 'mujer/003-4dias-hipertrofia-60min',
  gender: 'female',
  days: 4,
  leg_days: null,
  days_detail: [
    {
      focus: 'Cuádriceps + hombros',
      slots: [
        warmup(),
        principal('Piernas - Cuadriceps'),
        acc('Piernas - Cuadriceps', 2, '8', '2 min'),
        acc('Piernas - Cuadriceps', 2, '10x10x10', '2 min', DROP),
        acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
        warmup(),
        principal('Hombros'),
        acc('Hombros', 3, '8 a 10', '1:45 a 2 min', ECC_BAJADA),
        acc('Abdomen', 2, '10', '1 min', 'CONTROLAR VELOCIDAD DE GIRO'),
      ],
    },
    {
      focus: 'Pecho + brazos',
      slots: [
        warmup(),
        principal('Pecho - Mayor'),
        acc('Pecho - Superior', 2, '8', '1:45 a 2 min'),
        acc('Biceps', 3, '8', '1:45 a 2 min'),
        acc('Biceps', 2, '8', '1:45 a 2 min'),
        acc('Triceps', 3, '10 - 8 - 6', '2 min', PYRAMID),
        acc('Triceps', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
        acc('Abdomen', 2, '30 seg + 10 cad', '1 min'),
      ],
    },
    {
      focus: 'Espalda + hombros (posterior/lateral)',
      slots: [
        warmup(),
        principal('Espalda'),
        principal('Hombros'),
        acc('Espalda', 2, '8', '1:45 a 2 min', ECC_VUELTA),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Hombros', 2, '8', '1:45 a 2 min', 'INCLINARSE LEVEMENTE HACIA DELANTE'),
        acc('Hombros', 3, '8 a 10', '1:45 a 2 min', ECC_BAJADA),
        acc('Hombros', 2, '10 a 12', '1:30 min', ECC_VUELTA),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
    {
      focus: 'Glúteos/femorales + bíceps',
      slots: [
        warmup(),
        principal('Piernas - Gluteos'),
        acc('Piernas - Femorales', 3, '6', '2 min'),
        acc('Piernas - Femorales', 2, '6 a 8', '2 min', ECC_VUELTA),
        acc('Piernas - Abductores', 2, '10x10x10', '2 min', DROP),
        warmup(),
        acc('Biceps', 3, '8', '2 min', 'NO BALANCEARSE'),
        acc('Biceps', 2, '10x10x10', '2 min', DROP),
      ],
    },
  ],
};

// mujer/004 — 5 días, lower-biased split (3 lower / 2 upper), reconstructed
// from the documented day table + shared mechanics.
const MUJER_5D: CorpusExample = {
  source: 'mujer/004-5dias-hipertrofia-60min',
  gender: 'female',
  days: 5,
  leg_days: null,
  days_detail: [
    {
      focus: 'Cuádriceps + espalda',
      slots: [
        warmup(),
        principal('Piernas - Cuadriceps'),
        acc('Piernas - Cuadriceps', 2, '8', '2 min'),
        acc('Piernas - Cuadriceps', 2, '10x10x10', '2 min', DROP),
        warmup(),
        principal('Espalda'),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
    {
      focus: 'Pecho + hombros + tríceps (push)',
      slots: [
        warmup(),
        principal('Pecho - Mayor'),
        principal('Hombros'),
        acc('Pecho - Mayor', 2, '10', '1:45 a 2 min', ECC_VUELTA),
        acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
        acc('Hombros', 2, '10x10x10', '2 min', DROP),
        acc('Triceps', 2, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
        acc('Triceps', 2, '10x10x10', '2 min', DROP),
      ],
    },
    {
      focus: 'Glúteos + abdomen',
      slots: [
        warmup(),
        principal('Piernas - Gluteos'),
        acc('Piernas - Gluteos', 2, '8', '1:45 a 2 min'),
        acc('Piernas - Aductores', 2, '8 a 10', '1:45 a 2 min'),
        acc('Piernas - Abductores', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min', 'CONTROLAR VELOCIDAD DE GIRO'),
        acc('Abdomen', 2, '30 seg', '1 min'),
        acc('Abdomen', 2, '30 seg + 10 cad', '1 min'),
      ],
    },
    {
      focus: 'Espalda + hombros + bíceps (pull)',
      slots: [
        warmup(),
        principal('Espalda'),
        principal('Hombros'),
        acc('Espalda', 2, '8', '1:45 a 2 min', ECC_VUELTA),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Hombros', 2, '10 a 12', '1:30 min', ECC_VUELTA),
        acc('Biceps', 3, '8', '1:45 a 2 min'),
        acc('Biceps', 2, '10x10x10', '2 min', DROP),
      ],
    },
    {
      focus: 'Femorales + pantorrillas',
      slots: [
        warmup(),
        principal('Piernas - Femorales'),
        acc('Piernas - Cuadriceps', 2, '8', '2 min'),
        acc('Piernas - Femorales', 2, '8', '1:45 a 2 min', ECC_VUELTA),
        acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
        acc('Piernas - Gluteos', 1, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
        acc('Abdomen', 2, '30 seg', '1 min'),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Men (docs/routine-corpus/hombre) — reconstructed from day tables + M1-M5.
// ---------------------------------------------------------------------------

const HOMBRE_PUSH: CorpusExampleDay = {
  focus: 'Push: pecho + hombros + tríceps',
  slots: [
    warmup(),
    principal('Pecho - Mayor'),
    principal('Hombros'),
    acc('Pecho - Mayor', 2, '8', '1:45 a 2 min'),
    acc('Pecho - Superior', 2, '8', '1:45 a 2 min'),
    acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
    acc('Triceps', 2, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
    acc('Triceps', 2, '10x10x10', '2 min', DROP),
    acc('Abdomen', 2, '10', '1 min'),
  ],
};

const HOMBRE_LEGS_CARDIO: CorpusExampleDay = {
  focus: 'Pierna completa (cuádriceps + femoral + pantorrilla) + cardio',
  slots: [
    warmup(),
    principal('Piernas - Cuadriceps'),
    acc('Piernas - Cuadriceps', 2, '8', '2 min'),
    acc('Piernas - Femorales', 2, '8', '1:45 a 2 min', ECC_VUELTA),
    acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
    acc('Abdomen', 2, '10', '1 min'),
    acc('Abdomen', 2, '30 seg', '1 min'),
    acc('Cardio', 1, '15 min', '-', 'CONSTANTE NO SUAVE NO INTENSO'),
  ],
};

const HOMBRE_PULL: CorpusExampleDay = {
  focus: 'Pull: espalda + bíceps',
  slots: [
    warmup(),
    principal('Espalda'),
    acc('Espalda', 2, '8', '1:45 a 2 min', ECC_VUELTA),
    acc('Espalda', 2, '10x10x10', '2 min', DROP),
    acc('Biceps', 3, '8', '1:45 a 2 min'),
    acc('Biceps', 2, '8', '1:45 a 2 min', ECC_BAJADA),
    acc('Biceps', 2, '10x10x10', '2 min', DROP),
    acc('Abdomen', 2, '10', '1 min'),
  ],
};

const HOMBRE_SHOULDERS_CHEST: CorpusExampleDay = {
  focus: 'Hombros + pecho superior',
  slots: [
    warmup(),
    principal('Hombros'),
    acc('Pecho - Superior', 2, '8', '1:45 a 2 min'),
    acc('Pecho - Superior', 2, '10x10x10', '2 min', DROP),
    acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
    acc('Hombros', 2, '10 a 12', '1:30 min', ECC_VUELTA),
    acc('Hombros', 2, '10x10x10', '2 min', DROP),
    acc('Abdomen', 2, '10', '1 min'),
  ],
};

const HOMBRE_QUADS: CorpusExampleDay = {
  focus: 'Cuádriceps + pantorrillas + bíceps',
  slots: [
    warmup(),
    principal('Piernas - Cuadriceps'),
    acc('Piernas - Cuadriceps', 2, '8', '2 min'),
    acc('Piernas - Cuadriceps', 2, '10x10x10', '2 min', DROP),
    acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
    warmup(),
    acc('Biceps', 3, '8', '1:45 a 2 min'),
    acc('Biceps', 2, '10x10x10', '2 min', DROP),
  ],
};

const HOMBRE_HAMS: CorpusExampleDay = {
  focus: 'Femorales + aductores + bíceps',
  slots: [
    warmup(),
    principal('Piernas - Femorales'),
    acc('Piernas - Femorales', 2, '8', '1:45 a 2 min', ECC_VUELTA),
    acc('Piernas - Aductores', 2, '8 a 10', '1:45 a 2 min'),
    acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
    warmup(),
    acc('Biceps', 3, '8', '1:45 a 2 min'),
    acc('Biceps', 2, '10x10x10', '2 min', DROP),
  ],
};

const HOMBRE_PULL_HOMBROS: CorpusExampleDay = {
  focus: 'Pull: espalda + hombros + antebrazos',
  slots: [
    warmup(),
    principal('Espalda'),
    principal('Hombros'),
    acc('Espalda', 2, '8', '1:45 a 2 min', ECC_VUELTA),
    acc('Espalda', 2, '10x10x10', '2 min', DROP),
    acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
    acc('Antebrazos', 2, 'fallo', '2 min'),
    acc('Abdomen', 2, '10', '1 min'),
  ],
};

const HOMBRE_PUSH_ARMS: CorpusExampleDay = {
  focus: 'Push + brazos: pecho + bíceps + tríceps',
  slots: [
    warmup(),
    principal('Pecho - Mayor'),
    acc('Pecho - Superior', 2, '8', '1:45 a 2 min'),
    acc('Biceps', 3, '8', '1:45 a 2 min'),
    acc('Biceps', 2, '10x10x10', '2 min', DROP),
    acc('Triceps', 2, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
    acc('Triceps', 2, '10x10x10', '2 min', DROP),
    acc('Abdomen', 2, '10', '1 min'),
  ],
};

const HOMBRE_3D_1L: CorpusExample = {
  source: 'hombre/001-3dias-1pierna-60min',
  gender: 'male',
  days: 3,
  leg_days: 1,
  days_detail: [HOMBRE_PUSH, HOMBRE_LEGS_CARDIO, HOMBRE_PULL],
};

const HOMBRE_3D_2L: CorpusExample = {
  source: 'hombre/002-3dias-2piernas-60min',
  gender: 'male',
  days: 3,
  leg_days: 2,
  days_detail: [
    {
      focus: 'Cuádriceps + espalda',
      slots: [
        warmup(),
        principal('Piernas - Cuadriceps'),
        acc('Piernas - Cuadriceps', 2, '8', '2 min'),
        acc('Piernas - Pantorrillas', 2, '10x10x10', '2 min', DROP),
        warmup(),
        principal('Espalda'),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
    HOMBRE_PUSH_ARMS,
    {
      focus: 'Femorales + hombros',
      slots: [
        warmup(),
        principal('Piernas - Femorales'),
        acc('Piernas - Femorales', 2, '8', '1:45 a 2 min', ECC_VUELTA),
        acc('Piernas - Aductores', 2, '8 a 10', '1:45 a 2 min'),
        warmup(),
        principal('Hombros'),
        acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
        acc('Hombros', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
  ],
};

const HOMBRE_4D_1L: CorpusExample = {
  source: 'hombre/003-4dias-1pierna-60min',
  gender: 'male',
  days: 4,
  leg_days: 1,
  days_detail: [HOMBRE_PUSH, HOMBRE_PULL, HOMBRE_LEGS_CARDIO, HOMBRE_SHOULDERS_CHEST],
};

const HOMBRE_4D_2L: CorpusExample = {
  source: 'hombre/004-4dias-2piernas-60min',
  gender: 'male',
  days: 4,
  leg_days: 2,
  days_detail: [HOMBRE_QUADS, HOMBRE_PUSH_ARMS, HOMBRE_PULL_HOMBROS, HOMBRE_HAMS],
};

const HOMBRE_5D_1L: CorpusExample = {
  source: 'hombre/005-5dias-1pierna-60min',
  gender: 'male',
  days: 5,
  leg_days: 1,
  days_detail: [
    HOMBRE_PUSH,
    HOMBRE_PULL,
    HOMBRE_LEGS_CARDIO,
    HOMBRE_SHOULDERS_CHEST,
    {
      focus: 'Pull + brazos: espalda + bíceps + tríceps',
      slots: [
        warmup(),
        principal('Espalda'),
        acc('Espalda', 2, '10x10x10', '2 min', DROP),
        acc('Biceps', 3, '8', '1:45 a 2 min'),
        acc('Biceps', 2, '10x10x10', '2 min', DROP),
        acc('Triceps', 2, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
        acc('Triceps', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '10', '1 min'),
      ],
    },
  ],
};

const HOMBRE_5D_2L: CorpusExample = {
  source: 'hombre/006-5dias-2piernas-60min',
  gender: 'male',
  days: 5,
  leg_days: 2,
  days_detail: [
    HOMBRE_QUADS,
    HOMBRE_PUSH_ARMS,
    HOMBRE_PULL_HOMBROS,
    HOMBRE_HAMS,
    {
      focus: 'Push 2: pecho superior + hombros + tríceps',
      slots: [
        warmup(),
        principal('Pecho - Superior'),
        acc('Pecho - Superior', 2, '8', '1:45 a 2 min'),
        acc('Hombros', 3, '8 a 10', '1:45 a 2 min'),
        acc('Hombros', 2, '10x10x10', '2 min', DROP),
        acc('Triceps', 2, '10 - 8 - 6', '1:45 a 2 min', PYRAMID),
        acc('Triceps', 2, '10x10x10', '2 min', DROP),
        acc('Abdomen', 2, '40 seg', '1 min'),
      ],
    },
  ],
};

export const CORPUS_EXAMPLES: CorpusExample[] = [
  MUJER_3D, MUJER_4D, MUJER_5D,
  HOMBRE_3D_1L, HOMBRE_3D_2L,
  HOMBRE_4D_1L, HOMBRE_4D_2L,
  HOMBRE_5D_1L, HOMBRE_5D_2L,
];

export interface PickCorpusProfile {
  gender: 'male' | 'female' | 'other';
  days_per_week: number;
  leg_days: number | null;
}

// Nearest corpus example for a profile: exact gender, days clamped into the
// corpus range (3-5), men's leg_days normalized to 1|2 (null → 1, the same
// default buildSplitGuidance uses). Returns null when the corpus has no
// gender-specific guidance (gender 'other').
export function pickCorpusExample(
  profile: PickCorpusProfile,
): CorpusExample | null {
  if (profile.gender !== 'male' && profile.gender !== 'female') return null;
  const days = Math.min(5, Math.max(3, profile.days_per_week));
  const legs =
    profile.gender === 'male' ? Math.min(2, Math.max(1, profile.leg_days ?? 1)) : null;
  return (
    CORPUS_EXAMPLES.find(
      (e) =>
        e.gender === profile.gender && e.days === days && e.leg_days === legs,
    ) ?? null
  );
}
