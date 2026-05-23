import { AnimatePresence, motion } from 'framer-motion';
import { LEVELS } from '../lib/levels';

interface Props {
  newLevel: number | null;
  onDismiss: () => void;
}

export function LevelUpSplash({ newLevel, onDismiss }: Props) {
  const level = newLevel ? LEVELS.find((l) => l.level === newLevel) : null;

  return (
    <AnimatePresence>
      {level && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[600] flex flex-col items-center justify-center bg-black/85 p-6"
        >
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-center"
          >
            <span className="mb-3 block text-7xl">{level.emoji}</span>
            <div
              className="text-4xl font-black drop-shadow-[0_0_30px_rgba(245,158,11,0.6)]"
              style={{ color: 'var(--color-gold)' }}
            >
              LEVEL UP!
            </div>
            <div className="mt-2 text-lg text-(--color-muted)">
              You reached Level {level.level} — {level.title}!
            </div>
            <button
              onClick={onDismiss}
              className="mt-7 rounded-full bg-(--color-primary) px-6 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.4)] transition hover:bg-(--color-primary-d)"
            >
              Awesome! ⚡
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
