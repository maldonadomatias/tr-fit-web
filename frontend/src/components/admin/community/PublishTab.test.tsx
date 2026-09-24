import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishTab } from './PublishTab';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@/hooks/useCommunity', () => ({
  useCreateCommunityPost: () => ({
    mutateAsync: mocks.create,
    isPending: false,
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

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({});
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
});

describe('PublishTab', () => {
  it('drops a wrongly selected photo before publishing', async () => {
    render(<PublishTab />);
    const file = new File(['x'], 'mal.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Foto (opcional)'), {
      target: { files: [file] },
    });
    expect(
      screen.getByRole('button', { name: 'Eliminar imagen' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar imagen' }));
    expect(
      screen.queryByRole('button', { name: 'Eliminar imagen' })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Aviso sin foto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0].image).toBeNull();
  });
});
