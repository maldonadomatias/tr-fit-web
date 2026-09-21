import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdsTab } from './AdsTab';
import type { CommunityAd } from '@/hooks/useCommunity';

const mocks = vi.hoisted(() => ({
  ads: [] as CommunityAd[],
  create: vi.fn(),
  archive: vi.fn(),
  metrics: {
    views: 1200,
    clicks: 36,
    reach: 85,
    daily: [] as Array<{ day: string; views: number; clicks: number }>,
  },
}));

vi.mock('@/hooks/useCommunity', () => ({
  useCommunityAds: () => ({ data: mocks.ads, isLoading: false }),
  useCreateAd: () => ({ mutateAsync: mocks.create, isPending: false }),
  useArchiveAd: () => ({ mutateAsync: mocks.archive, isPending: false }),
  useAdMetrics: (id: string | null) => ({
    data: id ? mocks.metrics : undefined,
    isLoading: false,
  }),
}));
vi.mock('@/lib/image', () => ({
  prepareImage: async () => ({
    image: new Blob(['x']),
    thumb: new Blob(['t']),
    width: 10,
    height: 10,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ad: CommunityAd = {
  id: 'ad1',
  brand_name: 'Proteína X',
  body: '',
  image_url: 'https://img',
  cta_label: 'Ver',
  cta_url: 'https://x.example',
  monthly_fee_ars: 50000,
  starts_on: '2026-10-01',
  ends_on: '2026-10-31',
  archived_at: null,
  created_at: '2026-09-01T00:00:00Z',
  status: 'active',
};

beforeEach(() => {
  mocks.ads = [ad];
  mocks.create.mockReset().mockResolvedValue(ad);
  mocks.archive.mockReset().mockResolvedValue(undefined);
});

describe('AdsTab', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    render(<AdsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear publicidad' }));
    expect(await screen.findByText('Ingresá la marca')).toBeInTheDocument();
    expect(screen.getByText('Subí una imagen')).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('submits a valid ad with a numeric fee', async () => {
    render(<AdsTab />);
    fireEvent.change(screen.getByLabelText('Marca'), {
      target: { value: 'Marca' },
    });
    fireEvent.change(screen.getByLabelText('Texto del botón'), {
      target: { value: 'Comprar' },
    });
    fireEvent.change(screen.getByLabelText('Link'), {
      target: { value: 'https://marca.example' },
    });
    fireEvent.change(screen.getByLabelText('Monto mensual (ARS)'), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-12-31' },
    });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Imagen'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear publicidad' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      brand_name: 'Marca',
      monthly_fee_ars: 50000,
      starts_on: '2026-10-01',
    });
  });

  it('lists active ads and copies the WhatsApp report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AdsTab />);
    expect(screen.getByText('Proteína X')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver métricas' }));
    expect(screen.getByText('1.200')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar reporte' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('Proteína X');
  });
});
