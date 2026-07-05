import type { Exercise } from '../../src/domain/types.js';
import type { AiSkeletonOutput } from '../../src/domain/schemas.js';

const { enforceFirstWarmup, classifyDayRegion, isWarmupName, normalizeWarmupRoles } =
  await import('../../src/services/warmup-rule.js');

const baseEx: Exercise = {
  id: 0,
  name: '',
  muscle_group: '',
  equipment: 'bw',
  movement_pattern: 'cardio',
  is_principal: false,
  is_unilateral: false,
  level_min: 'principiante',
  contraindicated_for: [],
  default_increment_kg: 1,
  alternatives_ids: [],
  video_url: null,
  illustration_url: null,
  modality: 'reps',
  default_target: null,
  rep_cycle_threshold: 12,
};

const catalog: Exercise[] = [
  {
    ...baseEx,
    id: 1,
    name: 'Movimiento Articular con y sin elastico',
    muscle_group: 'Calentamiento',
  },
  {
    ...baseEx,
    id: 2,
    name: 'Movimientos Articulares completos Piernas',
    muscle_group: 'Calentamiento',
  },
  { ...baseEx, id: 3, name: 'Bicicleta fija', muscle_group: 'Calentamiento' },
  {
    ...baseEx,
    id: 10,
    name: 'Press Plano',
    muscle_group: 'Pecho - Mayor',
    is_principal: true,
  },
  { ...baseEx, id: 11, name: 'Jalon al Pecho polea', muscle_group: 'Espalda' },
  {
    ...baseEx,
    id: 12,
    name: 'Press Militar',
    muscle_group: 'Hombros',
    is_principal: true,
  },
  {
    ...baseEx,
    id: 20,
    name: 'Sentadilla',
    muscle_group: 'Piernas - Cuadriceps',
    is_principal: true,
  },
  {
    ...baseEx,
    id: 21,
    name: 'Hip Thrust',
    muscle_group: 'Piernas - Gluteos',
    is_principal: true,
  },
  {
    ...baseEx,
    id: 22,
    name: 'Curl Femoral',
    muscle_group: 'Piernas - Femorales',
  },
  { ...baseEx, id: 30, name: 'Plancha', muscle_group: 'Abdomen' },
];

type Slot = AiSkeletonOutput['days'][number]['slots'][number];

const slot = (
  exercise_id: number,
  role: Slot['role'],
  slot_index: number
): Slot => ({
  slot_index,
  exercise_id,
  role,
  notes: null,
  series: null,
  reps: null,
  descanso: null,
});

const day = (slots: Slot[]): AiSkeletonOutput['days'][number] => ({
  day_index: 1,
  focus: 'test',
  slots,
});

const out = (days: AiSkeletonOutput['days']): AiSkeletonOutput => ({
  rationale: 'r',
  days,
});

describe('classifyDayRegion', () => {
  it('upper-only day → upper', () => {
    const d = day([
      slot(3, 'calentamiento', 1),
      slot(10, 'principal', 2),
      slot(11, 'accesorio', 3),
    ]);
    expect(classifyDayRegion(d, catalog)).toBe('upper');
  });

  it('lower-only day → lower', () => {
    const d = day([
      slot(3, 'calentamiento', 1),
      slot(20, 'principal', 2),
      slot(22, 'accesorio', 3),
    ]);
    expect(classifyDayRegion(d, catalog)).toBe('lower');
  });

  it('mixed day → predominant region', () => {
    const d = day([
      slot(20, 'principal', 1),
      slot(21, 'accesorio', 2),
      slot(22, 'accesorio', 3),
      slot(10, 'principal', 4),
    ]);
    expect(classifyDayRegion(d, catalog)).toBe('lower');
  });

  it('mixed day tie → region of first working slot', () => {
    const d = day([slot(10, 'principal', 1), slot(20, 'principal', 2)]);
    expect(classifyDayRegion(d, catalog)).toBe('upper');
  });

  it('neutral-only day (core/warmup) → null', () => {
    const d = day([slot(3, 'calentamiento', 1), slot(30, 'accesorio', 2)]);
    expect(classifyDayRegion(d, catalog)).toBeNull();
  });
});

describe('enforceFirstWarmup', () => {
  it('upper day: first slot forced to MOVIMIENTO ARTICULAR CON Y SIN ELÁSTICO', () => {
    const o = out([
      day([
        slot(3, 'calentamiento', 1),
        slot(10, 'principal', 2),
        slot(11, 'accesorio', 3),
      ]),
    ]);
    const res = enforceFirstWarmup(o, catalog);
    const slots = res.days[0].slots;
    expect(slots[0].exercise_id).toBe(1);
    expect(slots[0].role).toBe('calentamiento');
    expect(slots.map((s) => s.slot_index)).toEqual([1, 2, 3]);
  });

  it('lower day: first slot forced to MOVIMIENTOS ARTICULARES COMPLETOS PIERNAS', () => {
    const o = out([
      day([
        slot(3, 'calentamiento', 1),
        slot(20, 'principal', 2),
        slot(22, 'accesorio', 3),
      ]),
    ]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots[0].exercise_id).toBe(2);
  });

  it('already correct first slot → unchanged slot list', () => {
    const o = out([
      day([slot(1, 'calentamiento', 1), slot(10, 'principal', 2)]),
    ]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots.map((s) => s.exercise_id)).toEqual([1, 10]);
  });

  it('required warmup elsewhere in day → moved to front, no duplicate', () => {
    const o = out([
      day([
        slot(3, 'calentamiento', 1),
        slot(20, 'principal', 2),
        slot(2, 'calentamiento', 3),
        slot(22, 'accesorio', 4),
      ]),
    ]);
    const res = enforceFirstWarmup(o, catalog);
    const ids = res.days[0].slots.map((s) => s.exercise_id);
    expect(ids[0]).toBe(2);
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
    // the generic warmup that was first is replaced, not kept
    expect(res.days[0].slots.map((s) => s.slot_index)).toEqual([1, 2, 3]);
  });

  it('day starting with a principal (no warmup) → warmup prepended', () => {
    const o = out([day([slot(20, 'principal', 1), slot(22, 'accesorio', 2)])]);
    const res = enforceFirstWarmup(o, catalog);
    const ids = res.days[0].slots.map((s) => s.exercise_id);
    expect(ids).toEqual([2, 20, 22]);
    expect(res.days[0].slots.map((s) => s.slot_index)).toEqual([1, 2, 3]);
  });

  it('12-slot day starting with a principal → prepend drops last accessory (max 12)', () => {
    const slots: Slot[] = [
      slot(20, 'principal', 1),
      ...Array.from({ length: 11 }, (_, i) => slot(22, 'accesorio', i + 2)),
    ];
    const o = out([day(slots)]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots).toHaveLength(12);
    expect(res.days[0].slots[0].exercise_id).toBe(2);
    expect(res.days[0].slots[11].slot_index).toBe(12);
  });

  it('neutral day (core only) → untouched', () => {
    const o = out([
      day([slot(3, 'calentamiento', 1), slot(30, 'accesorio', 2)]),
    ]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots.map((s) => s.exercise_id)).toEqual([3, 30]);
  });

  it('required warmup missing from catalog → day untouched', () => {
    const noWarmups = catalog.filter((e) => e.id !== 1 && e.id !== 2);
    const o = out([
      day([slot(3, 'calentamiento', 1), slot(10, 'principal', 2)]),
    ]);
    const res = enforceFirstWarmup(o, noWarmups);
    expect(res.days[0].slots.map((s) => s.exercise_id)).toEqual([3, 10]);
  });

  it('required warmup already first but mistagged → role fixed in place', () => {
    const o = out([day([slot(1, 'accesorio', 1), slot(10, 'principal', 2)])]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots.map((s) => s.exercise_id)).toEqual([1, 10]);
    expect(res.days[0].slots[0].role).toBe('calentamiento');
  });

  it('multi-day: each day gets its own region warmup', () => {
    const o = out([
      {
        day_index: 1,
        focus: 'upper',
        slots: [slot(3, 'calentamiento', 1), slot(10, 'principal', 2)],
      },
      {
        day_index: 2,
        focus: 'lower',
        slots: [slot(3, 'calentamiento', 1), slot(20, 'principal', 2)],
      },
    ]);
    const res = enforceFirstWarmup(o, catalog);
    expect(res.days[0].slots[0].exercise_id).toBe(1);
    expect(res.days[1].slots[0].exercise_id).toBe(2);
  });
});

describe('isWarmupName', () => {
  it.each([
    'Movimiento Articular con y sin elastico',
    'Movimientos Articulares completos Piernas',
    'MOVIMIENTO ARTICULAR CON Y SIN ELÁSTICO',
    'Movilidad de cadera',
    'Activación de glúteos',
    'Entrada en calor general',
  ])('matches "%s"', (name) => {
    expect(isWarmupName(name)).toBe(true);
  });

  it.each(['Press Plano', 'Sentadilla', 'Curl Femoral', 'Plancha'])(
    'does not match "%s"',
    (name) => {
      expect(isWarmupName(name)).toBe(false);
    }
  );
});

describe('normalizeWarmupRoles', () => {
  it('re-tags a warmup mislabeled as accesorio and clears its set-scheme', () => {
    const o = out([
      day([
        {
          ...slot(1, 'accesorio', 1),
          series: 2,
          reps: '8',
          descanso: '2 min',
        },
        slot(10, 'principal', 2),
      ]),
    ]);
    const res = normalizeWarmupRoles(o, catalog);
    const fixed = res.days[0].slots[0];
    expect(fixed.role).toBe('calentamiento');
    expect(fixed.series).toBeNull();
    expect(fixed.reps).toBeNull();
    expect(fixed.descanso).toBeNull();
    // the working slot is untouched
    expect(res.days[0].slots[1].role).toBe('principal');
  });

  it('re-tags a warmup mislabeled as principal', () => {
    const o = out([day([slot(2, 'principal', 1), slot(20, 'principal', 2)])]);
    const res = normalizeWarmupRoles(o, catalog);
    expect(res.days[0].slots[0].role).toBe('calentamiento');
    expect(res.days[0].slots[1].role).toBe('principal');
  });

  it('returns the same object when nothing needs fixing', () => {
    const o = out([
      day([slot(1, 'calentamiento', 1), slot(10, 'principal', 2)]),
    ]);
    expect(normalizeWarmupRoles(o, catalog)).toBe(o);
  });

  it('ignores exercise ids missing from the catalog', () => {
    const o = out([day([slot(999, 'accesorio', 1)])]);
    const res = normalizeWarmupRoles(o, catalog);
    expect(res.days[0].slots[0].role).toBe('accesorio');
  });
});
