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
