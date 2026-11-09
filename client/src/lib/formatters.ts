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

export function formatDeadline(deadline: string | Date | null): string {
  if (!deadline) return 'no deadline';
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 7) return `due in ${days}d`;
  // "Fri, Nov 13", with the year only when it is not this one: never a bare 11/13/2026.
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
