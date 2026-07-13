import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { AlertsTable } from './AlertsTable';
import type { CoachAlert } from '@/types/api';

it('links a pain alert directly to the athlete active routine', () => {
  const alert = {
    id: 'a1',
    athlete_id: 'athlete-1',
    athlete_name: 'Ana',
    type: 'sos_pain',
    severity: 'red',
    payload: { zone: 'rodilla', intensity: 7 },
    exercise_name: 'Sentadilla',
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolution_action: null,
  } as CoachAlert;
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AlertsTable alerts={[alert]} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByRole('link', { name: /ir a la rutina/i })).toHaveAttribute(
    'href',
    '/admin/rutinas/atleta/athlete-1'
  );
});
