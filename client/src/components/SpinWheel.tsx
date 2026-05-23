/**
 * Spin the Wheel — picks a random quest (weighted server-side by priority).
 * Visual: animated wheel-shaped reveal that lands on the picked title.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type Quest, type UnlockedAchievement } from '../lib/api';
import { useToastStore } from './Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onAccept: (questId: string) => void;
}

export function SpinWheel({ open, onClose, onAccept }: Props) {
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<Quest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useToastStore((s) => s.push);
  const addUnlocked = useAchievementsStore((s) => s.addUnlocked);

  const spin = async () => {
    setSpinning(true);
    setPicked(null);
    setError(null);
    try {
      // Build suspense: animate for ~1.2s before revealing.
      const [result] = await Promise.all([
        api.quests.spinWheel(),
        new Promise((r) => setTimeout(r, 1200)),
      ]);
      setPicked(result.picked);
      if (result.newlyUnlocked.length > 0) {
        addUnlocked(
          result.newlyUnlocked.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
        );
        result.newlyUnlocked.forEach((a: UnlockedAchievement, idx) => {
          setTimeout(() => {
            pushToast({
              icon: a.icon,
              title: `Achievement unlocked: ${a.title}`,
              sub: `+${a.xpReward} XP — ${a.description}`,
              variant: 'badge',
            });
          }, 600 + idx * 350);
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSpinning(false);
    }
  };

  const close = () => {
    setPicked(null);
    setSpinning(false);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-5"
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border p-6 text-center"
            style={{
              background: 'var(--color-surface2)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 4px 32px rgba(0,0,0,0.45)',
            }}
          >
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              🎲 Spin the Wheel
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
              Random quest, weighted by priority. Let the dice decide.
            </p>

            <div
              className="relative mx-auto mb-4 flex items-center justify-center"
              style={{ width: 200, height: 200 }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg, var(--color-primary), var(--color-gold), var(--color-fire), var(--color-teal), var(--color-primary))',
                  filter: 'blur(1px)',
                }}
                animate={{ rotate: spinning ? 1080 : 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
              <div
                className="absolute rounded-full flex items-center justify-center text-4xl"
                style={{
                  inset: 12,
                  background: 'var(--color-surface)',
                  border: '1.5px solid var(--color-border)',
                }}
              >
                {picked ? '🎯' : '🎲'}
              </div>
            </div>

            {picked && !spinning && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4"
              >
                <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
                  Your destiny:
                </p>
                <p className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {picked.title}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {picked.estimatedMinutes}m
                  {picked.deadline && ` · due ${new Date(picked.deadline).toLocaleDateString()}`}
                </p>
              </motion.div>
            )}

            {error && (
              <p className="text-xs mb-3" style={{ color: 'var(--color-fire)' }}>
                {error}
              </p>
            )}

            <div className="flex justify-center gap-2">
              {!picked && (
                <button
                  onClick={spin}
                  disabled={spinning}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.4)] transition disabled:opacity-40"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {spinning ? 'Spinning…' : '🎲 Spin'}
                </button>
              )}
              {picked && (
                <>
                  <button
                    onClick={() => {
                      onAccept(picked.id);
                      close();
                    }}
                    className="rounded-full px-5 py-2 text-sm font-semibold text-white"
                    style={{ background: 'var(--color-green)' }}
                  >
                    ✓ Do it
                  </button>
                  <button
                    onClick={() => {
                      setPicked(null);
                      spin();
                    }}
                    className="rounded-full border border-(--color-border) bg-white/5 px-5 py-2 text-sm font-semibold"
                  >
                    Re-spin
                  </button>
                </>
              )}
              <button
                onClick={close}
                className="rounded-full border border-(--color-border) bg-white/5 px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
