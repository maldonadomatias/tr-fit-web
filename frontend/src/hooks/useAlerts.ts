import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CoachAlert, AlertContext, AlertsListResponse, AlertsListFilters,
  AlertResolutionAction,
} from '@/types/api';

function buildQs(f: AlertsListFilters) {
  const sp = new URLSearchParams();
  if (f.status) sp.set('status', f.status);
  if (f.type) sp.set('type', f.type);
  if (f.severity) sp.set('severity', f.severity);
  if (f.athleteId) sp.set('athlete_id', f.athleteId);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useAlerts(filters: AlertsListFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'alerts', filters],
    queryFn: async (): Promise<AlertsListResponse> => {
      const r = await api.get<AlertsListResponse>(`/admin/alerts${buildQs(filters)}`);
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAlertContext(alertId: string | null) {
  return useQuery({
    queryKey: ['admin', 'alert-context', alertId],
    enabled: !!alertId,
    queryFn: async (): Promise<AlertContext> => {
      const r = await api.get<AlertContext>(`/admin/alerts/${alertId}/context`);
      return r.data;
    },
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/alerts/${id}/read`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alerts'] }),
  });
}

export interface ResolveArgs {
  id: string;
  action: AlertResolutionAction;
  payload?: Record<string, unknown>;
  note?: string;
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ResolveArgs): Promise<CoachAlert> => {
      const r = await api.post<CoachAlert>(
        `/admin/alerts/${args.id}/resolve`,
        { action: args.action, payload: args.payload ?? {}, note: args.note },
      );
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'alerts'] }),
  });
}
