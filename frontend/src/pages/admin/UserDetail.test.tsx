import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminUser } from '@/types/api';
import UserDetail from './UserDetail';

const mocks = vi.hoisted(() => ({
  setFee: vi.fn(),
  registerPayment: vi.fn(),
  newAthlete: {
    id: 'new-athlete-id',
    email: 'new-athlete@test.local',
    role: 'athlete',
    status: 'pending',
    email_verified: true,
    email_verified_at: '2026-07-21T00:00:00.000Z',
    created_at: '2026-07-21T00:00:00.000Z',
    name: null,
    phone: '+5493815551234',
    subscription_tier: null,
    subscription_status: null,
    current_period_end: null,
    monthly_fee_ars: null,
    membership_status: null,
    paid_until: null,
    last_session_at: null,
    days_per_week: null,
    days_specific: null,
    injuries: null,
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
  useAdminUser: () => ({
    data: mocks.newAthlete,
    isLoading: false,
    error: null,
  }),
  useDeleteUser: mocks.idleMutation,
  useForceLogout: mocks.idleMutation,
  usePauseMembership: mocks.idleMutation,
  useRegisterPayment: () => ({
    mutate: mocks.registerPayment,
    mutateAsync: mocks.registerPayment,
    isPending: false,
  }),
  useResumeMembership: mocks.idleMutation,
  useUpdateAdminUser: mocks.idleMutation,
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

const weightMocks = vi.hoisted(() => ({
  setWeight: vi.fn(),
  weights: [
    {
      exercise_id: 7,
      exercise_name: 'Press banca',
      current_value: 40,
      unit: 'kg',
    },
  ],
}));

vi.mock('@/hooks/useAthleteWeights', () => ({
  useAthleteWeights: () => ({ data: weightMocks.weights, isLoading: false }),
  useSetAthleteWeight: () => ({
    mutateAsync: weightMocks.setWeight,
    isPending: false,
  }),
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

describe('user detail register payment', () => {
  beforeEach(() => {
    mocks.registerPayment.mockReset();
  });

  it('confirms before booking the payment', async () => {
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(screen.getByRole('tab', { name: 'Suscripción' }));
    await user.click(screen.getByRole('button', { name: /Registrar pago/i }));

    // The click must only open the dialog — booking revenue and granting
    // access is too costly to fire on a stray click.
    expect(mocks.registerPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar pago' }));

    expect(mocks.registerPayment).toHaveBeenCalledTimes(1);
    expect(mocks.registerPayment.mock.calls[0][0]).toMatchObject({
      id: 'new-athlete-id',
    });
  });
});

describe('user detail contact', () => {
  it('shows the athlete phone as a callable link', () => {
    renderUserDetail();

    expect(
      screen.getByRole('link', { name: '+5493815551234' })
    ).toHaveAttribute('href', 'tel:+5493815551234');
  });
});

describe('user detail training card', () => {
  afterEach(() => {
    mocks.newAthlete.days_per_week = null;
    mocks.newAthlete.days_specific = null;
    mocks.newAthlete.injuries = null;
  });

  it('sits between Identidad and Plan actual with days and injuries', () => {
    mocks.newAthlete.days_per_week = 3;
    mocks.newAthlete.days_specific = ['lun', 'mie', 'vie'];
    mocks.newAthlete.injuries = ['lumbar'];
    renderUserDetail();

    const identidad = screen.getByText('Identidad');
    const entrenamiento = screen.getByText('Entrenamiento');
    const plan = screen.getByText('Plan actual');
    expect(identidad.compareDocumentPosition(entrenamiento)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(entrenamiento.compareDocumentPosition(plan)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByText('3 días / semana')).toBeInTheDocument();
    expect(screen.getByText('Lun · Mié · Vie')).toBeInTheDocument();
    expect(screen.getByText('lumbar')).toBeInTheDocument();
  });

  it('says there are no injuries when the list is empty', () => {
    mocks.newAthlete.days_per_week = 4;
    mocks.newAthlete.days_specific = ['lun', 'mar', 'jue', 'sab'];
    mocks.newAthlete.injuries = [];
    renderUserDetail();

    expect(screen.getByText('Sin lesiones declaradas.')).toBeInTheDocument();
  });

  it('hides the card when the user has no athlete profile', () => {
    renderUserDetail();
    expect(screen.queryByText('Entrenamiento')).not.toBeInTheDocument();
  });
});

describe('user detail exercise weights', () => {
  beforeEach(() => {
    weightMocks.setWeight.mockReset();
    weightMocks.setWeight.mockResolvedValue({
      exercise_id: 7,
      exercise_name: 'Press banca',
      current_value: 42.5,
      unit: 'kg',
    });
  });

  it('lets the coach change a working weight', async () => {
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(screen.getByRole('tab', { name: 'RM / Pesos' }));
    expect(screen.getByText('Press banca')).toBeInTheDocument();
    expect(screen.getByText('40 kg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '42.5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(weightMocks.setWeight).toHaveBeenCalledWith({
      exercise_id: 7,
      current_value: 42.5,
    });
  });
});
