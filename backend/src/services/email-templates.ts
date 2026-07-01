import { env } from '../config/env.js';

const brandColor = '#000';
const brandName = 'TR Fit';

/**
 * Shared email shell: optional logo header + branded footer.
 * Pass the inner HTML for the body.
 */
function layout(inner: string): string {
  const logo = env.EMAIL_LOGO_URL
    ? `<div style="text-align:center;margin:0 0 24px 0">
         <img src="${env.EMAIL_LOGO_URL}" alt="${brandName}" height="40"
              style="height:40px;width:auto;display:inline-block" />
       </div>`
    : `<div style="text-align:center;margin:0 0 24px 0">
         <span style="font-size:22px;font-weight:800;letter-spacing:1px;color:${brandColor}">${brandName}</span>
       </div>`;

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  ${logo}
  ${inner}
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px 0" />
  <p style="color:#999;font-size:12px;line-height:1.5;text-align:center;margin:0">
    ${brandName} · Entrenamiento inteligente<br />
    Este es un correo automático, no respondas a esta dirección.
  </p>
</div>`;
}

export function verifyTemplate(link: string): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Bienvenido a ${brandName}</h2>
  <p style="line-height:1.6">Confirmá tu email haciendo click acá:</p>
  <p style="margin:24px 0">
    <a href="${link}"
       style="background:${brandColor};color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
      Verificar email
    </a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">
    El link expira en 24 horas. Si no te registraste, ignorá este email.
  </p>`);
}

export function resetCodeTemplate(code: string): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Tu código de recuperación</h2>
  <p style="line-height:1.6">Usá este código para recuperar tu contraseña:</p>
  <p style="margin:24px 0; text-align:center">
    <span style="font-family:monospace;font-size:40px;font-weight:700;letter-spacing:8px;color:${brandColor}">${code}</span>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">
    Expira en 15 minutos. Si no pediste esto, ignorá este email.
  </p>`);
}

export function painAlertTemplate(opts: {
  athleteName: string;
  exerciseName: string;
  zone: string;
  intensity: number;
  alertUrl: string;
}): string {
  return layout(`
  <h2 style="margin:0 0 16px 0; color:#b91c1c">⚠️ SOS Dolor — ${opts.athleteName}</h2>
  <p style="line-height:1.6">${opts.athleteName} reportó dolor durante el entrenamiento:</p>
  <ul style="line-height:1.8">
    <li>Ejercicio: <strong>${opts.exerciseName}</strong></li>
    <li>Zona: <strong>${opts.zone}</strong></li>
    <li>Intensidad: <strong>${opts.intensity}/10</strong></li>
  </ul>
  <p style="margin:24px 0">
    <a href="${opts.alertUrl}"
       style="background:#b91c1c;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
      Ver en dashboard
    </a>
  </p>`);
}

export function membershipExpiringTemplate(opts: {
  name: string; paidUntil: string; daysLeft: number;
}): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Tu plan vence pronto</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a ${brandName} vence el
    <strong>${opts.paidUntil}</strong> (en ${opts.daysLeft} días).</p>
  <p style="line-height:1.6">Para renovar, coordiná el pago con tu coach. Una vez
    confirmado, tu cuenta sigue activa sin interrupciones.</p>`);
}

export function membershipExpiredTemplate(opts: { name: string }): string {
  return layout(`
  <h2 style="margin:0 0 16px 0">Tu plan venció</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a ${brandName} venció.
    Para renovarlo y volver a entrenar, coordiná el pago con tu coach.</p>`);
}
