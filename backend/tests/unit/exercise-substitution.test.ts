import { describe, it, expect } from '@jest/globals';
import { substituteUnavailableSlots } from '../../src/services/exercise-substitution.service.js';
import type { Exercise } from '../../src/domain/types.js';
import type { RoutineTemplate, TemplateSlot } from '../../src/services/template.service.js';

function ex(over: Partial<Exercise> & { id: number; name: string }): Exercise {
  return {
    muscle_group: 'pecho',
    equipment: 'mancuerna',
    movement_pattern: 'push_h',
    is_principal: true,
    is_unilateral: false,
    level_min: 'principiante',
    contraindicated_for: [],
    default_increment_kg: 2.5,
    alternatives_ids: [],
    video_url: null,
    illustration_url: null,
    modality: 'reps',
    default_target: null,
    rep_cycle_threshold: 3,
    ...over,
  } as Exercise;
}

function slot(over: Partial<TemplateSlot> & { exercise_id: number; exercise_name: string }): TemplateSlot {
  return {
    muscle_group: 'pecho',
    role: 'principal',
    series: 4,
    reps: '8-10',
    rir: '2',
    descanso: '90s',
    notes: 'nota del coach',
    ...over,
  } as TemplateSlot;
}

function tpl(slots: TemplateSlot[][]): RoutineTemplate {
  return {
    source: 'TEST.xlsx',
    gender: 'male',
    days: slots.length,
    leg_days: 1,
    schedules: [],
    days_detail: slots.map((s, i) => ({ focus: `dia ${i + 1}`, slots: s })),
  };
}

describe('substituteUnavailableSlots', () => {
  it('keeps slots whose exercise is already allowed', () => {
    const keep = ex({ id: 1, name: 'Press Mancuerna' });
    const t = tpl([[slot({ exercise_id: 1, exercise_name: 'Press Mancuerna' })]]);
    const r = substituteUnavailableSlots(t, [keep], [keep]);
    expect(r.substituted).toEqual([]);
    expect(r.unresolved).toEqual([]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(1);
  });

  it('prefers a curated alternative over the muscle-group sweep', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra', alternatives_ids: [30] });
    const sweep = ex({ id: 20, name: 'Press Mancuerna' });
    const curated = ex({ id: 30, name: 'Flexiones', equipment: 'bw', movement_pattern: 'core' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    const r = substituteUnavailableSlots(t, [sweep, curated], [orig, sweep, curated]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(30);
    expect(r.substituted).toEqual([{ from: 'Press Barra', to: 'Flexiones' }]);
    expect(r.unresolved).toEqual([]);
  });

  it('falls back to same muscle group, ranking movement_pattern then is_principal then equipment', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra', movement_pattern: 'push_h', is_principal: true });
    const wrongPattern = ex({ id: 20, name: 'Aperturas', movement_pattern: 'isolation' });
    const rightPattern = ex({ id: 21, name: 'Press Mancuerna', movement_pattern: 'push_h' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    const r = substituteUnavailableSlots(t, [wrongPattern, rightPattern], [orig, wrongPattern, rightPattern]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(21);
  });

  it('never repeats an exercise within the same day', () => {
    const origA = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const origB = ex({ id: 11, name: 'Press Inclinado Barra', equipment: 'barra' });
    const only1 = ex({ id: 20, name: 'Press Mancuerna' });
    const only2 = ex({ id: 21, name: 'Aperturas', movement_pattern: 'isolation' });
    const t = tpl([[
      slot({ exercise_id: 10, exercise_name: 'Press Barra' }),
      slot({ exercise_id: 11, exercise_name: 'Press Inclinado Barra' }),
    ]]);
    const r = substituteUnavailableSlots(t, [only1, only2], [origA, origB, only1, only2]);
    const ids = r.template.days_detail[0].slots.map((s) => s.exercise_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual([20, 21]);
  });

  it('reuses the same exercise across different days', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna' });
    const t = tpl([
      [slot({ exercise_id: 10, exercise_name: 'Press Barra' })],
      [slot({ exercise_id: 10, exercise_name: 'Press Barra' })],
    ]);
    const r = substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(20);
    expect(r.template.days_detail[1].slots[0].exercise_id).toBe(20);
  });

  it('keeps the coach prescription and role on a substituted slot', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna', muscle_group: 'pecho' });
    const t = tpl([[slot({
      exercise_id: 10, exercise_name: 'Press Barra',
      role: 'accesorio', series: 3, reps: '12', rir: '1', descanso: '60s', notes: 'lento',
    })]]);
    const r = substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(r.template.days_detail[0].slots[0]).toEqual({
      exercise_id: 20,
      exercise_name: 'Press Mancuerna',
      muscle_group: 'pecho',
      role: 'accesorio',
      series: 3,
      reps: '12',
      rir: '1',
      descanso: '60s',
      notes: 'lento',
    });
  });

  it('reports unresolved when no candidate shares the muscle group', () => {
    const orig = ex({ id: 10, name: 'Sentadilla Barra', muscle_group: 'pierna', equipment: 'barra' });
    const other = ex({ id: 20, name: 'Press Mancuerna', muscle_group: 'pecho' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Sentadilla Barra', muscle_group: 'pierna' })]]);
    const r = substituteUnavailableSlots(t, [other], [orig, other]);
    expect(r.unresolved).toEqual(['Sentadilla Barra']);
    expect(r.substituted).toEqual([]);
    expect(r.template.days_detail[0].slots[0].exercise_id).toBe(10);
  });

  it('does not mutate the input template', () => {
    const orig = ex({ id: 10, name: 'Press Barra', equipment: 'barra' });
    const repl = ex({ id: 20, name: 'Press Mancuerna' });
    const t = tpl([[slot({ exercise_id: 10, exercise_name: 'Press Barra' })]]);
    substituteUnavailableSlots(t, [repl], [orig, repl]);
    expect(t.days_detail[0].slots[0].exercise_id).toBe(10);
  });
});
