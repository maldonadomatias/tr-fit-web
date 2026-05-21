import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireSuperadmin } from '@/components/RequireSuperadmin';
import { setTokens, setUser, clearAuth } from '@/lib/auth-storage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireSuperadmin>
                <div>secret</div>
              </RequireSuperadmin>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/admin" element={<div>admin page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => clearAuth());

describe('RequireSuperadmin', () => {
  it('renders children for superadmin role', async () => {
    setTokens('a', 'b');
    setUser({ id: 'x', email: 'e', role: 'superadmin' });
    renderAt('/protected');
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('redirects admin to /admin', async () => {
    setTokens('a', 'b');
    setUser({ id: 'x', email: 'e', role: 'admin' });
    renderAt('/protected');
    expect(await screen.findByText('admin page')).toBeInTheDocument();
  });

  it('redirects unauthenticated to /login', async () => {
    renderAt('/protected');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
