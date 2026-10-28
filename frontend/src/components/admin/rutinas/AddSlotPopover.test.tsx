import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Exercise } from '@/types/api';
import { AddSlotPopover } from './AddSlotPopover';
import { hyroxSessionPreset } from './hyrox-session-presets';

// Mock the search hook: return a catalog for the empty-query call (used to
// build the group dropdown) and a subgroup-filtered list when muscle_group is
// passed.
const CATALOG: Partial<Exercise>[] = [
  {
    id: 1,
    name: 'Sentadilla',
    muscle_group: 'Piernas - Cuadriceps',
    is_principal: true,
  },
  {
    id: 2,
    name: 'Extension Cuadriceps',
    muscle_group: 'Piernas - Cuadriceps',
    is_principal: false,
  },
  {
    id: 3,
    name: 'Curl Femoral',
    muscle_group: 'Piernas - Femorales',
    is_principal: false,
  },
  {
    id: 4,
    name: 'Press Banca',
    muscle_group: 'Pecho - Mayor',
    is_principal: true,
  },
  {
    id: 174,
    name: 'HYROX Session LVL 1',
    muscle_group: 'Cardio',
    is_principal: false,
  },
  {
    id: 175,
    name: 'HYROX Session LVL 2',
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

const search = vi.fn(
  (q: string, opts?: { muscle_group?: string; enabled?: boolean }) => {
    const mg = opts?.muscle_group;
    const items = CATALOG.filter((e) => !mg || e.muscle_group === mg).filter(
      (e) => !q.trim() || e.name!.toLowerCase().includes(q.toLowerCase())
    );
    return { data: items };
  }
);

vi.mock('@/hooks/useAdminExercises', () => ({
  useExercisesSearch: (q: string, opts?: Record<string, unknown>) =>
    search(q, opts),
}));

describe('AddSlotPopover · filtro por grupo muscular', () => {
  beforeEach(() => {
    search.mockClear();
  });

  it('ofrece un select de grupo muscular y filtra por el subgrupo exacto', async () => {
    const user = userEvent.setup();
    render(<AddSlotPopover onAdd={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );

    const groupSelect = await screen.findByLabelText('Grupo muscular');
    // El dropdown incluye los subgrupos exactos del catálogo.
    expect(
      within(groupSelect).getByRole('option', {
        name: 'Piernas - Cuadriceps',
      })
    ).toBeInTheDocument();

    await user.selectOptions(groupSelect, 'Piernas - Cuadriceps');

    // La búsqueda de resultados recibió el subgrupo exacto.
    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ muscle_group: 'Piernas - Cuadriceps' })
    );
    // Se ve un cuádriceps y no el femoral.
    expect(screen.getByText('Extension Cuadriceps')).toBeInTheDocument();
    expect(screen.queryByText('Curl Femoral')).not.toBeInTheDocument();
  });
});

describe('AddSlotPopover · rol y periodización semanal', () => {
  beforeEach(() => {
    search.mockClear();
  });

  it('al elegir un ejercicio principal, entra como Principal sin series fijas', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('Press Banca'));

    expect(screen.getByLabelText('Rol en la rutina')).toHaveValue('principal');
    expect(screen.queryByLabelText('Series')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 4,
        exercise_name: 'Press Banca',
        role: 'principal',
        series: null,
        reps: null,
        descanso: null,
      })
    );
  });

  it('al elegir un accesorio, deja series vacías para seguir la semana', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('Curl Femoral'));

    expect(screen.getByLabelText('Rol en la rutina')).toHaveValue('accesorio');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 3,
        role: 'accesorio',
        series: null,
        reps: null,
        descanso: null,
      })
    );
  });
});

describe('AddSlotPopover · sesiones HYROX', () => {
  beforeEach(() => {
    search.mockClear();
  });

  it('precarga LVL 1 al elegirlo y lo manda como accesorio', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('HYROX Session LVL 1'));

    const preset = hyroxSessionPreset('HYROX Session LVL 1')!;
    expect(screen.getByLabelText('Rol en la rutina')).toHaveValue('accesorio');
    expect(screen.getByDisplayValue(String(preset.series))).toBeInTheDocument();
    expect(screen.getByDisplayValue(preset.reps)).toBeInTheDocument();
    expect(screen.getByDisplayValue(preset.descanso)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/cambia variante/i)).toHaveValue(
      preset.notes
    );

    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenCalledWith({
      exercise_id: 174,
      exercise_name: 'HYROX Session LVL 1',
      muscle_group: 'Cardio',
      role: 'accesorio',
      notes: preset.notes,
      series: preset.series,
      reps: preset.reps,
      descanso: preset.descanso,
    });
  });

  it('precarga LVL 2 aunque el coach no toque el formulario', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    const searchBox = screen.getByPlaceholderText('Buscar ejercicio…');
    await user.type(searchBox, 'HYROX Session LVL 2');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    const preset = hyroxSessionPreset('HYROX Session LVL 2')!;
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 175,
        role: 'accesorio',
        series: preset.series,
        reps: preset.reps,
        descanso: preset.descanso,
        notes: preset.notes,
      })
    );
  });

  it('guarda el reps que el coach cambió sobre el preset', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('HYROX Session LVL 1'));
    const reps = screen.getByDisplayValue('2,1 km');
    await user.clear(reps);
    await user.type(reps, '1 km');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 174,
        reps: '1 km',
        series: 2,
        notes: expect.stringContaining('CINTA 400'),
      })
    );
  });

  it('respeta un cambio del coach y no arrastra el bloque a otro ejercicio', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('HYROX Session LVL 1'));
    const reps = screen.getByDisplayValue('2,1 km');
    await user.clear(reps);
    await user.type(reps, '1 km');

    const searchBox = screen.getByPlaceholderText('Buscar ejercicio…');
    await user.clear(searchBox);
    expect(screen.getByDisplayValue('1 km')).toBeInTheDocument();

    await user.click(screen.getByText('Curl Femoral'));
    expect(screen.queryByDisplayValue('1 km')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/CINTA 400/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise_id: 3,
        series: null,
        reps: null,
        descanso: null,
        notes: undefined,
      })
    );
  });

  it('precarga series, tiempo, descanso y comentarios guardados en el ejercicio', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddSlotPopover onAdd={onAdd} />);

    await user.click(
      screen.getByRole('button', { name: /agregar ejercicio/i })
    );
    await user.click(await screen.findByText('Remo en seco'));

    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45 seg')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1 min')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ritmo constante.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(onAdd).toHaveBeenCalledWith({
      exercise_id: 180,
      exercise_name: 'Remo en seco',
      muscle_group: 'Cardio',
      role: 'accesorio',
      notes: 'Ritmo constante.',
      series: 3,
      reps: '45 seg',
      descanso: '1 min',
    });
  });
});
