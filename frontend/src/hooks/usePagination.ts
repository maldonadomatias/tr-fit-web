import { useEffect, useState } from 'react';

export interface PaginationState<T> {
  pageItems: T[];
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalPages: number;
  from: number;
  to: number;
  total: number;
}

/**
 * Pagina en cliente una lista ya filtrada y ordenada.
 *
 * `filterKey` es la firma de los filtros activos: cuando cambia, vuelve a la
 * página 1. Depende de esa clave y no de la identidad de `items` a propósito —
 * un refetch de react-query devuelve un array nuevo con los mismos datos y no
 * tiene que mover al usuario de página.
 */
export function usePagination<T>(
  items: T[],
  { pageSize: initialPageSize = 25, filterKey = '' } = {}
): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [filterKey, pageSize]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp derivado, no un efecto: si la lista se achica el render actual ya
  // devuelve una página válida, sin un frame intermedio en blanco.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    pageItems,
    page: safePage,
    setPage: (n) => setPage(Math.min(Math.max(1, n), totalPages)),
    pageSize,
    setPageSize,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + pageItems.length,
    total,
  };
}
