import type { ActivityEvent, AuditType } from '@/types/api';

const LABELS: Record<AuditType, string> = {
  user_created: 'Usuario creado',
  user_approved: 'Usuario aprobado',
  user_rejected: 'Usuario rechazado',
  user_deleted: 'Usuario eliminado',
  role_changed: 'Rol cambiado',
  email_verified: 'Email verificado',
  email_unverified: 'Email desverificado',
  subscription_created: 'Suscripción creada',
  subscription_updated: 'Suscripción actualizada',
  subscription_cancelled: 'Suscripción cancelada',
  subscription_authorized: 'Suscripción activada',
  subscription_paused: 'Suscripción pausada',
  force_logout: 'Logout forzado',
};

export function activityLabel(type: AuditType): string {
  return LABELS[type] ?? type;
}

export function activitySub(ev: ActivityEvent): string | null {
  const meta = ev.meta;
  if (!meta) return null;
  if (ev.type === 'role_changed' && meta.from && meta.to) {
    return `${String(meta.from)} → ${String(meta.to)}`;
  }
  if (
    (ev.type === 'subscription_created' ||
      ev.type === 'subscription_updated' ||
      ev.type === 'subscription_authorized' ||
      ev.type === 'subscription_paused' ||
      ev.type === 'subscription_cancelled') &&
    meta.tier
  ) {
    return String(meta.tier);
  }
  return null;
}
