import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

const base = {
  page: 2,
  totalPages: 3,
  from: 26,
  to: 50,
  total: 56,
  pageSize: 25,
  onPage: () => {},
  onPageSize: () => {},
  noun: 'usuarios',
};

describe('Pagination', () => {
  it('no renderiza nada si todo entra en una página', () => {
    const { container } = render(
      <Pagination {...base} page={1} totalPages={1} from={1} to={10} total={10} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el rango visible y el total', () => {
    const { container } = render(<Pagination {...base} />);
    // El texto está partido en varios nodos, así que se compara el textContent
    // normalizado en vez de usar getByText.
    const text = container.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Mostrando 26–50 de 56 usuarios');
    expect(text).toContain('Página 2 de 3');
  });

  it('deshabilita Anterior en la primera página', () => {
    render(<Pagination {...base} page={1} from={1} to={25} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('deshabilita Siguiente en la última página', () => {
    render(<Pagination {...base} page={3} from={51} to={56} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('avanza y retrocede de a una página', async () => {
    const onPage = vi.fn();
    render(<Pagination {...base} onPage={onPage} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPage).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('informa el nuevo tamaño de página como número', async () => {
    const onPageSize = vi.fn();
    render(<Pagination {...base} onPageSize={onPageSize} />);
    await userEvent.selectOptions(
      screen.getByLabelText('Filas por página'),
      '50'
    );
    expect(onPageSize).toHaveBeenCalledWith(50);
  });
});
