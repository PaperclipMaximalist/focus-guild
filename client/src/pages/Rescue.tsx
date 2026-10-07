/**
 * Rescue Mode — triage for overdue quests.
 *
 * Per-quest actions:
 *   - Extend deadline by 1/3/7 days
 *   - Mark complete (uses standard XP pipeline)
 *   - Delete
 *
 * Bulk action:
 *   - Extend all overdue by 7 days ("rescue everyone")
 */

import { achievementIcon } from '../lib/achievementCatalog';
import { useEffect, useState } from 'react';
import { duckReact } from '../store/useMascotStore';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type Quest } from '../lib/api';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from '../components/Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { levelFromXP } from '../lib/levels';
import { formatDeadline, formatMinutes } from '../lib/formatters';
import { Check, ChevronsUp, Hourglass, LifeBuoy, Sparkles, Trash2 } from 'lucide-react';

export default function Rescue() {
  const [rescue, setRescue] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { complete, remove } = useQuestStore();
  const { user, applyXPGain } = useUserStore();
  const pushToast = useToastStore((s) => s.push);
  const addUnlocked = useAchievementsStore((s) => s.addUnlocked);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.quests.rescue();
      setRescue(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // The duck notices the pile once it loads, and cheers when it's gone —
  // but only if there was a pile this visit, not on an already-empty page.
  const [hadOverdue, setHadOverdue] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (rescue.length > 0 && !hadOverdue) {
      setHadOverdue(true);
      duckReact('overdue', rescue.length);
    } else if (rescue.length === 0 && hadOverdue) {
      duckReact('rescueClear');
    }
  }, [loading, rescue.length, hadOverdue]);

  const handleExtend = async (id: string, days: number) => {
    setBusyId(id);
    try {
      await api.quests.extendDeadline(id, days);
      setRescue((r) => r.filter((q) => q.id !== id));
      pushToast({ icon: Hourglass, title: `Extended +${days}d`, sub: 'Back on the board', variant: 'xp' });
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    try {
      const prevLevel = levelFromXP(user.totalXP).level;
      const result = await complete(id);
      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
      setRescue((r) => r.filter((q) => q.id !== id));
      pushToast({
        icon: LifeBuoy,
        title: `+${result.xpAwarded} XP`,
        sub: 'Rescue cleared',
        variant: 'xp',
      });
      if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
        addUnlocked(
          result.newlyUnlocked.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
        );
        result.newlyUnlocked.forEach((a, idx) => {
          setTimeout(() => {
            pushToast({
              icon: achievementIcon(a.slug),
              title: `Achievement: ${a.title}`,
              sub: `+${a.xpReward} XP`,
              variant: 'badge',
            });
          }, 400 + idx * 350);
        });
      }
      const newLevel = levelFromXP(result.totalXP).level;
      if (newLevel > prevLevel) {
        pushToast({ icon: ChevronsUp, title: `Level ${newLevel}!`, sub: 'New rank unlocked', variant: 'levelup' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Drop this quest entirely?')) return;
    await remove(id);
    setRescue((r) => r.filter((q) => q.id !== id));
  };

  const handleBulkExtend = async () => {
    if (!confirm(`Push all ${rescue.length} overdue quests forward by 7 days?`)) return;
    setBusyId('bulk');
    try {
      await Promise.all(rescue.map((q) => api.quests.extendDeadline(q.id, 7)));
      setRescue([]);
      pushToast({ icon: Sparkles, title: 'Rescued', sub: `All ${rescue.length} pushed +7d`, variant: 'xp' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page">
        <h1 className="page-title">Rescue</h1>
        <p className="mb-5 mt-1.5 text-sm" style={{ color: 'var(--color-muted)' }}>
          Overdue quests, longest overdue first. Push the date, finish it, or drop it.
        </p>

        {rescue.length > 0 && (
          <div className="mb-4">
            <button
              onClick={handleBulkExtend}
              disabled={busyId === 'bulk'}
              className="btn-quiet disabled:opacity-50"
            >
              {busyId === 'bulk' ? '…' : <span className="inline-flex items-center gap-1.5"><ChevronsUp size={14} aria-hidden /> Push all {rescue.length} by a week</span>}
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-10" style={{ color: 'var(--color-muted)' }}>
            Loading…
          </div>
        )}

        {!loading && rescue.length === 0 && (
          <div className="flex flex-col items-center gap-4 pt-16 text-center">
            <Sparkles size={40} strokeWidth={1.5} className="opacity-70" aria-hidden />
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
              All clear
            </p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No overdue quests. You're on top of it.
            </p>
          </div>
        )}

        {rescue.length > 0 && (
          <div className="panel rows overflow-hidden">
            <AnimatePresence initial={false}>
              {rescue.map((q) => (
                <motion.div
                  key={q.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: busyId === q.id ? 0.5 : 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3.5 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold leading-snug">{q.title}</p>
                      <p className="tnum mt-0.5 text-[0.78rem] text-(--color-muted)">
                        <span className="font-medium" style={{ color: 'var(--color-fire)' }}>{formatDeadline(q.deadline)}</span>
                        {' · '}{formatMinutes(q.estimatedMinutes)}
                      </p>
                    </div>
                    <button onClick={() => handleDelete(q.id)} className="icon-btn -mr-1.5 -mt-1 h-8 w-8" title="Drop this quest" aria-label="Drop this quest">
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => handleComplete(q.id)} disabled={busyId === q.id} className="btn-quiet h-8 min-h-0 px-2.5 text-xs disabled:opacity-50">
                      <Check size={13} strokeWidth={2.5} aria-hidden style={{ color: 'var(--color-green)' }} /> Done
                    </button>
                    <span className="mx-1 text-xs text-(--color-muted)">or push</span>
                    {[1, 3, 7].map((d) => (
                      <button
                        key={d}
                        onClick={() => handleExtend(q.id, d)}
                        disabled={busyId === q.id}
                        className="btn-quiet tnum h-8 min-h-0 px-2.5 text-xs disabled:opacity-50"
                        aria-label={`Push ${d} ${d === 1 ? 'day' : 'days'}`}
                      >
                        {d === 1 ? '1 day' : `${d} days`}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
