/**
 * Noticing a quest that is already on the list.
 *
 * Two titles count as the same when they differ only in case, spacing, quote
 * style or a trailing full stop, bang, question mark or ellipsis. Anything
 * more than that ("Call the dentist" and "Call the dentist back") is a
 * different quest. Pure.
 */

/** The title with everything that does not change what it says taken out. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?\u2026]+$/, '')
    .trim();
}

/** The first of `existing` with the same title as `title`, or undefined. */
export function findDuplicate<T extends { title: string }>(title: string, existing: readonly T[]): T | undefined {
  const key = titleKey(title);
  if (!key) return undefined;
  return existing.find((q) => titleKey(q.title) === key);
}
