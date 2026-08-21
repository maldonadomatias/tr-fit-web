import { describe, expect, it } from 'vitest';
import {
  dayHeading,
  nextAvailableSlotIndex,
  remapDaysForMove,
} from './activas/DayCard';
import { resolvePrescription } from './TabRutina';
import { parseRoutineDraft } from './routine-draft';
import type { RutinaSlot } from '@/types/api';

const slot = (overrides: Partial<RutinaSlot> = {}): RutinaSlot => ({
  id: '00000000-0000-4000-8000-000000000001',
  day_of_week: 1,
  slot_index: 1,
  exercise_id: 1,
  role: 'accesorio',
  notes: null,
  series: null,
  reps: null,
  descanso: null,
  exercise_name: 'Press',
  muscle_group: 'Pecho',
  ...overrides,
});

describe('day reordering', () => {
  it('pulls a later day to the front and shifts the rest back', () => {
    // Coach drags Día 3 (piernas) onto Día 1: [1,2,3,4] -> contents [3,1,2,4].
    const remap = remapDaysForMove([1, 2, 3, 4], 3, 1);
    expect([...(remap ?? [])].sort()).toEqual([
      [1, 2],
      [2, 3],
      [3, 1],
      [4, 4],
    ]);
  });

  it('keeps the ordinals themselves 1..N', () => {
    const days = [1, 2, 3];
    const remap = remapDaysForMove(days, 1, 3);
    expect([...(remap ?? []).values()].sort()).toEqual(days);
    expect([...(remap ?? []).keys()].sort()).toEqual(days);
  });

  it('is a no-op when the day does not move or is unknown', () => {
    expect(remapDaysForMove([1, 2, 3], 2, 2)).toBeNull();
    expect(remapDaysForMove([1, 2, 3], 9, 1)).toBeNull();
    expect(remapDaysForMove([1, 2, 3], 1, 9)).toBeNull();
  });
});

describe('routine editor regressions', () => {
  it('labels session ordinals with the athlete real weekdays', () => {
    expect(dayHeading(2, ['lun', 'jue', 'vie'])).toBe('Día 2 · Jueves');
    expect(dayHeading(1, null)).toBe('Día 1');
    expect(dayHeading(4, ['lun', 'jue', 'vie'])).toBe('Día 4');
  });

  it('uses the first free position when an active day has gaps', () => {
    expect(
      nextAvailableSlotIndex([
        slot({ slot_index: 1 }),
        slot({ id: '2', slot_index: 3 }),
      ])
    ).toBe(2);
  });

  it('shows one warm-up series by default and honors a coach override', () => {
    expect(
      resolvePrescription(slot({ role: 'calentamiento' }), undefined, null)
        ?.sets
    ).toBe('1 serie');
    expect(
      resolvePrescription(
        slot({ role: 'calentamiento', series: 3 }),
        undefined,
        null
      )?.sets
    ).toBe('3 series');
  });

  it('rejects malformed persisted drafts without breaking the editor', () => {
    expect(parseRoutineDraft('{bad json')).toBeNull();
    expect(parseRoutineDraft(JSON.stringify({ version: 99 }))).toBeNull();
  });
});
