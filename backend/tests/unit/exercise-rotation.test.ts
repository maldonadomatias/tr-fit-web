import { describe, it, expect } from '@jest/globals';
import {
  pickRotation,
  groupKey,
  ROTATION_ORDER,
  type RotationSlot,
} from '../../src/services/exercise-rotation.js';
import type { Exercise } from '../../src/domain/types.js';

function ex(over: Partial<Exercise> & { id: number; name: string }): Exercise {
  return {
    muscle_group: 'Espalda',
    equipment: 'mancuerna',
    movement_pattern: 'pull_h',
    is_principal: false,
    is_unilateral: false,
    level_min: 'principiante',
    contraindicated_for: [],
    default_increment_kg: 2.5,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
    modality: 'reps',
    default_target: null,
    rep_cycle_threshold: 12,
    ...over,
  } as Exercise;
}

function slot(
  over: Partial<RotationSlot> & { id: string; exercise_id: number }
): RotationSlot {
  return { day_of_week: 1, role: 'accesorio', reps: '8', ...over };
}

const first = () => 0; // deterministic rng: always index 0

describe('groupKey', () => {
  it('uses the prefix, case and accent insensitive', () => {
    expect(groupKey('Piernas - Cuadriceps')).toBe('piernas');
    expect(groupKey('Bíceps')).toBe('biceps');
    expect(groupKey('Espalda')).toBe('espalda');
  });
});

describe('pickRotation', () => {
  const remo = ex({ id: 1, name: 'Remo' });
  const jalon = ex({ id: 2, name: 'Jalon' });
  const pullover = ex({ id: 3, name: 'Pullover' });
  const pecho = ex({
    id: 10,
    name: 'Aperturas',
    muscle_group: 'Pecho - Mayor',
  });
  const pecho2 = ex({ id: 11, name: 'Cruce', muscle_group: 'Pecho - Mayor' });

  it('order starts at Espalda and ends at Hombros', () => {
    expect(ROTATION_ORDER).toEqual([
      'Espalda',
      'Pecho',
      'Piernas',
      'Biceps',
      'Triceps',
      'Hombros',
    ]);
  });

  it('swaps an Espalda accessory for another Espalda exercise not used that day', () => {
    const slots = [
      slot({ id: 's1', exercise_id: 1 }),
      slot({ id: 's2', exercise_id: 2 }),
    ];
    const byId = new Map([
      [1, remo],
      [2, jalon],
    ]);
    const pick = pickRotation(
      slots,
      byId,
      [remo, jalon, pullover, pecho],
      0,
      first
    );
    expect(pick?.to.id).toBe(3);
    expect(pick?.group).toBe('Espalda');
    expect(pick?.nextIndex).toBe(1);
  });

  it('allows a replacement used on another day', () => {
    const slots = [
      slot({ id: 's1', exercise_id: 1, day_of_week: 1 }),
      slot({ id: 's2', exercise_id: 2, day_of_week: 2 }),
    ];
    const byId = new Map([
      [1, remo],
      [2, jalon],
    ]);
    const pick = pickRotation(slots, byId, [remo, jalon], 0, first);
    expect(pick?.slotId).toBe('s1');
    expect(pick?.to.id).toBe(2);
  });

  it('never rotates principal slots, principal exercises or dropset finishers', () => {
    const principalEx = ex({ id: 4, name: 'Remo Barra', is_principal: true });
    const slots = [
      slot({ id: 'a', exercise_id: 1, role: 'principal' }),
      slot({ id: 'b', exercise_id: 4 }),
      slot({ id: 'c', exercise_id: 2, reps: '10x10x10' }),
    ];
    const byId = new Map<number, Exercise>([
      [1, remo],
      [2, jalon],
      [4, principalEx],
    ]);
    expect(
      pickRotation(slots, byId, [remo, jalon, pullover, principalEx], 0, first)
    ).toBeNull();
  });

  it('never picks a principal exercise as replacement', () => {
    const principalEx = ex({ id: 4, name: 'Remo Barra', is_principal: true });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(
      slots,
      new Map([[1, remo]]),
      [remo, principalEx],
      0,
      first
    );
    expect(pick).toBeNull();
  });

  it('requires exact same muscle_group', () => {
    const cuad = ex({
      id: 20,
      name: 'Extension',
      muscle_group: 'Piernas - Cuadriceps',
    });
    const fem = ex({
      id: 21,
      name: 'Curl femoral',
      muscle_group: 'Piernas - Femorales',
    });
    const slots = [slot({ id: 's1', exercise_id: 20 })];
    expect(
      pickRotation(slots, new Map([[20, cuad]]), [cuad, fem], 2, first)
    ).toBeNull();
  });

  it('time-modality only replaced by time-modality', () => {
    const plancha = ex({
      id: 30,
      name: 'Remo isometrico',
      modality: 'tiempo',
    });
    const slots = [slot({ id: 's1', exercise_id: 30 })];
    const byId = new Map([[30, plancha]]);
    expect(pickRotation(slots, byId, [plancha, remo], 0, first)).toBeNull();
    const plancha2 = ex({ id: 31, name: 'Colgado', modality: 'tiempo' });
    expect(
      pickRotation(slots, byId, [plancha, remo, plancha2], 0, first)?.to.id
    ).toBe(31);
  });

  it('only picks from allowed (injury/equipment filtered) list', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    // pullover NOT in allowed → nothing
    expect(
      pickRotation(slots, new Map([[1, remo]]), [remo], 0, first)
    ).toBeNull();
  });

  it('skips a group with no candidates and moves to the next', () => {
    const slots = [
      slot({ id: 's1', exercise_id: 1 }),
      slot({ id: 's2', exercise_id: 10, day_of_week: 2 }),
    ];
    const byId = new Map([
      [1, remo],
      [10, pecho],
    ]);
    const pick = pickRotation(slots, byId, [remo, pecho, pecho2], 0, first);
    expect(pick?.group).toBe('Pecho');
    expect(pick?.to.id).toBe(11);
    expect(pick?.nextIndex).toBe(2);
  });

  it('wraps around after Hombros', () => {
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(
      slots,
      new Map([[1, remo]]),
      [remo, jalon],
      5,
      first
    );
    expect(pick?.group).toBe('Espalda');
    expect(pick?.nextIndex).toBe(1);
  });

  it('prefers curated alternatives when any passes filters', () => {
    const remoCur = ex({ id: 1, name: 'Remo', alternatives_ids: [3] });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(
      slots,
      new Map([[1, remoCur]]),
      [remoCur, jalon, pullover],
      0,
      first
    );
    expect(pick?.to.id).toBe(3);
  });

  it('falls back to group when curated ones are not allowed', () => {
    const remoCur = ex({ id: 1, name: 'Remo', alternatives_ids: [99] });
    const slots = [slot({ id: 's1', exercise_id: 1 })];
    const pick = pickRotation(
      slots,
      new Map([[1, remoCur]]),
      [remoCur, jalon],
      0,
      first
    );
    expect(pick?.to.id).toBe(2);
  });

  it('returns null when nothing in any group is rotatable', () => {
    expect(pickRotation([], new Map(), [], 0, first)).toBeNull();
  });
});
