import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/types/api';
import Users, { DEFAULT_SORT, sortUsers } from './Users';

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

const rechazada: AdminUser = {
  ...base,
  id: 'a4',
  email: 'carla@test.local',
  name: 'Carla Rechazada',
  status: 'rejected',
  membership_status: 'cancelled',
  monthly_fee_ars: 21000,
  paid_until: '2026-01-01T00:00:00.000Z',
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

describe('sortUsers', () => {
  const nombres = (us: AdminUser[]) => us.map((u) => u.name);

  it('sorts by name ignoring case and accents', () => {
    const a = { ...base, id: 'x', name: 'ánabel' } as AdminUser;
    const b = { ...base, id: 'y', name: 'Bruno' } as AdminUser;
    const c = { ...base, id: 'z', name: 'Ana' } as AdminUser;
    expect(
      nombres(sortUsers([b, a, c], { key: 'usuario', dir: 'asc' }))
    ).toEqual(['Ana', 'ánabel', 'Bruno']);
    expect(
      nombres(sortUsers([b, a, c], { key: 'usuario', dir: 'desc' }))
    ).toEqual(['Bruno', 'ánabel', 'Ana']);
  });

  it('sorts by fee low to high, then high to low', () => {
    const caro = { ...base, id: 'c', name: 'Caro', monthly_fee_ars: 30000 };
    const barato = { ...base, id: 'b', name: 'Barato', monthly_fee_ars: 21000 };
    expect(
      nombres(sortUsers([caro, barato], { key: 'cuota', dir: 'asc' }))
    ).toEqual(['Barato', 'Caro']);
    expect(
      nombres(sortUsers([barato, caro], { key: 'cuota', dir: 'desc' }))
    ).toEqual(['Caro', 'Barato']);
  });

  it('puts the most urgent expiry first, and lapsed before upcoming', () => {
    const lejos = { ...base, id: 'l', name: 'Lejos' };
    expect(
      nombres(sortUsers([lejos, vencida], { key: 'vence', dir: 'asc' }))
    ).toEqual(['Bruno Vencido', 'Lejos']);
  });

  it('keeps staff at the bottom of athlete-only columns in both directions', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const out = sortUsers([staff, base, vencida], { key: 'cuota', dir });
      expect(out[out.length - 1].name).toBe('Coach Staff');
    }
  });

  it('breaks ties by name so the order never jumps around', () => {
    const z = { ...base, id: 'z', name: 'Zulema' };
    const a = { ...base, id: 'a', name: 'Abril' };
    expect(nombres(sortUsers([z, a], { key: 'estado', dir: 'asc' }))).toEqual([
      'Abril',
      'Zulema',
    ]);
  });
});

describe('sortUsers — rechazados', () => {
  it('sinks rejected accounts in every column and direction', () => {
    for (const key of ['usuario', 'estado', 'vence', 'cuota'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const out = sortUsers([rechazada, vencida, base], { key, dir });
        expect(out[out.length - 1].name).toBe('Carla Rechazada');
      }
    }
  });

  it('still sorts them among themselves when they are all there is', () => {
    const otra = { ...rechazada, id: 'a5', name: 'Aaron Rechazado' };
    const out = sortUsers([rechazada, otra], { key: 'usuario', dir: 'asc' });
    expect(out.map((u) => u.name)).toEqual([
      'Aaron Rechazado',
      'Carla Rechazada',
    ]);
  });
});

describe('Usuarios — orden por defecto y clicks', () => {
  it('lands sorted by soonest expiry, like the old Suscripciones page', () => {
    const lejos = { ...base, id: 'l', name: 'Lejos' };
    renderUsers([lejos, vencida]);
    expect(screen.getAllByRole('row')[1].textContent).toContain(
      'Bruno Vencido'
    );
    expect(DEFAULT_SORT).toEqual({ key: 'vence', dir: 'asc' });
  });

  it('flips direction when the active column is clicked again', async () => {
    const user = userEvent.setup();
    const caro = { ...base, id: 'c', name: 'Caro', monthly_fee_ars: 30000 };
    const barato = { ...base, id: 'b', name: 'Barato', monthly_fee_ars: 21000 };
    renderUsers([caro, barato]);

    const header = () => screen.getByRole('button', { name: /Cuota/ });
    const firstRow = () => screen.getAllByRole('row')[1].textContent ?? '';

    await user.click(header());
    expect(firstRow()).toContain('Barato');
    await user.click(header());
    expect(firstRow()).toContain('Caro');
    await user.click(header());
    expect(firstRow()).toContain('Barato');
  });
});
