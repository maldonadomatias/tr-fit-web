import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { sendMail } from './mailer/index.js';
import {
  verifyTemplate,
  resetCodeTemplate,
  painAlertTemplate,
  membershipExpiringTemplate,
  membershipExpiredTemplate,
  accountApprovedTemplate,
  communityRevisionTemplate,
  openAiAccountAlertTemplate,
} from './email-templates.js';

// Plain-text part derived from the existing HTML templates, links kept visible.
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, url, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text && text !== url ? `${text}: ${url}` : url;
    })
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|tr|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (env.EXTERNAL_EFFECTS_ENABLED === 'false') {
    logger.info({ channel: 'email' }, 'external effect blocked in rehearsal');
    return;
  }
  // The mail client validates its config on first send and throws MailerError
  // (status, code, responseCode, response); callers log it.
  await sendMail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: htmlToText(opts.html),
    ...(env.SUPPORT_EMAIL ? { replyTo: env.SUPPORT_EMAIL } : {}),
  });
}

export async function sendVerifyEmail(
  email: string,
  token: string
): Promise<void> {
  const link = `${env.APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await send({
    to: email,
    subject: 'Verificá tu email — TR Fit',
    html: verifyTemplate(link),
  });
}

export async function sendPasswordResetEmail(
  email: string,
  code: string
): Promise<void> {
  await send({
    to: email,
    subject: 'Tu código de recuperación — TR Fit',
    html: resetCodeTemplate(code),
  });
}

export const OPS_ALERT_EMAIL = 'info@molpo.ar';

export async function sendOpenAiAccountAlert(reason: string): Promise<void> {
  await send({
    to: OPS_ALERT_EMAIL,
    subject: '⚠️ OpenAI sin crédito o key inválida — TR Fit',
    html: openAiAccountAlertTemplate({ reason }),
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

export async function sendMembershipExpiringEmail(opts: {
  email: string;
  name: string;
  paidUntil: string;
  daysLeft: number;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu plan TR-FIT vence pronto',
    html: membershipExpiringTemplate({
      name: opts.name,
      paidUntil: opts.paidUntil,
      daysLeft: opts.daysLeft,
    }),
  });
}

export async function sendMembershipExpiredEmail(opts: {
  email: string;
  name: string;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu plan TR-FIT venció',
    html: membershipExpiredTemplate({ name: opts.name }),
  });
}

export async function sendAccountApprovedEmail(opts: {
  email: string;
  name: string;
}): Promise<void> {
  await send({
    to: opts.email,
    subject: 'Tu cuenta TR-FIT ya está activa',
    html: accountApprovedTemplate({ name: opts.name }),
  });
}

export async function sendCommunityRevisionEmail(opts: {
  email: string;
  average: number;
  threshold: number;
  newFee: number;
  downgraded: boolean;
}): Promise<void> {
  const { email, ...rest } = opts;
  await send({
    to: email,
    subject: 'Revisión de Comunidad — TR Fit',
    html: communityRevisionTemplate(rest),
  });
}
