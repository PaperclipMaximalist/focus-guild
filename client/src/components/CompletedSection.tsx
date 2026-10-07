import { useState } from 'react';
import { useQuestStore } from '../store/useQuestStore';
import { Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

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
        <div className="panel rows mt-2 overflow-hidden">
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
                className="flex items-center gap-3 px-3.5 py-2.5"
              >
                <div className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-(--color-green) text-(--color-on-primary) opacity-70">
                  <Check size={13} strokeWidth={3} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-(--color-muted) line-through">{q.title}</div>
                  <div className="tnum text-xs text-(--color-muted) opacity-80">{when}</div>
                </div>
                <button
                  onClick={() => remove(q.id)}
                  title="Delete"
                  aria-label="Delete"
                  className="icon-btn h-8 w-8"
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
