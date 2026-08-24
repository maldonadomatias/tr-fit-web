import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/types/api';
import Users from './Users';

const base: AdminUser = {
  id: 'a1',
  email: 'ana@test.local',
  role: 'athlete',
  status: 'approved',
  email_verified: true,
  email_verified_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  name: 'Ana Atleta',
  phone: null,
  subscription_tier: null,
  subscription_status: null,
  current_period_end: null,
  monthly_fee_ars: 28000,
  membership_status: 'active',
  paid_until: '2026-12-31T00:00:00.000Z',
  last_session_at: null,
  days_per_week: null,
  days_specific: null,
  injuries: null,
  profile: null,
} as AdminUser;

const vencida: AdminUser = {
  ...base,
  id: 'a2',
  email: 'bruno@test.local',
  name: 'Bruno Vencido',
  membership_status: 'expired',
  monthly_fee_ars: 26000,
  paid_until: '2026-01-05T00:00:00.000Z',
};

const staff: AdminUser = {
  ...base,
  id: 'a3',
  email: 'coach@test.local',
  name: 'Coach Staff',
  role: 'admin',
  membership_status: null,
  monthly_fee_ars: null,
  paid_until: null,
};

const mocks = vi.hoisted(() => ({ users: [] as AdminUser[] }));

vi.mock('@/hooks/useAdminUsers', () => ({
  useAdminUsers: () => ({ data: mocks.users, isLoading: false }),
  useRegisterPayment: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderUsers(users: AdminUser[]) {
  mocks.users = users;
  return render(
    <MemoryRouter>
      <Users />
    </MemoryRouter>
  );
}

const rowOf = (name: string) =>
  screen.getByText(name).closest('tr') as HTMLElement;

describe('Usuarios — columnas de membresía', () => {
  it('shows fee, expiry and month status for an athlete who is up to date', () => {
    renderUsers([base]);
    const row = within(rowOf('Ana Atleta'));
    expect(row.getByText('Activa')).toBeTruthy();
    expect(row.getByText('Pagado')).toBeTruthy();
    expect(row.getByText(/28\.000/)).toBeTruthy();
    expect(row.getByRole('button', { name: /Registrar pago/ })).toBeTruthy();
  });

  it('flags a lapsed athlete as expired and unpaid', () => {
    renderUsers([vencida]);
    const row = within(rowOf('Bruno Vencido'));
    expect(row.getByText('VENCIÓ')).toBeTruthy();
    expect(row.getByText('No pagado')).toBeTruthy();
  });

  it('replaces the membership columns for staff accounts', () => {
    renderUsers([staff]);
    const row = within(rowOf('Coach Staff'));
    expect(row.getByText(/sin membresía/i)).toBeTruthy();
    expect(row.queryByRole('button', { name: /Registrar pago/ })).toBeNull();
  });
});
