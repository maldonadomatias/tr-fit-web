# Paginación en tablas de admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginar en cliente las tablas de `/admin/users` y `/admin/subscriptions`, cortando siempre después de filtrar y ordenar.

**Architecture:** Un hook `usePagination` hace el `slice` sobre la lista ya filtrada y ordenada que cada página arma con `useMemo`. Un componente `Pagination` renderiza la barra de controles. Las dos páginas pasan de renderizar `filtered` a renderizar `pageItems`. Sin cambios de backend.

**Tech Stack:** React 19, TypeScript, Tailwind 4, vitest + @testing-library/react.

## Global Constraints

- Los contadores de encabezado y del `FilterBar` (activas, MRR, churn, "X de Y", counts por estado) se siguen calculando sobre el set completo, nunca sobre la página visible.
- El reset de página cuelga de `filterKey`, nunca de la identidad del array `items`: un refetch de react-query devuelve un array nuevo y no debe patear al usuario a la página 1.
- `pageSize` inicial 25 en las dos páginas. Opciones del selector: 25 / 50 / 100.
- `from` / `to` son 1-based e inclusivos. Con `total === 0`, `from`, `to` y `total` valen 0.
- Prettier: comillas simples, punto y coma, ancho 80, comas finales ES5.

---

## File Structure

- `frontend/src/hooks/usePagination.ts` — el hook. Estado de página y tamaño, clamp, slicing.
- `frontend/src/hooks/usePagination.test.ts` — tests del hook.
- `frontend/src/components/admin/Pagination.tsx` — la barra de controles. Presentacional puro, sin estado.
- `frontend/src/pages/admin/Users.tsx` — cablear (reemplaza la barra falsa existente).
- `frontend/src/pages/admin/Subscriptions.tsx` — cablear.

---

### Task 1: hook `usePagination`

**Files:**
- Create: `frontend/src/hooks/usePagination.ts`
- Test: `frontend/src/hooks/usePagination.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `usePagination<T>(items: T[], opts?: { pageSize?: number; filterKey?: string }): PaginationState<T>` donde `PaginationState<T>` es `{ pageItems: T[]; page: number; setPage: (n: number) => void; pageSize: number; setPageSize: (n: number) => void; totalPages: number; from: number; to: number; total: number }`. Ambos tipos se exportan.

- [ ] **Step 1: Write the failing test**

Crear `frontend/src/hooks/usePagination.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/usePagination.test.ts`
Expected: FAIL — `Failed to resolve import "./usePagination"`.

- [ ] **Step 3: Write minimal implementation**

Crear `frontend/src/hooks/usePagination.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/usePagination.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePagination.ts frontend/src/hooks/usePagination.test.ts
git commit -m "feat(admin): hook usePagination para tablas en cliente"
```

---

### Task 2: componente `Pagination`

**Files:**
- Create: `frontend/src/components/admin/Pagination.tsx`
- Test: `frontend/src/components/admin/Pagination.test.tsx`

**Interfaces:**
- Consumes: nada de Task 1 en tiempo de compilación; las props reflejan los campos de `PaginationState`.
- Produces: `<Pagination />` con props `{ page: number; totalPages: number; from: number; to: number; total: number; pageSize: number; onPage: (n: number) => void; onPageSize: (n: number) => void; noun: string }`. `noun` es el sustantivo del texto ("usuarios", "suscripciones").

- [ ] **Step 1: Write the failing test**

Crear `frontend/src/components/admin/Pagination.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/Pagination.test.tsx`
Expected: FAIL — `Failed to resolve import "./Pagination"`.

- [ ] **Step 3: Write minimal implementation**

Crear `frontend/src/components/admin/Pagination.tsx`:

```tsx
import { Button } from '@/components/ui/button';

const PAGE_SIZES = [25, 50, 100];

interface PaginationProps {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  pageSize: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
  noun: string;
}

export function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  pageSize,
  onPage,
  onPageSize,
  noun,
}: PaginationProps) {
  // Sin corte que mostrar, la barra es ruido.
  if (total <= pageSize) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-[18px] py-3">
      <div className="text-xs text-muted-foreground">
        Mostrando{' '}
        <span className="font-mono tabular-nums text-foreground">
          {from}–{to}
        </span>{' '}
        de <span className="font-mono tabular-nums">{total}</span> {noun}
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label="Filas por página"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs tabular-nums text-muted-foreground"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/admin/Pagination.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/Pagination.tsx frontend/src/components/admin/Pagination.test.tsx
git commit -m "feat(admin): componente Pagination"
```

---

### Task 3: cablear `/admin/users`

**Files:**
- Modify: `frontend/src/pages/admin/Users.tsx`

**Interfaces:**
- Consumes: `usePagination` de Task 1, `Pagination` de Task 2.
- Produces: nada para tareas siguientes.

**Contexto:** `Users.tsx` ya tiene una barra de paginación falsa (busca el `<div className="mt-3 flex items-center justify-between">` con "Mostrando N usuarios" y dos `Button ... disabled`). Se elimina entera: la reemplaza `<Pagination />` dentro del card.

- [ ] **Step 1: Agregar los imports**

En el bloque de imports de `frontend/src/pages/admin/Users.tsx`, después de `import { CreateUserDialog } from '@/components/admin/CreateUserDialog';`:

```tsx
import { Pagination } from '@/components/admin/Pagination';
import { usePagination } from '@/hooks/usePagination';
```

- [ ] **Step 2: Llamar al hook**

Justo después del `useMemo` que define `filtered` (termina en `}, [users, status, role, search]);`):

```tsx
const pager = usePagination(filtered, {
  pageSize: 25,
  filterKey: `${status}|${role}|${search}`,
});
```

- [ ] **Step 3: Renderizar la página en vez de la lista entera**

Reemplazar el bloque del card (el `<div className="overflow-hidden rounded-2xl border bg-card">` y su contenido) por:

```tsx
      <div className="overflow-hidden rounded-2xl border bg-card">
        {q.isLoading ? (
          <UsersTableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          <>
            <UsersTable
              users={pager.pageItems}
              onOpen={(u) => navigate(`/admin/users/${u.id}`)}
            />
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              from={pager.from}
              to={pager.to}
              total={pager.total}
              pageSize={pager.pageSize}
              onPage={pager.setPage}
              onPageSize={pager.setPageSize}
              noun="usuarios"
            />
          </>
        )}
      </div>
```

Nota: el empty state se evalúa sobre `filtered`, no sobre `pager.pageItems` — si no, una página vacía por clamp mostraría "sin resultados" con filtros que sí matchean.

- [ ] **Step 4: Borrar la barra falsa**

Eliminar por completo el bloque que sigue al card:

```tsx
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Mostrando{' '}
          <span className="font-mono tabular-nums">{filtered.length}</span>{' '}
          usuarios
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        </div>
      </div>
```

- [ ] **Step 5: Verificar tipos y tests**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Users.tsx|Pagination|usePagination"`
Expected: sin salida. `Button` sigue usándose en el header (`Exportar CSV`), así que el import no queda huérfano.

Run: `cd frontend && npx vitest run src/pages/admin src/hooks src/components/admin`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/Users.tsx
git commit -m "feat(admin): paginar la tabla de usuarios"
```

---

### Task 4: cablear `/admin/subscriptions`

**Files:**
- Modify: `frontend/src/pages/admin/Subscriptions.tsx`

**Interfaces:**
- Consumes: `usePagination` de Task 1, `Pagination` de Task 2.
- Produces: nada.

- [ ] **Step 1: Agregar los imports**

Después de `import { useAdminStats } from '@/hooks/useAdminStats';`:

```tsx
import { Pagination } from '@/components/admin/Pagination';
import { usePagination } from '@/hooks/usePagination';
```

- [ ] **Step 2: Llamar al hook**

Justo después del `useMemo` que define `filtered` (termina en `}, [subs, tier, status, search]);`):

```tsx
const pager = usePagination(filtered, {
  pageSize: 25,
  filterKey: `${tier}|${status}|${search}`,
});
```

- [ ] **Step 3: Iterar la página y montar la barra**

En el JSX de la tabla, cambiar la línea `{filtered.map((u) => {` por:

```tsx
              {pager.pageItems.map((u) => {
```

Y justo después del `</Table>` de cierre, todavía dentro del `<div className="overflow-hidden rounded-2xl border bg-card">`, agregar:

```tsx
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              from={pager.from}
              to={pager.to}
              total={pager.total}
              pageSize={pager.pageSize}
              onPage={pager.setPage}
              onPageSize={pager.setPageSize}
              noun="suscripciones"
            />
```

La `<Table>` y la `<Pagination>` quedan como hermanas dentro de la rama `else` del ternario, así que hay que envolverlas en un fragmento `<>...</>` igual que en Task 3.

El contador de "N resultados" de la barra de filtros sigue usando `filtered.length` — no se toca.

- [ ] **Step 4: Verificar tipos y tests**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "Subscriptions.tsx|Pagination|usePagination"`
Expected: sin salida.

Run: `cd frontend && npx vitest run`
Expected: PASS, toda la suite.

- [ ] **Step 5: Verificación manual**

Con las dos páginas cableadas, revisar en el navegador:

1. `/admin/users` con 56 usuarios muestra 25 filas y "Página 1 de 3".
2. Escribir en el buscador con la página 3 abierta vuelve a la página 1 y muestra los resultados desde arriba.
3. Cambiar el selector a 100 muestra todo y esconde la barra.
4. Los contadores del encabezado y del `FilterBar` siguen mostrando los totales completos, no 25.
5. Lo mismo en `/admin/subscriptions`, donde el orden por vencimiento tiene que respetarse: los vencidos siguen primeros en la página 1.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/Subscriptions.tsx
git commit -m "feat(admin): paginar la tabla de suscripciones"
```

---

## Notas de revisión

Cobertura del spec: hook (Task 1), componente y regla de ocultarse con `total <= pageSize` (Task 2), cableado de las dos páginas con sus `filterKey` (Tasks 3 y 4), contadores intactos (constraint global, verificado en Task 4 Step 5), tests del hook (Task 1 Step 1).

Sobre el spec original: no mencionaba la barra de paginación falsa que ya vive en `Users.tsx`. Task 3 Step 4 la elimina.
