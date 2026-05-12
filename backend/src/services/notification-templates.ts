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
    body: exerciseName ? `Hay novedades sobre ${exerciseName}` : 'Tu coach respondió tu alerta',
    route: '/(app)/athlete',
  }),
  rm_test_week: ({ week }) => ({
    title: `Semana de RM (${week})`,
    body: 'Esta semana medimos tu nuevo máximo. ¡Vení preparado!',
    route: '/(app)/athlete',
  }),
};
