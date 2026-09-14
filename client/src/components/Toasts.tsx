import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export type ToastVariant = 'xp' | 'streak' | 'badge' | 'levelup' | 'error';

interface Toast {
  id: number;
  title: string;
  sub: string;
  icon: LucideIcon;
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
  xp:      'var(--color-border)',
  streak:  'color-mix(in srgb, var(--color-fire) 50%, transparent)',
  badge:   'color-mix(in srgb, var(--color-gold) 50%, transparent)',
  levelup: 'color-mix(in srgb, var(--color-gold) 80%, transparent)',
  error:   'color-mix(in srgb, var(--color-fire) 70%, transparent)',
};

const BG: Record<ToastVariant, string> = {
  xp:      'var(--color-surface2)',
  streak:  'var(--color-surface2)',
  badge:   'var(--color-surface2)',
  levelup: 'var(--color-surface2)',
  error:   'var(--color-surface2)',
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
            className="pointer-events-auto flex min-w-[220px] max-w-[320px] items-center gap-2.5 rounded-md border border-l-4 p-3 px-4 text-sm font-medium"
            style={{ borderColor: BORDER[t.variant], background: BG[t.variant] }}
          >
            <t.icon className="shrink-0" size={20} strokeWidth={2} aria-hidden />
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
                style={{ background: 'color-mix(in srgb, var(--color-primary) 22%, transparent)', color: 'var(--color-primary)' }}
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
