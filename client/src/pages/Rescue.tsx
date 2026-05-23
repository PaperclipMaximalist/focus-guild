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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../components/Header';
import { api, type Quest } from '../lib/api';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from '../components/Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { levelFromXP } from '../lib/levels';
import { formatDeadline } from '../lib/formatters';

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

  const handleExtend = async (id: string, days: number) => {
    setBusyId(id);
    try {
      await api.quests.extendDeadline(id, days);
      setRescue((r) => r.filter((q) => q.id !== id));
      pushToast({ icon: '⏳', title: `Extended +${days}d`, sub: 'Back on the board', variant: 'xp' });
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
        icon: '🚑',
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
              icon: a.icon,
              title: `Achievement: ${a.title}`,
              sub: `+${a.xpReward} XP`,
              variant: 'badge',
            });
          }, 400 + idx * 350);
        });
      }
      const newLevel = levelFromXP(result.totalXP).level;
      if (newLevel > prevLevel) {
        pushToast({ icon: '🆙', title: `Level ${newLevel}!`, sub: 'New rank unlocked', variant: 'levelup' });
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
      pushToast({ icon: '✨', title: 'Rescued', sub: `All ${rescue.length} pushed +7d`, variant: 'xp' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--color-bg)' }}>
      <Header />

      <div className="mx-auto max-w-2xl px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="flex-1 text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            🚑 Rescue Mode
          </h1>
          <Link
            to="/"
            className="text-xs"
            style={{ color: 'var(--color-muted)' }}
          >
            ← Today
          </Link>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          Overdue quests, sorted by how long they've been past due. Extend, complete, or drop.
        </p>

        {rescue.length > 0 && (
          <div className="mb-4">
            <button
              onClick={handleBulkExtend}
              disabled={busyId === 'bulk'}
              className="text-sm rounded-full px-4 py-1.5 font-semibold transition disabled:opacity-50"
              style={{ background: 'var(--color-gold)', color: '#0d0d1a' }}
            >
              {busyId === 'bulk' ? '…' : `✨ Rescue all ${rescue.length} (+7d)`}
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
            <p className="text-4xl">✨</p>
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
              All clear
            </p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No overdue quests. You're on top of it.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <AnimatePresence>
            {rescue.map((q) => (
              <motion.div
                key={q.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="rounded-(--radius-card) border p-3"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  borderColor: 'rgba(239,68,68,0.35)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                      {q.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-fire)' }}>
                      {formatDeadline(q.deadline)} · {q.estimatedMinutes}m
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-base opacity-50 hover:opacity-100"
                    title="Drop"
                  >
                    🗑️
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleComplete(q.id)}
                    disabled={busyId === q.id}
                    className="text-xs rounded-full px-3 py-1 font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-green)' }}
                  >
                    ✓ Complete
                  </button>
                  <button
                    onClick={() => handleExtend(q.id, 1)}
                    disabled={busyId === q.id}
                    className="text-xs rounded-full border px-3 py-1 font-semibold disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    +1d
                  </button>
                  <button
                    onClick={() => handleExtend(q.id, 3)}
                    disabled={busyId === q.id}
                    className="text-xs rounded-full border px-3 py-1 font-semibold disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    +3d
                  </button>
                  <button
                    onClick={() => handleExtend(q.id, 7)}
                    disabled={busyId === q.id}
                    className="text-xs rounded-full border px-3 py-1 font-semibold disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    +7d
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
