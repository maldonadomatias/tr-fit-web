import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { server } from '@/test/setup';
import Rutinas from './Rutinas';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
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
  slots: [],
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

describe('Cola pendiente · skip con una sola rutina', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('mantiene el botón Skip habilitado', async () => {
    renderRutinas();
    const skip = await screen.findByRole('button', { name: /skip/i });
    expect(skip).toBeEnabled();
  });

  it('al clickear Skip avisa que no hay otra rutina y no navega', async () => {
    const user = userEvent.setup();
    renderRutinas();
    const skip = await screen.findByRole('button', { name: /skip/i });

    await user.click(skip);

    expect(toast.info).toHaveBeenCalledWith('No hay otra rutina en la cola');
    // Sigue mostrando la única rutina, no la pantalla "Todo al día".
    expect(screen.getByRole('heading', { name: 'Atleta Test' })).toBeVisible();
  });

  it('la tecla J avisa que no hay otra rutina', async () => {
    const user = userEvent.setup();
    renderRutinas();
    await screen.findByRole('button', { name: /skip/i });

    await user.keyboard('j');

    expect(toast.info).toHaveBeenCalledWith('No hay otra rutina en la cola');
  });
});
