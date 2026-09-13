import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';

export type ToastVariant = 'xp' | 'streak' | 'badge' | 'levelup' | 'error';

interface Toast {
  id: number;
  title: string;
  sub: string;
  icon: string;
  variant: ToastVariant;
  /** A single inline action, e.g. Undo. Tapping it also dismisses the toast. */
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    // Actionable toasts linger longer — three seconds is too short to reach
    // an Undo with a thumb.
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      t.action ? 6000 : 3000,
    );
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

const BORDER: Record<ToastVariant, string> = {
  xp:      'rgba(139,92,246,0.5)',
  streak:  'rgba(239,68,68,0.5)',
  badge:   'rgba(245,158,11,0.5)',
  levelup: 'rgba(245,158,11,0.8)',
  error:   'rgba(239,68,68,0.7)',
};

const BG: Record<ToastVariant, string> = {
  xp:      'var(--color-surface2)',
  streak:  'var(--color-surface2)',
  badge:   'var(--color-surface2)',
  levelup: '#1e1508',
  error:   '#2a1214',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[500] flex flex-col gap-2 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto flex min-w-[220px] max-w-[320px] items-center gap-2.5 rounded-xl border p-3 px-4 text-sm font-medium shadow-[0_4px_32px_rgba(0,0,0,0.45)]"
            style={{ borderColor: BORDER[t.variant], background: BG[t.variant] }}
          >
            <span className="shrink-0 text-xl">{t.icon}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <strong className="block">{t.title}</strong>
              <span className="text-xs text-(--color-muted)">{t.sub}</span>
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold"
                style={{ background: 'rgba(139,92,246,0.22)', color: 'var(--color-primary)' }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
