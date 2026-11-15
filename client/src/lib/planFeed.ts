/**
 * The plan feed: the member's plan as a calendar another app can subscribe to.
 *
 * Its link carries a token of its own (`fgcal_…`) that can only read the plan.
 * Links made before November 2026 carried the personal access token instead,
 * which opens the whole account; those stopped working, and the server notes
 * when a calendar still asks with one (`oldFeedLinkSeenAt`).
 *
 * Pure; unit-tested.
 */

/** The address a calendar app subscribes to. `apiUrl` has no trailing slash. */
export function planFeedUrl(apiUrl: string, feedToken: string): string {
  return `${apiUrl}/calendar/${feedToken}.ics`;
}

/** "13 Nov 2026", in the member's own date format; null when the server sent nothing usable. */
export function oldLinkSeenDate(seenAt: string | null): string | null {
  if (!seenAt) return null;
  const at = new Date(seenAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
