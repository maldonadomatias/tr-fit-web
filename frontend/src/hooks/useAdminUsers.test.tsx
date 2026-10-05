import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));

import { api } from '@/lib/api';
import {
  useForceLogout,
  usePauseMembership,
  useRegisterVacation,
  useResumeMembership,
} from './useAdminUsers';

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

describe('usePauseMembership / useResumeMembership', () => {
  it('POSTs to /admin/users/:id/membership/pause', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { membership: { status: 'paused' } },
    });
    const { result } = renderHook(() => usePauseMembership('u1'), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/admin/users/u1/membership/pause');
  });

  it('POSTs to /admin/users/:id/membership/resume', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { membership: { status: 'active' } },
    });
    const { result } = renderHook(() => useResumeMembership('u1'), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/admin/users/u1/membership/resume');
  });
});

describe('useRegisterVacation', () => {
  it('POSTs the maintenance charge and the chosen date', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { membership: { status: 'vacation' } } });
    const { result } = renderHook(() => useRegisterVacation(), { wrapper });
    result.current.mutate({
      id: 'u1',
      amount: 10000,
      paid_until: '2026-11-15',
      record_payment: true,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith(
      '/admin/users/u1/membership/vacation',
      expect.objectContaining({
        amount: 10000,
        paid_until: '2026-11-15',
        record_payment: true,
        method: 'transfer',
      }),
    );
  });
});
