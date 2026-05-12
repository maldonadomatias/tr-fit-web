import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { verifyTemplate, resetTemplate, painAlertTemplate } from './email-templates.js';

const resend = new Resend(env.RESEND_API_KEY);

async function send(opts: { to: string; subject: string; html: string }): Promise<void> {
  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    // Resend v6 returns { data, error } discriminated union — check error
    if (result && 'error' in result && result.error) {
      const err = new Error(
        (result.error as { message?: string }).message ?? 'resend send failed',
      );
      logger.error({ err: result.error, to: opts.to }, 'resend send failed');
      throw err;
    }
  } catch (e) {
    logger.error({ err: e, to: opts.to }, 'resend send failed');
    throw e;
  }
}

export async function sendVerifyEmail(email: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await send({
    to: email,
    subject: 'Verificá tu email — TR-FIT',
    html: verifyTemplate(link),
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await send({
    to: email,
    subject: 'Restablecer contraseña — TR-FIT',
    html: resetTemplate(link),
  });
}

export async function sendCoachPainAlert(opts: {
  coachEmail: string;
  athleteName: string;
  exerciseName: string;
  zone: string;
  intensity: number;
  alertId: string;
}): Promise<void> {
  const alertUrl = `${env.APP_URL}/coach/alerts/${opts.alertId}`;
  await send({
    to: opts.coachEmail,
    subject: `🔴 SOS Dolor — ${opts.athleteName}`,
    html: painAlertTemplate({
      athleteName: opts.athleteName,
      exerciseName: opts.exerciseName,
      zone: opts.zone,
      intensity: opts.intensity,
      alertUrl,
    }),
  });
}
