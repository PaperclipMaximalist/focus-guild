/**
 * Connecting Google Calendar, the parts that can be decided without a network.
 *
 * The Guild reads a calendar through its iCal address: no Google sign-in, no
 * permissions screen, nothing that expires. The one hard part for a person is
 * copying the right link out of Google's settings, because that page shows
 * four addresses that look alike and the browser's own address bar is a
 * fifth. `checkFeedLink` tells them apart before anything is sent, so the
 * mistake is named while the settings page is still open in the other tab.
 *
 * The other direction (the plan shown in Google Calendar) is a subscription
 * to the Guild's plan feed; `addToGoogleUrl` opens Google's own "add this
 * calendar?" page for it.
 *
 * Pure; unit-tested.
 */

/** Settings, where each calendar's "Integrate calendar" section lives. */
export const GOOGLE_SETTINGS_URL = 'https://calendar.google.com/calendar/u/0/r/settings';

export type FeedCheck =
  /** `note` is something worth knowing even though the link will work. */
  | { ok: true; google: boolean; note?: string }
  | { ok: false; problem: string };

const WHERE = 'In Google Calendar settings, pick the calendar, find “Integrate calendar”, and copy “Secret address in iCal format”.';

export function checkFeedLink(raw: string): FeedCheck {
  const text = raw.trim();
  if (!text) return { ok: false, problem: '' };
  // A calendar ID is an email address (or ends in @group.calendar.google.com).
  if (!/^[a-z]+:\/\//i.test(text) && /^[^\s/]+@[^\s/]+\.[^\s/]+$/.test(text)) {
    return { ok: false, problem: `That is the calendar ID, not its link. The link is a little further down the same section. ${WHERE}` };
  }
  let u: URL;
  try {
    u = new URL(text.replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return { ok: false, problem: 'That is not a link. It starts with https://calendar.google.com/calendar/ical/' };
  }
  if (u.protocol !== 'https:') return { ok: false, problem: 'The link has to start with https:// or webcal://.' };

  const google = u.hostname.toLowerCase() === 'calendar.google.com';
  if (!google) return { ok: true, google: false };

  const path = u.pathname;
  if (path.startsWith('/calendar/ical/') && path.endsWith('.ics')) {
    if (path.includes('/public/')) {
      return {
        ok: true,
        google: true,
        note: 'This is the public address. It only works while the calendar is shared with everyone; the secret address just below it works either way.',
      };
    }
    return { ok: true, google: true };
  }
  if (path.startsWith('/calendar/embed')) {
    return { ok: false, problem: `That is the link for embedding the calendar in a web page. ${WHERE}` };
  }
  return { ok: false, problem: `That is the address of the Google Calendar page itself. ${WHERE}` };
}

/** Is a connected calendar a Google one? `host` is the masked form the API returns. */
export function isGoogleSource(host: string): boolean {
  return host.toLowerCase().startsWith('calendar.google.com');
}

/** Google's "Add calendar" page for a feed. It asks before adding anything. */
export function addToGoogleUrl(feedUrl: string): string {
  const webcal = feedUrl.replace(/^https?:\/\//i, 'webcal://');
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
}
