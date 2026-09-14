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
            <level.icon size={72} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: level.accent }} aria-hidden />
            <div
              className="font-mono text-4xl font-black"
              style={{ color: 'var(--color-primary)' }}
            >
              LEVEL UP
            </div>
            <div className="mt-2 text-lg text-(--color-muted)">
              You reached Level {level.level} — {level.title}!
            </div>
            <button
              onClick={onDismiss}
              className="mt-7 rounded-md bg-(--color-primary) px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) transition hover:bg-(--color-primary-d)"
            >
              Keep going
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
