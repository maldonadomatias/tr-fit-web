import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminUser,
  Role,
  SubscriptionStatus,
  SubscriptionTier,
  UserStatus,
} from '@/types/api';

export interface AdminUserFilters {
  status?: UserStatus;
  role?: Role;
  search?: string;
}

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: async (): Promise<AdminUser[]> => {
      const r = await api.get<AdminUser[]>('/admin/users', { params: filters });
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    enabled: !!id,
    queryFn: async (): Promise<AdminUser> => {
      const r = await api.get<AdminUser>(`/admin/users/${id}`);
      return r.data;
    },
  });
}

export interface UpdateUserPatch {
  role?: Role;
  status?: UserStatus;
  email_verified?: boolean;
}

export function useUpdateAdminUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateUserPatch): Promise<AdminUser> => {
      const r = await api.patch<AdminUser>(`/admin/users/${id}`, patch);
      return r.data;
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['admin', 'user', id], fresh);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export interface UpsertSubInput {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_end?: string | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: Role;
  status?: UserStatus;
  email_verified?: boolean;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput): Promise<AdminUser> => {
      const r = await api.post<AdminUser>('/admin/users', input);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/users/${id}`);
    },
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: ['admin', 'user', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUpsertSubscription(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertSubInput): Promise<AdminUser> => {
      const r = await api.put<AdminUser>(`/admin/users/${id}/subscription`, input);
      return r.data;
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['admin', 'user', id], fresh);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useCancelSubscription(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<AdminUser> => {
      const r = await api.delete<AdminUser>(`/admin/users/${id}/subscription`);
      return r.data;
    },
    onSuccess: (fresh) => {
      qc.setQueryData(['admin', 'user', id], fresh);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
