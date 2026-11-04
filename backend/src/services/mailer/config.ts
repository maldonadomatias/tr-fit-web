// No dependencies on purpose: this folder is copied into each app.

export interface ClientConfig {
  url: string;
  apiKey: string;
}

export interface MailBrand {
  name: string;
  logoUrl?: string;
  color: string;
}

type Env = Record<string, string | undefined>;

function invalid(names: string[]): Error {
  return new Error(`Invalid mail config: ${names.join(', ')}`);
}

function hasProtocol(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function loadClientConfig(env: Env = process.env): ClientConfig {
  const url = env.MAILER_URL || '';
  const apiKey = env.MAILER_API_KEY || '';
  const bad = [
    ...(hasProtocol(url, ['http:', 'https:']) ? [] : ['MAILER_URL']),
    ...(apiKey ? [] : ['MAILER_API_KEY']),
  ];
  if (bad.length > 0) {
    throw invalid(bad);
  }
  return { url: url.replace(/\/+$/, ''), apiKey };
}

export function loadMailBrand(env: Env = process.env): MailBrand {
  const name = env.MAIL_BRAND_NAME || '';
  const logoUrl = env.MAIL_LOGO_URL || undefined;
  const color = env.MAIL_BRAND_COLOR || '#111111';
  const bad = [
    ...(name ? [] : ['MAIL_BRAND_NAME']),
    ...(logoUrl === undefined || hasProtocol(logoUrl, ['https:'])
      ? []
      : ['MAIL_LOGO_URL']),
    ...(/^#[0-9a-fA-F]{6}$/.test(color) ? [] : ['MAIL_BRAND_COLOR']),
  ];
  if (bad.length > 0) {
    throw invalid(bad);
  }
  return { name, ...(logoUrl === undefined ? {} : { logoUrl }), color };
}
