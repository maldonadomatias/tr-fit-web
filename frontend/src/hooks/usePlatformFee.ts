import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type BillingPhase = 'testflight' | 'production';

export interface PlatformFeeSummary {
  base_fee_ars: number;
  active_athletes: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  next_adjustment_date: string;
  adjustment_due: boolean;
  phase: BillingPhase;
}

export interface PlatformFeeConfig {
  base_fee_ars: number;
  reference_usd: number;
  current_usd: number;
  price_per_athlete_ars: number;
  revenue_share_pct: number;
  adjustment_interval_months: number;
  next_adjustment_date: string;
  phase: BillingPhase;
  updated_at: string;
}

export interface PlatformFeeHistoryRow {
  period: string;
  base_fee_ars: number;
  active_athletes: number;
  price_per_athlete_ars: number;
  gross_revenue_ars: number;
  revenue_share_pct: number;
  revenue_share_ars: number;
  total_ars: number;
  usd_at_snapshot: number;
  created_at: string;
}

export interface FeeLogRow {
  id: string;
  athlete_id: string;
  athlete_name: string | null;
  from_ars: number;
  to_ars: number;
  actor: string;
  created_at: string;
}

export function useFeeLog() {
  return useQuery({
    queryKey: ['platform-fee', 'fee-log'],
    queryFn: async () => {
      const r = await api.get<FeeLogRow[]>('/platform-fee/fee-log');
      return r.data;
    },
  });
}

export function usePlatformFee() {
  return useQuery({
    queryKey: ['platform-fee'],
    queryFn: async () => {
      const r = await api.get<{
        summary: PlatformFeeSummary;
        config: PlatformFeeConfig;
      }>('/platform-fee');
      return r.data;
    },
    refetchInterval: 60_000,
  });
}

export function usePlatformFeeHistory() {
  return useQuery({
    queryKey: ['platform-fee', 'history'],
    queryFn: async () => {
      const r = await api.get<PlatformFeeHistoryRow[]>('/platform-fee/history');
      return r.data;
    },
  });
}

export function useUpdatePlatformFeeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PlatformFeeConfig>) => {
      const r = await api.put<PlatformFeeConfig>('/platform-fee/config', patch);
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-fee'] }),
  });
}

export function useApplyAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (current_usd: number) => {
      const r = await api.post<{
        config: PlatformFeeConfig;
        applied: { new_base_fee_ars: number };
      }>('/platform-fee/adjust', { current_usd });
      return r.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-fee'] }),
  });
}
