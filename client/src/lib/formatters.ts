export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * When something next happens, in words: "today at 4:00 PM", "tomorrow at
 * 9:00 AM", "Monday at 9:00 AM", or "Nov 20 at 9:00 AM" a week or more out.
 */
export function formatDayAndTime(at: string | Date, now: Date = new Date()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Rounded, so a daylight-saving change (a 23 or 25 hour day) still counts as one day.
  const days = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  const day =
    days <= 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days < 7
          ? d.toLocaleDateString(undefined, { weekday: 'long' })
          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

const timeOf = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** An hour of the day as the member's clock writes it: 8 -> "8:00 AM" (or "08:00" where that is the custom). */
export function formatHour(hour: number): string {
  return timeOf(new Date(2000, 0, 1, Math.floor(hour), Math.round((hour % 1) * 60)));
}

/** "Fri, Nov 13", with the year only when it is not this one: never a bare 11/13/2026. */
function shortDate(d: Date, now: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * A deadline in words, counted in calendar days of local time: "due today
 * 9:00 PM", "due tomorrow 8:30 AM", "due Fri", "Fri, Nov 20", or how late
 * it is ("20m late", "5h late", "3d late") once it has passed.
 */
export function formatDeadline(deadline: string | Date | null, now: Date = new Date()): string {
  if (!deadline) return 'no deadline';
  const d = new Date(deadline);
  const ms = now.getTime() - d.getTime();
  if (ms > 0) {
    const mins = Math.max(1, Math.floor(ms / 60_000));
    if (mins < 60) return `${mins}m late`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h late`;
    return `${Math.floor(hours / 24)}d late`;
  }
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Rounded, so a daylight-saving change (a 23 or 25 hour day) still counts as one day.
  const days = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  // A day with no time of its own (the editor's dates) needs no clock beside it.
  const clock = isEndOfDay(d) ? '' : ` ${timeOf(d)}`;
  if (days <= 0) return `due today${clock}`;
  if (days === 1) return `due tomorrow${clock}`;
  if (days < 7) return `due ${d.toLocaleDateString(undefined, { weekday: 'short' })}`;
  return shortDate(d, now);
}

/**
 * The editor sets a date with no time to 23:59 of that day: "by the end of
 * the day". Such a deadline is a day, not a moment, and is written as one.
 */
export function isEndOfDay(d: Date): boolean {
  return d.getHours() === 23 && d.getMinutes() === 59;
}

/** The full stamp for places with room: "Fri, Nov 13 at 9:00 PM", or "Fri, Nov 13" for a whole day. */
export function formatDeadlineExact(deadline: string | Date, now: Date = new Date()): string {
  const d = new Date(deadline);
  return isEndOfDay(d) ? shortDate(d, now) : `${shortDate(d, now)} at ${timeOf(d)}`;
}
