import { describe, expect, it } from 'vitest';
import { buildIcsFeed, type FeedBlock } from './publish.js';
import { parseBusyEvents } from './ics.js';

const now = new Date('2026-09-19T12:00:00Z');

const blocks: FeedBlock[] = [
  {
    id: 'b1',
    start: new Date('2026-09-19T16:00:00Z'),
    end: new Date('2026-09-19T17:30:00Z'),
    type: 'work',
    title: 'EE lit review; part 2, with a comma',
    reason: 'Placed at the time of day you asked for',
  },
  { id: 'b2', start: new Date('2026-09-19T17:30:00Z'), end: new Date('2026-09-19T17:45:00Z'), type: 'break', title: 'Break' },
  { id: 'b3', start: new Date('2026-09-20T18:00:00Z'), end: new Date('2026-09-20T19:00:00Z'), type: 'fixed', title: 'Calendar: Chem HL' },
];

describe('buildIcsFeed', () => {
  const ics = buildIcsFeed(blocks, { calendarName: 'Focus Guild', now });

  it('is a well-formed calendar with CRLF endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('drops breaks but keeps work and calendar blocks', () => {
    expect(ics).toContain('EE lit review');
    expect(ics).toContain('Chem HL');
    expect(ics).not.toContain('SUMMARY:Break');
  });

  it('escapes separators and writes UTC stamps', () => {
    expect(ics).toContain(String.raw`SUMMARY:EE lit review\; part 2\, with a comma`);
    expect(ics).toContain('DTSTART:20260919T160000Z');
    expect(ics).toContain('DTEND:20260919T173000Z');
  });

  it('gives each block a stable uid so resubscribing updates in place', () => {
    expect(ics).toContain('UID:b1@focus-guild');
    expect(buildIcsFeed(blocks, { calendarName: 'Focus Guild', now: new Date('2026-10-01T00:00:00Z') })).toContain(
      'UID:b1@focus-guild',
    );
  });

  it('folds long lines to 75 octets without splitting a character', () => {
    const long = buildIcsFeed(
      [{ ...blocks[0]!, title: `Write the ${'very '.repeat(20)}long essay — ünïcödé` }],
      { calendarName: 'Focus Guild', now },
    );
    for (const line of long.split('\r\n')) expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75);
    // Every continuation line starts with a single space, and nothing is lost.
    expect(long).toContain('ünïcödé');
  });

  it('round-trips through our own ICS parser', () => {
    const parsed = parseBusyEvents(ics, new Date('2026-09-18T00:00:00Z'), new Date('2026-09-22T00:00:00Z'));
    expect(parsed.map((e) => e.title)).toEqual(['EE lit review; part 2, with a comma', 'Calendar: Chem HL']);
    expect(parsed[0]!.start.toISOString()).toBe('2026-09-19T16:00:00.000Z');
  });

  it('produces a valid empty calendar when there is no plan', () => {
    const empty = buildIcsFeed([], { calendarName: 'Focus Guild', now });
    expect(empty).toContain('BEGIN:VCALENDAR');
    expect(empty).not.toContain('BEGIN:VEVENT');
  });
});
