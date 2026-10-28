import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Exercise } from '@/types/api';
import { EditSlotPopover } from './EditSlotPopover';
import { hyroxSessionPreset } from './hyrox-session-presets';

const CATALOG: Partial<Exercise>[] = [
  {
    id: 3,
    name: 'Curl Femoral',
    muscle_group: 'Piernas - Femorales',
    is_principal: false,
  },
  {
    id: 174,
    name: 'HYROX Session LVL 1',
    muscle_group: 'Cardio',
    is_principal: false,
  },
  {
    id: 180,
    name: 'Remo en seco',
    muscle_group: 'Cardio',
    is_principal: false,
    default_series: 3,
    default_target: '45 seg',
    default_descanso: '1 min',
    default_notes: 'Ritmo constante.',
  },
];

vi.mock('@/hooks/useAdminExercises', () => ({
  useExercisesSearch: (q: string) => ({
    data: CATALOG.filter(
      (exercise) =>
        !q.trim() || exercise.name!.toLowerCase().includes(q.toLowerCase())
    ),
  }),
}));

describe('EditSlotPopover · sesiones HYROX', () => {
  it('al cambiar el ejercicio a LVL 1 precarga el bloque', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const preset = hyroxSessionPreset('HYROX Session LVL 1')!;
    render(
      <EditSlotPopover
        role="accesorio"
        currentExerciseId={3}
        currentExerciseName="Curl Femoral"
        currentMuscleGroup="Piernas - Femorales"
        currentNotes="nota propia"
        currentSeries={3}
        currentReps="10"
        currentDescanso="1 min"
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Editar slot' }));
    const searchBox = screen.getByDisplayValue('Curl Femoral');
    await user.clear(searchBox);
    await user.click(await screen.findByText('HYROX Session LVL 1'));
    expect(screen.getByPlaceholderText(/cambia variante/i)).toHaveValue(
      preset.notes
    );
    expect(screen.getByDisplayValue('2,1 km')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 174,
        series: 2,
        reps: '2,1 km',
        descanso: '3 min',
        notes: preset.notes,
      })
    );
  });

  it('al cambiar a un ejercicio con prescripción guardada copia ese bloque', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditSlotPopover
        role="accesorio"
        currentExerciseId={3}
        currentExerciseName="Curl Femoral"
        currentMuscleGroup="Piernas - Femorales"
        currentNotes="nota propia"
        currentSeries={3}
        currentReps="10"
        currentDescanso="1 min"
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Editar slot' }));
    const searchBox = screen.getByDisplayValue('Curl Femoral');
    await user.clear(searchBox);
    await user.click(await screen.findByText('Remo en seco'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 180,
        series: 3,
        reps: '45 seg',
        descanso: '1 min',
        notes: 'Ritmo constante.',
      })
    );
  });
});
