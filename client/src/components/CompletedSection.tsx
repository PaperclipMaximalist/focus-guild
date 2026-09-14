import { useState } from 'react';
import { useQuestStore } from '../store/useQuestStore';
import { Check, ChevronDown, ChevronRight, CircleCheck, Trash2 } from 'lucide-react';

export function CompletedSection() {
  const completed = useQuestStore((s) => s.completed);
  const remove = useQuestStore((s) => s.remove);
  const [open, setOpen] = useState(false);

  if (completed.length === 0) return null;

  return (
    <div className="mt-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent py-1.5 text-sm text-(--color-muted) transition hover:text-(--color-text)"
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span>{open ? 'Hide' : 'Show'} completed ({completed.length})</span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {completed.map((q) => {
            const when = q.completedAt
              ? new Date(q.completedAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              <div
                key={q.id}
                className="relative flex items-start gap-3 overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4 opacity-60"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
                  style={{ background: 'var(--color-teal)' }}
                />
                <div className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-(--color-green) bg-(--color-green) text-[0.75rem] font-extrabold text-(--color-on-primary)">
                  <Check size={14} strokeWidth={3} aria-hidden />
                </div>
                <div className="flex-1">
                  <div className="text-[0.92rem] font-semibold line-through opacity-60">{q.title}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-(--color-green)/10 px-2 py-0.5 text-[0.68rem] font-semibold text-(--color-green)">
                      <CircleCheck size={12} strokeWidth={2.25} aria-hidden /> {when}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => remove(q.id)}
                  title="Delete"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-(--color-border) bg-white/5 text-[0.75rem] transition hover:bg-white/15"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
