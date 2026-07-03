import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));

import { api } from '@/lib/api';
import { useForceLogout } from './useAdminUsers';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useForceLogout', () => {
  it('POSTs to /admin/users/:id/force-logout', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useForceLogout('u1'), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/admin/users/u1/force-logout');
  });

  it('surfaces errors from the API', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useForceLogout('u1'), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
