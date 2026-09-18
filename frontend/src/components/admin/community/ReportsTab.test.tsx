import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsTab } from './ReportsTab';
import type { CommunityReport } from '@/hooks/useCommunity';

const mocks = vi.hoisted(() => ({
  reports: [] as CommunityReport[],
  resolve: vi.fn(),
}));

vi.mock('@/hooks/useCommunity', () => ({
  useCommunityReports: () => ({ data: mocks.reports, isLoading: false }),
  useResolveReport: () => ({ mutateAsync: mocks.resolve, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const report = (over: Partial<CommunityReport>): CommunityReport => ({
  id: 'r1',
  target_type: 'post',
  target_id: 'p1',
  reason: 'offensive',
  note: null,
  status: 'open',
  created_at: '2026-09-18T00:00:00Z',
  age_hours: 2,
  reporter: { id: 'u1', name: 'Ana' },
  content: {
    body: 'contenido feo',
    author_id: 'u2',
    author_name: 'Beto',
    hidden: false,
    media: [],
    post_id: 'p1',
  },
  ...over,
});

beforeEach(() => {
  mocks.resolve.mockReset();
  mocks.resolve.mockResolvedValue(undefined);
  mocks.reports = [report({})];
});

describe('ReportsTab', () => {
  it('shows the reported content and author', () => {
    render(<ReportsTab />);
    expect(screen.getByText('contenido feo')).toBeInTheDocument();
    expect(screen.getByText(/Beto/)).toBeInTheDocument();
    expect(screen.getByText('Ofensivo')).toBeInTheDocument();
  });

  it('age is red only after 20 h', () => {
    mocks.reports = [
      report({ id: 'a', age_hours: 19 }),
      report({ id: 'b', age_hours: 21 }),
    ];
    render(<ReportsTab />);
    const ages = screen.getAllByTestId('report-age');
    expect(ages[0].className).not.toMatch(/text-red/);
    expect(ages[1].className).toMatch(/text-red/);
  });

  it('hide and dismiss call resolve with the action', async () => {
    render(<ReportsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: 'r1', action: 'hide' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: 'r1', action: 'dismiss' });
  });

  it('mute sends the chosen number of days', () => {
    render(<ReportsTab />);
    fireEvent.change(screen.getByLabelText('Días de silencio'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Silenciar/ }));
    expect(mocks.resolve).toHaveBeenCalledWith({
      id: 'r1',
      action: 'mute',
      mute_days: 7,
    });
  });

  it('empty state', () => {
    mocks.reports = [];
    render(<ReportsTab />);
    expect(
      screen.getByText('No hay denuncias pendientes.')
    ).toBeInTheDocument();
  });
});
