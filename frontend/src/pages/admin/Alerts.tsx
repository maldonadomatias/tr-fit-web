import { useState } from 'react';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertsFilters } from '@/components/admin/alerts/AlertsFilters';
import { AlertsTable } from '@/components/admin/alerts/AlertsTable';
import type { AlertsListFilters } from '@/types/api';

export default function Alerts() {
  const [filters, setFilters] = useState<AlertsListFilters>({ status: 'open' });
  const { data, isLoading } = useAlerts(filters);

  return (
    <div className="space-y-4">
      <AlertsFilters value={filters} onChange={setFilters} />
      {isLoading && (
        <div className="text-sm text-muted-foreground">Cargando alertas...</div>
      )}
      {!isLoading && data && <AlertsTable alerts={data.items} />}
    </div>
  );
}
