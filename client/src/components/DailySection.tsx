/**
 * DailySection — list of recurring (daily) quests with today's check-off state.
 *
 * Each row:
 *  - Title + preferredHour badge
 *  - Estimated minutes
 *  - tick button when not done; subtle "Done today" state once completed
 */

import { achievementIcon } from '../lib/achievementCatalog';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { type Quest } from '../lib/api';
import { Check, Pencil, Repeat, Trash2, TriangleAlert } from 'lucide-react';

interface Props {
  onEdit: (q: Quest) => void;
}

export function DailySection({ onEdit }: Props) {
  const { recurring, completeDaily, remove } = useQuestStore();
  const { applyXPGain } = useUserStore();
  const pushToast = useToastStore((s) => s.push);
  const addUnlockedToStore = useAchievementsStore((s) => s.addUnlocked);

  if (recurring.length === 0) return null;

  const undone = recurring.filter((q) => !q.doneToday);
  const done = recurring.filter((q) => q.doneToday);

  const handleComplete = async (id: string) => {
    try {
      const result = await completeDaily(id);
      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
      pushToast({
        icon: Repeat,
        title: `+${result.xpAwarded} XP`,
        sub: 'Daily quest done',
        variant: 'xp',
      });
      if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
        addUnlockedToStore(
          result.newlyUnlocked.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
        );
        result.newlyUnlocked.forEach((a, idx) => {
          setTimeout(() => {
            pushToast({
              icon: achievementIcon(a.slug),
              title: `Achievement unlocked: ${a.title}`,
              sub: `+${a.xpReward} XP — ${a.description}`,
              variant: 'badge',
            });
          }, 400 + idx * 350);
        });
      }
    } catch (err) {
      pushToast({
        icon: TriangleAlert,
        title: 'Could not complete',
        sub: String(err),
        variant: 'xp',
      });
    }
  };

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="section-label flex flex-1 items-center gap-1.5">
          <Repeat size={13} strokeWidth={2.25} aria-hidden /> Routines
        </h2>
        <span className="tnum text-xs text-(--color-muted)">
          {done.length} of {recurring.length} done
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
                  {q.preferredHour != null && ` · ${String(q.preferredHour).padStart(2, '0')}:00`}
                  {q.category && ` · ${q.category.replace('_', ' ')}`}
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
                  onClick={() => {
                    if (confirm('Delete this daily quest?')) remove(q.id);
                  }}
                  className="icon-btn h-8 w-8 max-lg:hidden"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
