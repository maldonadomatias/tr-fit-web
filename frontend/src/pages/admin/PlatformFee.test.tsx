import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformFee from './PlatformFee';

const mocks = vi.hoisted(() => ({
  role: 'superadmin' as 'admin' | 'superadmin',
  payment: null as null | {
    period: string;
    total_ars: number;
    paid_at: string;
    recorded_by: string | null;
  },
  history: [] as Array<Record<string, string | number | null>>,
  markPaid: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'su-1', role: mocks.role } }),
}));

vi.mock('@/hooks/usePlatformFee', () => ({
  usePlatformFee: () => ({
    isLoading: false,
    data: {
      summary: {
        base_fee_ars: 52500,
        active_athletes: 13,
        gross_revenue_ars: 329000,
        revenue_share_pct: 0,
        revenue_share_ars: 0,
        total_ars: 52500,
        next_adjustment_date: '2026-10-01',
        adjustment_due: false,
        phase: 'testflight',
      },
      config: {
        base_fee_ars: 105000,
        reference_usd: 1420,
        current_usd: 1500,
        price_per_athlete_ars: 25000,
        revenue_share_pct: 0,
        adjustment_interval_months: 3,
        next_adjustment_date: '2026-10-01',
        phase: 'testflight',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      payment: mocks.payment,
    },
  }),
  usePlatformFeeHistory: () => ({ data: mocks.history }),
  useUpdatePlatformFeeConfig: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useApplyAdjustment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFeeLog: () => ({ data: [] }),
  useMarkPlatformFeePaid: () => ({
    mutateAsync: mocks.markPaid,
    isPending: false,
  }),
}));

describe('platform fee payment status', () => {
  beforeEach(() => {
    mocks.role = 'superadmin';
    mocks.payment = null;
    mocks.history = [];
    mocks.markPaid.mockReset();
  });

  it('shows the recorded payment for the current month', () => {
    mocks.payment = {
      period: '2026-07-01',
      total_ars: 52500,
      paid_at: '2026-07-14T15:30:00.000Z',
      recorded_by: 'su-1',
    };

    render(<PlatformFee />);

    expect(screen.getByText('Pagado este mes')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Marcar como pagado' })
    ).not.toBeInTheDocument();
  });

  it('lets a superadmin mark the current month as paid', () => {
    render(<PlatformFee />);

    expect(screen.getByText('Pago pendiente')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Marcar como pagado' })
    ).toBeInTheDocument();
  });

  it('records the payment after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.markPaid.mockResolvedValue({});
    render(<PlatformFee />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pagado' }));

    await waitFor(() => expect(mocks.markPaid).toHaveBeenCalledOnce());
    confirm.mockRestore();
  });

  it('shows an admin the pending status without the payment action', () => {
    mocks.role = 'admin';

    render(<PlatformFee />);

    expect(screen.getByText('Pago pendiente')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Marcar como pagado' })
    ).not.toBeInTheDocument();
  });

  it('shows the payment status in monthly history', () => {
    mocks.history = [
      {
        period: '2026-06-01',
        base_fee_ars: 52500,
        active_athletes: 12,
        price_per_athlete_ars: 25000,
        gross_revenue_ars: 300000,
        revenue_share_pct: 0,
        revenue_share_ars: 0,
        total_ars: 52500,
        usd_at_snapshot: 1420,
        created_at: '2026-07-01T00:00:00.000Z',
        paid_total_ars: 52500,
        paid_at: '2026-06-14T15:30:00.000Z',
      },
    ];

    render(<PlatformFee />);

    expect(screen.getByText('Pagado')).toBeInTheDocument();
  });
});
