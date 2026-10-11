import { describe, expect, it } from 'vitest';
import { addToGoogleUrl, checkFeedLink, isGoogleSource } from './googleCalendar';

const SECRET = 'https://calendar.google.com/calendar/ical/someone%40gmail.com/private-0123456789abcdef/basic.ics';

describe('checking a pasted calendar link', () => {
  it('accepts the secret iCal address', () => {
    expect(checkFeedLink(`  ${SECRET}  `)).toEqual({ ok: true, google: true });
    expect(checkFeedLink(SECRET.replace('https://', 'webcal://'))).toEqual({ ok: true, google: true });
  });

  it('accepts the public address, with a word about when it works', () => {
    const r = checkFeedLink('https://calendar.google.com/calendar/ical/someone%40gmail.com/public/basic.ics');
    expect(r).toMatchObject({ ok: true, google: true });
    expect(r.ok && r.note).toMatch(/public address/);
  });

  it('names each of the links people copy by mistake', () => {
    const problem = (s: string) => {
      const r = checkFeedLink(s);
      return r.ok ? '' : r.problem;
    };
    expect(problem('https://calendar.google.com/calendar/u/0/r/settings/calendar/c29tZW9uZQ')).toMatch(/page itself/);
    expect(problem('https://calendar.google.com/calendar/u/0/r')).toMatch(/page itself/);
    expect(problem('https://calendar.google.com/calendar/embed?src=someone%40gmail.com&ctz=Europe%2FLondon')).toMatch(/embedding/);
    expect(problem('someone@gmail.com')).toMatch(/calendar ID/);
    expect(problem('abc123@group.calendar.google.com')).toMatch(/calendar ID/);
    expect(problem('my calendar')).toMatch(/not a link/);
    expect(problem('http://calendar.google.com/calendar/ical/x/private-y/basic.ics')).toMatch(/https/);
  });

  it('says nothing about an empty box', () => {
    expect(checkFeedLink('   ')).toEqual({ ok: false, problem: '' });
  });

  it('lets any other iCal link through, as not Google', () => {
    expect(checkFeedLink('https://outlook.office365.com/owa/calendar/abc/def/calendar.ics')).toEqual({ ok: true, google: false });
    expect(checkFeedLink('webcal://p01-caldav.icloud.com/published/2/abc')).toEqual({ ok: true, google: false });
  });
});

describe('the other direction', () => {
  it('recognises a connected Google calendar from its masked host', () => {
    expect(isGoogleSource('calendar.google.com/…ic.ics')).toBe(true);
    expect(isGoogleSource('outlook.office365.com/…ar.ics')).toBe(false);
  });

  it("builds Google's add-calendar link for the plan feed", () => {
    expect(addToGoogleUrl('https://api.example.com/calendar/fg_abc.ics')).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fapi.example.com%2Fcalendar%2Ffg_abc.ics',
    );
  });
});
