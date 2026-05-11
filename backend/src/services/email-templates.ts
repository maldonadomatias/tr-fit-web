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

export function resetTemplate(link: string): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color:#111">
  <h2 style="margin:0 0 16px 0">Restablecer contraseña</h2>
  <p style="line-height:1.6">Click acá para crear una nueva contraseña:</p>
  <p style="margin:24px 0">
    <a href="${link}"
       style="background:${brandColor};color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
      Restablecer contraseña
    </a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">
    El link expira en 1 hora. Si no pediste esto, ignorá.
  </p>
</div>`;
}
