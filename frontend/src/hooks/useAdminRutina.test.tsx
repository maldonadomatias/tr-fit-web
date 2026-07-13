import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '@/lib/api';
import type { ActiveRutinaResponse } from '@/types/api';
import { useActiveAthletes, useCreateSlot } from './useAdminRutina';

function testContext() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useActiveAthletes', () => {
  it('requests the complete supported page of active athletes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });
    const { wrapper } = testContext();

    const { result } = renderHook(() => useActiveAthletes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/admin/rutinas/atleta', {
      params: { limit: 200 },
    });
  });
});

describe('useCreateSlot', () => {
  it('shows the new exercise optimistically while the request is pending', async () => {
    let resolveRequest!: (value: { data: { slot: unknown } }) => void;
    vi.mocked(api.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const { queryClient, wrapper } = testContext();
    const detailKey = ['admin', 'rutinas', 'detail', 'athlete-1'] as const;
    const initial: ActiveRutinaResponse = {
      rutina: {
        skeleton: {
          id: 'skeleton-1',
          athlete_id: 'athlete-1',
          status: 'approved',
          created_at: '2026-07-13T12:00:00Z',
          reviewed_at: '2026-07-13T12:00:00Z',
        },
        slots: [],
        days: [{ day_of_week: 1, focus: null }],
        profile: {
          user_id: 'athlete-1',
          name: 'Atleta Uno',
          days_per_week: 1,
          days_specific: ['lunes'],
        },
        has_active_session: false,
      },
      pending_skeleton_id: null,
    };
    queryClient.setQueryData(detailKey, initial);
    const { result } = renderHook(() => useCreateSlot('athlete-1'), {
      wrapper,
    });

    act(() => {
      result.current.mutate({
        day_of_week: 1,
        slot_index: 1,
        exercise_id: 42,
        exercise_name: 'Sentadilla goblet',
        muscle_group: 'Piernas',
        role: 'accesorio',
        notes: null,
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<ActiveRutinaResponse>(detailKey);
      expect(cached?.rutina?.slots).toEqual([
        expect.objectContaining({
          exercise_id: 42,
          exercise_name: 'Sentadilla goblet',
          muscle_group: 'Piernas',
        }),
      ]);
    });

    resolveRequest({ data: { slot: {} } });
  });
});
