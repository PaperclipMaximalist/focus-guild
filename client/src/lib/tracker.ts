/**
 * Shared tracker presentation helpers — strand palette, date-input conversion,
 * due-date wording and error-toast mapping. One copy each, so the CAS lens,
 * the item sheet and the cards can't drift apart.
 */

import type { LucideIcon } from 'lucide-react';
import { ApiRequestError, type CasStrand } from './api';
import { BrickWall, Footprints, TriangleAlert } from 'lucide-react';

export const STRAND_COLOR: Record<CasStrand, string> = {
  creativity: '#a855f7',
  activity: '#22c55e',
  service: '#3b82f6',
};

export const STRAND_LABEL: Record<CasStrand, string> = {
  creativity: 'Creativity',
  activity: 'Activity',
  service: 'Service',
};

/** `<input type="date">` wants YYYY-MM-DD in local time, not an ISO instant. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Midday local, so a timezone shift can't roll the date onto the day before. */
export function fromDateInput(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function formatDue(due: string | null): { text: string; urgent: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  // Compare calendar days, not 24h windows, so "tomorrow" means tomorrow.
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(today)) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, urgent: true };
  if (days === 0) return { text: 'due today', urgent: true };
  if (days === 1) return { text: 'due tomorrow', urgent: false };
  if (days < 7) return { text: `due in ${days}d`, urgent: false };
  return {
    text: `due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    urgent: false,
  };
}

/**
 * Toast copy for a failed tracker write. The two rule violations get their
 * own headline; the server's message is already written for humans, so it
 * is shown as-is rather than paraphrased.
 */
export function trackerErrorToast(err: unknown): { title: string; sub: string; icon: LucideIcon } {
  if (err instanceof ApiRequestError) {
    if (err.code === 'ACTIVE_CAP_REACHED') {
      return { title: 'Active cap reached', sub: err.detail, icon: BrickWall };
    }
    if (err.code === 'NEXT_ACTION_REQUIRED') {
      return { title: 'Needs a next action', sub: err.detail, icon: Footprints };
    }
    return { title: 'That did not save', sub: err.detail, icon: TriangleAlert };
  }
  return { title: 'That did not save', sub: String(err), icon: TriangleAlert };
}
