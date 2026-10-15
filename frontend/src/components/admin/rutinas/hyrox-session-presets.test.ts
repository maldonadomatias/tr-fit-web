import { describe, expect, it } from 'vitest';
import { hyroxSessionPreset } from './hyrox-session-presets';

describe('hyroxSessionPreset', () => {
  it('devuelve el bloque de HYROX Session LVL 1', () => {
    expect(hyroxSessionPreset('HYROX Session LVL 1')).toEqual({
      series: 2,
      reps: '2,1 km',
      descanso: '3 min',
      notes: [
        'CINTA 400 MTS + LUNGES 20 REPS +',
        'CINTA 400 MTS + REMO ROW 500 MTS +',
        'CINTA 400 MTS + THRUSTERS 15 REPS +',
        'CINTA 400 MTS - (Fin de Serie 1)',
      ].join('\n'),
    });
  });

  it('devuelve el bloque de HYROX Session LVL 2', () => {
    const preset = hyroxSessionPreset('  hyrox   session lvl 2 ');
    expect(preset?.series).toBe(1);
    expect(preset?.reps).toBe('3,8 Km');
    expect(preset?.descanso).toBe('3 min');
    expect(preset?.notes).toContain('BURPEES TO PLATE 15 REPS');
    expect(preset?.notes).toContain('Fin de serie 1');
  });

  it('no inventa un preset para otro ejercicio', () => {
    expect(hyroxSessionPreset('Sentadilla')).toBeNull();
  });
});
