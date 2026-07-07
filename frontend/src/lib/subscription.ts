// Pure helpers for the Suscripciones dashboard: "Vence el" urgency, sort key,
// and "paid this month" status. Kept side-effect free so they're unit-testable.

export type ExpiryUrgency =
  | 'infinity' // sin vencimiento (paid_until = infinity → null in JSON)
  | 'expired' // already past due
  | 'today' // VENCE HOY
  | 'tomorrow' // VENCE MAÑANA
  | 'soon' // within the grace window
  | 'later'; // comfortably in the future

export interface ExpiryInfo {
  urgency: ExpiryUrgency;
  /** Whole days until paid_until (negative if past). null when no due date. */
  daysLeft: number | null;
  /** Sort ascending: most-urgent (smallest) first. */
  sortKey: number;
}

const DAY_MS = 86_400_000;

/** Midnight (local) of the given instant, so "today" ignores the time-of-day. */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Classify a membership's paid_until for the dashboard.
 * @param paidUntil ISO string, or null for "sin vencimiento" (infinity/none).
 * @param now epoch ms (injectable for tests).
 */
export function expiryInfo(
  paidUntil: string | null | undefined,
  now: number = Date.now(),
): ExpiryInfo {
  if (paidUntil == null) {
    // infinity or no membership: never urgent, always sorts to the bottom.
    return { urgency: 'infinity', daysLeft: null, sortKey: Number.MAX_SAFE_INTEGER };
  }
  const due = new Date(paidUntil).getTime();
  if (Number.isNaN(due)) {
    return { urgency: 'infinity', daysLeft: null, sortKey: Number.MAX_SAFE_INTEGER };
  }
  // Compare on calendar-day boundaries so "VENCE HOY" is date-based, not exact time.
  const daysLeft = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  const urgency: ExpiryUrgency =
    daysLeft < 0
      ? 'expired'
      : daysLeft === 0
        ? 'today'
        : daysLeft === 1
          ? 'tomorrow'
          : daysLeft <= 7
            ? 'soon'
            : 'later';
  // Sort key = days until due; expired (negative) floats to the very top.
  return { urgency, daysLeft, sortKey: daysLeft };
}

/**
 * Has this membership been paid for the calendar month of `now`?
 * "Paid" = coverage reaches the end of the current month, i.e. paid_until is at
 * or after the first instant of next month. Infinity/no-due counts as paid.
 * A subscription that expires mid-month (paid_until inside this month) reads as
 * NOT paid — the coach still needs to collect this month's cuota to renew it.
 */
export function isPaidThisMonth(
  paidUntil: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (paidUntil == null) return true; // infinity / sin vencimiento
  const due = new Date(paidUntil).getTime();
  if (Number.isNaN(due)) return true;
  const n = new Date(now);
  const startNextMonth = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime();
  return due >= startNextMonth;
}

/** es-AR month label in caps, e.g. "JULIO". */
export function monthLabel(now: number = Date.now()): string {
  const s = new Date(now).toLocaleDateString('es-AR', { month: 'long' });
  return s.toUpperCase();
}
