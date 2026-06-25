import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSetMonthlyFee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (monthly_fee_ars: number) => {
      const r = await api.put<{ monthly_fee_ars: number }>(
        `/admin/users/${id}/monthly-fee`,
        { monthly_fee_ars }
      );
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
      qc.invalidateQueries({ queryKey: ['platform-fee'] });
    },
  });
}
