/**
 * The other direction: publish the plan as an ICS feed.
 *
 * Subscribing to this in Google/Outlook/Apple puts your quest blocks in the
 * calendar you already look at, with its reminders. Read-only and one-way —
 * editing there changes nothing here, which is why every event says so.
 *
 * Pure: callers pass the blocks and the clock.
 */

export interface FeedBlock {
  id: string;
  start: Date;
  end: Date;
  /** 'work' | 'break' | 'fixed' | 'buffer', as stored. */
  type: string;
  title: string;
  reason?: string | null;
}

/** RFC 5545 date-time in UTC: 20260913T160000Z. */
function stamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets per line, continuations starting with one space.
 * Measured in bytes, not characters, or a long title with an em dash breaks
 * mid-codepoint in strict parsers.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte character: back up off continuation bytes.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    parts.push((start === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // the leading space counts
  }
  return parts.join('\r\n');
}

export interface FeedOptions {
  calendarName: string;
  now: Date;
  /** Skip breaks and buffers; most people only want the real commitments. */
  workOnly?: boolean;
}

export function buildIcsFeed(blocks: FeedBlock[], opts: FeedOptions): string {
  const wanted = blocks.filter((b) => {
    if (opts.workOnly !== false && (b.type === 'break' || b.type === 'buffer')) return false;
    return b.end > b.start;
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Focus Guild//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.calendarName)}`,
    'X-PUBLISHED-TTL:PT30M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
  ];

  for (const b of wanted) {
    const description =
      b.type === 'fixed'
        ? 'From one of your connected calendars.'
        : `${b.reason ? `${b.reason}. ` : ''}Planned by Focus Guild. Changes here do not reach the Guild.`;
    lines.push(
      'BEGIN:VEVENT',
      // Stable per block so a resubscribe updates rather than duplicates.
      `UID:${esc(b.id)}@focus-guild`,
      `DTSTAMP:${stamp(opts.now)}`,
      `DTSTART:${stamp(b.start)}`,
      `DTEND:${stamp(b.end)}`,
      `SUMMARY:${esc(b.title)}`,
      `DESCRIPTION:${esc(description)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
