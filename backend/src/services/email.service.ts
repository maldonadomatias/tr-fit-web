import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { verifyTemplate, resetTemplate } from './email-templates.js';

const resend = new Resend(env.RESEND_API_KEY);

async function send(opts: { to: string; subject: string; html: string }): Promise<void> {
  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
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
