import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

const items = Array.from({ length: 56 }, (_, i) => i + 1);

describe('usePagination', () => {
  it('corta la primera página y reporta from/to/total', () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    expect(result.current.pageItems).toHaveLength(25);
    expect(result.current.pageItems[0]).toBe(1);
    expect(result.current.from).toBe(1);
    expect(result.current.to).toBe(25);
    expect(result.current.total).toBe(56);
    expect(result.current.totalPages).toBe(3);
  });

  it('la última página devuelve solo el resto', () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual([51, 52, 53, 54, 55, 56]);
    expect(result.current.from).toBe(51);
    expect(result.current.to).toBe(56);
  });

  it('cambiar filterKey vuelve a la página 1', () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePagination(items, { pageSize: 25, filterKey: key }),
      { initialProps: { key: 'all' } }
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ key: 'pending' });
    expect(result.current.page).toBe(1);
  });

  it('un refetch con array nuevo pero mismos filtros no cambia de página', () => {
    const { result, rerender } = renderHook(
      ({ data }) => usePagination(data, { pageSize: 25, filterKey: 'all' }),
      { initialProps: { data: items } }
    );
    act(() => result.current.setPage(3));
    rerender({ data: [...items] });
    expect(result.current.page).toBe(3);
  });

  it('clampea la página cuando la lista se achica', () => {
    const { result, rerender } = renderHook(
      ({ data }) => usePagination(data, { pageSize: 25, filterKey: 'all' }),
      { initialProps: { data: items } }
    );
    act(() => result.current.setPage(3));
    rerender({ data: items.slice(0, 10) });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it('lista vacía: una página, sin items, contadores en cero', () => {
    const { result } = renderHook(() =>
      usePagination([] as number[], { pageSize: 25 })
    );
    expect(result.current.pageItems).toEqual([]);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.from).toBe(0);
    expect(result.current.to).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('cambiar el tamaño de página vuelve a la página 1', () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(50);
    expect(result.current.totalPages).toBe(2);
  });

  it('setPage ignora valores fuera de rango', () => {
    const { result } = renderHook(() => usePagination(items, { pageSize: 25 }));
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(0));
    expect(result.current.page).toBe(1);
  });
});
