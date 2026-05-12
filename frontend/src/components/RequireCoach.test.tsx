import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireCoach } from '@/components/RequireCoach';
import { setTokens, setUser, clearAuth } from '@/lib/auth-storage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireCoach>
                <div>secret</div>
              </RequireCoach>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => clearAuth());

describe('RequireCoach', () => {
  it('redirects to /login when no user', async () => {
    renderAt('/protected');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('redirects to /login when role !== coach', async () => {
    setTokens('a', 'b');
    setUser({ id: 'x', email: 'e', role: 'athlete' });
    renderAt('/protected');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('renders children for coach role', async () => {
    setTokens('a', 'b');
    setUser({ id: 'x', email: 'e', role: 'coach' });
    renderAt('/protected');
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });
});
