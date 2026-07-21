import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminUser } from '@/types/api';
import UserDetail from './UserDetail';

const mocks = vi.hoisted(() => ({
  setFee: vi.fn(),
  newAthlete: {
    id: 'new-athlete-id',
    email: 'new-athlete@test.local',
    role: 'athlete',
    status: 'pending',
    email_verified: true,
    email_verified_at: '2026-07-21T00:00:00.000Z',
    created_at: '2026-07-21T00:00:00.000Z',
    name: null,
    phone: null,
    subscription_tier: null,
    subscription_status: null,
    current_period_end: null,
    monthly_fee_ars: null,
    membership_status: null,
    paid_until: null,
  } as AdminUser,
  idleMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin-id', role: 'admin' } }),
}));

vi.mock('@/hooks/useAdminUsers', () => ({
  useAdminUser: () => ({ data: mocks.newAthlete, isLoading: false, error: null }),
  useCancelSubscription: mocks.idleMutation,
  useDeleteUser: mocks.idleMutation,
  useForceLogout: mocks.idleMutation,
  usePauseMembership: mocks.idleMutation,
  useResumeMembership: mocks.idleMutation,
  useUpdateAdminUser: mocks.idleMutation,
  useUpsertSubscription: mocks.idleMutation,
}));

vi.mock('@/hooks/useActivityLog', () => ({
  useActivityLog: () => ({ data: [] }),
}));

vi.mock('@/hooks/useLoggedSessions', () => ({
  useLoggedSessions: () => ({ data: [] }),
}));

vi.mock('@/hooks/useAthleteRms', () => ({
  useAthleteRms: () => ({ data: [] }),
  useSetAthleteRm: mocks.idleMutation,
}));

vi.mock('@/hooks/useSetMonthlyFee', () => ({
  useSetMonthlyFee: () => ({
    mutateAsync: mocks.setFee,
    isPending: false,
  }),
}));

function renderUserDetail() {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/admin/users/new-athlete-id']}>
        <Routes>
          <Route path="/admin/users/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );
}

describe('user detail monthly fee', () => {
  beforeEach(() => {
    mocks.setFee.mockReset();
    mocks.setFee.mockResolvedValue(0);
  });

  it('accepts zero and does not impose an HTML maximum', async () => {
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(screen.getByRole('tab', { name: 'Suscripción' }));

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '0');
    expect(input).not.toHaveAttribute('max');

    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mocks.setFee).toHaveBeenCalledWith(0);
  });
});
