import type { AxiosError } from 'axios';

type AuthErrorBody = { error?: string; reason?: string };

export function authErrorMessage(err: unknown): { message: string } {
  const e = err as AxiosError<AuthErrorBody>;
  const body = e.response?.data;

  switch (body?.error) {
    case 'invalid_credentials':
      return { message: 'Email o contraseña incorrectos' };
    case 'blocked':
      if (body.reason === 'email_not_verified') {
        return { message: 'Verificá tu email antes de iniciar sesión' };
      }
      if (body.reason === 'not_approved') {
        return { message: 'Tu cuenta está pendiente de aprobación' };
      }
      if (body.reason === 'rejected') {
        return {
          message: 'Tu cuenta fue rechazada. Escribinos a hola@tr-fit.app',
        };
      }
      if (body.reason === 'membership_paused') {
        return {
          message: 'Tu membresía está pausada. Hablá con tu coach para reactivarla',
        };
      }
      return { message: 'Tu cuenta no puede iniciar sesión' };
    case 'rate_limited':
      return { message: 'Demasiados intentos. Esperá unos minutos.' };
    default:
      return { message: 'No se pudo iniciar sesión' };
  }
}
