import type { NotificationType } from '../domain/types.js';

export interface RenderedNotification {
  title: string;
  body: string;
  route: string;
}

type Renderer = (vars: Record<string, string>) => RenderedNotification;

export const TEMPLATES: Record<NotificationType, Renderer> = {
  session_reminder: () => ({
    title: 'Hora de entrenar',
    body: 'Tu sesión de hoy te espera 💪',
    route: '/(app)/athlete',
  }),
  session_missed: () => ({
    title: 'Te perdiste la sesión',
    body: 'Recuperá mañana — un día no rompe la racha.',
    route: '/(app)/athlete',
  }),
  week_start: ({ week }) => ({
    title: `Semana ${week} arranca`,
    body: 'Plan nuevo listo. ¡A romperla!',
    route: '/(app)/athlete',
  }),
  skeleton_approved: () => ({
    title: 'Tu plan está aprobado',
    body: 'Tu coach revisó tu rutina. Ya podés arrancar.',
    route: '/(app)/athlete',
  }),
  sos_resolved: ({ exerciseName }) => ({
    title: 'Tu coach respondió',
    body: exerciseName
      ? `Hay novedades sobre ${exerciseName}`
      : 'Tu coach respondió tu alerta',
    route: '/(app)/athlete',
  }),
  rm_test_week: ({ week }) => ({
    title: `Semana de RM (${week})`,
    body: 'Esta semana medimos tu nuevo máximo. ¡Vení preparado!',
    route: '/(app)/athlete',
  }),
  membership_expiring: ({ days }) => ({
    title: 'Tu plan está por vencer',
    body: days
      ? `Te quedan ${days} días. Escribí a tu coach para seguir entrenando 💪`
      : 'Tu plan está por vencer. Escribí a tu coach para seguir entrenando 💪',
    route: '/(app)/athlete',
  }),
  membership_expired: () => ({
    title: 'Tu acceso está pausado',
    body: 'Escribí a tu coach para volver a entrenar.',
    route: '/(app)/athlete',
  }),
  community_announcement: ({ preview }) => ({
    title: 'Aviso de tu coach',
    body: preview || 'Hay un aviso nuevo en la comunidad',
    route: '/(app)/community',
  }),
  community_event: ({ preview }) => ({
    title: 'Nuevo evento',
    body: preview || 'Hay un evento nuevo en la comunidad',
    route: '/(app)/community',
  }),
  community_comment: ({ commenter }) => ({
    title: 'Nuevo comentario',
    body: commenter
      ? `${commenter} comentó tu publicación`
      : 'Comentaron tu publicación',
    route: '/(app)/community',
  }),
  community_report: ({ reason }) => ({
    title: 'Nueva denuncia',
    body: reason
      ? `Denuncia por ${reason} en la comunidad`
      : 'Hay una denuncia nueva en la comunidad',
    route: '/(app)/community',
  }),
  community_revision: ({ average, newFee, downgraded }) => ({
    title: 'Revisión de Comunidad aplicada',
    body:
      downgraded === 'true'
        ? `Promedio de publicidad $${average}: el fee de Comunidad pasa a $${newFee}.`
        : `Promedio de publicidad $${average}: el fee de Comunidad se mantiene en $${newFee}.`,
    route: '/(app)/community',
  }),
};
