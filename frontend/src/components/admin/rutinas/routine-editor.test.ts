import { describe, expect, it } from 'vitest';
import { nextAvailableSlotIndex } from './activas/DayCard';
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

describe('routine editor regressions', () => {
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
