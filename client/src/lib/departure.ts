/**
 * The status column of the board.
 *
 * A station board says one thing about each train: on time, boarding, late.
 * These turn a quest or a planned block into that one word. Rules:
 *   - the word is always true of the data it was given (no "on time" for
 *     something already overdue);
 *   - the tone only repeats the word, so nothing depends on colour alone.
 */

export type Tone = 'ok' | 'now' | 'warn' | 'late' | 'dim';

export interface Status {
  label: string;
  tone: Tone;
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--color-green)',
  now: 'var(--color-primary)',
  warn: 'var(--color-gold)',
  late: 'var(--color-fire)',
  dim: 'var(--color-muted)',
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** How late, in the largest unit that fits: "128d late", "5h late", "20m late". */
function lateBy(ms: number): string {
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d late`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h late`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m late`;
}

/** A quest on a list: where it stands against its own deadline. */
export function questStatus(deadline: string | Date | null | undefined, now: number = Date.now()): Status {
  if (!deadline) return { label: 'Open', tone: 'dim' };
  const due = new Date(deadline).getTime();
  if (due < now) return { label: lateBy(now - due), tone: 'late' };
  if (sameLocalDay(due, now)) return { label: 'Due today', tone: 'warn' };
  if (sameLocalDay(due, now + DAY)) return { label: 'Tomorrow', tone: 'warn' };
  return { label: 'On time', tone: 'ok' };
}

/** A planned block on the route: where it stands against the clock. */
export function blockStatus(
  block: { start: string; end: string; type: string },
  questDeadline: string | Date | null | undefined,
  now: number = Date.now(),
): Status {
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  if (end <= now) return { label: 'Departed', tone: 'dim' };
  if (start <= now) return { label: 'Boarding', tone: 'now' };
  if (block.type === 'fixed') return { label: 'Round', tone: 'dim' };
  // The quest is already past its deadline, or this block finishes after it.
  if (questDeadline) {
    const due = new Date(questDeadline).getTime();
    if (due < now) return { label: lateBy(now - due), tone: 'late' };
    if (due < end) return { label: 'Runs late', tone: 'late' };
  }
  return { label: 'On time', tone: 'ok' };
}
