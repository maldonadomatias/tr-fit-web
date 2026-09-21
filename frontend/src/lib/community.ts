import type {
  AdMetrics,
  CommunityAd,
  ReportReason,
} from '@/hooks/useCommunity';

export const REPORT_AGE_ALERT_HOURS = 20;

export function reportAgeTone(ageHours: number): 'danger' | 'normal' {
  return ageHours > REPORT_AGE_ALERT_HOURS ? 'danger' : 'normal';
}

export function fmtAge(ageHours: number): string {
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} min`;
  if (ageHours < 24) return `${Math.floor(ageHours)} h`;
  const d = Math.floor(ageHours / 24);
  const h = Math.floor(ageHours - d * 24);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  offensive: 'Ofensivo',
  spam: 'Spam',
  inappropriate: 'Inapropiado',
  other: 'Otro',
};

export interface AdFormValues {
  brand_name: string;
  body: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: string;
  starts_on: string;
  ends_on: string;
  image: File | null;
}
export type AdFormErrors = Partial<Record<keyof AdFormValues, string>>;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAdForm(v: AdFormValues): AdFormErrors {
  const e: AdFormErrors = {};
  if (!v.brand_name.trim()) e.brand_name = 'Ingresá la marca';
  if (v.body.length > 280) e.body = 'Máximo 280 caracteres';
  if (!v.cta_label.trim()) e.cta_label = 'Ingresá el texto del botón';
  if (!/^https?:\/\/\S+\.\S+/.test(v.cta_url.trim()))
    e.cta_url = 'Ingresá un link que empiece con https://';
  const fee = Number(v.monthly_fee_ars);
  if (v.monthly_fee_ars.trim() === '' || !Number.isFinite(fee) || fee < 0)
    e.monthly_fee_ars = 'Ingresá un monto válido';
  if (!v.starts_on) e.starts_on = 'Elegí la fecha de inicio';
  if (!v.ends_on) e.ends_on = 'Elegí la fecha de fin';
  else if (v.starts_on && v.ends_on < v.starts_on)
    e.ends_on = 'La fecha de fin es anterior al inicio';
  if (!v.image) e.image = 'Subí una imagen';
  else if (!IMAGE_TYPES.includes(v.image.type))
    e.image = 'La imagen debe ser JPG, PNG o WebP';
  return e;
}

export interface PublishFormValues {
  kind: 'announcement' | 'event';
  body: string;
  event_location: string;
  event_starts_at: string;
  pin: boolean;
}

export function validatePublishForm(
  v: PublishFormValues
): Partial<Record<keyof PublishFormValues, string>> {
  const e: Partial<Record<keyof PublishFormValues, string>> = {};
  if (!v.body.trim()) e.body = 'Escribí el texto';
  else if (v.body.length > 2000) e.body = 'Máximo 2000 caracteres';
  if (v.kind === 'event') {
    if (!v.event_location.trim()) e.event_location = 'Ingresá el lugar';
    if (!v.event_starts_at) e.event_starts_at = 'Elegí fecha y hora';
  }
  return e;
}

export function groupAds(ads: CommunityAd[]): {
  active: CommunityAd[];
  upcoming: CommunityAd[];
  ended: CommunityAd[];
} {
  return {
    active: ads.filter((a) => a.status === 'active'),
    upcoming: ads.filter((a) => a.status === 'upcoming'),
    ended: ads.filter((a) => a.status === 'expired' || a.status === 'archived'),
  };
}

export const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);
const PCT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function buildAdReport(ad: CommunityAd, m: AdMetrics): string {
  const ctr = m.views > 0 ? (m.clicks / m.views) * 100 : 0;
  return [
    `📊 Reporte de publicidad — ${ad.brand_name}`,
    `Período: ${ddmm(ad.starts_on)} al ${ddmm(ad.ends_on)}`,
    '',
    `👀 Vistas: ${fmtNum(m.views)}`,
    `👤 Alcance: ${fmtNum(m.reach)} personas`,
    `👉 Clics: ${fmtNum(m.clicks)} (${PCT.format(ctr)}%)`,
    '',
    'Comunidad TR-Fit',
  ].join('\n');
}

/** Backend error code from an axios error, if any. */
export function apiErrorCode(e: unknown): string | undefined {
  const data = (e as { response?: { data?: { error?: unknown } } })?.response
    ?.data;
  return typeof data?.error === 'string' ? data.error : undefined;
}
