import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
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
    phone: '+5493815551234',
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
  resendMutate: vi.fn(),
  resetMutate: vi.fn(),
  resendResult: { ok: true, emailSendFailed: false } as {
    ok: true;
    emailSendFailed: boolean;
    alreadyVerified?: boolean;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
  useCancelSubscription: mocks.idleMutation,
  useDeleteUser: mocks.idleMutation,
  useForceLogout: mocks.idleMutation,
  usePauseMembership: mocks.idleMutation,
  useResendVerification: () => ({
    mutate: mocks.resendMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useResumeMembership: mocks.idleMutation,
  useSendPasswordReset: () => ({
    mutate: mocks.resetMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  }),
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

type MutateOpts = {
  onSuccess?: (r: unknown) => void;
  onError?: (e: Error) => void;
};

describe('user detail soporte panel', () => {
  beforeEach(() => {
    mocks.newAthlete.email_verified = true;
    mocks.resendResult = { ok: true, emailSendFailed: false };
    mocks.resetMutate.mockReset();
    mocks.resetMutate.mockImplementation((_v: unknown, o?: MutateOpts) =>
      o?.onSuccess?.(undefined)
    );
    mocks.resendMutate.mockReset();
    mocks.resendMutate.mockImplementation((_v: unknown, o?: MutateOpts) =>
      o?.onSuccess?.(mocks.resendResult)
    );
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.info).mockReset();
  });

  it('sends the reset code to the athlete email', async () => {
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Enviar código de reseteo' })
    );

    expect(mocks.resetMutate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      'Código de reseteo enviado a new-athlete@test.local'
    );
  });

  it('reports a failed reset send instead of claiming success', async () => {
    mocks.resetMutate.mockImplementation((_v: unknown, o?: MutateOpts) =>
      o?.onError?.(new Error('429'))
    );
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Enviar código de reseteo' })
    );

    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo enviar el código: 429'
    );
  });

  it('disables the verification resend once the email is verified', () => {
    renderUserDetail();

    expect(
      screen.getByRole('button', { name: 'Email ya verificado' })
    ).toBeDisabled();
  });

  it('resends the verification email for an unverified account', async () => {
    mocks.newAthlete.email_verified = false;
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Reenviar email de verificación' })
    );

    expect(mocks.resendMutate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      'Email de verificación enviado a new-athlete@test.local'
    );
  });

  it('says nothing was sent when the account was already verified', async () => {
    mocks.newAthlete.email_verified = false;
    mocks.resendResult = {
      ok: true,
      emailSendFailed: false,
      alreadyVerified: true,
    };
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Reenviar email de verificación' })
    );

    expect(toast.info).toHaveBeenCalledWith('El email ya estaba verificado');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('surfaces a failed verification email send', async () => {
    mocks.newAthlete.email_verified = false;
    mocks.resendResult = { ok: true, emailSendFailed: true };
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Reenviar email de verificación' })
    );

    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo enviar el email de verificación'
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('surfaces a failed verification request', async () => {
    mocks.newAthlete.email_verified = false;
    mocks.resendMutate.mockImplementation((_v: unknown, o?: MutateOpts) =>
      o?.onError?.(new Error('boom'))
    );
    const user = userEvent.setup();
    renderUserDetail();

    await user.click(
      screen.getByRole('button', { name: 'Reenviar email de verificación' })
    );

    expect(toast.error).toHaveBeenCalledWith('No se pudo reenviar: boom');
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
