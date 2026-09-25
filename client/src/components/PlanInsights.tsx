/**
 * What the plan can't say on its own: overdue quests that fell out of it,
 * routines crowding out quest time, an undated backlog's real pace, working
 * hours that don't fit the user's calendar, and how estimates are running.
 *
 * Plain notes, no alarms. The one actionable card — a better set of working
 * hours — applies with a tap and can be dismissed for good.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PlanInsights as Insights } from '../lib/api';
import { useToastStore } from './Toasts';
import { Clock, Hourglass, LifeBuoy, Lightbulb, X } from 'lucide-react';

const DISMISS_KEY = 'fg.feed.hoursSuggestionDismissed';

const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function PlanInsights({ insights, onChanged }: { insights: Insights | null; onChanged: () => void }) {
  const pushToast = useToastStore((s) => s.push);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const [busy, setBusy] = useState(false);
  if (!insights) return null;

  const s = insights.hoursSuggestion;
  const suggestionKey = s ? `${s.startHour}-${s.endHour}` : null;
  const showSuggestion = s && suggestionKey !== dismissed;
  if (!insights.notes.length && !showSuggestion) return null;

  const applyHours = async () => {
    if (!s) return;
    setBusy(true);
    try {
      // PUT /settings replaces the whole override set: merge, don't clobber.
      const { overrides } = await api.settings.get();
      await api.settings.save({ ...overrides, workingHours: { startHour: s.startHour, endHour: s.endHour } });
      pushToast({ title: 'Working hours updated', sub: `${fmt(s.startHour)}–${fmt(s.endHour)} · replanning`, icon: Clock, variant: 'xp' });
      onChanged();
    } catch (err) {
      pushToast({ title: 'Could not update hours', sub: String(err), icon: X, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      if (suggestionKey) localStorage.setItem(DISMISS_KEY, suggestionKey);
    } catch {
      /* the card just comes back next time */
    }
    setDismissed(suggestionKey);
  };

  const iconFor = (note: string) =>
    /overdue/i.test(note) ? LifeBuoy : /weeks|no time this week/i.test(note) ? Hourglass : /estimates/i.test(note) ? Clock : Lightbulb;

  return (
    <section className="mb-3 flex flex-col gap-2" aria-label="About this plan">
      {showSuggestion && s && (
        <div className="rounded-(--radius-card) border p-3" style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            Plan {fmt(s.startHour)}–{fmt(s.endHour)} instead?
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted)' }}>
            {s.reason}, so most of your working hours are already taken.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={applyHours}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              {busy ? 'Updating…' : 'Use these hours'}
            </button>
            <button type="button" onClick={dismiss} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      {insights.notes.map((note) => {
        const Icon = iconFor(note);
        const overdue = /overdue/i.test(note);
        return (
          <div
            key={note}
            className="flex items-start gap-2.5 rounded-(--radius-card) border px-3 py-2.5 text-xs leading-snug"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <Icon size={15} aria-hidden className="mt-px shrink-0" style={{ color: overdue ? 'var(--color-gold)' : 'var(--color-muted)' }} />
            <span className="flex-1">{note}</span>
            {overdue && (
              <Link to="/rescue" className="shrink-0 font-bold" style={{ color: 'var(--color-primary)' }}>
                Rescue
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
