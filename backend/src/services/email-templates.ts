const brandColor = '#000';

export function verifyTemplate(link: string): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Bienvenido a TR-FIT</h2>
  <p style="line-height:1.6">Confirmá tu email haciendo click acá:</p>
  <p style="margin:24px 0">
    <a href="${link}"
       style="background:${brandColor};color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
      Verificar email
    </a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">
    El link expira en 24 horas. Si no te registraste, ignorá este email.
  </p>
</div>`;
}

export function resetCodeTemplate(code: string): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Tu código FORMA</h2>
  <p style="line-height:1.6">Tu código de recuperación:</p>
  <p style="margin:24px 0; text-align:center">
    <span style="font-family:monospace;font-size:40px;font-weight:700;letter-spacing:8px;color:${brandColor}">${code}</span>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">
    Expira en 15 minutos. Si no pediste esto, ignorá este email.
  </p>
  <p style="color:#999;font-size:12px;margin-top:24px">— FORMA</p>
</div>`;
}

export function painAlertTemplate(opts: {
  athleteName: string;
  exerciseName: string;
  zone: string;
  intensity: number;
  alertUrl: string;
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
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
  </p>
</div>`;
}

export function membershipExpiringTemplate(opts: {
  name: string; paidUntil: string; daysLeft: number;
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Tu plan vence pronto</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a TR-FIT vence el
    <strong>${opts.paidUntil}</strong> (en ${opts.daysLeft} días).</p>
  <p style="line-height:1.6">Para renovar, coordiná el pago con tu coach. Una vez
    confirmado, tu cuenta sigue activa sin interrupciones.</p>
  <p style="color:#999;font-size:12px;margin-top:24px">— FORMA</p>
</div>`;
}

export function membershipExpiredTemplate(opts: { name: string }): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Tu plan venció</h2>
  <p style="line-height:1.6">Hola ${opts.name}, tu acceso a TR-FIT venció.
    Para renovarlo y volver a entrenar, coordiná el pago con tu coach.</p>
  <p style="color:#999;font-size:12px;margin-top:24px">— FORMA</p>
</div>`;
}
