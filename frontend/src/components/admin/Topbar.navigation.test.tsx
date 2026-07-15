import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TooltipProvider } from '@/components/ui/tooltip';
import { server } from '@/test/setup';
import { Topbar } from './Topbar';

function renderTopbar() {
  window.localStorage.setItem('forma-theme', 'light');
  server.use(
    http.get('http://localhost:5001/api/admin/users', () =>
      HttpResponse.json([])
    )
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<Topbar />} />
            <Route path="/admin/alerts" element={<p>Vista de alertas</p>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('Topbar navigation', () => {
  it('opens alerts from the notification bell', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByLabelText('Notificaciones'));

    expect(await screen.findByText('Vista de alertas')).toBeInTheDocument();
  });

  it('toggles the theme without navigating to alerts', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByLabelText('Modo oscuro'));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(screen.queryByText('Vista de alertas')).not.toBeInTheDocument();
  });
});
