import { buildSet, type SetRow } from '../../src/services/logged-sessions.service.js';

function row(p: Partial<SetRow>): SetRow {
  return {
    session_log_id: 's1',
    exercise_id: 1,
    name: 'Ej',
    muscle_group: null,
    set_index: 1,
    drop_index: null,
    value: null,
    unit: 'kg',
    reps: null,
    rpe: null,
    ...p,
  };
}

describe('buildSet — dropset grouping', () => {
  it('groups a 3-2-1 dropset into one labelled entry', () => {
    const out = buildSet([
      row({ set_index: 1, drop_index: 1, value: '3', unit: 'ladrillos', reps: 10, rpe: 8 }),
      row({ set_index: 1, drop_index: 2, value: '2', unit: 'ladrillos', reps: 10 }),
      row({ set_index: 1, drop_index: 3, value: '1', unit: 'ladrillos', reps: 10 }),
    ]);
    expect(out.is_dropset).toBe(true);
    expect(out.weight_label).toBe('3-2-1 lad');
    expect(out.reps_label).toBe('10'); // equal reps collapse to a single value
    expect(out.rpe).toBe(8); // taken from the heaviest (first) drop
  });

  it('lists distinct reps when drops differ', () => {
    const out = buildSet([
      row({ set_index: 2, drop_index: 1, value: '40', reps: 12 }),
      row({ set_index: 2, drop_index: 2, value: '30', reps: 10 }),
    ]);
    expect(out.weight_label).toBe('40-30 kg');
    expect(out.reps_label).toBe('12-10');
  });

  it('renders a normal single set plainly', () => {
    const out = buildSet([
      row({ set_index: 1, drop_index: null, value: '60.00', unit: 'kg', reps: 8, rpe: 7 }),
    ]);
    expect(out.is_dropset).toBe(false);
    expect(out.weight_label).toBe('60 kg'); // trailing .00 trimmed
    expect(out.reps_label).toBe('8');
    expect(out.rpe).toBe(7);
  });

  it('omits weight for a bodyweight/timed set', () => {
    const out = buildSet([row({ set_index: 1, value: null, reps: 30, unit: 'kg' })]);
    expect(out.weight_label).toBe('');
    expect(out.reps_label).toBe('30');
  });
});
