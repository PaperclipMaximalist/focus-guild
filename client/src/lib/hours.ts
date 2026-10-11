/**
 * Reading a length of time the way a person jots one down.
 *
 * The hour log asks "how long?" in one field, and people answer that in half
 * a dozen ways. All of these are accepted, and the form shows what it
 * understood before anything is saved:
 *
 *   1.5      an hour and a half     (a small bare number is hours)
 *   45       forty-five minutes     (10 or more is minutes: nobody logs "45 hours")
 *   1:30     an hour and a half
 *   1h 30    1h30m, 1 h 30 min      the same
 *   90m      90 min
 *   2h       2 hours
 *
 * Returns whole minutes, or null when it can't tell (so the button stays off
 * rather than saving a guess).
 */

/** A day is the most one entry can hold; the server says the same. */
export const MAX_ENTRY_MINUTES = 24 * 60;

/** Bare numbers below this are hours, from it up they are minutes. */
const HOURS_BELOW = 10;

export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!text) return null;

  let minutes: number;
  const clock = text.match(/^(\d{1,2}):([0-5]?\d)$/);
  const worded = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    minutes = n < HOURS_BELOW ? n * 60 : n;
  } else if (worded && (worded[1] !== undefined || /m/.test(text))) {
    minutes = Number(worded[1] ?? 0) * 60 + Number(worded[2] ?? 0);
  } else {
    return null;
  }

  minutes = Math.round(minutes);
  return minutes >= 1 && minutes <= MAX_ENTRY_MINUTES ? minutes : null;
}

/** Local calendar day as `YYYY-MM-DD`, the form the server takes a date in. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Today", "Yesterday", or "Tue 6 Oct": a day as a diary would head it. */
export function dayLabel(key: string, now = new Date()): string {
  if (key === localDayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === localDayKey(y)) return 'Yesterday';
  const d = new Date(`${key}T12:00:00`);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
