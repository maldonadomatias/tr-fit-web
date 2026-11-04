import type { MailBrand } from './config.js';

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export interface MailContent {
  subject: string;
  /** Preview line shown by the inbox next to the subject. */
  preheader?: string;
  heading?: string;
  /** Plain text; every paragraph is HTML-escaped. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the button, e.g. "Si no lo pediste, ignorá este mail." */
  footnote?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function assertHttpUrl(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('Mail url must use http or https');
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('Mail url must use http or https');
  }
}

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Layout from the design handoff (plantilla.html): tables and inline styles
// only, since mail clients drop <style>; the MSO wrapper pins Outlook to 560px.
function header(brand: MailBrand): string {
  const name = escapeHtml(brand.name);
  if (brand.logoUrl) {
    return `<img src="${escapeHtml(brand.logoUrl)}" height="40" alt="${name}" style="display:block;border:0;outline:none;height:40px;width:auto;">`;
  }
  return name;
}

function heading(text: string): string {
  return `<tr><td style="padding:0 0 16px;${FONT};font-size:22px;line-height:30px;font-weight:700;color:#1a1d21;"><h1 style="margin:0;font-size:22px;line-height:30px;font-weight:700;color:#1a1d21;${FONT};">${escapeHtml(text)}</h1></td></tr>`;
}

function button(color: string, b: NonNullable<MailContent['button']>): string {
  const url = escapeHtml(b.url);
  return `<tr><td style="padding:8px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${color}" align="center" style="background-color:${color};border-radius:6px;mso-padding-alt:14px 24px;"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 24px;background-color:${color};border-radius:6px;${FONT};font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)}</a></td></tr></table><p style="margin:16px 0 0;${FONT};font-size:13px;line-height:20px;color:#4b5563;">Si el botón no funciona, copiá y pegá este enlace en el navegador:<br><a href="${url}" target="_blank" style="color:#1a1d21;text-decoration:underline;word-break:break-all;">${url}</a></p></td></tr>`;
}

function footnote(text: string): string {
  return `<tr><td style="padding:24px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #d3d8de;padding:16px 0 0;${FONT};font-size:13px;line-height:20px;color:#4b5563;">${escapeHtml(text)}</td></tr></table></td></tr>`;
}

/**
 * Wraps content in the shared layout: logo or brand name, card with a brand
 * stripe, button and footer. Every text value is escaped.
 */
export function renderMail(
  brand: MailBrand,
  content: MailContent
): RenderedMail {
  if (content.button) {
    assertHttpUrl(content.button.url);
  }

  const name = escapeHtml(brand.name);
  const color = brand.color;
  const paragraphs = content.paragraphs
    .map((text) => `<p style="margin:0 0 16px;">${escapeHtml(text)}</p>`)
    .join('');

  const card = [
    content.heading ? heading(content.heading) : '',
    `<tr><td style="${FONT};font-size:16px;line-height:25px;color:#2b3138;">${paragraphs}</td></tr>`,
    content.button ? button(color, content.button) : '',
    content.footnote ? footnote(content.footnote) : '',
  ].join('');

  const html = `<!doctype html><html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><title>${name}</title></head><body style="margin:0;padding:0;background-color:#eef0f2;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(content.preheader ?? '')}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef0f2" style="background-color:#eef0f2;"><tr><td align="center" style="padding:32px 12px;"><!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;"><tr><td align="left" style="padding:0 4px 20px;${FONT};font-size:20px;line-height:40px;font-weight:700;color:#1a1d21;">${header(brand)}</td></tr><tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #d3d8de;border-top:4px solid ${color};border-radius:6px;padding:32px 28px;${FONT};color:#1a1d21;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${card}</table></td></tr><tr><td align="left" style="padding:20px 4px 0;${FONT};font-size:13px;line-height:20px;color:#4b5563;">Enviado por ${name}</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;

  const text = [
    content.heading,
    ...content.paragraphs,
    content.button ? `${content.button.label}: ${content.button.url}` : '',
    content.footnote,
    `— ${brand.name}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject: content.subject, html, text };
}

function greeting(name: string | undefined): string {
  return name ? `Hola ${name},` : 'Hola,';
}

export function passwordReset(
  brand: MailBrand,
  p: { name?: string; resetUrl: string; expiresInMinutes: number }
): RenderedMail {
  return renderMail(brand, {
    subject: 'Restablecé tu contraseña',
    preheader: `El enlace expira en ${p.expiresInMinutes} minutos.`,
    heading: 'Restablecé tu contraseña',
    paragraphs: [
      greeting(p.name),
      `Recibimos un pedido para cambiar tu contraseña. El enlace expira en ${p.expiresInMinutes} minutos.`,
    ],
    button: { label: 'Restablecer contraseña', url: p.resetUrl },
    footnote: 'Si no lo pediste, ignorá este mail. Tu contraseña no cambia.',
  });
}

export function emailVerification(
  brand: MailBrand,
  p: { name?: string; verifyUrl: string }
): RenderedMail {
  return renderMail(brand, {
    subject: 'Verificá tu cuenta',
    preheader: 'Confirmá tu email para activar tu cuenta.',
    heading: 'Verificá tu cuenta',
    paragraphs: [
      greeting(p.name),
      'Confirmá tu email para terminar de crear tu cuenta.',
    ],
    button: { label: 'Verificar cuenta', url: p.verifyUrl },
    footnote: 'Si no creaste una cuenta, ignorá este mail.',
  });
}
