import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Exercise } from '@/types/api';
import { AddSlotPopover } from './AddSlotPopover';

// Mock the search hook: return a catalog for the empty-query call (used to
// build the group dropdown) and a subgroup-filtered list when muscle_group is
// passed.
const CATALOG: Partial<Exercise>[] = [
  { id: 1, name: 'Sentadilla', muscle_group: 'Piernas - Cuadriceps' },
  { id: 2, name: 'Extension Cuadriceps', muscle_group: 'Piernas - Cuadriceps' },
  { id: 3, name: 'Curl Femoral', muscle_group: 'Piernas - Femorales' },
  { id: 4, name: 'Press Banca', muscle_group: 'Pecho - Mayor' },
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
