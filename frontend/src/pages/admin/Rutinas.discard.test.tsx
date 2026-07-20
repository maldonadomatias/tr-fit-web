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

const RUTINA_ID = 'bbbbbbbb-1111-4111-8111-111111111111';

const pendingItem = {
  id: RUTINA_ID,
  athlete_id: 'athlete-1',
  athlete_name: 'Atleta Test',
  created_at: '2026-07-01T00:00:00Z',
  generation_rationale: null,
};

const detail = {
  skeleton: {
    id: RUTINA_ID,
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
    gender: 'female',
    age: 28,
    height_cm: 165,
    weight_kg: 60,
    level: 'medio',
    goal: 'hipertrofia',
    days_per_week: 3,
    days_specific: ['lun', 'mie', 'vie'],
    equipment: 'gym_completo',
    injuries: [],
    exercise_minutes: 60,
  },
};

function renderRutinas() {
  let discarded = false;
  const discardCalls: string[] = [];
  server.use(
    http.get('http://localhost:5001/api/admin/rutinas/pending', () =>
      HttpResponse.json(discarded ? [] : [pendingItem])
    ),
    http.get(`http://localhost:5001/api/admin/rutinas/${RUTINA_ID}`, () =>
      HttpResponse.json(detail)
    ),
    http.post(
      `http://localhost:5001/api/admin/rutinas/${RUTINA_ID}/discard`,
      () => {
        discarded = true;
        discardCalls.push(RUTINA_ID);
        return new HttpResponse(null, { status: 204 });
      }
    )
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
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
  return { discardCalls };
}

describe('Cola pendiente · descartar rutina', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('descarta tras confirmar y saca la rutina de la cola', async () => {
    const user = userEvent.setup();
    const { discardCalls } = renderRutinas();

    await user.click(await screen.findByRole('button', { name: /descartar/i }));
    // Diálogo de confirmación: avisa que no se regenera otra.
    expect(
      await screen.findByText(/no se genera otra rutina/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sí, descartar/i }));

    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(discardCalls).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('Rutina descartada');
  });

  it('cancelar no llama al endpoint', async () => {
    const user = userEvent.setup();
    const { discardCalls } = renderRutinas();

    await user.click(await screen.findByRole('button', { name: /descartar/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(discardCalls).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Atleta Test' })).toBeVisible();
  });
});
