import { describe, expect, it } from 'vitest';
import { hyroxSessionPreset } from './hyrox-session-presets';
import {
  catalogSlotPreset,
  nextSlotForm,
  type SlotFormState,
} from './catalog-slot-preset';

const empty: SlotFormState = { series: '', reps: '', descanso: '', notes: '' };

describe('catalogSlotPreset', () => {
  it('arma el bloque guardado en el ejercicio', () => {
    expect(
      catalogSlotPreset({
        name: 'Remo en seco',
        default_series: 3,
        default_target: '45 seg',
        default_descanso: '1 min',
        default_notes: 'Ritmo constante.',
      })
    ).toEqual({
      series: 3,
      reps: '45 seg',
      descanso: '1 min',
      notes: 'Ritmo constante.',
      forceAccessory: false,
      replacesBlock: true,
    });
  });

  it('un objetivo solo no reemplaza series ni comentarios', () => {
    expect(
      catalogSlotPreset({
        name: 'Bicicleta fija',
        default_target: '5 min',
      })
    ).toEqual({
      series: null,
      reps: '5 min',
      descanso: null,
      notes: null,
      forceAccessory: false,
      replacesBlock: false,
    });
  });

  it('los valores guardados pisan el bloque fijo de HYROX', () => {
    const preset = catalogSlotPreset({
      name: 'HYROX Session LVL 1',
      default_series: 4,
      default_target: '2 km',
      default_descanso: '2 min',
      default_notes: 'Bloque editado',
    });
    expect(preset?.series).toBe(4);
    expect(preset?.notes).toBe('Bloque editado');
    expect(preset?.forceAccessory).toBe(false);
  });

  it('sin prescripción guardada sigue el nombre de HYROX', () => {
    const hyrox = hyroxSessionPreset('HYROX Session LVL 2')!;
    expect(
      catalogSlotPreset({ name: 'HYROX Session LVL 2', default_target: '3,8 Km' })
    ).toMatchObject({
      series: hyrox.series,
      reps: hyrox.reps,
      notes: hyrox.notes,
      forceAccessory: true,
      replacesBlock: true,
    });
  });

  it('un ejercicio común sin datos no tiene preset', () => {
    expect(catalogSlotPreset({ name: 'Curl Femoral' })).toBeNull();
  });
});

describe('nextSlotForm', () => {
  it('copia el bloque al elegir el ejercicio', () => {
    expect(
      nextSlotForm(
        empty,
        null,
        {
          name: 'Remo en seco',
          default_series: 3,
          default_target: '45 seg',
          default_descanso: '1 min',
          default_notes: 'Ritmo constante.',
        },
        { sameExercise: false }
      )
    ).toEqual({
      series: '3',
      reps: '45 seg',
      descanso: '1 min',
      notes: 'Ritmo constante.',
    });
  });

  it('un objetivo solo completa reps y deja el comentario que ya estaba', () => {
    expect(
      nextSlotForm(
        { series: '2', reps: '8', descanso: '1 min', notes: 'nota propia' },
        { name: 'Curl Femoral' },
        { name: 'Bicicleta fija', default_target: '5 min' },
        { sameExercise: false }
      )
    ).toEqual({
      series: '2',
      reps: '5 min',
      descanso: '1 min',
      notes: 'nota propia',
    });
  });

  it('salir de un bloque no arrastra el comentario al siguiente ejercicio', () => {
    const hyrox = hyroxSessionPreset('HYROX Session LVL 1')!;
    const filled = nextSlotForm(
      empty,
      null,
      { name: 'HYROX Session LVL 1' },
      { sameExercise: false }
    );
    expect(filled.notes).toBe(hyrox.notes);

    expect(
      nextSlotForm(
        { ...filled, reps: '1 km' },
        { name: 'HYROX Session LVL 1' },
        { name: 'Curl Femoral' },
        { sameExercise: false }
      )
    ).toEqual(empty);
  });
});
