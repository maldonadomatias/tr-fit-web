import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TooltipProvider } from '@/components/ui/tooltip';
import { server } from '@/test/setup';
import Rutinas from './Rutinas';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const pending = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    athlete_id: 'athlete-1',
    athlete_name: 'Atleta Test',
    created_at: '2026-07-01T00:00:00Z',
    generation_rationale: null,
  },
];

const detail = {
  skeleton: {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    athlete_id: 'athlete-1',
    status: 'pending_review',
    generated_by: 'ai',
    generation_rationale: 'base',
    rejection_feedback: null,
    created_at: '2026-07-01T00:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
  },
  slots: [
    {
      id: 'slot-1',
      day_of_week: 1,
      slot_index: 1,
      exercise_id: 1,
      role: 'principal',
      notes: null,
      series: null,
      reps: null,
      descanso: null,
      exercise_name: 'Sentadilla',
      muscle_group: 'piernas',
    },
  ],
  periodization: null,
  profile: {
    name: 'Atleta Test',
    gender: 'male',
    age: 30,
    height_cm: 175,
    weight_kg: 80,
    level: 'medio',
    goal: 'hipertrofia',
    days_per_week: 4,
    days_specific: ['lun', 'mar', 'jue', 'sab'],
    equipment: 'gym_completo',
    injuries: [],
    exercise_minutes: 90,
  },
};

function renderRutinas() {
  server.use(
    http.get('http://localhost:5001/api/admin/rutinas/pending', () =>
      HttpResponse.json(pending)
    ),
    http.get('http://localhost:5001/api/admin/rutinas/pending/stuck', () =>
      HttpResponse.json([
        {
          athlete_id: 'athlete-sofia',
          athlete_name: 'Alvarez Sofia',
          status: 'failed',
          last_error: 'skeleton adjustment invalid',
          since: '2026-11-05T16:00:00Z',
        },
      ])
    ),
    http.get(
      'http://localhost:5001/api/admin/rutinas/aaaaaaaa-1111-4111-8111-111111111111',
      () => HttpResponse.json(detail)
    )
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/admin/rutinas']}>
          <Routes>
            <Route path="/admin/rutinas" element={<Rutinas />} />
            <Route path="/admin/rutinas/:id" element={<Rutinas />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('creación de rutinas · scroll', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the review grid inside the panel when a generation failed', async () => {
    renderRutinas();
    const banner = await screen.findByText(/Alvarez Sofia/);
    const shell = banner.closest('div')?.parentElement;
    expect(shell).toHaveClass('flex');
    expect(shell).toHaveClass('flex-col');
    expect(shell).toHaveClass('min-h-0');
    expect(shell).toHaveClass('h-full');
    const grid = shell?.querySelector(':scope > .grid');
    expect(grid).toHaveClass('min-h-0');
    expect(grid).toHaveClass('flex-1');
    expect(grid?.className ?? '').not.toMatch(/(?:^|\s)h-full(?:\s|$)/);
  });

  it('lets the routine detail scroll without pushing the actions off screen', async () => {
    renderRutinas();
    const approve = await screen.findByRole('button', { name: /aprobar/i });
    const footer = approve.closest('footer');
    const scroll = footer?.previousElementSibling;
    const pane = footer?.parentElement;
    expect(scroll).toHaveClass('min-h-0');
    expect(scroll).toHaveClass('overflow-y-auto');
    expect(pane).toHaveClass('min-h-0');
    expect(pane).toHaveClass('overflow-hidden');
  });
});
