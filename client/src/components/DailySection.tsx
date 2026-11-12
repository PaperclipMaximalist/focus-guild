/**
 * DailySection — list of recurring quests with today's check-off state.
 * Routines that don't come round today (weekly, every few days) are listed
 * after them, quietly, with the day they next do.
 *
 * Each row:
 *  - Title + preferredHour badge
 *  - Estimated minutes
 *  - tick button when not done; subtle "Done today" state once completed
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { useCompleteQuest } from '../lib/useCompleteQuest';
import { formatHour } from '../lib/formatters';
import { type Quest } from '../lib/api';
import { describeRepeat, nextLabel, repeatsOn, todayKey } from '../lib/repeat';
import { CalendarClock, Check, Pencil, Repeat, Trash2 } from 'lucide-react';

interface Props {
  onEdit: (q: Quest) => void;
}

export function DailySection({ onEdit }: Props) {
  const { recurring, removeWithUndo } = useQuestStore();
  const complete = useCompleteQuest();

  if (recurring.length === 0) return null;

  // Today's rounds: the ones that come round today, and any already ticked today.
  const today = todayKey();
  const due = recurring.filter((q) => q.doneToday || repeatsOn(q.repeat, today));
  const later = recurring.filter((q) => !due.includes(q));
  const undone = due.filter((q) => !q.doneToday);
  const done = due.filter((q) => q.doneToday);

  const handleComplete = async (id: string) => {
    try {
      await complete(id, { daily: true, sub: 'Round done' });
    } catch {
      // useCompleteQuest has already said why; the row stays undone.
    }
  };

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="section-label flex flex-1 items-center gap-1.5">
          <Repeat size={13} strokeWidth={2.25} aria-hidden /> Rounds
        </h2>
        <span className="tnum text-xs text-(--color-muted)">
          {done.length} of {due.length} done
        </span>
      </div>

      <div className="panel rows overflow-hidden">
        <AnimatePresence>
          {[...undone, ...done].map((q) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: q.doneToday ? 0.55 : 1 }}
              exit={{ opacity: 0 }}
              className="group flex items-center gap-3 px-3.5 py-2.5"
            >
              <button
                onClick={() => !q.doneToday && handleComplete(q.id)}
                disabled={q.doneToday}
                className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors ${q.doneToday ? '' : 'quest-check'}`}
                style={{
                  borderColor: q.doneToday ? 'var(--color-green)' : 'var(--color-border-strong)',
                  background: q.doneToday ? 'var(--color-green)' : 'transparent',
                  cursor: q.doneToday ? 'default' : 'pointer',
                }}
                title={q.doneToday ? 'Done today' : 'Mark done'}
              >
                {q.doneToday
                  ? <Check size={13} strokeWidth={3} className="text-(--color-on-primary)" aria-hidden />
                  : <Check size={13} strokeWidth={3} className="text-(--color-green) opacity-0 transition-opacity" aria-hidden />}
              </button>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{
                    color: 'var(--color-text)',
                    textDecoration: q.doneToday ? 'line-through' : 'none',
                  }}
                >
                  {q.title}
                </p>
                <p className="tnum text-xs" style={{ color: 'var(--color-muted)' }}>
                  {q.estimatedMinutes}m
                  {q.preferredHour != null && ` · ${formatHour(q.preferredHour)}`}
                  {q.repeat ? ` · ${describeRepeat(q.repeat)}` : q.category && ` · ${q.category.replace('_', ' ')}`}
                </p>
              </div>

              <div className="flex items-center transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                <button
                  onClick={() => onEdit(q)}
                  className="icon-btn h-8 w-8"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil size={14} aria-hidden />
                </button>
                <button
                  onClick={() => removeWithUndo(q.id)}
                  className="icon-btn h-8 w-8 max-lg:hidden"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </motion.div>
          ))}
          {/* Not today's: when each comes round next. */}
          {later.map((q) => {
            const next = nextLabel(q.repeat, today) ?? '—';
            const rule = describeRepeat(q.repeat);
            return (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="group flex items-center gap-3 px-3.5 py-2.5"
            >
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center text-(--color-muted)" title="Not today">
                <CalendarClock size={15} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {q.title}
                </p>
                <p className="tnum text-xs" style={{ color: 'var(--color-muted)' }}>
                  {rule === next ? `Next: ${next}` : `Next: ${next} · ${rule}`}
                </p>
              </div>
              <div className="flex items-center transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                <button onClick={() => onEdit(q)} className="icon-btn h-8 w-8" title="Edit" aria-label="Edit">
                  <Pencil size={14} aria-hidden />
                </button>
                <button onClick={() => removeWithUndo(q.id)} className="icon-btn h-8 w-8 max-lg:hidden" title="Delete" aria-label="Delete">
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
