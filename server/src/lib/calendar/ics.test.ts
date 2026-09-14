import { describe, expect, it } from 'vitest';
import { eventsToFixedBlocks, isCalendarBlock, normaliseFeedUrl, parseBusyEvents } from './ics.js';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VTIMEZONE',
  'TZID:America/Vancouver',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
  // Weekly Chem lesson Mon 09:00-10:15 Vancouver, one week cancelled via EXDATE.
  'BEGIN:VEVENT',
  'UID:chem-1',
  'DTSTAMP:20260901T000000Z',
  'DTSTART;TZID=America/Vancouver:20260907T090000',
  'DTEND;TZID=America/Vancouver:20260907T101500',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'EXDATE;TZID=America/Vancouver:20260914T090000',
  'SUMMARY:Chem HL',
  'END:VEVENT',
  // One-off meeting in UTC.
  'BEGIN:VEVENT',
  'UID:mtg-1',
  'DTSTAMP:20260901T000000Z',
  'DTSTART:20260909T200000Z',
  'DTEND:20260909T203000Z',
  'SUMMARY:Teams: EE check-in',
  'END:VEVENT',
  // Should all be skipped: all-day, show-as-free, cancelled.
  'BEGIN:VEVENT',
  'UID:allday-1',
  'DTSTAMP:20260901T000000Z',
  'DTSTART;VALUE=DATE:20260910',
  'DTEND;VALUE=DATE:20260911',
  'SUMMARY:Spirit day',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:free-1',
  'DTSTAMP:20260901T000000Z',
  'DTSTART:20260910T180000Z',
  'DTEND:20260910T190000Z',
  'TRANSP:TRANSPARENT',
  'SUMMARY:Maybe gym',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancel-1',
  'DTSTAMP:20260901T000000Z',
  'DTSTART:20260911T180000Z',
  'DTEND:20260911T190000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Called off',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const FROM = new Date('2026-09-01T00:00:00Z');
const TO = new Date('2026-10-15T00:00:00Z');

describe('parseBusyEvents', () => {
  const events = parseBusyEvents(ICS, FROM, TO);

  it('expands recurrence, honours EXDATE, and keeps one-offs', () => {
    expect(events.map((e) => e.title)).toEqual(['Chem HL', 'Teams: EE check-in', 'Chem HL', 'Chem HL']);
  });

  it('converts TZID times to the right instant (09:00 PDT = 16:00Z)', () => {
    expect(events[0]!.start.toISOString()).toBe('2026-09-07T16:00:00.000Z');
    expect(events[0]!.end.toISOString()).toBe('2026-09-07T17:15:00.000Z');
  });

  it('skips all-day, transparent and cancelled events', () => {
    const titles = events.map((e) => e.title);
    expect(titles).not.toContain('Spirit day');
    expect(titles).not.toContain('Maybe gym');
    expect(titles).not.toContain('Called off');
  });

  it('gives each recurrence instance its own uid', () => {
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  });

  it('respects the window', () => {
    const narrow = parseBusyEvents(ICS, new Date('2026-09-20T00:00:00Z'), new Date('2026-09-24T00:00:00Z'));
    expect(narrow).toHaveLength(1);
    expect(narrow[0]!.start.toISOString()).toBe('2026-09-21T16:00:00.000Z');
  });

  it('survives garbage without throwing', () => {
    expect(parseBusyEvents('not a calendar', FROM, TO)).toEqual([]);
  });
});

describe('eventsToFixedBlocks', () => {
  it('drops past events and tags the rest as calendar fixed blocks', () => {
    const now = new Date('2026-09-08T00:00:00Z').getTime();
    const blocks = eventsToFixedBlocks(
      [
        { id: 'a', title: 'Past', start: new Date('2026-09-07T16:00:00Z'), end: new Date('2026-09-07T17:00:00Z') },
        { id: 'b', title: 'Chem HL', start: new Date('2026-09-21T16:00:00Z'), end: new Date('2026-09-21T17:15:00Z') },
      ],
      now,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: 'cal:b', type: 'fixed', locked: true, note: 'Calendar: Chem HL', taskId: null });
    expect(isCalendarBlock(blocks[0]!)).toBe(true);
    expect(isCalendarBlock({ type: 'fixed', note: 'Daily: Meds' })).toBe(false);
  });
});

describe('normaliseFeedUrl', () => {
  it('turns webcal into https', () => {
    expect(normaliseFeedUrl('webcal://example.com/cal.ics')).toEqual({ url: 'https://example.com/cal.ics' });
  });

  it('refuses http, private hosts and junk', () => {
    expect(normaliseFeedUrl('http://example.com/a.ics')).toHaveProperty('error');
    expect(normaliseFeedUrl('https://localhost/a.ics')).toHaveProperty('error');
    expect(normaliseFeedUrl('https://192.168.1.4/a.ics')).toHaveProperty('error');
    expect(normaliseFeedUrl('https://[::1]/a.ics')).toHaveProperty('error');
    expect(normaliseFeedUrl('nope')).toHaveProperty('error');
  });
});
