import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAdminRutina', () => ({
  useActiveAthletes: () => ({
    isLoading: false,
    data: {
      total: 75,
      items: Array.from({ length: 75 }, (_, index) => ({
        athlete_id: `athlete-${index + 1}`,
        name: `Atleta ${index + 1}`,
        skeleton_id: `skeleton-${index + 1}`,
        reviewed_at: null,
        days_per_week: 3,
      })),
    },
  }),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

import { ListPaneActivas } from './ListPaneActivas';

describe('ListPaneActivas', () => {
  it('exposes one scrollable region containing the complete athlete list', () => {
    render(<ListPaneActivas activeId={undefined} onSelect={vi.fn()} />);

    const list = screen.getByRole('region', {
      name: 'Atletas con rutina activa',
    });
    expect(list).toHaveClass('overflow-y-auto');
    expect(screen.getByText('Atleta 75')).toBeInTheDocument();
  });
});
