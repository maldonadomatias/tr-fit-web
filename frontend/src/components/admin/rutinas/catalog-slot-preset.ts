/**
 * Slot prescription copied from a catalog exercise (Molpo #143).
 * Series, rest, or coach notes replace the whole accessory form.
 * A target with none of those only fills reps/time (warmups already
 * read default_target on their own). HYROX names stay a fallback when
 * the row has not been saved with a prescription yet.
 */
import { hyroxSessionPreset } from './hyrox-session-presets';

export type CatalogSlotPreset = {
  series: number | null;
  reps: string | null;
  descanso: string | null;
  notes: string | null;
  /** HYROX name fallback must enter the routine as an accessory. */
  forceAccessory: boolean;
  /** True when series, rest, notes, or the HYROX block replace the form. */
  replacesBlock: boolean;
};

export type SlotFormState = {
  series: string;
  reps: string;
  descanso: string;
  notes: string;
};

type PresetSource = {
  name: string;
  default_series?: number | null;
  default_target?: string | null;
  default_descanso?: string | null;
  default_notes?: string | null;
};

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function catalogSlotPreset(
  exercise: PresetSource
): CatalogSlotPreset | null {
  const series =
    exercise.default_series != null &&
    Number.isFinite(Number(exercise.default_series))
      ? Number(exercise.default_series)
      : null;
  const descanso = blank(exercise.default_descanso);
  const notes = blank(exercise.default_notes);
  const reps = blank(exercise.default_target);

  if (series != null || descanso != null || notes != null) {
    return {
      series,
      reps,
      descanso,
      notes,
      forceAccessory: false,
      replacesBlock: true,
    };
  }

  const hyrox = hyroxSessionPreset(exercise.name);
  if (hyrox) {
    return {
      series: hyrox.series,
      reps: hyrox.reps,
      descanso: hyrox.descanso,
      notes: hyrox.notes,
      forceAccessory: true,
      replacesBlock: true,
    };
  }

  if (reps) {
    return {
      series: null,
      reps,
      descanso: null,
      notes: null,
      forceAccessory: false,
      replacesBlock: false,
    };
  }

  return null;
}

export function formFromPreset(preset: CatalogSlotPreset): SlotFormState {
  return {
    series: preset.series != null ? String(preset.series) : '',
    reps: preset.reps ?? '',
    descanso: preset.descanso ?? '',
    notes: preset.notes ?? '',
  };
}

function isBlank(form: SlotFormState): boolean {
  return (
    !form.series.trim() &&
    !form.reps.trim() &&
    !form.descanso.trim() &&
    !form.notes.trim()
  );
}

/**
 * Next series/reps/rest/notes after the coach picks another exercise.
 * A saved block replaces the form. Leaving a block clears it so the
 * previous comments do not stick to the next exercise.
 */
export function nextSlotForm(
  current: SlotFormState,
  previous: PresetSource | null,
  next: PresetSource,
  options: { sameExercise: boolean }
): SlotFormState {
  const preset = catalogSlotPreset(next);
  const blankForm = isBlank(current);
  const leaving =
    previous != null && catalogSlotPreset(previous)?.replacesBlock === true;
  const apply = !options.sameExercise || blankForm;

  if (preset?.replacesBlock && apply) return formFromPreset(preset);

  if (preset && !preset.replacesBlock && apply) {
    return {
      series: leaving ? '' : current.series,
      descanso: leaving ? '' : current.descanso,
      notes: leaving ? '' : current.notes,
      reps: preset.reps ?? '',
    };
  }

  if (leaving && !options.sameExercise) {
    return { series: '', reps: '', descanso: '', notes: '' };
  }

  return current;
}
