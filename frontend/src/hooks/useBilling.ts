import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface BillingInfo {
  alias: string | null;
  cbu: string | null;
  holder: string | null;
  amount: number | null;
  currency: string;
  note: string | null;
}

export function useBillingInfo() {
  return useQuery({
    queryKey: ['admin', 'billing'],
    queryFn: async (): Promise<BillingInfo> => {
      const r = await api.get<BillingInfo>('/billing/info');
      return r.data;
    },
  });
}

export function useUpdateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<BillingInfo>): Promise<BillingInfo> => {
      const r = await api.put<BillingInfo>('/billing/admin/info', input);
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'billing'] }),
  });
}
