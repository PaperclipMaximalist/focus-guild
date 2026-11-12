/**
 * How often a routine comes round. A routine with no rule repeats every day
 * (what every routine did before 2026-10-19, when the owner asked for
 * "custom/weekly recurring tasks"). Otherwise:
 *
 *   weekly    on the given weekdays (0 = Sunday … 6 = Saturday), every week
 *             or every `every` weeks counted from the week of `from`;
 *   interval  every `every` days, counted from `from`.
 *
 * Dates are the user's own calendar dates, "YYYY-MM-DD". Pure: no clock.
 */

export type RepeatRule =
  | { kind: 'weekly'; days: number[]; every?: number; from?: string }
  | { kind: 'interval'; every: number; from: string };

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a calendar date, or NaN. */
function dayNumber(date: string): number {
  const m = DATE.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** 0 = Sunday … 6 = Saturday. (1970-01-01, day 0, was a Thursday.) */
function weekdayOf(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

/** The Monday on or before day `n`. */
function mondayOf(n: number): number {
  return n - ((weekdayOf(n) + 6) % 7);
}

/** Does a routine with this rule come round on `date`? No rule = every day. */
export function repeatsOn(rule: RepeatRule | null | undefined, date: string): boolean {
  if (!rule) return true;
  const n = dayNumber(date);
  if (!Number.isFinite(n)) return true;
  if (rule.kind === 'weekly') {
    if (!rule.days.includes(weekdayOf(n))) return false;
    const every = Math.max(1, Math.floor(rule.every ?? 1));
    if (every === 1) return true;
    const from = dayNumber(rule.from ?? '');
    if (!Number.isFinite(from)) return true;
    const weeks = Math.round((mondayOf(n) - mondayOf(from)) / 7);
    return weeks >= 0 && weeks % every === 0;
  }
  const from = dayNumber(rule.from);
  const every = Math.max(1, Math.floor(rule.every));
  if (!Number.isFinite(from)) return true;
  const diff = n - from;
  return diff >= 0 && diff % every === 0;
}

/**
 * A stored value as a rule, or null for "every day". Anything malformed is
 * read as every day rather than never: a routine that silently stops coming
 * round is worse than one that comes round too often.
 */
export function parseRepeat(value: unknown): RepeatRule | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const every = typeof v.every === 'number' && Number.isFinite(v.every) ? Math.floor(v.every) : undefined;
  const from = typeof v.from === 'string' && DATE.test(v.from) ? v.from : undefined;
  if (v.kind === 'weekly' && Array.isArray(v.days)) {
    const days = [...new Set(v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!days.length || days.length === 7 && (every ?? 1) === 1) return null;
    return { kind: 'weekly', days, ...(every && every > 1 ? { every: Math.min(every, 8) } : {}), ...(from ? { from } : {}) };
  }
  if (v.kind === 'interval' && every && from) {
    if (every <= 1) return null;
    return { kind: 'interval', every: Math.min(every, 90), from };
  }
  return null;
}
