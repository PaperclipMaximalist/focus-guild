/**
 * How often a routine comes round: the client's copy of
 * server/src/lib/scheduler/repeat.ts (the two must agree). No rule = every day.
 */

export type RepeatRule =
  | { kind: 'weekly'; days: number[]; every?: number; from?: string }
  | { kind: 'interval'; every: number; from: string };

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Weekdays in the order the editor shows them, Monday first. 0 = Sunday. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's date on this device, "YYYY-MM-DD". */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayNumber(date: string): number {
  const m = DATE.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}
const weekdayOf = (n: number) => (((n + 4) % 7) + 7) % 7;
const mondayOf = (n: number) => n - ((weekdayOf(n) + 6) % 7);
const dateOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

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

/** "Every day", "Mon, Wed, Fri", "Every 2 weeks: Tue", "Every 3 days". */
export function describeRepeat(rule: RepeatRule | null | undefined): string {
  if (!rule) return 'Every day';
  if (rule.kind === 'interval') return `Every ${rule.every} days`;
  const days = WEEK.filter((d) => rule.days.includes(d)).map((d) => SHORT[d]).join(', ');
  const weekdays = rule.days.length === 5 && [1, 2, 3, 4, 5].every((d) => rule.days.includes(d));
  const named = weekdays ? 'Weekdays' : rule.days.length === 2 && rule.days.includes(0) && rule.days.includes(6) ? 'Weekends' : days;
  return (rule.every ?? 1) > 1 ? `Every ${rule.every} weeks: ${named}` : named;
}

/** The next date after `from` the routine comes round, as "Sun" (this week) or "12 Nov". */
export function nextLabel(rule: RepeatRule | null | undefined, from = todayKey()): string | null {
  const start = dayNumber(from);
  for (let i = 1; i <= 366; i += 1) {
    const date = dateOf(start + i);
    if (!repeatsOn(rule, date)) continue;
    if (i < 7) return i === 1 ? 'Tomorrow' : SHORT[weekdayOf(start + i)]!;
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  return null;
}
