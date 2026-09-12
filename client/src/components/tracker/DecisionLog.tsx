/**
 * Decision log — append-only, dated.
 *
 * There is no edit and no delete, by design on both sides: a log you can
 * quietly rewrite is not a log. Entries are grouped by day so the record
 * reads as a history rather than a list.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DecisionLogEntry } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { fieldClass, fieldStyle } from './Sheet';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function DecisionLog() {
  const { decisions, addDecision } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const record = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await addDecision(value);
      setText('');
    } catch (err) {
      pushToast({ title: 'Could not record', sub: String(err), icon: '⚠️', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Group by calendar day, newest first (the server already sorts desc).
  const groups: Array<{ label: string; entries: DecisionLogEntry[] }> = [];
  for (const entry of decisions) {
    const label = dayLabel(entry.decidedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="What did you decide, and why?"
          className={`${fieldClass} resize-y`}
          style={fieldStyle}
          aria-label="Record a decision"
        />
        <button
          type="button"
          onClick={record}
          disabled={busy || !text.trim()}
          className="self-end rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          Record
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        Append-only — entries cannot be edited or removed once recorded.
      </p>

      {decisions.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
          No decisions recorded yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {groups.map((group) => (
              <motion.div key={group.label} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h3
                  className="mb-1.5 text-xs font-bold uppercase tracking-wide"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {group.label}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-(--radius-card) border-l-2 py-1.5 pl-3 text-sm leading-snug"
                      style={{ borderColor: 'var(--color-primary)' }}
                    >
                      {entry.text}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
