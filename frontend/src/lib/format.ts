const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function fmtARS(value: number | null | undefined): string {
  if (value == null) return '—';
  return ARS.format(value);
}

const SHORT_DATE = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
});

export function fmtShortDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return SHORT_DATE.format(d).replace('.', '');
}

export function fmtTimeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} m`;
  return `${Math.floor(months / 12)} a`;
}

export function fmtDelta(
  value: number,
  opts: { suffix?: string; digits?: number } = {},
): string {
  const { suffix = '', digits = 1 } = opts;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${suffix}`;
}
