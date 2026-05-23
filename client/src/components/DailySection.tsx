/**
 * DailySection — list of recurring (daily) quests with today's check-off state.
 *
 * Each row:
 *  - Title + preferredHour badge
 *  - Estimated minutes
 *  - ✅ button when not done; subtle "Done today" state once completed
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { type Quest } from '../lib/api';

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
        icon: '🔁',
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
              icon: a.icon,
              title: `Achievement unlocked: ${a.title}`,
              sub: `+${a.xpReward} XP — ${a.description}`,
              variant: 'badge',
            });
          }, 400 + idx * 350);
        });
      }
    } catch (err) {
      pushToast({
        icon: '⚠️',
        title: 'Could not complete',
        sub: String(err),
        variant: 'xp',
      });
    }
  };

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-base font-bold">
          🔁 Daily Quests
          <span className="text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            ({done.length}/{recurring.length})
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {[...undone, ...done].map((q) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: q.doneToday ? 0.5 : 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-3 rounded-(--radius-card) border px-4 py-2.5"
              style={{
                background: q.doneToday ? 'rgba(34,197,94,0.06)' : 'var(--color-surface)',
                borderColor: q.doneToday ? 'rgba(34,197,94,0.3)' : 'var(--color-border)',
              }}
            >
              <button
                onClick={() => !q.doneToday && handleComplete(q.id)}
                disabled={q.doneToday}
                className="h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all"
                style={{
                  borderColor: q.doneToday ? 'var(--color-green)' : 'var(--color-primary)',
                  background: q.doneToday ? 'var(--color-green)' : 'transparent',
                  cursor: q.doneToday ? 'default' : 'pointer',
                }}
                title={q.doneToday ? 'Done today' : 'Mark done'}
              >
                {q.doneToday && <span className="text-xs text-white font-bold">✓</span>}
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
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {q.estimatedMinutes}m
                  {q.preferredHour != null && ` · ${String(q.preferredHour).padStart(2, '0')}:00`}
                  {q.category && ` · ${q.category.replace('_', ' ')}`}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(q)}
                  className="text-base"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this daily quest?')) remove(q.id);
                  }}
                  className="text-base"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
