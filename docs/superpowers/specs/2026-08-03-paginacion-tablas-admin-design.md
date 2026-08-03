# Paginación en las tablas de admin

Fecha: 2026-08-03
Estado: aprobado

## Problema

`/admin/users` y `/admin/subscriptions` renderizan una fila por usuario, sin
corte. Hoy son 56 usuarios y ya cuesta encontrar a alguien; el roster crece cada
semana con el traspaso de alumnos del gimnasio viejo.

Las dos páginas llaman `useAdminUsers({})`, reciben la lista completa y filtran y
ordenan en cliente con `useMemo`. El backend corta en `LIMIT 500`
(`buildListUsersSql`, `backend/src/services/admin.service.ts`).

## Alcance

Paginar las dos tablas en cliente, después de filtrar y ordenar. Los filtros
mandan: la paginación es siempre el último paso sobre el resultado filtrado.

Fuera de alcance: paginación en el servidor, y cualquier cambio de backend.

## Decisión: paginar en cliente

Con 56 filas contra un techo de 500, paginar en el servidor no mejora nada y
rompe los totales: los contadores de encabezado (activas, MRR, churn, "X de Y",
los counts por estado del `FilterBar`) se calculan hoy sobre el set completo. En
el servidor harían falta endpoints de agregación aparte para sostenerlos.

Revisar cuando la cuenta de usuarios se acerque a 500.

## Componentes

### `frontend/src/hooks/usePagination.ts`

```ts
usePagination(items, { pageSize, filterKey })
// → { pageItems, page, setPage, pageSize, setPageSize,
//     totalPages, from, to, total }
```

- `pageItems` es `items.slice()` de la página actual. `items` ya viene filtrado y
  ordenado por la página que lo llama.
- `filterKey` es un string con los filtros activos (`"approved|athlete|maldo"`).
  Cuando cambia, la página vuelve a 1. Sin esto, filtrar con la página 3 abierta
  deja la tabla vacía.
- La página se clampea a `totalPages`. Si el coach está en la última página y una
  renovación saca a alguien del filtro, no queda en una página inexistente.
- `from` / `to` / `total` son para el texto "Mostrando 1–25 de 56". `from` y `to`
  son 1-based e inclusivos; con `total === 0` los tres valen 0.

### `frontend/src/components/admin/Pagination.tsx`

Barra dentro del card, debajo de la tabla:

```
Mostrando 1–25 de 56        [25 ▾]   ‹ Anterior   Página 1 de 3   Siguiente ›
```

- No renderiza nada si `total <= pageSize`.
- Selector de tamaño: 25 / 50 / 100. Cambiar el tamaño vuelve a página 1.
- `Anterior` deshabilitado en la primera página, `Siguiente` en la última.

### Páginas

`Users.tsx` y `Subscriptions.tsx`: llamar al hook sobre el `filtered` que ya
existe, pasar `pageItems` a la tabla en lugar de `filtered`, y montar la barra
debajo. `pageSize` inicial 25 en las dos.

Los encabezados y el `FilterBar` no cambian: siguen contando sobre el set
completo, no sobre la página visible. El empty state actual (`filtered.length
=== 0`) tampoco cambia — se evalúa antes de paginar.

## Tests

`frontend/src/hooks/usePagination.test.ts` con vitest:

- corta la página pedida y calcula `from` / `to` / `total`;
- cambiar `filterKey` vuelve a página 1;
- si la lista se achica, la página se clampea al último índice válido;
- lista vacía: `totalPages === 1`, `pageItems === []`, `from`/`to`/`total` en 0.

## Riesgos

Un refetch de react-query devuelve un array nuevo. El reset tiene que colgar de
`filterKey`, no de la identidad de `items`, o cualquier refetch en segundo plano
patea al coach a la página 1 mientras trabaja.
