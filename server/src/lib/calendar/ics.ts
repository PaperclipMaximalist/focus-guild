/**
 * ICS feed → busy intervals, and busy intervals → scheduler fixed blocks.
 *
 * Pure: no fetch, no DB, no clock. `node-ical` parses and expands recurrence
 * (RRULE, EXDATE, RECURRENCE-ID overrides, TZID); this module decides which
 * instances count as busy time.
 *
 * Skipped on purpose:
 *   - all-day events (birthdays, "Exam week") usually don't block the clock
 *   - TRANSP:TRANSPARENT ("show as free") and STATUS:CANCELLED
 */

import ical from 'node-ical';
import type { Block } from '../scheduler/types.js';

export interface BusyEvent {
  /** Stable per instance: base UID + instance start, so recurrences don't collide. */
  uid: string;
  title: string;
  start: Date;
  end: Date;
}

/** Block notes carry this prefix so replans can swap in fresh calendar blocks. */
export const CALENDAR_NOTE_PREFIX = 'Calendar: ';

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val);
  return '';
}

export function parseBusyEvents(icsBody: string, from: Date, to: Date): BusyEvent[] {
  const parsed = ical.sync.parseICS(icsBody);
  const out: BusyEvent[] = [];
  for (const comp of Object.values(parsed)) {
    if (!comp || comp.type !== 'VEVENT') continue;
    // Overrides are applied through their base event's expansion.
    if ('recurrenceid' in comp && comp.recurrenceid) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(comp, { from, to, expandOngoing: true });
    } catch {
      continue; // one malformed event must not sink the whole feed
    }
    for (const inst of instances) {
      const ev = inst.event;
      if (inst.isFullDay) continue;
      if (ev.transparency === 'TRANSPARENT' || ev.status === 'CANCELLED') continue;
      const start = new Date(inst.start);
      const end = new Date(inst.end ?? inst.start);
      if (!(end > start) || end <= from || start >= to) continue;
      out.push({
        uid: `${comp.uid}@${start.toISOString()}`,
        title: text(inst.summary).trim() || 'Busy',
        start,
        end,
      });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Busy events as immovable scheduler blocks. Overlapping events are kept as
 * separate blocks; the planner only needs to know the time is taken.
 */
export function eventsToFixedBlocks(
  events: Array<{ id: string; title: string; start: Date; end: Date }>,
  now: number,
): Block[] {
  return events
    .filter((e) => e.end.getTime() > now)
    .map((e) => ({
      id: `cal:${e.id}`,
      start: e.start.getTime(),
      end: e.end.getTime(),
      type: 'fixed' as const,
      taskId: null,
      locked: true,
      note: `${CALENDAR_NOTE_PREFIX}${e.title}`,
    }));
}

export function isCalendarBlock(b: Pick<Block, 'type' | 'note'>): boolean {
  return b.type === 'fixed' && (b.note?.startsWith(CALENDAR_NOTE_PREFIX) ?? false);
}

/**
 * Accept https and webcal links only, and refuse obvious internal targets so a
 * pasted URL can't make the server probe its own network.
 */
export function normaliseFeedUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return { error: 'That is not a valid link.' };
  }
  if (u.protocol !== 'https:') return { error: 'Use an https:// or webcal:// calendar link.' };
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.startsWith('[') ||
    /^\d+$/.test(host);
  if (privateHost) return { error: 'That link points at a private address.' };
  return { url: u.toString() };
}
