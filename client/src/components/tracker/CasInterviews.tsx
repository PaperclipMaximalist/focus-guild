/**
 * The three CAS interviews.
 *
 * Fixed slots, not a list: there are exactly three, they are ordered, and they
 * are addressed by ordinal on the server. So the UI shows three cards that are
 * always present and simply unfilled until they happen.
 *
 * Notes save on blur rather than behind a Save button — an interview note is a
 * scratchpad, and a save step on a scratchpad is friction that loses text.
 */

import { useEffect, useState } from 'react';
import type { CasInterview } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { fieldClass, fieldStyle } from './Sheet';

const TITLES: Record<number, { name: string; when: string }> = {
  1: { name: 'First interview', when: 'Early — at the start of the programme' },
  2: { name: 'Second interview', when: 'Midway — a progress check' },
  3: { name: 'Third interview', when: 'Final — reviewing the whole portfolio' },
};

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0).toISOString();
}

function InterviewCard({ interview }: { interview: CasInterview }) {
  const updateInterview = useTrackerStore((s) => s.updateInterview);
  const pushToast = useToastStore((s) => s.push);
  const [notes, setNotes] = useState(interview.notes ?? '');
  const meta = TITLES[interview.ordinal] ?? { name: `Interview ${interview.ordinal}`, when: '' };

  // Re-sync if the row changes underneath (e.g. a CAS refresh).
  useEffect(() => {
    setNotes(interview.notes ?? '');
  }, [interview.notes]);

  const save = async (fields: { date?: string | null; notes?: string | null }) => {
    try {
      await updateInterview(interview.ordinal as 1 | 2 | 3, fields);
    } catch (err) {
      pushToast({ title: 'Could not save', sub: String(err), icon: '⚠️', variant: 'error' });
    }
  };

  const done = Boolean(interview.date);

  return (
    <div
      className="rounded-(--radius-card) border p-3.5"
      style={{
        borderColor: done ? 'rgba(34,197,94,0.4)' : 'var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold">{meta.name}</h3>
        <span className="text-xs font-semibold" style={{ color: done ? 'var(--color-green)' : 'var(--color-muted)' }}>
          {done ? '✓ held' : 'not yet held'}
        </span>
      </div>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted)' }}>
        {meta.when}
      </p>

      <input
        type="date"
        value={toDateInput(interview.date)}
        onChange={(e) => save({ date: fromDateInput(e.target.value) })}
        aria-label={`Date of ${meta.name}`}
        className={`${fieldClass} mt-2.5`}
        style={fieldStyle}
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== (interview.notes ?? '')) save({ notes: notes.trim() || null });
        }}
        rows={3}
        placeholder="What was discussed…"
        aria-label={`Notes for ${meta.name}`}
        className={`${fieldClass} mt-2 resize-y`}
        style={fieldStyle}
      />
    </div>
  );
}

export function CasInterviews({ interviews }: { interviews: CasInterview[] }) {
  // Always render three slots, even if a row hasn't been created yet.
  const byOrdinal = new Map(interviews.map((i) => [i.ordinal, i]));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        Interviews
      </h2>
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((ordinal) => (
          <InterviewCard
            key={ordinal}
            interview={
              byOrdinal.get(ordinal) ?? { id: `pending-${ordinal}`, ordinal, date: null, notes: null }
            }
          />
        ))}
      </div>
    </section>
  );
}
