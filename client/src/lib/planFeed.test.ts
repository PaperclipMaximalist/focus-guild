import { describe, expect, it } from 'vitest';
import { addToGoogleUrl } from './googleCalendar';
import { oldLinkSeenDate, planFeedUrl } from './planFeed';

describe('planFeedUrl', () => {
  it('puts the feed token, and nothing else, in the calendar address', () => {
    expect(planFeedUrl('https://api.example.com', 'fgcal_abc')).toBe('https://api.example.com/calendar/fgcal_abc.ics');
  });

  it('is the address Google is asked to add', () => {
    expect(addToGoogleUrl(planFeedUrl('https://api.example.com', 'fgcal_abc'))).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fapi.example.com%2Fcalendar%2Ffgcal_abc.ics',
    );
  });
});

describe('oldLinkSeenDate', () => {
  it('names the day, with its year', () => {
    expect(oldLinkSeenDate(new Date(2026, 10, 13, 12).toISOString())).toMatch(/13.*2026|2026.*13/);
  });

  it('is null when no old link has been seen, or the date is unreadable', () => {
    expect(oldLinkSeenDate(null)).toBeNull();
    expect(oldLinkSeenDate('nonsense')).toBeNull();
  });
});
