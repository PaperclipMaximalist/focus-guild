import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';

export type ToastVariant = 'xp' | 'streak' | 'badge' | 'levelup';

interface Toast {
  id: number;
  title: string;
  sub: string;
  icon: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

const BORDER: Record<ToastVariant, string> = {
  xp:      'rgba(139,92,246,0.5)',
  streak:  'rgba(239,68,68,0.5)',
  badge:   'rgba(245,158,11,0.5)',
  levelup: 'rgba(245,158,11,0.8)',
};

const BG: Record<ToastVariant, string> = {
  xp:      'var(--color-surface2)',
  streak:  'var(--color-surface2)',
  badge:   'var(--color-surface2)',
  levelup: '#1e1508',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[500] flex flex-col gap-2">
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
            <div className="leading-tight">
              <strong className="block">{t.title}</strong>
              <span className="text-xs text-(--color-muted)">{t.sub}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
